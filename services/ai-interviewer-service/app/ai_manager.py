"""
AI Manager — Production-grade with:
- Multi-key rotation (up to 5 Groq API keys)
- Context window pruning (keep system prompt + last 6 exchanges)
- Prompt injection detection and blocking (HTTP 422 raised in route layer)
- JSON response validation with retry (up to 3 attempts)
- Groq token usage tracking per session (AI-12)
- Fallback responses when all retries fail
- AI-04: Ordered model fallback list with per-attempt model rotation
- AI-03: Adaptive difficulty scoring based on answer quality heuristics
- AI-10: STAR method component extraction for behavioral interviews
- AI-11: System design checklist + behavioral STAR prompt enhancements
- AI-05: HashiCorp Vault dynamic retrieval for API key rotation
- AI-09: 3-level DSA hint system (easy, medium, hard hints)
"""
import os
import re
import json
import time
import asyncio
import logging
from typing import List, Dict, Optional, Tuple
from groq import Groq, AsyncGroq
from .vault_service import vault_service

logger = logging.getLogger("ai-manager")

# ─── Circuit Breaker ─────────────────────────────────────────────────────────
class CircuitBreaker:
    """Simple circuit breaker: opens after `threshold` failures within `window` seconds."""
    def __init__(self, threshold: int = 5, window: float = 60.0, reset_timeout: float = 30.0):
        self.threshold = threshold
        self.window = window
        self.reset_timeout = reset_timeout
        self._failures: List[float] = []
        self._open_until: float = 0.0

    def record_failure(self) -> None:
        now = time.time()
        self._failures = [t for t in self._failures if now - t < self.window]
        self._failures.append(now)
        if len(self._failures) >= self.threshold:
            self._open_until = now + self.reset_timeout
            logger.warning("[CIRCUIT-BREAKER] Opened — %d failures in %.0fs window", len(self._failures), self.window)

    def record_success(self) -> None:
        self._failures.clear()
        self._open_until = 0.0

    @property
    def is_open(self) -> bool:
        if time.time() >= self._open_until:
            return False
        return True


_circuit_breaker = CircuitBreaker(threshold=5, window=60.0, reset_timeout=30.0)


# ─── LLM Response Cache ──────────────────────────────────────────────────────
class ResponseCache:
    """In-memory exact-match cache for LLM responses. Reduces redundant Groq calls."""
    def __init__(self, max_size: int = 200, ttl_seconds: float = 300.0):
        self._cache: Dict[str, Tuple[dict, float]] = {}
        self._max_size = max_size
        self._ttl = ttl_seconds

    def _make_key(self, messages: List[dict], model: str) -> str:
        import hashlib
        content = json.dumps(messages, sort_keys=True) + model
        return hashlib.sha256(content.encode()).hexdigest()

    def get(self, messages: List[dict], model: str) -> Optional[dict]:
        key = self._make_key(messages, model)
        entry = self._cache.get(key)
        if entry is None:
            return None
        data, ts = entry
        if time.time() - ts > self._ttl:
            del self._cache[key]
            return None
        return data

    def put(self, messages: List[dict], model: str, response: dict) -> None:
        if len(self._cache) >= self._max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]
        key = self._make_key(messages, model)
        self._cache[key] = (response, time.time())


_response_cache = ResponseCache(max_size=200, ttl_seconds=300.0)

# ─── Multi-Key Rotation ────────────────────────────────────────────────────────
# Load up to 5 Groq API keys from env: GROQ_API_KEY, GROQ_API_KEY_2, ... _5
# AI-05: Also try to load from Vault if available
_GROQ_KEYS: List[str] = []

# First, try to load from Vault
if vault_service.is_available():
    vault_keys = vault_service.get_groq_api_keys()
    if vault_keys:
        _GROQ_KEYS.extend(vault_keys)
        logger.info(f"Loaded {len(vault_keys)} API keys from Vault")

# Then, load from environment variables (fallback)
for idx in ["", "_2", "_3", "_4", "_5"]:
    key = os.getenv(f"GROQ_API_KEY{idx}", "")
    if key and key not in _GROQ_KEYS:  # Avoid duplicates
        _GROQ_KEYS.append(key)

