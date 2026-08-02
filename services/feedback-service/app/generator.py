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
from datetime import datetime, timedelta

logger = logging.getLogger("feedback-generator")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
FILE_SERVICE_URL = os.getenv("FILE_SERVICE_URL", "http://localhost:8011/api/v1/files/upload")

class FeedbackGenerator:
    def __init__(self):
        self.groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
        self.s3_bucket = os.getenv("AWS_S3_REPORTS_BUCKET", "devmeet-reports")
        self.s3_region = os.getenv("AWS_REGION", "us-east-1")
        self.s3_client = None
        self._initialize_s3_client()
    
    def _initialize_s3_client(self):
        """Initialize S3 client for PDF uploads."""
        try:
            aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
            
            if aws_access_key and aws_secret_key:
                self.s3_client = boto3.client(
                    's3',
                    region_name=self.s3_region,
                    aws_access_key_id=aws_access_key,
                    aws_secret_access_key=aws_secret_key
                )
                logger.info("S3 client initialized with explicit credentials")
            else:
                self.s3_client = boto3.client('s3', region_name=self.s3_region)
                logger.info("S3 client initialized with default credential chain")
            
            # Test connection
            self.s3_client.head_bucket(Bucket=self.s3_bucket)
            logger.info(f"S3 bucket '{self.s3_bucket}' is accessible")
            
        except NoCredentialsError:
            logger.warning("AWS credentials not found. S3 uploads will fall back to local disk.")
            self.s3_client = None
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == '404':
                logger.warning(f"S3 bucket '{self.s3_bucket}' does not exist. S3 uploads will fall back to local disk.")
            else:
                logger.error(f"S3 initialization error: {e}")
            self.s3_client = None
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            self.s3_client = None

    async def _calculate_percentile(self, score: int, interview_type: str, difficulty: str) -> dict:
        """
        FEED-07: Calculate percentile ranking based on score and interview parameters.
        Returns percentile data comparing user performance to peer group.
        """
        # FEED-07: Percentile ranges based on score (simplified peer comparison)
        # In production, this would query historical data from analytics service
        percentile_ranges = {
            "dsa": {
                "easy": {(90, 100): 95, (80, 89): 85, (70, 79): 70, (60, 69): 50, (50, 59): 30, (0, 49): 15},
                "medium": {(90, 100): 92, (80, 89): 80, (70, 79): 65, (60, 69): 45, (50, 59): 25, (0, 49): 10},
                "hard": {(90, 100): 90, (80, 89): 75, (70, 79): 60, (60, 69): 40, (50, 59): 20, (0, 49): 5}
            },
            "behavioral": {
                "easy": {(90, 100): 93, (80, 89): 82, (70, 79): 68, (60, 69): 48, (50, 59): 28, (0, 49): 12},
                "medium": {(90, 100): 91, (80, 89): 78, (70, 79): 63, (60, 69): 43, (50, 59): 23, (0, 49): 8},
                "hard": {(90, 100): 88, (80, 89): 73, (70, 79): 58, (60, 69): 38, (50, 59): 18, (0, 49): 3}
            },
            "system_design": {
                "easy": {(90, 100): 94, (80, 89): 84, (70, 79): 72, (60, 69): 52, (50, 59): 32, (0, 49): 14},
                "medium": {(90, 100): 90, (80, 89): 76, (70, 79): 62, (60, 69): 42, (50, 59): 22, (0, 49): 7},
                "hard": {(90, 100): 85, (80, 89): 70, (70, 79): 55, (60, 69): 35, (50, 59): 15, (0, 49): 2}
            }
        }
        
        type_ranges = percentile_ranges.get(interview_type, percentile_ranges["dsa"])
        diff_ranges = type_ranges.get(difficulty, type_ranges["medium"])
        
        percentile = 50  # default
        for (low, high), pct in diff_ranges.items():
            if low <= score <= high:
                percentile = pct
                break
        
        return {
            "percentile": percentile,
            "peer_group_size": 1000,  # Simulated peer group size
            "interview_type": interview_type,
            "difficulty": difficulty,
            "message": f"You performed better than {percentile}% of candidates in similar {interview_type} interviews at {difficulty} difficulty."
        }

    async def generate_feedback(self, data: dict) -> dict:
        """
        Analyze transcript via LLM or locally, and compile detailed scores & feedback
        """
        transcript = data.get("transcript", [])
        interview_type = data.get("interview_type", "dsa")
        difficulty = data.get("difficulty", "medium")
        language = data.get("language", "python")
        company = data.get("target_company") or "Target Company"

        # Guard: check for empty or thin conversation history
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
                        "The session ended without sufficient participation to evaluate"
                    ],
                    "code_improvements": [],
                    "recommendations": [
                        "Start a new interview session and answer each question thoroughly",
                        "Explain your thinking and approach, not just a one-word answer"
                    ]
                },
                "question_scores": [],
                "percentile_estimate": 0,
                "hiring_recommendation": "no",
                "percentile": {
                    "percentile": 0,
                    "peer_group_size": 1000,
                    "interview_type": interview_type,
                    "difficulty": difficulty,
                    "message": "Insufficient data to determine percentile."
                }
            }

        if self.groq_client:
            try:
                result = await self._generate_with_groq(transcript, interview_type, difficulty, language, company)
                # FEED-03: ensure question_scores key is always present
                if "question_scores" not in result:
                    result["question_scores"] = []
                # FEED-07: Add percentile comparison
                result["percentile"] = await self._calculate_percentile(result["overall_score"], interview_type, difficulty)
                return result
            except Exception as e:
                print(f"Groq evaluation failed: {e}. Falling back to rule-based evaluation.")

        fallback = await self._generate_local_fallback(transcript, interview_type, difficulty, language, company)
        # FEED-07: Add percentile comparison to fallback
        fallback["percentile"] = await self._calculate_percentile(fallback["overall_score"], interview_type, difficulty)
        return fallback

    async def generate_pdf(self, feedback_data: dict, session_info: dict) -> bytes:
        """
        Renders styled HTML and compiles it to PDF bytes via Weasyprint
        """
        scores = feedback_data["scores"]
        detailed = feedback_data["detailed_feedback"]
        
        # Build score grid HTML
        score_grid = f"""
            <div class="score-card main-score">
                <h3>Overall Score</h3>
                <div class="score-val">{feedback_data['overall_score']}/100</div>
            </div>
            <div class="score-card">
                <h4>Communication</h4>
                <div class="score-val">{scores['communication_score']}/100</div>
            </div>
            <div class="score-card">
                <h4>Problem Solving</h4>
                <div class="score-val">{scores['problem_solving_score']}/100</div>
            </div>
        """
        
        if scores.get("code_quality_score") is not None:
            score_grid += f"""
            <div class="score-card">
                <h4>Code Quality</h4>
                <div class="score-val">{scores['code_quality_score']}/100</div>
            </div>
            """
        if scores.get("time_complexity_score") is not None:
            score_grid += f"""
            <div class="score-card">
                <h4>Time & Space Complexity</h4>
                <div class="score-val">{scores['time_complexity_score']}/100</div>
            </div>
            """
        if scores.get("behavioral_score") is not None:
            score_grid += f"""
            <div class="score-card">
                <h4>Behavioral Alignment</h4>
                <div class="score-val">{scores['behavioral_score']}/100</div>
            </div>
            """

        # Lists elements
        strengths_html = "".join([f"<li>{s}</li>" for s in detailed.get("strengths", [])])
        weaknesses_html = "".join([f"<li>{w}</li>" for w in detailed.get("weaknesses", [])])
        improvements_html = "".join([f"<li>{i}</li>" for i in detailed.get("code_improvements", [])])
        recs_html = "".join([f"<li>{r}</li>" for r in detailed.get("recommendations", [])])

        html_content = f"""
        <html>
        <head>
            <style>
                @page {{
                    size: A4;
                    margin: 20mm;
                    @bottom-right {{
                        content: "Page " counter(page) " of " counter(pages);
                        font-size: 9pt;
                        color: #718096;
                    }}
                }}
                body {{
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    color: #2D3748;
                    line-height: 1.6;
                    margin: 0;
                    padding: 0;
                }}
                .header {{
                    border-bottom: 2px solid #4A5568;
                    padding-bottom: 15px;
                    margin-bottom: 30px;
                }}
                .header h1 {{
                    font-size: 26pt;
                    color: #1A365D;
                    margin: 0;
                    letter-spacing: -0.5px;
                }}
                .meta-table {{
                    width: 100%;
                    margin-top: 10px;
                    font-size: 10pt;
                    color: #4A5568;
                }}
                .meta-table td {{
                    padding: 4px 0;
                }}
                .scores-container {{
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                    justify-content: space-between;
                    margin-bottom: 35px;
                }}
                .score-card {{
                    flex: 1;
                    min-width: 120px;
                    background: #F7FAFC;
                    border: 1px solid #E2E8F0;
                    border-radius: 8px;
                    padding: 15px;
                    text-align: center;
                    margin: 5px;
                }}
                .score-card h3, .score-card h4 {{
                    margin: 0 0 10px 0;
                    color: #4A5568;
                    font-size: 11pt;
                }}
                .score-card.main-score {{
                    background: #EBF8FF;
                    border-color: #BEE3F8;
                }}
                .score-card.main-score h3 {{
                    color: #2B6CB0;
                    font-size: 13pt;
                }}
                .score-val {{
                    font-size: 20pt;
                    font-weight: bold;
                    color: #1A202C;
                }}
                .section {{
                    margin-bottom: 30px;
                }}
                .section h2 {{
                    font-size: 16pt;
                    color: #2B6CB0;
                    border-left: 4px solid #3182CE;
                    padding-left: 10px;
                    margin-top: 0;
                    margin-bottom: 15px;
                }}
                ul {{
                    padding-left: 20px;
                    margin-top: 0;
                }}
                li {{
                    margin-bottom: 8px;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>DevMeet Evaluation Report</h1>
                <table class="meta-table">
                    <tr>
                        <td><strong>Session ID:</strong> {session_info.get('session_id')}</td>
                        <td><strong>Interview Type:</strong> {session_info.get('interview_type').upper()}</td>
                    </tr>
                    <tr>
                        <td><strong>Target Company:</strong> {session_info.get('target_company', 'N/A')}</td>
                        <td><strong>Difficulty:</strong> {session_info.get('difficulty').upper()}</td>
                    </tr>
                    <tr>
                        <td><strong>Language:</strong> {session_info.get('language', 'N/A').upper()}</td>
                        <td><strong>Date Evaluated:</strong> {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</td>
                    </tr>
                </table>
            </div>

            <div class="section">
                <h2>Score Breakdown</h2>
                <div class="scores-container">
                    {score_grid}
                </div>
            </div>

            <div class="section">
                <h2>Strengths</h2>
                <ul>
                    {strengths_html}
                </ul>
            </div>

            <div class="section">
                <h2>Areas for Improvement</h2>
                <ul>
                    {weaknesses_html}
                </ul>
            </div>

            {f'<div class="section"><h2>Technical & Code Suggestions</h2><ul>{improvements_html}</ul></div>' if improvements_html else ''}

            {f'<div class="section"><h2>Actionable Recommendations</h2><ul>{recs_html}</ul></div>' if recs_html else ''}

            {self._generate_question_scores_html(feedback_data.get('question_scores', [])) if feedback_data.get('question_scores') else ''}
        </body>
        </html>
        """
        
        # Write PDF to bytes
        if HTML is None:
            raise RuntimeError("weasyprint is not installed — PDF export unavailable")
        pdf_bytes = HTML(string=html_content).write_pdf()
        return pdf_bytes

    def _generate_question_scores_html(self, question_scores: list) -> str:
        """
        FEED-03: Generate HTML for question-by-question breakdown with AI commentary.
        """
        if not question_scores:
            return ""
        
        rows_html = ""
        for qs in question_scores:
            score_color = "#38A169" if qs.get("score", 0) >= 7 else "#E53E3E" if qs.get("score", 0) <= 4 else "#D69E2E"
            rows_html += f"""
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #E2E8F0;">{qs.get('turn', '-')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #E2E8F0;">{qs.get('question_summary', 'N/A')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; text-align: center;">
                    <span style="color: {score_color}; font-weight: bold;">{qs.get('score', 0)}/10</span>
                </td>
                <td style="padding: 8px; border-bottom: 1px solid #E2E8F0;">{qs.get('feedback', 'N/A')}</td>
            </tr>
            """
        
        return f"""
        <div class="section">
            <h2>Question-by-Question Breakdown</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                <thead>
                    <tr style="background-color: #F7FAFC;">
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #CBD5E0;">Turn</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #CBD5E0;">Question Summary</th>
                        <th style="padding: 10px; text-align: center; border-bottom: 2px solid #CBD5E0;">Score</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #CBD5E0;">AI Commentary</th>
                    </tr>
                </thead>
                <tbody>
                    {rows_html}
                </tbody>
            </table>
        </div>
        """

    async def upload_pdf_report(self, pdf_bytes: bytes, session_id: str) -> Optional[str]:
        """
        FEED-05: Uploads PDF to AWS S3 with 7-day presigned URL expiry.
        Falls back to File Service, then local disk if S3 is unavailable.
        """
        # Try S3 upload first (FEED-05)
        if self.s3_client:
            try:
                timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                s3_key = f"reports/{session_id}/report_{timestamp}.pdf"
                
                self.s3_client.put_object(
                    Bucket=self.s3_bucket,
                    Key=s3_key,
                    Body=pdf_bytes,
                    ContentType='application/pdf',
                    ServerSideEncryption='AES256'
                )
                
                # Generate presigned URL with 7-day expiry (FEED-05 requirement)
                presigned_url = self.s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': self.s3_bucket,
                        'Key': s3_key
                    },
                    ExpiresIn=7 * 24 * 3600  # 7 days in seconds
                )
                
                logger.info(f"PDF report uploaded to S3: {s3_key}")
                return presigned_url
                
            except Exception as e:
                logger.error(f"Failed to upload PDF to S3: {e}. Falling back to File Service.")
        
        # Fallback to File Service
        try:
            async with httpx.AsyncClient() as client:
                files = {"file": (f"report_{session_id}.pdf", pdf_bytes, "application/pdf")}
                data = {"purpose": "report"}
                response = await client.post(FILE_SERVICE_URL, files=files, data=data, timeout=10.0)
                if response.status_code == 200:
                    return response.json().get("url")
        except Exception as e:
            logger.error(f"Failed to upload report PDF to file-service: {e}. Writing to local disk fallback.")

        # Local disk fallback
        local_dir = Path("uploads")
        local_dir.mkdir(exist_ok=True)
        dest = local_dir / f"report_{session_id}.pdf"
        with open(dest, "wb") as f:
            f.write(pdf_bytes)
        return f"/uploads/report_{session_id}.pdf"

    # ─── LLM / Helper Logic ───────────────────────────────────────────────────────

    async def _generate_with_groq(
        self,
        transcript: List[dict],
        interview_type: str,
        difficulty: str,
        language: str,
        company: str
    ) -> dict:
        # Construct transcript block for LLM
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
                {"role": "user", "content": f"Here is the transcript to evaluate:\n\n{transcript_text}"}
            ],
            model="llama-3.1-8b-instant",
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        res_text = chat_completion.choices[0].message.content
        return json.loads(res_text)

    async def _generate_local_fallback(
        self,
        transcript: List[dict],
        interview_type: str,
        difficulty: str,
        language: str,
        company: str
    ) -> dict:
        """
        Analyzes the conversation transcript locally without LLM keys.
        Uses conservative baselines — honest scoring to avoid inflation.
        """
        # Count words, questions, complexity words, codes
        turns_count = len(transcript)
        user_turns = [t for t in transcript if t.get("role") in ("user", "candidate")]
        ai_turns = [t for t in transcript if t.get("role") in ("assistant", "interviewer", "ai")]

        total_words = sum(len(t.get("content", "").split()) for t in user_turns)
        avg_words_per_turn = total_words / len(user_turns) if user_turns else 0

        # Coverage: how many AI questions did the candidate actually answer?
        total_questions = len(ai_turns)
        answered_questions = len(user_turns)
        coverage_ratio = answered_questions / total_questions if total_questions > 0 else 0

        # Look for keywords
        all_user_text = " ".join(t.get("content", "").lower() for t in user_turns)
        has_complexity = "complexity" in all_user_text or "big o" in all_user_text or "o(n" in all_user_text
        has_edge_cases = "edge" in all_user_text or "empty" in all_user_text or "null" in all_user_text or "boundary" in all_user_text
        has_code_blocks = any("```" in t.get("content", "") for t in user_turns)
        has_tradeoffs = "trade" in all_user_text or "pros and cons" in all_user_text or "alternatively" in all_user_text

        # ── Conservative baselines (start LOW, earn your way up) ──
        comm_score = 30
        prob_score = 25
        code_qual = None
        time_comp = None
        beh_score = None

        # Communication: based on depth of answers
        if avg_words_per_turn > 80:
            comm_score += 40
        elif avg_words_per_turn > 50:
            comm_score += 30
        elif avg_words_per_turn > 30:
            comm_score += 20
        elif avg_words_per_turn > 15:
            comm_score += 10
        # Penalty for very short answers
        if avg_words_per_turn <= 10:
            comm_score -= 10

        # Coverage bonus/penalty
        comm_score += int(coverage_ratio * 20)
        comm_score = min(100, max(0, comm_score))

        # Problem solving: based on demonstrated thinking
        if has_edge_cases:
            prob_score += 15
        if has_tradeoffs:
            prob_score += 10
        if turns_count > 8:
            prob_score += 10
        elif turns_count > 4:
            prob_score += 5
        # Coverage heavily affects problem solving
        prob_score += int(coverage_ratio * 20)
        prob_score = min(100, max(0, prob_score))

        # Core lists
        strengths = []
        weaknesses = []
        improvements = []
        recs = [
            "Focus on explaining your thought process step by step.",
        ]

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

        if interview_type == "dsa" or interview_type == "system_design":
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

            # Scale by coverage
            code_qual += int(coverage_ratio * 25)
            time_comp += int(coverage_ratio * 25)
            code_qual = min(100, max(0, code_qual))
            time_comp = min(100, max(0, time_comp))

            if interview_type == "dsa":
                improvements.append("Verify pointer conditions and null values to avoid index errors.")
                improvements.append("Adopt helper functions to separate algorithm logic into readable parts.")
                recs.append("Practice Array, HashMap, and Two-pointer problems.")
            else:  # system design
                improvements.append("Use standard architectural block diagrams and explain load balancing thresholds.")
                recs.append("Cover all design components: caching, sharding, replication, monitoring.")
        else:  # behavioral
            beh_score = 30
            if "star" in all_user_text or "situation" in all_user_text:
                beh_score += 20
                strengths.append("Used structured storytelling in answers.")
            if avg_words_per_turn > 60:
                beh_score += 15
            beh_score += int(coverage_ratio * 20)
            beh_score = min(100, max(0, beh_score))
            recs.append("Structure behavioral answers using the STAR format (Situation, Task, Action, Result).")

        # Compile overall score
        active_scores = [comm_score, prob_score]
        if code_qual is not None:
            active_scores.append(code_qual)
        if time_comp is not None:
            active_scores.append(time_comp)
        if beh_score is not None:
            active_scores.append(beh_score)

        overall_score = int(sum(active_scores) / len(active_scores))

        # FEED-03: Generate question-by-question breakdown from transcript
        question_scores = []
        ai_turns_list = [t for t in transcript if t.get("role") in ("assistant", "interviewer", "ai")]
        user_turns_list = [t for t in transcript if t.get("role") in ("user", "candidate")]
        for i, (q, a) in enumerate(zip(ai_turns_list, user_turns_list)):
            q_text = q.get("content", "")[:80]
            a_text = a.get("content", "")
            a_words = len(a_text.split())
            turn_score = min(10, max(1, 2 + (2 if a_words > 50 else 0) + (2 if a_words > 100 else 0) + (2 if "complexity" in a_text.lower() or "trade" in a_text.lower() else 0) + (1 if has_code_blocks and "```" in a_text else 0)))
            question_scores.append({"turn": i + 1, "question_summary": q_text + "...", "score": turn_score, "feedback": "Good engagement." if turn_score >= 7 else "Needs more depth and detail." if turn_score >= 4 else "Answer was too brief or lacked substance."})

        # FEED-07: Percentile estimate (rule-based for fallback)
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
                "behavioral_score": beh_score
            },
            "detailed_feedback": {
                "strengths": strengths,
                "weaknesses": weaknesses,
                "code_improvements": improvements,
                "recommendations": recs
            },
            "question_scores": question_scores,
            "percentile_estimate": percentile_estimate,
            "hiring_recommendation": hiring_rec
        }

feedback_generator = FeedbackGenerator()
