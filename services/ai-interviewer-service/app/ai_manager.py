"""
================================================================================
AI INTERVIEWER SERVICE — MASTER LLM ORCHESTRATION & EVALUATION ENGINE
================================================================================
Role & Responsibility:
  This module serves as the central brain of the AI Interviewer service. It manages
  all interactions with external LLM providers (primarily Groq Cloud API), handling:
    1. Multi-Key Round-Robin & Model Failover: Rotates across up to 5 Groq API keys
       and cascades through backup models (llama-3.3-70b-versatile, llama-3.1-8b-instant, etc.)
       to withstand provider rate limits (HTTP 429) or transient downtime.
    2. Whisper Speech-to-Text (STT): Direct integration with Groq Whisper Large v3
       for ultra-fast audio transcription of candidate speech.
    3. Security & Anti-Abuse Enforcement: Tracks and penalizes prompt injection attempts;
       terminates malicious sessions after 3 strikes.
    4. Adaptive Difficulty Heuristics: Dynamically adjusts interview difficulty up or down
       based on rolling quality scores of candidate answers.
    5. Token Accounting: Tracks prompt, completion, and cumulative token budgets per session.
    6. Multimodal Interview Support: Progressive 3-level DSA hints, behavioral STAR analysis,
       sentiment/EQ evaluation, and system design component coverage checks.
    7. Circuit Breaker & Caching: Protects upstream providers from cascading failures
       and caches deterministic evaluation outputs.
================================================================================
"""

import os
import json
import asyncio
import logging
from typing import List, Dict, Optional, Tuple
from groq import Groq, AsyncGroq

# ==============================================================================
# SUBMODULE IMPORTS & INTERNAL DEPENDENCIES
# ==============================================================================
from .circuit_breaker import CircuitBreaker, default_circuit_breaker as _circuit_breaker
from .cache import ResponseCache, default_response_cache as _response_cache
from .key_manager import (
    _GROQ_KEYS,
    _get_next_key,
    _MODEL_FALLBACKS,
    _get_next_model,
)
from .security import (
    detect_injection,
    MAX_CONTEXT_TURNS,
    prune_conversation_history,
    validate_question_response,
    validate_feedback_response,
)
from .prompts import (
    build_interview_system_prompt,
    build_question_user_message,
    FALLBACK_QUESTIONS,
)
from .heuristics import (
    score_answer_quality as _heuristic_score,
    calculate_adaptive_difficulty,
    extract_star_components as _heuristic_star,
)

logger = logging.getLogger("ai-manager")