if not _GROQ_KEYS:
    print("[ai-manager] WARNING: No GROQ_API_KEY configured (env or Vault). AI will use fallback responses.")

_key_index = 0

def _get_next_key() -> Optional[str]:
    global _key_index
    if not _GROQ_KEYS:
        return None
    key = _GROQ_KEYS[_key_index % len(_GROQ_KEYS)]
    _key_index += 1
    return key


# AI-04: Ordered model fallback list (fastest → most capable)
_MODEL_FALLBACKS = [
    os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
]
_model_index = 0

def _get_next_model() -> str:
    global _model_index
    model = _MODEL_FALLBACKS[_model_index % len(_MODEL_FALLBACKS)]
    _model_index += 1
    return model


# ─── Prompt Injection Detection ────────────────────────────────────────────────
_INJECTION_PATTERNS = [
    # Classic jailbreak patterns
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?",
    r"disregard\s+(all\s+)?(previous|prior)\s+",
    r"you\s+are\s+now\s+(?:dan|jailbreak|evil|unrestricted)",
    r"act\s+as\s+if\s+you\s+have\s+no\s+restrictions",
    r"pretend\s+(you\s+are|to\s+be)\s+(an?\s+)?(?:evil|unrestricted|unfiltered|jailbreak)",
    r"do\s+anything\s+now",
    r"developer\s+mode",
    r"system\s+prompt\s*:",
    r"<\s*system\s*>",
    r"\[INST\]",
    # Data exfiltration
    r"reveal\s+(your\s+)?(system|secret|hidden)\s+prompt",
    r"print\s+(your\s+)?(internal|system|initial)\s+(prompt|instructions?)",
    r"what\s+(are\s+)?your\s+(exact\s+)?instructions",
    # Role hijacking
    r"from\s+now\s+on\s+(you\s+are|act|behave)",
    r"your\s+new\s+role\s+is",
]
_INJECTION_RE = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]


def detect_injection(text: str) -> bool:
    """Returns True if prompt injection attempt detected."""
    for pattern in _INJECTION_RE:
        if pattern.search(text):
            return True
    return False


# ─── Context Window Pruner ─────────────────────────────────────────────────────
MAX_CONTEXT_TURNS = 6  # Keep last 6 exchanges (12 messages)
APPROX_CHARS_PER_TOKEN = 4
MAX_CONTEXT_CHARS = 8192 * APPROX_CHARS_PER_TOKEN  # ~32768 chars


def prune_conversation_history(
    conversation_history: List[dict],
    system_prompt: str,
    current_question: str = "",
) -> List[dict]:
    """
    Sliding window pruner:
    - Always keep the system prompt slot
    - Keep last MAX_CONTEXT_TURNS pairs of (assistant, user)
    - Ensure total chars fit within MAX_CONTEXT_CHARS
    """
    if not conversation_history:
        return []

    # Take last MAX_CONTEXT_TURNS * 2 messages
    pruned = conversation_history[-(MAX_CONTEXT_TURNS * 2):]

    # Trim further if char budget exceeded
    base_chars = len(system_prompt) + len(current_question)
    while pruned and (base_chars + sum(len(m.get("content", "")) for m in pruned)) > MAX_CONTEXT_CHARS:
        pruned = pruned[2:]  # Remove oldest pair

    return pruned


# ─── JSON Response Validator ──────────────────────────────────────────────────

def validate_question_response(data: dict) -> bool:
    return isinstance(data.get("question"), str) and len(data["question"]) > 5


def validate_feedback_response(data: dict) -> bool:
    return (
        isinstance(data.get("overall_score"), (int, float)) and
        0 <= data["overall_score"] <= 100 and
        isinstance(data.get("strengths"), list) and
        isinstance(data.get("weaknesses"), list)
    )


