"""
================================================================================
FEEDBACK SERVICE — EVALUATION GENERATOR, WEASYPRINT PDF & CLOUD S3 UPLOADER
================================================================================
Role & Responsibility:
  This module acts as the core scoring and report generation engine for the Feedback Service.
  It coordinates:
    1. Multi-Dimensional Scoring: Evaluates candidate transcripts via Groq LLM API
       (or local conservative heuristic fallback) across Communication, Problem Solving,
       Code Quality, Time/Space Complexity, and Behavioral alignment.
    2. Anti-Inflation / Anti-Leniency Enforcement: Fact-checks candidate participation:
       unanswered questions receive a 0, vague answers are capped at 40/100, and sessions
       with <15 total candidate words receive an incomplete grade (0 score).
    3. WeasyPrint PDF Generation: Compiles HTML/CSS evaluation templates into A4 PDFs.
    4. S3 Cloud Storage & Presigned URLs: Uploads PDF reports to AWS S3 with AES-256
       encryption and generates secure 7-day presigned download links.
    5. Fallback Cascade: Falls back to `file-service` or local `/uploads` if S3 is unconfigured.
================================================================================
"""

import os
import json
import httpx
from typing import Optional, Dict, Any, List
try:
    from weasyprint import HTML
except ImportError:
    HTML = None
from pathlib import Path
from groq import Groq
import boto3
import logging
from botocore.exceptions import ClientError, NoCredentialsError
from datetime import datetime, timedelta, timezone
from .percentiles import calculate_percentile
from .report_template import render_html_report, generate_question_scores_html

logger = logging.getLogger("feedback-generator")

# External service credentials and endpoints
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
FILE_SERVICE_URL = os.getenv("FILE_SERVICE_URL", "http://localhost:8011/api/v1/files/upload")