class AIManager:
    """
    Central orchestration class managing all Groq LLM invocations, fallbacks,
    transcription, security checks, and evaluation logic.
    """

    def __init__(self):
        """
        Initializes in-memory session tracking for security, token usage, and quality metrics.
        """
        # Tracks security violation counts per session (session_id -> count of injection attempts)
        self._violation_counts: Dict[str, int] = {}
        
        # Tracks token consumption per session (session_id -> {prompt, completion, total})
        self._token_usage: Dict[str, Dict[str, int]] = {}
        
        # Tracks rolling heuristic scores (0-10) of candidate answers for adaptive difficulty
        self._session_quality_scores: Dict[str, List[int]] = {}

    def _get_client(self) -> Optional[Groq]:
        """
        Obtains a new Groq client instance initialized with the next round-robin API key.

        Returns:
          Groq | None: Configured Groq SDK client, or None if no keys are available.
        """
        key = _get_next_key()
        if not key:
            return None
        return Groq(api_key=key)

    def transcribe_audio(self, audio_file_bytes: bytes, filename: str) -> str:
        """
        Transcribes candidate speech audio bytes into plain text using Groq's Whisper API.

        Parameters:
          audio_file_bytes (bytes): Binary payload of recorded speech.
          filename (str): Name of the audio file (used to infer MIME type).

        Returns:
          str: Transcribed text string.

        Raises:
          ValueError: If no API keys are present or all retry/fallback attempts fail.

        How It Works:
          1. Detects MIME type (.webm, .mp3, .wav, .ogg).
          2. Iterates through configured API keys to bypass rate limits or expired credentials.
          3. Attempts transcription using 'whisper-large-v3-turbo' first.
          4. If turbo fails, cascades to the standard 'whisper-large-v3' model.
        """
        if not _GROQ_KEYS:
            raise ValueError("No Groq API keys configured")

        # Determine proper MIME format based on audio file extension
        filename_clean = filename or "audio.webm"
        mime_type = "audio/webm"
        if filename_clean.endswith(".mp3"):
            mime_type = "audio/mpeg"
        elif filename_clean.endswith(".wav"):
            mime_type = "audio/wav"
        elif filename_clean.endswith(".ogg"):
            mime_type = "audio/ogg text/plain"

        import requests

        # Iterate through all available API keys before giving up
        for _ in range(len(_GROQ_KEYS)):
            key = _get_next_key()
            if not key:
                continue

            headers = {"Authorization": f"Bearer {key}"}
            files = {"file": (filename_clean, audio_file_bytes, mime_type)}
            data = {"model": "whisper-large-v3-turbo", "response_format": "json"}

            try:
                # Primary attempt: Turbo model for ultra-low latency transcription
                response = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=25,
                )

                if response.status_code == 200:
                    return response.json().get("text", "")

                # If unauthorized, rotate immediately to next key
                if response.status_code == 401:
                    logger.warning(f"Groq API Key {key[:8]}... returned 401 Invalid. Trying next key...")
                    continue

                # Secondary fallback: Standard whisper-large-v3
                data["model"] = "whisper-large-v3"
                files = {"file": (filename_clean, audio_file_bytes, mime_type)}
                response2 = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=25,
                )
                if response2.status_code == 200:
                    return response2.json().get("text", "")

            except Exception as err:
                logger.warning(f"Groq Audio request attempt failed with key {key[:8]}...: {err}")
                continue

        raise ValueError("Audio transcription service unavailable. Please check your microphone or use WebSpeech mode.")

    def check_and_record_injection(self, session_id: str, text: str) -> bool:
        """
        Checks candidate speech or text for prompt injection attempts.

        Parameters:
          session_id (str): Unique session identifier.
          text (str): Candidate input string.

        Returns:
          bool: True if candidate has accumulated >= 3 violations (session must terminate).
        """
        if detect_injection(text):
            self._violation_counts[session_id] = self._violation_counts.get(session_id, 0) + 1
            violations = self._violation_counts[session_id]
            logger.warning(
                "[INJECTION] session=%s violations=%d text_preview=%.120r",
                session_id, violations, text
            )
            return violations >= 3
        return False

    def record_token_usage(self, session_id: str, prompt_tokens: int, completion_tokens: int) -> None:
        """
        Records token consumption per session for billing and quota monitoring.

        Parameters:
          session_id (str): Unique session identifier.
          prompt_tokens (int): Count of input tokens sent to the LLM.
          completion_tokens (int): Count of tokens generated by the LLM.
        """
        if session_id not in self._token_usage:
            self._token_usage[session_id] = {"prompt": 0, "completion": 0, "total": 0}
        self._token_usage[session_id]["prompt"] += prompt_tokens
        self._token_usage[session_id]["completion"] += completion_tokens
        self._token_usage[session_id]["total"] += prompt_tokens + completion_tokens
        logger.info(
            "[TOKENS] session=%s prompt=%d completion=%d cumulative_total=%d",
            session_id, prompt_tokens, completion_tokens,
            self._token_usage[session_id]["total"]
        )

    def get_token_usage(self, session_id: str) -> Dict[str, int]:
        """
        Returns accumulated token usage statistics for a session.

        Parameters:
          session_id (str): Unique session identifier.

        Returns:
          Dict[str, int]: Dictionary containing 'prompt', 'completion', and 'total' token counts.
        """
        return self._token_usage.get(session_id, {"prompt": 0, "completion": 0, "total": 0})

    def _build_interview_system_prompt(
        self,
        interview_type: str,
        difficulty: str,
        target_company: Optional[str],
        focus_area: Optional[str],
        candidate_name: Optional[str] = "Candidate",
    ) -> str:
        """Helper to invoke prompt builder with specified session parameters."""
        return build_interview_system_prompt(
            interview_type=interview_type,
            difficulty=difficulty,
            target_company=target_company,
            focus_area=focus_area,
            candidate_name=candidate_name,
        )

    def _build_question_user_message(self, conversation_history: List[dict]) -> str:
        """Helper to construct context-aware user turn prompt."""
        return build_question_user_message(conversation_history)

    def score_answer_quality(self, answer: str, interview_type: str) -> int:
        """
        Computes a 0-10 heuristic quality score without LLM latency.

        Parameters:
          answer (str): The candidate's response.
          interview_type (str): 'dsa', 'behavioral', or 'system_design'.

        Returns:
          int: Heuristic quality score from 0 to 10.
        """
        return _heuristic_score(answer, interview_type)

    def get_adaptive_difficulty(self, session_id: str, base_difficulty: str) -> str:
        """
        Adjusts interview difficulty dynamically based on historical answer quality.

        Parameters:
          session_id (str): Unique session identifier.
          base_difficulty (str): The starting difficulty ('easy', 'medium', 'hard').

        Returns:
          str: Adjusted difficulty string.
        """
        scores = self._session_quality_scores.get(session_id, [])
        return calculate_adaptive_difficulty(scores, base_difficulty)

    def extract_star_components(self, answer: str) -> dict:
        """
        Extracts STAR framework components from a candidate's behavioral answer.

        Parameters:
          answer (str): Candidate's behavioral story.

        Returns:
          dict: Dictionary indicating presence and text of Situation, Task, Action, and Result.
        """
        return _heuristic_star(answer)

    async def generate_interview_question(
        self,
        interview_type: str,
        difficulty: str,
        target_company: Optional[str],
        focus_area: Optional[str],
        conversation_history: List[dict],
        session_id: str = "default",
        candidate_name: Optional[str] = "Candidate",
    ) -> Tuple[dict, bool]:
        """
        Generates the next interview turn, follow-up, or technical challenge.

        Parameters:
          interview_type (str): Track ('dsa', 'behavioral', 'system_design').
          difficulty (str): Starting difficulty level.
          target_company (Optional[str]): Target firm for custom context.
          focus_area (Optional[str]): Specialized topic.
          conversation_history (List[dict]): Previous dialogue turns.
          session_id (str): Active session identifier.
          candidate_name (Optional[str]): Candidate's name for personalized greetings.

        Returns:
          Tuple[dict, bool]: (question_payload_dict, is_injection_terminated).

        Resilience & Flow:
          1. Scans conversation history for prompt injection attempts; terminates if >= 3.
          2. Calculates adaptive difficulty adjustment.
          3. Prunes history to fit within strict character and token limits.
          4. Verifies Circuit Breaker state (fails fast with fallback question if open).
          5. Executes chat completion with exponential backoff, JSON schema validation,
             and model rotation across up to 3 attempts.
        """
        # Step 1: Scan recent turns for adversarial prompt injection
        for turn in conversation_history:
            if turn.get("role") == "user":
                should_terminate = self.check_and_record_injection(session_id, turn.get("content", ""))
                if should_terminate:
                    return {
                        "question": "[Session terminated due to policy violations]",
                        "hints": [],
                        "follow_up_questions": [],
                        "terminated": True,
                    }, True

        # Step 2: Score the most recent answer to update adaptive difficulty
        last_user_answer = next(
            (t["content"] for t in reversed(conversation_history) if t.get("role") == "user"),
            None,
        )
        if last_user_answer:
            quality = self.score_answer_quality(last_user_answer, interview_type)
            if session_id not in self._session_quality_scores:
                self._session_quality_scores[session_id] = []
            self._session_quality_scores[session_id].append(quality)
            logger.info("[AI-03] session=%s quality_score=%d", session_id, quality)

        adaptive_difficulty = self.get_adaptive_difficulty(session_id, difficulty)
        if adaptive_difficulty != difficulty:
            logger.info("[AI-03] session=%s difficulty adjusted %s -> %s", session_id, difficulty, adaptive_difficulty)

        # Step 3: Construct prompts and prune conversational context
        system_prompt = self._build_interview_system_prompt(
            interview_type, adaptive_difficulty, target_company, focus_area, candidate_name
        )
        pruned_history = prune_conversation_history(conversation_history, system_prompt)
        user_message = self._build_question_user_message(pruned_history)

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(pruned_history)
        messages.append({"role": "user", "content": user_message})

        # Step 4: Verify client and circuit breaker availability
        client = self._get_client()
        if not client:
            return self._fallback_question(interview_type), False

        if _circuit_breaker.is_open:
            logger.warning("[CIRCUIT-BREAKER] Open — returning fallback without calling Groq")
            return self._fallback_question(interview_type), False

        current_model = _MODEL_FALLBACKS[0]

        # Step 5: Retry loop with model rotation and exponential backoff
        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=800,
                    response_format={"type": "json_object"},
                )
                content = response.choices[0].message.content
                parsed = None
                start_idx = -1
                
                # Robust JSON parsing: handles raw JSON or JSON embedded inside explanatory text
                try:
                    parsed = json.loads(content)
                except Exception:
                    start_idx = content.find("{")
                    end_idx = content.rfind("}")
                    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                        parsed = json.loads(content[start_idx:end_idx + 1])
                    else:
                        raise

                # Verify schema compliance
                if parsed and isinstance(parsed, dict) and validate_question_response(parsed):
                    pre_text = content[:start_idx].strip() if start_idx != -1 else ""
                    if pre_text:
                        parsed["question"] = f"{pre_text}\n\n{parsed.get('question', '')}"
                    data = parsed
                    
                    # Track token accounting
                    if hasattr(response, "usage") and response.usage:
                        self.record_token_usage(
                            session_id,
                            response.usage.prompt_tokens or 0,
                            response.usage.completion_tokens or 0,
                        )
                    _circuit_breaker.record_success()
                    return data, False
                    
                logger.warning("[ai-manager] Attempt %d: invalid question schema, retrying...", attempt + 1)
            except json.JSONDecodeError:
                logger.warning("[ai-manager] Attempt %d: JSON decode error, retrying...", attempt + 1)
            except Exception as e:
                logger.error("[ai-manager] Attempt %d: API error (model=%s): %s", attempt + 1, current_model, e)
                _circuit_breaker.record_failure()
                client = self._get_client()
                current_model = _get_next_model()
                logger.info("[AI-04] Rotated to model=%s", current_model)
                if not client:
                    break
                    
            await asyncio.sleep(min(1.0 * (2 ** attempt), 4.0))

        # All retries exhausted: Serve verified offline fallback question
        return self._fallback_question(interview_type), False

    async def generate_feedback(
        self,
        conversation_history: List[dict],
        interview_type: str,
        user_answers: List[str],
    ) -> dict:
        """
        Generates comprehensive scoring, feedback, strengths, and weaknesses for completed session.

        Parameters:
          conversation_history (List[dict]): Full transcript of the interview.
          interview_type (str): Track ('dsa', 'behavioral', 'system_design').
          user_answers (List[str]): List of candidate responses.

        Returns:
          dict: Structured evaluation report with scores (0-100) and qualitative feedback.

        Anti-Cheating / Anti-Leniency Check:
          If the candidate provided fewer than 2 meaningful answers or under 30 words total,
          the function rejects scoring and marks the session incomplete with a 0 score.
        """
        # Guard against zero-effort or early-terminated sessions
        user_msgs = [m for m in conversation_history if m.get("role") == "user"]
        total_words = sum(len(m.get("content", "").split()) for m in user_msgs)
        meaningful = sum(1 for m in user_msgs if len(m.get("content", "").split()) >= 5)

        if len(user_msgs) < 2 or total_words < 30 or meaningful < 2:
            return {
                "overall_score": 0,
                "technical_score": 0,
                "communication_score": 0,
                "problem_solving_score": 0,
                "strengths": [],
                "weaknesses": [
                    "No meaningful answers were provided during the interview",
                    "The session ended without sufficient participation to evaluate",
                ],
                "recommendations": [
                    "Start a new interview session and answer each question thoroughly",
                    "Explain your thinking and approach, not just a one-word answer",
                    "For DSA: describe the algorithm, complexity, and edge cases",
                ],
                "summary": (
                    "This interview was incomplete. You did not provide enough answers "
                    "for a meaningful evaluation. Please start a new session and actively "
                    "participate to get an accurate score."
                ),
            }

        # Prompt instructing strict, unbiased grading
        system = (
            "You are an expert technical interviewer providing comprehensive, constructive feedback. "
            "Be critical and realistic — avoid leniency bias. Score honestly based on observable evidence only. "
            "WRONG answers must score low (0-20 for that dimension). Vague answers without substance score 20-40. "
            "Count how many questions were asked vs answered — unanswered questions count as 0. "
            "A candidate who answered only 2-3 questions out of many CANNOT score above 40 overall. "
            "Only 70+ for clearly correct, well-explained answers. 90+ only for exceptional responses. "
            "Always respond ONLY with valid JSON matching the exact schema requested."
        )

        conv_text = "\n".join(
            f"{t['role'].upper()}: {t['content']}" for t in conversation_history
        )
        user_message = f"""Evaluate this {interview_type} interview conversation and score the candidate.

Conversation:
{conv_text}

Return JSON with EXACTLY this schema:
{{
    "overall_score": <0-100>,
    "technical_score": <0-100>,
    "communication_score": <0-100>,
    "problem_solving_score": <0-100>,
    "strengths": ["<strength>", ...],
    "weaknesses": ["<weakness>", ...],
    "recommendations": ["<actionable tip>", ...],
    "summary": "<2-3 sentence overall assessment>"
}}"""

        client = self._get_client()
        if not client:
            return self._fallback_feedback()

        current_model = _MODEL_FALLBACKS[0]
        eval_messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ]
        
        # Check LRU cache to avoid redundant token spend on identical transcripts
        cached = _response_cache.get(eval_messages, current_model)
        if cached:
            logger.info("[CACHE-HIT] Feedback response served from cache")
            return cached

        # Retry loop for feedback generation
        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=current_model,
                    messages=eval_messages,
                    temperature=0.4,
                    max_tokens=1200,
                    response_format={"type": "json_object"},
                )
                content = response.choices[0].message.content
                data = json.loads(content)
                if validate_feedback_response(data):
                    data.setdefault("problem_solving_score", data.get("technical_score", 0))
                    data.setdefault("summary", "Interview completed successfully.")
                    if hasattr(response, "usage") and response.usage:
                        self.record_token_usage(
                            "feedback",
                            response.usage.prompt_tokens or 0,
                            response.usage.completion_tokens or 0,
                        )
                    _response_cache.put(eval_messages, current_model, data)
                    return data
                logger.warning("[ai-manager] Attempt %d: invalid feedback schema, retrying...", attempt + 1)
            except json.JSONDecodeError:
                logger.warning("[ai-manager] Attempt %d: JSON decode error in feedback", attempt + 1)
            except Exception as e:
                logger.error("[ai-manager] Attempt %d: feedback API error (model=%s): %s", attempt + 1, current_model, e)
                client = self._get_client()
                current_model = _get_next_model()
                logger.info("[AI-04] Rotated to model=%s", current_model)
                if not client:
                    break
            await asyncio.sleep(min(1.0 * (2 ** attempt), 4.0))

        return self._fallback_feedback()

    async def evaluate_code_answer(
        self,
        code: str,
        question: str,
        language: str,
        execution_output: Optional[str] = None,
    ) -> dict:
        """
        Evaluates candidate code submission against problem requirements and test output.

        Parameters:
          code (str): Source code string.
          question (str): Problem description.
          language (str): Language ('python', 'javascript', etc.).
          execution_output (Optional[str]): Output or stderr from code-execution-service sandbox.

        Returns:
          dict: Score, correctness ('correct'|'partial'|'incorrect'), Big-O complexities, and feedback.
        """
        system = "You are an expert code reviewer. Respond ONLY with valid JSON."
        user_message = f"""Evaluate this code solution for the following problem.

Problem: {question}
Language: {language}
Code:
```{language}
{code}
```
{f"Execution output: {execution_output}" if execution_output else ""}

Return JSON:
{{
    "score": <0-100>,
    "correctness": <"correct"|"partial"|"incorrect">,
    "time_complexity": "<Big-O>",
    "space_complexity": "<Big-O>",
    "feedback": "<detailed constructive feedback>",
    "improvements": ["<suggestion>", ...]
}}"""

        client = self._get_client()
        if not client:
            return {
                "score": 0,
                "correctness": "unevaluated",
                "time_complexity": "unknown",
                "space_complexity": "unknown",
                "feedback": "Unable to evaluate — AI service unavailable. Please retry.",
                "improvements": ["Retry when AI service is available for an accurate evaluation."],
            }

        current_model = _MODEL_FALLBACKS[0]

        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=current_model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=0.3,
                    max_tokens=800,
                    response_format={"type": "json_object"},
                )
                data = json.loads(response.choices[0].message.content)
                if isinstance(data.get("score"), (int, float)):
                    return data
            except Exception as e:
                current_model = _get_next_model()
                print(f"[ai-manager] Code eval attempt {attempt+1} failed, rotating to {current_model}: {e}")
            await asyncio.sleep(0.5)

        return {
            "score": 0,
            "correctness": "unevaluated",
            "time_complexity": "unknown",
            "space_complexity": "unknown",
            "feedback": "Code evaluation failed after retries. Please retry.",
            "improvements": ["Retry when AI service is available for an accurate evaluation."],
        }

    async def generate_hint(
        self,
        question: str,
        hint_level: int = 1,
        interview_type: str = "dsa",
        conversation_history: Optional[List[dict]] = None,
    ) -> dict:
        """
        Generates progressive 3-level hints:
          Level 1: General intuition / problem approach without giving answers away.
          Level 2: Specific data structure or algorithmic technique.
          Level 3: Near-solution pseudocode guidance.

        Parameters:
          question (str): The problem under discussion.
          hint_level (int): 1, 2, or 3.
          interview_type (str): Track ('dsa', 'behavioral', 'system_design').
          conversation_history (Optional[List[dict]]): Recent turns for conversational context.

        Returns:
          dict: JSON payload with 'hint', 'hint_level', 'focus_area', and 'next_step_suggestion'.
        """
        if hint_level not in [1, 2, 3]:
            raise ValueError("hint_level must be 1, 2, or 3")

        client = self._get_client()
        if not client:
            return self._fallback_hint(hint_level, interview_type)

        context = ""
        if conversation_history:
            recent_turns = conversation_history[-4:]
            context = "\n".join([f"{t.get('role', 'user')}: {t.get('content', '')}" for t in recent_turns])

        hint_level_descriptions = {
            1: "Provide a gentle, general hint that points the user in the right direction without giving away the solution. Focus on the core concept or approach.",
            2: "Provide a more specific hint that suggests a particular data structure, algorithm, or approach. Give more guidance but still let the user figure out the implementation.",
            3: "Provide a near-solution hint that gives specific algorithmic guidance. This should be very close to revealing the solution but still requires the user to implement it.",
        }

        system_prompt = f"""You are an expert technical interviewer providing hints to candidates.
Interview type: {interview_type.upper()}
Current question: {question}

{hint_level_descriptions[hint_level]}

Respond ONLY with valid JSON in this format:
{{
    "hint": "<the hint text>",
    "hint_level": {hint_level},
    "focus_area": "<what area the hint focuses on>",
    "next_step_suggestion": "<brief suggestion for what to try next>"
}}"""

        user_message = f"""Here is the conversation context so far:
{context if context else "No previous conversation context."}

Generate a level {hint_level} hint for this question."""

        current_model = _MODEL_FALLBACKS[0]

        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=current_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=0.5,
                    max_tokens=300,
                    response_format={"type": "json_object"},
                )
                data = json.loads(response.choices[0].message.content)
                if isinstance(data.get("hint"), str):
                    return data
            except Exception as e:
                current_model = _get_next_model()
                logger.warning(f"[AI-09] Hint generation attempt {attempt+1} failed, rotating to {current_model}: {e}")
            await asyncio.sleep(0.3)

        return self._fallback_hint(hint_level, interview_type)

    def _fallback_hint(self, hint_level: int, interview_type: str) -> dict:
        """Supplies deterministic fallback hints when external LLM APIs fail."""
        fallback_hints = {
            "dsa": {
                1: {
                    "hint": "Think about what data structure would be most efficient for this problem. Consider time and space complexity.",
                    "hint_level": 1,
                    "focus_area": "Data structure selection",
                    "next_step_suggestion": "Review common data structures and their use cases.",
                },
                2: {
                    "hint": "Consider using a hash map or set to optimize lookups. Think about whether you need to store elements or just track their presence.",
                    "hint_level": 2,
                    "focus_area": "Optimization technique",
                    "next_step_suggestion": "Try implementing with a hash-based data structure.",
                },
                3: {
                    "hint": "Use a single pass through the array with a hash map to store complements. For each element, check if its complement (target - element) exists in the map.",
                    "hint_level": 3,
                    "focus_area": "Algorithm implementation",
                    "next_step_suggestion": "Implement the two-sum hash map solution.",
                },
            },
            "behavioral": {
                1: {
                    "hint": "Structure your answer using a clear framework. Think about the key elements of your story.",
                    "hint_level": 1,
                    "focus_area": "Answer structure",
                    "next_step_suggestion": "Consider using the STAR method.",
                },
                2: {
                    "hint": "Use the STAR method: Situation, Task, Action, Result. Make sure to emphasize your specific actions and their impact.",
                    "hint_level": 2,
                    "focus_area": "STAR framework",
                    "next_step_suggestion": "Structure your answer with clear STAR sections.",
                },
                3: {
                    "hint": "Focus on the 'Action' section - what specifically did you do? Quantify your impact with metrics. For 'Result', highlight the outcome and what you learned.",
                    "hint_level": 3,
                    "focus_area": "Specific details",
                    "next_step_suggestion": "Add specific metrics and outcomes to your story.",
                },
            },
            "system_design": {
                1: {
                    "hint": "Start by clarifying the requirements. Think about scale, read/write ratios, and key features.",
                    "hint_level": 1,
                    "focus_area": "Requirements gathering",
                    "next_step_suggestion": "Ask clarifying questions about the system.",
                },
                2: {
                    "hint": "Consider a distributed system with load balancing, caching, and database sharding. Think about the data model and access patterns.",
                    "hint_level": 2,
                    "focus_area": "System architecture",
                    "next_step_suggestion": "Design the high-level architecture components.",
                },
                3: {
                    "hint": "Use a consistent hashing approach for load distribution. Implement Redis for caching, and consider a NoSQL database for flexibility. Add CDN for static content.",
                    "hint_level": 3,
                    "focus_area": "Specific technologies",
                    "next_step_suggestion": "Detail the technology stack and data flow.",
                },
            },
        }
        return fallback_hints.get(interview_type, fallback_hints["dsa"]).get(hint_level, fallback_hints["dsa"][1])

    async def analyze_sentiment(
        self,
        answer: str,
        question: str,
        interview_type: str = "behavioral",
    ) -> dict:
        """
        Analyzes emotional intelligence (EQ), sentiment tone, and confidence indicators.

        Parameters:
          answer (str): Candidate's response.
          question (str): The interviewer's question.
          interview_type (str): Track identifier.

        Returns:
          dict: Sentiment scores, confidence levels, and communication strengths/improvements.
        """
        client = self._get_client()
        if not client:
            return self._fallback_sentiment_analysis()

        system_prompt = """You are an expert behavioral interviewer analyzing candidate responses.
Evaluate the sentiment, emotional intelligence, and communication quality of the answer.

Respond ONLY with valid JSON in this format:
{
    "sentiment_score": <0-100 overall sentiment score>,
    "sentiment_category": "<positive|neutral|negative>",
    "confidence_level": <0-100 confidence in the answer>,
    "emotional_indicators": {
        "enthusiasm": <0-100>,
        "professionalism": <0-100>,
        "authenticity": <0-100>,
        "emotional_intelligence": <0-100>
    },
    "strengths": ["<strength>", ...],
    "areas_for_improvement": ["<area>", ...],
    "suggestions": ["<suggestion>", ...]
}"""

        user_message = f"""Question: {question}

Candidate's Answer:
{answer}

Analyze the sentiment and emotional quality of this response."""

        current_model = _MODEL_FALLBACKS[0]

        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=current_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=0.3,
                    max_tokens=500,
                    response_format={"type": "json_object"},
                )
                data = json.loads(response.choices[0].message.content)
                if isinstance(data.get("sentiment_score"), (int, float)):
                    return data
            except Exception as e:
                current_model = _get_next_model()
                logger.warning(f"[AI-10] Sentiment analysis attempt {attempt+1} failed, rotating to {current_model}: {e}")
            await asyncio.sleep(0.3)

        return self._fallback_sentiment_analysis()

    def _fallback_sentiment_analysis(self) -> dict:
        """Provides default neutral sentiment metrics during provider outages."""
        return {
            "sentiment_score": 75,
            "sentiment_category": "neutral",
            "confidence_level": 70,
            "emotional_indicators": {
                "enthusiasm": 70,
                "professionalism": 80,
                "authenticity": 75,
                "emotional_intelligence": 70,
            },
            "strengths": [
                "Answered the question directly",
                "Maintained professional tone",
            ],
            "areas_for_improvement": [
                "Could show more enthusiasm",
                "Add more specific examples",
            ],
            "suggestions": [
                "Use more engaging language",
                "Include quantifiable achievements",
            ],
        }

    async def evaluate_system_design(
        self,
        design_description: str,
        question: str,
        scale_requirements: Optional[dict] = None,
    ) -> dict:
        """
        Evaluates system architecture responses against an industry component coverage checklist:
        load balancing, caching, database sharding, replication, consistency models,
        partitioning, API design, monitoring, fault tolerance, and scalability.

        Parameters:
          design_description (str): Candidate's architectural explanation.
          question (str): System design challenge prompt.
          scale_requirements (Optional[dict]): QPS, data size, and latency constraints.

        Returns:
          dict: Component coverage breakdown, scores, and missing architecture elements.
        """
        client = self._get_client()
        if not client:
            return self._fallback_system_design_evaluation()

        scale_info = ""
        if scale_requirements:
            scale_info = f"""
Scale Requirements:
- QPS: {scale_requirements.get('qps', 'Not specified')}
- Data Size: {scale_requirements.get('data_size', 'Not specified')}
- Read/Write Ratio: {scale_requirements.get('read_write_ratio', 'Not specified')}
- Latency SLA: {scale_requirements.get('latency_sla', 'Not specified')}
"""

        system_prompt = """You are an expert system design interviewer evaluating candidate responses.
Evaluate the design against a comprehensive component checklist.

Respond ONLY with valid JSON in this format:
{
    "overall_score": <0-100>,
    "component_coverage": {
        "load_balancing": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "caching": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "database_sharding": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "replication": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "consistency_model": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "partitioning": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "api_design": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "monitoring": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "fault_tolerance": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"},
        "scalability": {"covered": <boolean>, "score": <0-100>, "notes": "<notes>"}
    },
    "strengths": ["<strength>", ...],
    "missing_components": ["<component>", ...],
    "improvement_suggestions": ["<suggestion>", ...],
    "follow_up_questions": ["<question>", ...]
}"""

        user_message = f"""System Design Question:
{question}

{scale_info}

Candidate's Design:
{design_description}

Evaluate this design against the component checklist."""

        current_model = _MODEL_FALLBACKS[0]

        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=current_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=0.3,
                    max_tokens=800,
                    response_format={"type": "json_object"},
                )
                data = json.loads(response.choices[0].message.content)
                if isinstance(data.get("overall_score"), (int, float)):
                    return data
            except Exception as e:
                current_model = _get_next_model()
                logger.warning(f"[AI-11] System design evaluation attempt {attempt+1} failed, rotating to {current_model}: {e}")
            await asyncio.sleep(0.3)

        return self._fallback_system_design_evaluation()

    def _fallback_system_design_evaluation(self) -> dict:
        """Supplies structured fallback response for system design evaluations."""
        return {
            "overall_score": 0,
            "component_coverage": {
                "load_balancing": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "caching": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "database_sharding": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "replication": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "consistency_model": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "partitioning": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "api_design": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "monitoring": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "fault_tolerance": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
                "scalability": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"},
            },
            "strengths": [],
            "missing_components": [
                "AI evaluation unavailable — cannot determine coverage"
            ],
            "improvement_suggestions": [
                "Retry when AI service is available for an accurate system design evaluation",
                "Cover: load balancing, caching, database sharding, replication, monitoring",
            ],
            "follow_up_questions": [],
        }

    def _fallback_question(self, interview_type: str) -> dict:
        """Retrieves a baseline question from the static fallback catalog."""
        return FALLBACK_QUESTIONS.get(interview_type, FALLBACK_QUESTIONS["dsa"])

    def _fallback_feedback(self) -> dict:
        """Supplies default feedback payload when external evaluation fails completely."""
        return {
            "overall_score": 0,
            "technical_score": 0,
            "communication_score": 0,
            "problem_solving_score": 0,
            "strengths": [],
            "weaknesses": [
                "Interview could not be evaluated — AI service was unavailable",
                "Insufficient data to generate meaningful feedback",
            ],
            "recommendations": [
                "Please retry the interview with a stable internet connection",
                "Ensure you provide detailed answers to each question",
            ],
            "summary": (
                "Feedback could not be generated because the AI evaluation service was temporarily unavailable. "
                "Please try again or contact support if this persists."
            ),
        }


# Singleton AIManager instance shared across API routes
ai_manager = AIManager()