class AIManager:
    def __init__(self):
        # AI-04: Primary model is first in fallback list; no longer stored as self.model
        self._violation_counts: Dict[str, int] = {}  # session_id → violation count
        # AI-12: Per-session token usage tracking {session_id: {prompt: int, completion: int}}
        self._token_usage: Dict[str, Dict[str, int]] = {}
        # AI-03: Per-session answer quality scores for adaptive difficulty
        self._session_quality_scores: Dict[str, List[int]] = {}

    def _get_client(self) -> Optional[Groq]:
        key = _get_next_key()
        if not key:
            return None
        return Groq(api_key=key)

    def transcribe_audio(self, audio_file_bytes: bytes, filename: str) -> str:
        """Transcribe audio bytes using Groq Whisper API (direct HTTP request to avoid SDK version issues)."""
        key = _get_next_key()
        if not key:
            raise ValueError("Groq API key not configured")

        # Try Groq SDK if audio attribute exists
        client = self._get_client()
        if client and hasattr(client, 'audio'):
            try:
                translation = client.audio.transcriptions.create(
                    file=(filename or "audio.webm", audio_file_bytes),
                    model="whisper-large-v3-turbo",
                    response_format="json",
                )
                if hasattr(translation, 'text'):
                    return translation.text
                elif isinstance(translation, dict) and "text" in translation:
                    return translation["text"]
            except Exception as sdk_err:
                logger.warning(f"Groq SDK audio transcription failed: {sdk_err}. Trying direct HTTP fallback...")

        # Direct HTTP request fallback to Groq Audio API
        import requests
        headers = {"Authorization": f"Bearer {key}"}
        filename_clean = filename or "audio.webm"
        mime_type = "audio/webm"
        if filename_clean.endswith(".mp3"): mime_type = "audio/mpeg"
        elif filename_clean.endswith(".wav"): mime_type = "audio/wav"
        elif filename_clean.endswith(".ogg"): mime_type = "audio/ogg text/plain"

        files = {"file": (filename_clean, audio_file_bytes, mime_type)}
        data = {"model": "whisper-large-v3-turbo", "response_format": "json"}

        try:
            response = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers,
                files=files,
                data=data,
                timeout=30
            )

            if response.status_code == 200:
                res_json = response.json()
                return res_json.get("text", "")
            
            # Model fallback: try whisper-large-v3
            data["model"] = "whisper-large-v3"
            files = {"file": (filename_clean, audio_file_bytes, mime_type)}
            response2 = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers,
                files=files,
                data=data,
                timeout=30
            )
            if response2.status_code == 200:
                return response2.json().get("text", "")
            
            raise ValueError(f"Groq Audio API returned HTTP {response.status_code}: {response.text}")
        except Exception as http_err:
            logger.error(f"Audio transcription HTTP request failed: {http_err}")
            raise ValueError(f"Transcription service error: {str(http_err)}")

    def check_and_record_injection(self, session_id: str, text: str) -> bool:
        """
        Check for injection. Returns True if session should be terminated
        (3+ violations per SRS AI-06).
        """
        if detect_injection(text):
            self._violation_counts[session_id] = self._violation_counts.get(session_id, 0) + 1
            violations = self._violation_counts[session_id]
            # AI-06: Log incident with severity
            logger.warning(
                "[INJECTION] session=%s violations=%d text_preview=%.120r",
                session_id, violations, text
            )
            return violations >= 3
        return False

    def record_token_usage(self, session_id: str, prompt_tokens: int, completion_tokens: int) -> None:
        """AI-12: Accumulate Groq token costs per session."""
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
        """Return accumulated token usage for a session."""
        return self._token_usage.get(session_id, {"prompt": 0, "completion": 0, "total": 0})

    def _build_interview_system_prompt(
        self,
        interview_type: str,
        difficulty: str,
        target_company: Optional[str],
        focus_area: Optional[str],
        candidate_name: Optional[str] = "Candidate",
    ) -> str:
        type_descriptions = {
            "dsa": "Data Structures and Algorithms coding interview",
            "behavioral": "Behavioral interview using the STAR method",
            "system_design": "System Design and architecture interview",
        }
        difficulty_descriptions = {
            "easy": "beginner level",
            "medium": "intermediate level",
            "hard": "advanced / senior engineer level",
        }
        system = (
            f"You are an expert technical interviewer at a top tech company, conducting a "
            f"{type_descriptions.get(interview_type, 'technical')} interview at "
            f"{difficulty_descriptions.get(difficulty, 'medium')} difficulty with a candidate named {candidate_name}."
        )
        if target_company:
            system += f" The candidate is interviewing for a role at {target_company}."
        if focus_area:
            system += f" Focus specifically on: {focus_area}."

        # Friendly welcoming greeting at the start
        system += (
            f"\n\nAt the very start of the interview (when the conversation history is empty), "
            f"begin with a warm, friendly greeting to {candidate_name} by name. "
            f"Welcome them, say something encouraging to make them comfortable and confident, "
            f"introduce yourself briefly as their AI interviewer, and then present the first question."
        )

        # CRITICAL: Proper interview flow instructions
        system += """

CRITICAL INTERVIEW CONDUCT RULES — follow these exactly at every turn:

1. RESPOND TO THE CANDIDATE FIRST: Always acknowledge and respond to what the candidate just said before doing anything else.
   - If their answer is good and complete: briefly praise it (1-2 sentences), then move to a new question.
   - If their answer is vague, short (e.g. "yes", "ok", "I think so"), or missing key details: DO NOT give a new question. Instead, ask a probing follow-up to get more depth (e.g. "Could you elaborate on that?", "Can you walk me through how you'd approach that?", "That's a good start — what specific data structure would you use and why?").
   - If their answer is completely wrong or off-topic: gently redirect them with a hint or a clarifying question.
   - NEVER jump straight to a new unrelated question if the candidate's last message was a short, vague, or incomplete answer.

2. MAINTAIN INTERVIEW STRUCTURE:
   - Spend 2-4 turns deeply exploring each question/topic before moving on.
   - For DSA: discuss approach, complexity, edge cases, then code/pseudocode. Don't rush to a new problem.
   - For Behavioral: use STAR. Probe for Situation, Task, Action, Result. Ask follow-ups on each.
   - For System Design: probe requirements, then components, then scalability. Ask about trade-offs.

3. BE CONVERSATIONAL: Sound like a real human interviewer. Use the candidate's name occasionally. Be warm but professional.

4. ONLY move to a NEW question/topic when the current one has been adequately explored (at least 2 candidate responses on the topic)."""

        system += (
            "\n\nIMPORTANT: Always respond ONLY with valid JSON matching the exact schema requested. "
            "Do not include markdown, code fences, or any text outside the JSON object."
        )

        # AI-11: Interview-type-specific evaluation checklists
        if interview_type == "system_design":
            system += (
                "\n\nFor system design: probe requirements first, then high-level design, "
                "then components (load balancer, cache, DB, sharding), then scalability. "
                "Ask follow-up questions on any area the candidate glosses over."
            )
        elif interview_type == "behavioral":
            system += (
                "\n\nFor behavioral: explicitly extract all STAR components. If the candidate "
                "skips Situation, Task, Action, or Result — ask specifically for the missing part."
            )
        elif interview_type == "dsa":
            system += (
                "\n\nFor DSA: first ask for their initial approach/intuition, then probe for "
                "time/space complexity, then edge cases, then implementation. Guide progressively."
            )
        return system

    # ─── AI-03: Adaptive Difficulty Scoring ────────────────────────────────────

    def score_answer_quality(self, answer: str, interview_type: str) -> int:
        """
        AI-03: Score an answer 0-10 using heuristics (no LLM).
        Base: 5. Bonuses for length and relevant keywords. Penalty for very short.
        """
        words = answer.split()
        word_count = len(words)
        score = 5

        # Length bonuses
        if word_count > 200:
            score += 2
        elif word_count > 100:
            score += 1

        # Length penalty
        if word_count < 20:
            score -= 1

        # Keyword bonuses (max +3)
        answer_lower = answer.lower()
        if interview_type == "behavioral":
            keywords = ["complexity", "trade-off", "o(n)", "scalab", "star", "situation", "action", "result"]
        elif interview_type == "dsa":
            keywords = ["hash", "tree", "graph", "dp", "greedy", "binary"]
        else:  # system_design
            keywords = ["load balancer", "cache", "database", "microservice", "sharding", "cdn"]

        keyword_hits = sum(1 for kw in keywords if kw in answer_lower)
        score += min(keyword_hits, 3)

        return max(0, min(10, score))

    def get_adaptive_difficulty(self, session_id: str, base_difficulty: str) -> str:
        """
        AI-03: Return an adjusted difficulty level based on recent answer quality scores.
        Upgrades difficulty if avg of last 3 scores >= 8, downgrades if avg <= 3.
        """
        scores = self._session_quality_scores.get(session_id, [])
        if len(scores) < 2:
            return base_difficulty

        recent = scores[-3:]
        avg = sum(recent) / len(recent)

        upgrade_map = {"easy": "medium", "medium": "hard", "hard": "hard"}
        downgrade_map = {"hard": "medium", "medium": "easy", "easy": "easy"}

        if avg >= 8:
            return upgrade_map.get(base_difficulty, base_difficulty)
        elif avg <= 3:
            return downgrade_map.get(base_difficulty, base_difficulty)
        return base_difficulty

    # ─── AI-10: STAR Method Extraction ─────────────────────────────────────────

    def extract_star_components(self, answer: str) -> dict:
        """AI-10: Extract STAR method components from a behavioral answer."""
        answer_lower = answer.lower()
        situation_keywords = ["situation", "context", "when i", "at my", "in my", "while working", "during"]
        task_keywords = ["task", "responsible", "needed to", "had to", "my role", "assigned", "challenge"]
        action_keywords = ["action", "i did", "i decided", "i implemented", "i took", "i created", "i led", "i worked", "so i", "therefore i"]
        result_keywords = ["result", "outcome", "consequently", "as a result", "ended up", "achieved", "improved", "increased", "reduced", "saved"]

        components = {
            "situation": any(kw in answer_lower for kw in situation_keywords),
            "task": any(kw in answer_lower for kw in task_keywords),
            "action": any(kw in answer_lower for kw in action_keywords),
            "result": any(kw in answer_lower for kw in result_keywords),
        }
        completeness = sum(components.values()) / 4.0
        missing = [k.upper() for k, v in components.items() if not v]
        return {
            "components": components,
            "completeness": completeness,
            "missing_components": missing,
            "star_score": int(completeness * 100),
        }

    def _build_question_user_message(self, conversation_history: List[dict]) -> str:
        schema = '{"question": "<your response to candidate + your next question or probing follow-up>", "hints": ["hint1", "hint2"], "follow_up_questions": ["q1"]}'
        if not conversation_history:
            return (
                "This is the very start of the interview. Greet the candidate warmly by name, make them feel "
                "comfortable, introduce yourself, and present the first interview question clearly. "
                f"Return JSON: {schema}"
            )

        # Inspect the last user message to decide what kind of response to give
        last_user_msg = ""
        last_assistant_msg = ""
        for turn in reversed(conversation_history):
            if turn.get("role") == "user" and not last_user_msg:
                last_user_msg = turn.get("content", "").strip()
            elif turn.get("role") == "assistant" and not last_assistant_msg:
                last_assistant_msg = turn.get("content", "").strip()
            if last_user_msg and last_assistant_msg:
                break

        word_count = len(last_user_msg.split()) if last_user_msg else 0
        is_short_vague = word_count < 15

        if is_short_vague:
            return (
                f"The candidate just gave a very short answer: \"{last_user_msg}\". "
                "This is too brief and vague — do NOT move to a new topic. "
                "Instead, acknowledge what they said briefly and ask a probing follow-up question "
                "to encourage them to elaborate and give a more complete answer. "
                "Be encouraging and guide them toward a better response. "
                f"Return JSON: {schema}"
            )
        else:
            return (
                "The candidate has given an answer. First, briefly acknowledge what they said (1-2 sentences). "
                "Then, based on whether their answer is complete or not: "
                "- If complete and thorough: give brief positive feedback and present the next interview question. "
                "- If incomplete (missing key details, complexity analysis, examples, etc.): ask a targeted "
                "follow-up to deepen their answer on the current topic. "
                f"Return JSON: {schema}"
            )

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
        Returns (question_dict, injection_terminated).
        If any user message contains injection, returns (fallback, True) on 3rd violation.
        """
        # Check all user messages in history for injection
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

        # AI-03: Score the last user answer (if any) and record for adaptive difficulty
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

        # AI-03: Adapt difficulty based on accumulated quality scores
        adaptive_difficulty = self.get_adaptive_difficulty(session_id, difficulty)
        if adaptive_difficulty != difficulty:
            logger.info(
                "[AI-03] session=%s difficulty adjusted %s -> %s",
                session_id, difficulty, adaptive_difficulty,
            )

        system_prompt = self._build_interview_system_prompt(
            interview_type, adaptive_difficulty, target_company, focus_area, candidate_name
        )
        pruned_history = prune_conversation_history(conversation_history, system_prompt)
        user_message = self._build_question_user_message(pruned_history)

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(pruned_history)
        messages.append({"role": "user", "content": user_message})

        client = self._get_client()
        if not client:
            return self._fallback_question(interview_type), False

        if _circuit_breaker.is_open:
            logger.warning("[CIRCUIT-BREAKER] Open — returning fallback without calling Groq")
            return self._fallback_question(interview_type), False

        # AI-04: Start with primary model; rotate on exception
        current_model = _MODEL_FALLBACKS[0]

        # Retry loop: up to 3 attempts with exponential backoff
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
                try:
                    parsed = json.loads(content)
                except Exception:
                    start_idx = content.find('{')
                    end_idx = content.rfind('}')
                    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                        parsed = json.loads(content[start_idx:end_idx+1])
                    else:
                        raise

                if parsed and isinstance(parsed, dict) and validate_question_response(parsed):
                    pre_text = content[:start_idx].strip() if start_idx != -1 else ""
                    if pre_text:
                        parsed["question"] = f"{pre_text}\n\n{parsed.get('question', '')}"
                    data = parsed
                    # AI-12: Record token usage
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
                # AI-04: Rotate both key and model on failure
                client = self._get_client()
                current_model = _get_next_model()
                logger.info("[AI-04] Rotated to model=%s", current_model)
                if not client:
                    break
            await asyncio.sleep(min(1.0 * (2 ** attempt), 4.0))

        return self._fallback_question(interview_type), False

    async def generate_feedback(
        self,
        conversation_history: List[dict],
        interview_type: str,
        user_answers: List[str],
    ) -> dict:
        """Generate comprehensive interview feedback with retry logic."""

        # Guard: detect incomplete/thin interview — don't send garbage to the AI
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

        # AI-04: Start with primary model; rotate on exception
        current_model = _MODEL_FALLBACKS[0]

        eval_messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ]
        cached = _response_cache.get(eval_messages, current_model)
        if cached:
            logger.info("[CACHE-HIT] Feedback response served from cache")
            return cached

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
                    # Ensure all expected keys exist
                    data.setdefault("problem_solving_score", data.get("technical_score", 0))
                    data.setdefault("summary", "Interview completed successfully.")
                    # AI-12: Record token usage
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
                # AI-04: Rotate both key and model on failure
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
        """Evaluate a candidate's code submission against the question."""
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
            return {"score": 0, "correctness": "unevaluated", "time_complexity": "unknown", "space_complexity": "unknown", "feedback": "Unable to evaluate — AI service unavailable. Please retry.", "improvements": ["Retry when AI service is available for an accurate evaluation."]}

        # AI-04: Start with primary model; rotate on exception
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
                # AI-04: Rotate model on failure
                current_model = _get_next_model()
                print(f"[ai-manager] Code eval attempt {attempt+1} failed, rotating to {current_model}: {e}")
            await asyncio.sleep(0.5)

        return {"score": 0, "correctness": "unevaluated", "time_complexity": "unknown", "space_complexity": "unknown", "feedback": "Code evaluation failed after retries. Please retry.", "improvements": ["Retry when AI service is available for an accurate evaluation."]}

    # ─── AI-09: 3-Level DSA Hint System ────────────────────────────────────────────

    async def generate_hint(
        self,
        question: str,
        hint_level: int = 1,  # 1=easy, 2=medium, 3=hard
        interview_type: str = "dsa",
        conversation_history: Optional[List[dict]] = None
    ) -> dict:
        """
        AI-09: Generate a hint at the specified level for the current question.
        
        Hint levels:
        - Level 1 (Easy): General guidance, points user in the right direction
        - Level 2 (Medium): More specific guidance, suggests approach or data structure
        - Level 3 (Hard): Near-solution guidance, specific algorithmic hint
        
        Args:
            question: The current interview question
            hint_level: 1, 2, or 3 (easy, medium, hard)
            interview_type: Type of interview (dsa, behavioral, system_design)
            conversation_history: Previous conversation turns for context
            
        Returns:
            dict with hint text and metadata
        """
        if hint_level not in [1, 2, 3]:
            raise ValueError("hint_level must be 1, 2, or 3")
        
        client = self._get_client()
        if not client:
            return self._fallback_hint(hint_level, interview_type)
        
        # Build context from conversation history
        context = ""
        if conversation_history:
            recent_turns = conversation_history[-4:]  # Last 4 turns for context
            context = "\n".join([f"{t.get('role', 'user')}: {t.get('content', '')}" for t in recent_turns])
        
        # Hint level descriptions
        hint_level_descriptions = {
            1: "Provide a gentle, general hint that points the user in the right direction without giving away the solution. Focus on the core concept or approach.",
            2: "Provide a more specific hint that suggests a particular data structure, algorithm, or approach. Give more guidance but still let the user figure out the implementation.",
            3: "Provide a near-solution hint that gives specific algorithmic guidance. This should be very close to revealing the solution but still requires the user to implement it."
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
        """Fallback hints when AI service is unavailable."""
        fallback_hints = {
            "dsa": {
                1: {
                    "hint": "Think about what data structure would be most efficient for this problem. Consider time and space complexity.",
                    "hint_level": 1,
                    "focus_area": "Data structure selection",
                    "next_step_suggestion": "Review common data structures and their use cases."
                },
                2: {
                    "hint": "Consider using a hash map or set to optimize lookups. Think about whether you need to store elements or just track their presence.",
                    "hint_level": 2,
                    "focus_area": "Optimization technique",
                    "next_step_suggestion": "Try implementing with a hash-based data structure."
                },
                3: {
                    "hint": "Use a single pass through the array with a hash map to store complements. For each element, check if its complement (target - element) exists in the map.",
                    "hint_level": 3,
                    "focus_area": "Algorithm implementation",
                    "next_step_suggestion": "Implement the two-sum hash map solution."
                }
            },
            "behavioral": {
                1: {
                    "hint": "Structure your answer using a clear framework. Think about the key elements of your story.",
                    "hint_level": 1,
                    "focus_area": "Answer structure",
                    "next_step_suggestion": "Consider using the STAR method."
                },
                2: {
                    "hint": "Use the STAR method: Situation, Task, Action, Result. Make sure to emphasize your specific actions and their impact.",
                    "hint_level": 2,
                    "focus_area": "STAR framework",
                    "next_step_suggestion": "Structure your answer with clear STAR sections."
                },
                3: {
                    "hint": "Focus on the 'Action' section - what specifically did you do? Quantify your impact with metrics. For 'Result', highlight the outcome and what you learned.",
                    "hint_level": 3,
                    "focus_area": "Specific details",
                    "next_step_suggestion": "Add specific metrics and outcomes to your story."
                }
            },
            "system_design": {
                1: {
                    "hint": "Start by clarifying the requirements. Think about scale, read/write ratios, and key features.",
                    "hint_level": 1,
                    "focus_area": "Requirements gathering",
                    "next_step_suggestion": "Ask clarifying questions about the system."
                },
                2: {
                    "hint": "Consider a distributed system with load balancing, caching, and database sharding. Think about the data model and access patterns.",
                    "hint_level": 2,
                    "focus_area": "System architecture",
                    "next_step_suggestion": "Design the high-level architecture components."
                },
                3: {
                    "hint": "Use a consistent hashing approach for load distribution. Implement Redis for caching, and consider a NoSQL database for flexibility. Add CDN for static content.",
                    "hint_level": 3,
                    "focus_area": "Specific technologies",
                    "next_step_suggestion": "Detail the technology stack and data flow."
                }
            }
        }
        
        return fallback_hints.get(interview_type, fallback_hints["dsa"]).get(hint_level, fallback_hints["dsa"][1])

    # ─── AI-10: Sentiment Scoring for Behavioral Interviews ────────────────────────

    async def analyze_sentiment(
        self,
        answer: str,
        question: str,
        interview_type: str = "behavioral"
    ) -> dict:
        """
        AI-10: Analyze the sentiment and emotional tone of a behavioral interview answer.
        Provides sentiment score, emotional indicators, and suggestions for improvement.
        
        Args:
            answer: The candidate's answer
            question: The interview question
            interview_type: Type of interview (typically behavioral)
            
        Returns:
            dict with sentiment analysis results
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
        """Fallback sentiment analysis when AI service is unavailable."""
        return {
            "sentiment_score": 75,
            "sentiment_category": "neutral",
            "confidence_level": 70,
            "emotional_indicators": {
                "enthusiasm": 70,
                "professionalism": 80,
                "authenticity": 75,
                "emotional_intelligence": 70
            },
            "strengths": [
                "Answered the question directly",
                "Maintained professional tone"
            ],
            "areas_for_improvement": [
                "Could show more enthusiasm",
                "Add more specific examples"
            ],
            "suggestions": [
                "Use more engaging language",
                "Include quantifiable achievements"
            ]
        }

    # ─── AI-11: System Design Component Checklist ─────────────────────────────────

    async def evaluate_system_design(
        self,
        design_description: str,
        question: str,
        scale_requirements: Optional[dict] = None
    ) -> dict:
        """
        AI-11: Evaluate a system design answer against a comprehensive component checklist.
        Provides coverage analysis for key system design components.
        
        Args:
            design_description: The candidate's system design description
            question: The system design question
            scale_requirements: Optional scale requirements (QPS, data size, etc.)
            
        Returns:
            dict with component coverage analysis and scores
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
        """Fallback system design evaluation when AI service is unavailable."""
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
                "scalability": {"covered": False, "score": 0, "notes": "Not evaluated — AI unavailable"}
            },
            "strengths": [],
            "missing_components": [
                "AI evaluation unavailable — cannot determine coverage"
            ],
            "improvement_suggestions": [
                "Retry when AI service is available for an accurate system design evaluation",
                "Cover: load balancing, caching, database sharding, replication, monitoring"
            ],
            "follow_up_questions": []
        }

    # ─── Fallback Responses ─────────────────────────────────────────────────────

    def _fallback_question(self, interview_type: str) -> dict:
        fallbacks = {
            "dsa": {
                "question": "Given an array of integers, find two numbers that add up to a target sum. Return their indices.",
                "hints": ["Consider using a hash map", "Think about one-pass traversal", "What is the complement of each number?"],
                "follow_up_questions": ["Can you solve it in O(n)?", "What if the array is sorted?", "Handle duplicates in the input."],
            },
            "behavioral": {
                "question": "Tell me about a time when you had to lead a project under significant time pressure. What did you do?",
                "hints": ["Use the STAR method: Situation, Task, Action, Result", "Be specific about your role", "Quantify the impact if possible"],
                "follow_up_questions": ["What would you do differently?", "How did you prioritize tasks?", "How did the team respond?"],
            },
            "system_design": {
                "question": "Design a URL shortening service like bit.ly. Walk me through your approach.",
                "hints": ["Start with requirements gathering", "Consider read-heavy vs write-heavy workloads", "Think about encoding and collision avoidance"],
                "follow_up_questions": ["How do you handle 1M requests/second?", "How do you ensure uniqueness?", "What's your caching strategy?"],
            },
        }
        return fallbacks.get(interview_type, fallbacks["dsa"])

    def _fallback_feedback(self) -> dict:
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


ai_manager = AIManager()