class FeedbackGenerator:
    """
    Orchestration class handling LLM transcript evaluation, PDF compilation, and S3 uploads.

    Attributes:
      groq_client (Groq | None): Groq SDK client for LLM evaluation prompts.
      s3_bucket (str): AWS S3 bucket name (default: 'devmeet-reports').
      s3_region (str): AWS region string (default: 'us-east-1').
      s3_client (boto3.client | None): Configured Boto3 S3 client.
    """

    def __init__(self):
        """Initializes Groq and AWS S3 client connections."""
        self.groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
        self.s3_bucket = os.getenv("AWS_S3_REPORTS_BUCKET", "devmeet-reports")
        self.s3_region = os.getenv("AWS_REGION", "us-east-1")
        self.s3_client = None
        self._initialize_s3_client()

    def _initialize_s3_client(self):
        """
        Initializes the S3 client using explicit credentials or IAM role instance profiles.

        Error Handling:
          - NoCredentialsError: Logs warning and disables S3 features (falls back to local storage).
          - 404 Bucket Not Found: Disables S3 if target bucket does not exist.
        """
        try:
            aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")

            if aws_access_key and aws_secret_key:
                self.s3_client = boto3.client(
                    "s3",
                    region_name=self.s3_region,
                    aws_access_key_id=aws_access_key,
                    aws_secret_access_key=aws_secret_key,
                )
                logger.info("S3 client initialized with explicit credentials")
            else:
                self.s3_client = boto3.client("s3", region_name=self.s3_region)
                logger.info("S3 client initialized with default credential chain")

            # Verify bucket existence and permission
            self.s3_client.head_bucket(Bucket=self.s3_bucket)
            logger.info(f"S3 bucket '{self.s3_bucket}' is accessible")

        except NoCredentialsError:
            logger.warning("AWS credentials not found. S3 uploads will fall back to local disk.")
            self.s3_client = None
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code == "404":
                logger.warning(f"S3 bucket '{self.s3_bucket}' does not exist. S3 uploads will fall back to local disk.")
            else:
                logger.error(f"S3 initialization error: {e}")
            self.s3_client = None
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.s3_client = None

    async def _calculate_percentile(self, score: int, interview_type: str, difficulty: str) -> dict:
        """
        Computes candidate percentile ranking against historical peer cohort distributions.

        Parameters:
          score (int): Composite overall score (0-100).
          interview_type (str): Domain track ('dsa', 'behavioral', 'system_design').
          difficulty (str): Difficulty level ('easy', 'medium', 'hard').

        Returns:
          dict: Percentile payload with comparative message.
        """
        return calculate_percentile(score, interview_type, difficulty)

    async def generate_feedback(self, data: dict) -> dict:
        """
        Analyzes the full interview transcript to synthesize comprehensive scores and feedback.

        Parameters:
          data (dict): Payload containing 'transcript', 'interview_type', 'difficulty',
                       'language', and 'target_company'.

        Returns:
          dict: Report dictionary containing 'overall_score', 'scores', 'detailed_feedback',
                'question_scores', 'percentile_estimate', and 'hiring_recommendation'.

        Safety Guard:
          If the candidate answered 0 questions or spoke fewer than 15 total words,
          aborts evaluation and returns an honest 0 score (prevents leniency hallucination).
        """
        transcript = data.get("transcript", [])
        interview_type = data.get("interview_type", "dsa")
        difficulty = data.get("difficulty", "medium")
        language = data.get("language", "python")
        company = data.get("target_company") or "Target Company"

        # Anti-Cheating Guard: Detect empty or single-word transcripts
        user_msgs = [t for t in transcript if t.get("role") in ("user", "candidate")]
        total_words = sum(len(t.get("content", "").split()) for t in user_msgs)
        meaningful_turns = sum(1 for t in user_msgs if len(t.get("content", "").split()) >= 5)

        if len(user_msgs) < 1 or total_words < 15 or meaningful_turns < 1:
            return {
                "overall_score": 0,
                "scores": {
                    "communication_score": 0,
                    "problem_solving_score": 0,
                    "code_quality_score": 0 if interview_type in ("dsa", "system_design") else None,
                    "time_complexity_score": 0 if interview_type in ("dsa", "system_design") else None,
                    "behavioral_score": 0 if interview_type == "behavioral" else None,
                },
                "detailed_feedback": {
                    "strengths": [],
                    "weaknesses": [
                        "No meaningful answers were provided during the interview",
                        "The session ended without sufficient participation to evaluate",
                    ],
                    "code_improvements": [],
                    "recommendations": [
                        "Start a new interview session and answer each question thoroughly",
                        "Explain your thinking and approach, not just a one-word answer",
                    ],
                },
                "question_scores": [],
                "percentile_estimate": 0,
                "hiring_recommendation": "no",
                "percentile": {
                    "percentile": 0,
                    "peer_group_size": 1000,
                    "interview_type": interview_type,
                    "difficulty": difficulty,
                    "message": "Insufficient data to determine percentile.",
                },
            }

        # Primary Path: Groq LLM Evaluation
        if self.groq_client:
            try:
                result = await self._generate_with_groq(transcript, interview_type, difficulty, language, company)
                if "question_scores" not in result:
                    result["question_scores"] = []
                result["percentile"] = await self._calculate_percentile(result["overall_score"], interview_type, difficulty)
                return result
            except Exception as e:
                print(f"Groq evaluation failed: {e}. Falling back to rule-based evaluation.")

        # Secondary Path: Local Heuristic Analysis
        fallback = await self._generate_local_fallback(transcript, interview_type, difficulty, language, company)
        fallback["percentile"] = await self._calculate_percentile(fallback["overall_score"], interview_type, difficulty)
        return fallback

    async def generate_pdf(self, feedback_data: dict, session_info: dict) -> bytes:
        """
        Renders print-ready HTML/CSS and compiles it into PDF binary bytes using WeasyPrint.

        Parameters:
          feedback_data (dict): Evaluation scores and qualitative lists.
          session_info (dict): Session metadata (id, type, company, language).

        Returns:
          bytes: Binary PDF file content.

        Raises:
          RuntimeError: If WeasyPrint C-libraries (Pango/Cairo) are not installed on the host.
        """
        html_content = render_html_report(feedback_data, session_info)

        if HTML is None:
            logger.info("weasyprint is not installed — PDF export unavailable")
            return None
        try:
            pdf_bytes = HTML(string=html_content).write_pdf()
            return pdf_bytes
        except Exception as e:
            logger.warning("Failed to render PDF with WeasyPrint: %s", e)
            return None

    def _generate_question_scores_html(self, question_scores: list) -> str:
        """Helper to invoke question scoring table renderer."""
        return generate_question_scores_html(question_scores)

    async def upload_pdf_report(self, pdf_bytes: Optional[bytes], session_id: str) -> Optional[str]:
        """
        Uploads generated PDF to AWS S3 and creates an expiring presigned download link.
        """
        if not pdf_bytes:
            return None
        # Step 1: Attempt S3 direct upload
        if self.s3_client:
            try:
                timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                s3_key = f"reports/{session_id}/report_{timestamp}.pdf"

                self.s3_client.put_object(
                    Bucket=self.s3_bucket,
                    Key=s3_key,
                    Body=pdf_bytes,
                    ContentType="application/pdf",
                    ServerSideEncryption="AES256",
                )

                # Generate 7-day presigned URL (7 * 24 * 3600 seconds)
                presigned_url = self.s3_client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": self.s3_bucket,
                        "Key": s3_key,
                    },
                    ExpiresIn=7 * 24 * 3600,
                )

                logger.info(f"PDF report uploaded to S3: {s3_key}")
                return presigned_url

            except Exception as e:
                logger.error(f"Failed to upload PDF to S3: {e}. Falling back to File Service.")

        # Step 2: Attempt File Service upload
        try:
            async with httpx.AsyncClient() as client:
                files = {"file": (f"report_{session_id}.pdf", pdf_bytes, "application/pdf")}
                data = {"purpose": "report"}
                response = await client.post(FILE_SERVICE_URL, files=files, data=data, timeout=10.0)
                if response.status_code == 200:
                    return response.json().get("url")
        except Exception as e:
            logger.error(f"Failed to upload report PDF to file-service: {e}. Writing to local disk fallback.")

        # Step 3: Local filesystem disk fallback
        local_dir = Path("uploads")
        local_dir.mkdir(exist_ok=True)
        dest = local_dir / f"report_{session_id}.pdf"
        with open(dest, "wb") as f:
            f.write(pdf_bytes)
        return f"/uploads/report_{session_id}.pdf"

    async def _generate_with_groq(
        self,
        transcript: List[dict],
        interview_type: str,
        difficulty: str,
        language: str,
        company: str,
    ) -> dict:
        """
        Executes an evaluation prompt on Groq LLM with strict anti-leniency scoring rules.
        """
        transcript_text = "\n".join([f"{t.get('role', 'user').upper()}: {t.get('content', '')}" for t in transcript])

        rubric_map = {
            "dsa": "communication(15%), problem_solving(25%), code_quality(30%), time_complexity(30%)",
            "behavioral": "communication(30%), problem_solving(20%), behavioral_alignment(50%)",
            "system_design": "communication(20%), problem_solving(30%), time_complexity_thinking(25%), behavioral_alignment(25%)",
        }
        rubric = rubric_map.get(interview_type, rubric_map["dsa"])

        system_prompt = f"""
You are an expert technical interview evaluator. Analyze the provided interview transcript with STRICT, realistic scoring.
Interview type: {interview_type.upper()} | Target company: {company} | Difficulty: {difficulty} | Language: {language}

Scoring rubric for this interview type: {rubric}

CRITICAL SCORING RULES:
1. Count how many questions the interviewer asked vs how many the candidate actually answered. Unanswered questions score 0 — factor this into the overall score proportionally.
2. WRONG answers must score low (0-20). A confident wrong answer is worse than no answer.
3. Vague or hand-wavy answers without technical substance score 20-40 at most.
4. Only award 70+ for answers that demonstrate clear understanding with correct technical details.
5. 90+ is reserved for exceptional, near-perfect responses with optimization insights.
6. A candidate who answered 2-3 out of 8 questions CANNOT score above 40 overall, regardless of answer quality.
7. Do NOT exhibit leniency bias. Score based on observable evidence only.

Return a single valid JSON object with this EXACT structure (no markdown, no extra keys):
{{
    "overall_score": <0-100 weighted average based on rubric AND coverage>,
    "scores": {{
        "communication_score": <0-100>,
        "problem_solving_score": <0-100>,
        "code_quality_score": <0-100 or null if not applicable>,
        "time_complexity_score": <0-100 or null if not applicable>,
        "behavioral_score": <0-100 or null if not applicable>
    }},
    "detailed_feedback": {{
        "strengths": ["...", "..."],
        "weaknesses": ["...", "..."],
        "code_improvements": ["..."],
        "recommendations": ["...", "..."]
    }},
    "question_scores": [
        {{"turn": 1, "question_summary": "<brief summary>", "score": <0-10>, "feedback": "<one sentence>"}}
    ],
    "percentile_estimate": <0-100 percentile vs typical {difficulty} candidates at {company}>,
    "hiring_recommendation": "<strong_yes | yes | borderline | no>"
}}
"""

        chat_completion = self.groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Here is the transcript to evaluate:\n\n{transcript_text}"},
            ],
            model="llama-3.1-8b-instant",
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        res_text = chat_completion.choices[0].message.content
        return json.loads(res_text)

    async def _generate_local_fallback(
        self,
        transcript: List[dict],
        interview_type: str,
        difficulty: str,
        language: str,
        company: str,
    ) -> dict:
        """
        Conservative heuristic evaluation fallback when external LLM APIs are unreachable.
        Calculates scores from word counts, question coverage ratios, and algorithmic keywords.
        """
        turns_count = len(transcript)
        user_turns = [t for t in transcript if t.get("role") in ("user", "candidate")]
        ai_turns = [t for t in transcript if t.get("role") in ("assistant", "interviewer", "ai")]

        total_words = sum(len(t.get("content", "").split()) for t in user_turns)
        avg_words_per_turn = total_words / len(user_turns) if user_turns else 0

        # Coverage ratio: answered questions vs total AI prompts
        total_questions = len(ai_turns)
        answered_questions = len(user_turns)
        coverage_ratio = answered_questions / total_questions if total_questions > 0 else 0

        all_user_text = " ".join(t.get("content", "").lower() for t in user_turns)
        has_complexity = "complexity" in all_user_text or "big o" in all_user_text or "o(n" in all_user_text
        has_edge_cases = "edge" in all_user_text or "empty" in all_user_text or "null" in all_user_text or "boundary" in all_user_text
        has_code_blocks = any("```" in t.get("content", "") for t in user_turns)
        has_tradeoffs = "trade" in all_user_text or "pros and cons" in all_user_text or "alternatively" in all_user_text

        # Baseline starting scores (candidates must earn points)
        comm_score = 30
        prob_score = 25
        code_qual = None
        time_comp = None
        beh_score = None

        # Communication score based on explanation depth
        if avg_words_per_turn > 80:
            comm_score += 40
        elif avg_words_per_turn > 50:
            comm_score += 30
        elif avg_words_per_turn > 30:
            comm_score += 20
        elif avg_words_per_turn > 15:
            comm_score += 10
        if avg_words_per_turn <= 10:
            comm_score -= 10

        comm_score += int(coverage_ratio * 20)
        comm_score = min(100, max(0, comm_score))

        # Problem solving score based on edge cases, tradeoffs, and coverage
        if has_edge_cases:
            prob_score += 15
        if has_tradeoffs:
            prob_score += 10
        if turns_count > 8:
            prob_score += 10
        elif turns_count > 4:
            prob_score += 5
        prob_score += int(coverage_ratio * 20)
        prob_score = min(100, max(0, prob_score))

        strengths = []
        weaknesses = []
        improvements = []
        recs = ["Focus on explaining your thought process step by step."]

        if avg_words_per_turn > 50:
            strengths.append("Provided detailed answers with adequate explanation.")
        if coverage_ratio >= 0.8:
            strengths.append("Answered most questions asked during the interview.")
        if not strengths:
            strengths.append("Participated in the interview session.")

        if coverage_ratio < 0.5:
            weaknesses.append(f"Only answered {answered_questions} of {total_questions} questions — participation was too low.")
        if avg_words_per_turn < 30:
            weaknesses.append("Answers were too brief — elaborate on your reasoning and approach.")
        weaknesses.append("Could elaborate more on trade-offs and alternative solutions.")

        # Track-specific metric evaluation
        if interview_type in ("dsa", "system_design"):
            code_qual = 0
            time_comp = 0

            if has_code_blocks:
                code_qual = 40
                strengths.append("Provided code in the response.")
            if has_complexity:
                time_comp = 45
                strengths.append("Addressed time and space complexity considerations.")
            else:
                weaknesses.append("Did not explicitly analyze Time or Space complexity of the proposed solution.")
                recs.append("Study Big-O notation and analyze the complexity of solutions before finishing.")

            code_qual += int(coverage_ratio * 25)
            time_comp += int(coverage_ratio * 25)
            code_qual = min(100, max(0, code_qual))
            time_comp = min(100, max(0, time_comp))

            if interview_type == "dsa":
                improvements.append("Verify pointer conditions and null values to avoid index errors.")
                improvements.append("Adopt helper functions to separate algorithm logic into readable parts.")
                recs.append("Practice Array, HashMap, and Two-pointer problems.")
            else:
                improvements.append("Use standard architectural block diagrams and explain load balancing thresholds.")
                recs.append("Cover all design components: caching, sharding, replication, monitoring.")
        else:
            beh_score = 30
            if "star" in all_user_text or "situation" in all_user_text:
                beh_score += 20
                strengths.append("Used structured storytelling in answers.")
            if avg_words_per_turn > 60:
                beh_score += 15
            beh_score += int(coverage_ratio * 20)
            beh_score = min(100, max(0, beh_score))
            recs.append("Structure behavioral answers using the STAR format (Situation, Task, Action, Result).")

        # Composite overall calculation
        active_scores = [comm_score, prob_score]
        if code_qual is not None:
            active_scores.append(code_qual)
        if time_comp is not None:
            active_scores.append(time_comp)
        if beh_score is not None:
            active_scores.append(beh_score)

        overall_score = int(sum(active_scores) / len(active_scores))

        # Question-by-question commentary table
        question_scores = []
        ai_turns_list = [t for t in transcript if t.get("role") in ("assistant", "interviewer", "ai")]
        user_turns_list = [t for t in transcript if t.get("role") in ("user", "candidate")]
        for i, (q, a) in enumerate(zip(ai_turns_list, user_turns_list)):
            q_text = q.get("content", "")[:80]
            a_text = a.get("content", "")
            a_words = len(a_text.split())
            turn_score = min(10, max(1, 2 + (2 if a_words > 50 else 0) + (2 if a_words > 100 else 0) + (2 if "complexity" in a_text.lower() or "trade" in a_text.lower() else 0) + (1 if has_code_blocks and "```" in a_text else 0)))
            question_scores.append({
                "turn": i + 1,
                "question_summary": q_text + "...",
                "score": turn_score,
                "feedback": "Good engagement." if turn_score >= 7 else "Needs more depth and detail." if turn_score >= 4 else "Answer was too brief or lacked substance.",
            })

        # Percentile calculation
        percentile_map = {(90, 100): 95, (80, 89): 80, (70, 79): 65, (60, 69): 45, (50, 59): 30, (0, 49): 15}
        percentile_estimate = 50
        for (low, high), pct in percentile_map.items():
            if low <= overall_score <= high:
                percentile_estimate = pct
                break
        hiring_rec = "strong_yes" if overall_score >= 85 else "yes" if overall_score >= 70 else "borderline" if overall_score >= 55 else "no"

        return {
            "overall_score": overall_score,
            "scores": {
                "communication_score": comm_score,
                "problem_solving_score": prob_score,
                "code_quality_score": code_qual,
                "time_complexity_score": time_comp,
                "behavioral_score": beh_score,
            },
            "detailed_feedback": {
                "strengths": strengths,
                "weaknesses": weaknesses,
                "code_improvements": improvements,
                "recommendations": recs,
            },
            "question_scores": question_scores,
            "percentile_estimate": percentile_estimate,
            "hiring_recommendation": hiring_rec,
        }


# Singleton generator instance
feedback_generator = FeedbackGenerator()
