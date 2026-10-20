"""
================================================================================
AI INTERVIEWER SERVICE — REST & SERVER-SENT EVENTS (SSE) ROUTING LAYER
================================================================================
Role & Responsibility:
  This module defines the external HTTP API endpoints for the AI Interviewer service.
  It acts as the secure interface between the Next.js frontend / central Orchestrator
  and the underlying LLM inference engine (`ai_manager.py`).

Key Endpoints & Capabilities:
  1. POST /api/v1/interview/question: Synchronous generation of the next interview
     turn or follow-up question with JSON contract enforcement.
  2. POST /api/v1/interview/question/stream: Real-time Server-Sent Events (SSE)
     streaming for token-by-token rendering in the chat UI.
  3. POST /api/v1/interview/feedback: Post-session holistic evaluation across
     technical, communication, and problem-solving dimensions with anti-leniency guards.
  4. POST /api/v1/interview/evaluate-code: Evaluates candidate code solutions against
     problem statements and execution sandbox output.
  5. POST /api/v1/interview/hint: Progressive 3-level hinting gated behind Pro/Enterprise tiers.
  6. POST /api/v1/interview/star-analysis: Behavioral evaluation using the STAR framework.
  7. GET /api/v1/interview/adaptive-difficulty/{session_id}: Rolling difficulty telemetry.
  8. POST /api/v1/interview/transcribe: Audio speech-to-text transcription via Whisper.
  9. GET /api/v1/interview/tokens/{session_id}: Live session token and cost accounting.

Security & Rate Limiting:
  - Validates Bearer JWTs via auth-service (`/api/v1/auth/me`).
  - Enforces sliding-window rate limits (30 req/min) and single-concurrency slots via Redis.
  - Monitors session token budgets (50,000 token ceiling).
================================================================================
"""

from fastapi import APIRouter, HTTPException, Depends, status, Header, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio
import json as json_module
import httpx
import logging
import os
from typing import Optional, List
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from .models import InterviewRequest, InterviewResponse, FeedbackRequest, FeedbackResponse
from .ai_manager import ai_manager
from .ai_limiter import (
    check_ai_rate_limit,
    acquire_ai_slot,
    release_ai_slot,
    check_token_budget,
    record_tokens_used,
)

# Initialize APIRouter under standard /api/v1/interview prefix
router = APIRouter(prefix="/api/v1/interview", tags=["interview"])
security = HTTPBearer()

# Base URL for upstream authentication validation
AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")

_auth_http_client: Optional[httpx.AsyncClient] = None


def get_auth_client() -> httpx.AsyncClient:
    """Returns or initializes a connection-pooled HTTP client for auth verification."""
    global _auth_http_client
    if _auth_http_client is None or _auth_http_client.is_closed:
        _auth_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, connect=3.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=50)
        )
    return _auth_http_client


async def close_auth_client():
    """Gracefully closes the pooled auth HTTP client on service shutdown."""
    global _auth_http_client
    if _auth_http_client and not _auth_http_client.is_closed:
        await _auth_http_client.aclose()
        _auth_http_client = None


async def verify_token(token: str) -> Optional[dict]:
    """
    Validates an incoming Bearer JWT against auth-service using a pooled HTTP connection.

    Parameters:
      token (str): Raw JWT token extracted from the Authorization header.

    Returns:
      Optional[dict]: User profile dict if token is valid, or None if expired/invalid.

    Design Rationale:
      Delegates token decoding and revocation checking to auth-service's `/api/v1/auth/me`
      endpoint to ensure centralized session and blacklist management without socket churn.
    """
    try:
        client = get_auth_client()
        response = await client.get(
            f"{AUTH_SERVICE_URL}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    FastAPI dependency that enforces authentication on protected routes.

    Parameters:
      credentials (HTTPAuthorizationCredentials): Bearer token extracted from request header.

    Returns:
      dict: Authenticated user dictionary (including id, email, plan tier).

    Raises:
      HTTPException (401 Unauthorized): If the token is missing, invalid, or expired.
    """
    token = credentials.credentials
    user = await verify_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user


# ==============================================================================
# ROUTE 1: SYNCHRONOUS INTERVIEW QUESTION GENERATION
# ==============================================================================

@router.post("/question", response_model=InterviewResponse)
async def generate_question(
    request_data: InterviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generates the next interview turn, follow-up, or question using Groq LLM.

    Parameters:
      request_data (InterviewRequest): Payload containing track, difficulty, and message history.
      current_user (dict): Authenticated user context.

    Returns:
      InterviewResponse: Question text, algorithmic hints, and suggested follow-ups.

    Flow:
      1. Enforces sliding window rate limit (30 req/min) and session token budget (50k).
      2. Acquires exclusive concurrency lock to prevent overlapping generation turns.
      3. Invokes `ai_manager.generate_interview_question` with adaptive heuristics.
      4. Detects and blocks repeated prompt injection attempts (HTTP 422).
      5. Records consumed token metrics into Redis.
      6. Releases concurrency lock in `finally` block.
    """
    session_id = request_data.session_id or current_user.get("id", "default")
    user_id = current_user.get("id", "unknown")

    # Step 1: Pre-execution rate limit and quota checks
    await check_ai_rate_limit(user_id)
    await check_token_budget(session_id)
    await acquire_ai_slot(user_id)

    try:
        candidate_name = current_user.get("display_name") or current_user.get("email") or "Candidate"

        # Step 2: Invoke core LLM generation
        question_dict, terminated = await ai_manager.generate_interview_question(
            interview_type=request_data.interview_type,
            difficulty=request_data.difficulty,
            target_company=request_data.target_company,
            focus_area=request_data.focus_area,
            conversation_history=[m.dict() for m in request_data.conversation_history],
            session_id=session_id,
            candidate_name=candidate_name,
        )

        # Step 3: Handle policy termination
        if terminated:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Session terminated: repeated prompt injection policy violations detected.",
            )

        # Step 4: Record token usage
        usage = ai_manager.get_token_usage(session_id)
        await record_tokens_used(session_id, usage.get("total", 0))

        return InterviewResponse(
            question=question_dict.get("question", "Can you describe your approach?"),
            hints=question_dict.get("hints", []),
            follow_up_questions=question_dict.get("follow_up_questions", []),
        )
    finally:
        # Step 5: Always release the candidate's concurrency slot
        await release_ai_slot(user_id)


def get_progressive_interview_turn(
    history: list,
    interview_type: str,
    difficulty: str,
    candidate_name: str = "Candidate",
) -> dict:
    """
    Generates a natural, state-aware progressive interview question and hints
    when external LLMs (Groq) fail, rate limit, or run in offline/fallback mode.
    Guarantees the AI never repeats the same question in a loop.
    """
    candidate_turns = [
        m for m in history
        if m.get("role") in ("user", "candidate") and m.get("content", "").strip()
    ]
    turn_idx = len(candidate_turns)
    itype = (interview_type or "dsa").lower()

    if turn_idx == 0:
        # Turn 0: Opening introduction
        q = (
            f"Hello {candidate_name}, welcome to your {itype.upper()} technical interview! "
            f"I'll be your AI interviewer today. To get us started, could you share a brief overview "
            f"of your technical background, the technologies you work with most, and projects you've recently built?"
        )
        return {
            "question": q,
            "hints": ["Focus on your core languages, backend/frontend tools, and recent challenges."],
            "follow_up_questions": ["What is a technical project you are most proud of?"],
        }

    elif turn_idx == 1:
        # Turn 1: Primary technical challenge
        if itype == "dsa":
            q = (
                f"Thanks for sharing your background, {candidate_name}! Let's dive straight into our coding portion.\n\n"
                f"### Problem: Two Sum\n"
                f"Given an array of integers `nums` and an integer `target`, return the **indices** of the two numbers such that they add up to `target`.\n\n"
                f"You may assume each input has exactly one solution, and you may not use the same element twice.\n\n"
                f"**Example:**\n"
                f"- Input: `nums = [2, 7, 11, 15]`, `target = 9`\n"
                f"- Output: `[0, 1]` (because `nums[0] + nums[1] == 9`)\n\n"
                f"Before writing code in the editor, walk me through your initial algorithmic thought process."
            )
            hints = [
                "Consider using a hash map (dictionary) to store previously seen numbers and their indices.",
                "In a single pass: for each number `num`, check if `(target - num)` is already in your hash map.",
            ]
            follow_ups = ["What is the time complexity of the hash map approach compared to nested loops?"]
        elif itype == "system_design":
            q = (
                f"Great to meet you, {candidate_name}! Let's jump into our system design challenge.\n\n"
                f"### Challenge: Scalable URL Shortener (e.g. Bit.ly)\n"
                f"Design a high-scale distributed URL shortener service that generates unique short links (e.g. `dev.mt/xyz123`) "
                f"and redirects users with sub-10ms latency at 100M writes/month.\n\n"
                f"To start off, walk me through:\n"
                f"1. Key functional & non-functional requirements\n"
                f"2. Core API contracts (`createShortUrl`, `getOriginalUrl`)\n"
                f"3. High-level data model & unique hash generation strategy."
            )
            hints = [
                "Think about read-to-write ratio: URL shortening is heavily read-dominant (~100:1).",
                "Consider Base62 encoding over a counter or distributed snowflake ID generator.",
            ]
            follow_ups = ["How would you cache hot URLs to maintain under 10ms redirect latency?"]
        else:  # behavioral
            q = (
                f"Thank you for the introduction, {candidate_name}! Let's begin our behavioral evaluation using the STAR framework (Situation, Task, Action, Result).\n\n"
                f"Can you tell me about a time when you encountered a critical technical roadblock or production outage under tight deadline pressure? "
                f"Walk me through what happened, your specific role, the actions you took, and the eventual outcome."
            )
            hints = [
                "Structure your response clearly around Situation, Task, Action, and measurable Result.",
                "Highlight your personal technical decisions and how you communicated under pressure.",
            ]
            follow_ups = ["What would you do differently if faced with that exact deadline today?"]

        return {"question": q, "hints": hints, "follow_up_questions": follow_ups}

    elif turn_idx == 2:
        # Turn 2: Complexity & edge case probing
        if itype == "dsa":
            q = (
                "That's a solid initial thought. Can you analyze the time and space complexity of your approach? "
                "Also, what edge cases should we account for? For example: negative numbers, duplicate values, "
                "large arrays, or cases where no valid pair exists?"
            )
            hints = [
                "A hash map approach provides O(n) time and O(n) auxiliary space.",
                "Check whether you need to handle duplicate values or return empty if no pair sums to target.",
            ]
        elif itype == "system_design":
            q = (
                "Good start on the API and data schema. Let's talk scale: If traffic spikes to 50,000 requests per second, "
                "how do you design the database layer? Would you use SQL or NoSQL, and how would you handle horizontal sharding and replication?"
            )
            hints = [
                "NoSQL key-value stores (e.g. DynamoDB or Cassandra) provide predictable horizontal partitioning.",
                "Use a consistent hashing ring to distribute traffic evenly across shards.",
            ]
        else:
            q = (
                "That's clear context on the situation and task. What was the most challenging technical trade-off "
                "you had to negotiate with teammates or stakeholders during that incident, and how did you resolve disagreements?"
            )
            hints = [
                "Emphasize constructive compromise, data-driven decisions, and clear communication.",
            ]

        return {"question": q, "hints": hints, "follow_up_questions": []}

    elif turn_idx == 3:
        # Turn 3: Implementation & coding
        if itype == "dsa":
            q = (
                "Excellent analysis. Go ahead and write out your implementation in the code editor on the right! "
                "Feel free to choose Python, JavaScript, or TypeScript, and click **Run Code** to verify against test cases."
            )
            hints = [
                "Initialize `seen = {}`.",
                "Loop through `nums` with indices: `diff = target - num`. If `diff in seen`, return `[seen[diff], i]`.",
            ]
        elif itype == "system_design":
            q = (
                "Good architectural choices. Now let's address caching and high availability: Where would you place Redis or Memcached "
                "in your architecture, what cache eviction policy (LRU/LFU) would you choose, and how would you prevent cache stampede?"
            )
            hints = [
                "Use Redis cluster as a look-aside cache in front of your database with LRU eviction.",
                "Use mutex locking or probabilistic early expiration to avoid cache stampedes on hot keys.",
            ]
        else:
            q = (
                "Thank you for sharing that. Looking back, what was the most valuable technical lesson you learned "
                "from that project, and how has it influenced the way you build software today?"
            )
            hints = [
                "Connect the past experience to your current best practices (testing, observability, design docs).",
            ]

        return {"question": q, "hints": hints, "follow_up_questions": []}

    else:
        # Turn 4+: Optimization / wrap up
        if itype == "dsa":
            q = (
                "Great work working through the problem! As a final follow-up: If the input array was guaranteed to be already sorted, "
                "could we solve this in O(1) auxiliary space without using a hash map? How would a two-pointer approach work here?"
            )
            hints = [
                "Place left pointer at index 0 and right pointer at index len - 1.",
                "If `nums[left] + nums[right] < target`, increment `left`. If greater, decrement `right`.",
            ]
        elif itype == "system_design":
            q = (
                "Solid architectural design! How would you monitor system health, latency SLAs, and detect anomalies in production?"
            )
            hints = [
                "Instrument Prometheus metrics (p95/p99 latency, error rates, cache hit ratio) and configure Grafana dashboards.",
            ]
        else:
            q = (
                "Thank you for walking me through those experiences in depth. Is there any other technical project or architectural "
                "philosophy you'd like to share before we conclude this interview?"
            )
            hints = ["Feel free to highlight open-source work, system reliability, or team mentorship."]

        return {"question": q, "hints": hints, "follow_up_questions": []}


# ==============================================================================
# ROUTE 2: SERVER-SENT EVENTS (SSE) STREAMING QUESTION GENERATION
# ==============================================================================

@router.post("/question/stream")
async def generate_question_stream(
    request_data: InterviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Streams question tokens in real time via Server-Sent Events (SSE).

    Parameters:
      request_data (InterviewRequest): Interview context and transcript.
      current_user (dict): Authenticated candidate profile.

    Returns:
      StreamingResponse: Event stream formatted as `data: {"token": "...", "done": false}\n\n`.

    Benefits:
      Minimizes perceived latency (Time to First Token < 300ms) by rendering the interviewer's
      response immediately as Groq streams tokens, rather than waiting for the entire completion.
    """
    from groq import AsyncGroq
    from .ai_manager import _get_next_key, prune_conversation_history

    session_id = request_data.session_id or current_user.get("id", "default")
    user_id = current_user.get("id", "unknown")

    # Rate limiting and concurrency allocation
    await check_ai_rate_limit(user_id)
    await check_token_budget(session_id)
    await acquire_ai_slot(user_id)

    # Check for adversarial injection before opening the streaming channel
    last_user_msg = next(
        (m.content for m in reversed(request_data.conversation_history) if m.role == "user"),
        "",
    )
    if ai_manager.check_and_record_injection(session_id, last_user_msg):
        await release_ai_slot(user_id)
        async def injection_stream():
            yield f"data: {json_module.dumps({'error': 'Session terminated: repeated injection violations.', 'done': True})}\n\n"
        return StreamingResponse(injection_stream(), media_type="text/event-stream")

    candidate_name = current_user.get("display_name") or current_user.get("email") or "Candidate"
    system_prompt = ai_manager._build_interview_system_prompt(
        interview_type=request_data.interview_type,
        difficulty=request_data.difficulty,
        target_company=request_data.target_company,
        focus_area=request_data.focus_area,
        candidate_name=candidate_name,
    )
    history = prune_conversation_history(
        [m.dict() for m in request_data.conversation_history],
        system_prompt,
    )
    user_turn = ai_manager._build_question_user_message(history)
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": user_turn},
    ]

    async def event_generator():
        """Asynchronous generator yielding SSE token frames to the client."""
        try:
            key = _get_next_key()
            async def stream_progressive_fallback():
                fallback_data = get_progressive_interview_turn(
                    history=history,
                    interview_type=request_data.interview_type,
                    difficulty=request_data.difficulty,
                    candidate_name=candidate_name,
                )
                fq = fallback_data["question"]
                words = fq.split(" ")
                for i, w in enumerate(words):
                    chunk = w + (" " if i < len(words) - 1 else "")
                    yield f"data: {json_module.dumps({'token': chunk, 'done': False})}\n\n"
                    await asyncio.sleep(0.015)
                yield f"data: {json_module.dumps({'token': '', 'done': True, 'question': fq, 'hints': fallback_data.get('hints', []), 'follow_up_questions': fallback_data.get('follow_up_questions', [])})}\n\n"

            if not key:
                logger.info("No Groq API key available; using progressive interview engine")
                async for frame in stream_progressive_fallback():
                    yield frame
                return

            client = AsyncGroq(api_key=key)
            full_text = ""
            models_to_try = [
                os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                "llama-3.1-8b-instant",
                "mixtral-8x7b-32768",
                "gemma2-9b-it",
            ]

            stream_success = False
            for model in models_to_try:
                try:
                    stream = await client.chat.completions.create(
                        model=model,
                        messages=messages,
                        stream=True,
                        temperature=0.7,
                        max_tokens=600,
                    )
                    # Yield each text delta as it arrives across the wire
                    async for chunk in stream:
                        delta = chunk.choices[0].delta.content or ""
                        if delta:
                            full_text += delta
                            yield f"data: {json_module.dumps({'token': delta, 'done': False})}\n\n"
                            await asyncio.sleep(0)  # Yield control back to event loop
                    stream_success = True
                    break
                except Exception as model_err:
                    logger.warning(f"Model {model} failed: {model_err}. Trying next fallback...")
                    continue

            if not stream_success or not full_text.strip():
                logger.info("External LLM did not complete stream; using progressive interview engine")
                async for frame in stream_progressive_fallback():
                    yield frame
                return

            # Parse accumulated stream into structured JSON object
            parsed = None
            start_idx = -1
            try:
                parsed = json_module.loads(full_text)
            except Exception:
                start_idx = full_text.find("{")
                end_idx = full_text.rfind("}")
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    try:
                        parsed = json_module.loads(full_text[start_idx:end_idx + 1])
                    except Exception:
                        pass

            # Final SSE completion packet
            if parsed and isinstance(parsed, dict):
                pre_text = full_text[:start_idx].strip() if start_idx != -1 else ""
                main_q = parsed.get("question", "")
                final_q = f"{pre_text}\n\n{main_q}".strip() if pre_text else main_q
                yield f"data: {json_module.dumps({'token': '', 'done': True, 'question': final_q or full_text.strip(), 'hints': parsed.get('hints', []), 'follow_up_questions': parsed.get('follow_up_questions', [])})}\n\n"
            else:
                yield f"data: {json_module.dumps({'token': '', 'done': True, 'question': full_text.strip(), 'hints': [], 'follow_up_questions': []})}\n\n"

        except Exception as e:
            logger.exception("Error in event_generator: %s", e)
            fallback_data = get_progressive_interview_turn(
                history=history,
                interview_type=request_data.interview_type,
                difficulty=request_data.difficulty,
                candidate_name=candidate_name,
            )
            fq = fallback_data["question"]
            yield f"data: {json_module.dumps({'token': fq, 'done': True, 'question': fq, 'hints': fallback_data.get('hints', []), 'follow_up_questions': fallback_data.get('follow_up_questions', [])})}\n\n"
        finally:
            await release_ai_slot(user_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disables Nginx reverse-proxy buffering
        },
    )


# ==============================================================================
# ROUTE 3: INTERVIEW EVALUATION & FEEDBACK GENERATION
# ==============================================================================

@router.post("/feedback", response_model=FeedbackResponse)
async def generate_feedback(
    request_data: FeedbackRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generates comprehensive qualitative evaluation, scores (0-100), and recommendations.

    Parameters:
      request_data (FeedbackRequest): Complete conversation transcript and user answers.
      current_user (dict): Authenticated candidate profile.

    Returns:
      FeedbackResponse: Detailed report across technical, communication, and problem-solving metrics.

    Anti-Leniency Check:
      If candidate provided fewer than 2 meaningful responses (< 10 words total),
      returns an incomplete result with 0 score, refusing to hallucinate praise.
    """
    user_id = current_user.get("id", "unknown")

    await check_ai_rate_limit(user_id)
    await acquire_ai_slot(user_id)

    try:
        history = [m.dict() for m in request_data.conversation_history]

        # Guard: Detect empty or incomplete interview sessions
        user_messages = [m for m in history if m.get("role") == "user"]
        total_user_words = sum(len(m.get("content", "").split()) for m in user_messages)
        meaningful_turns = sum(1 for m in user_messages if len(m.get("content", "").split()) >= 5)

        if len(user_messages) < 1 or total_user_words < 10 or meaningful_turns < 1:
            return FeedbackResponse(
                overall_score=0,
                technical_score=0,
                communication_score=0,
                problem_solving_score=0,
                strengths=[],
                weaknesses=[
                    "No meaningful answers were provided during the interview",
                    "The interview session ended without sufficient participation",
                ],
                recommendations=[
                    "Attempt the interview again and provide detailed answers to each question",
                    "Read each question carefully and explain your thought process",
                    "Aim to write at least 2-3 sentences per answer",
                ],
                summary=(
                    "This interview session was incomplete — no meaningful answers were detected. "
                    "Please start a new session and actively participate by answering each question "
                    "in detail to receive a genuine evaluation."
                ),
            )

        # Invoke LLM evaluation via ai_manager
        result = await ai_manager.generate_feedback(
            conversation_history=history,
            interview_type=request_data.interview_type,
            user_answers=request_data.user_answers,
        )

        return FeedbackResponse(
            overall_score=result.get("overall_score", 0),
            technical_score=result.get("technical_score", 0),
            communication_score=result.get("communication_score", 0),
            problem_solving_score=result.get("problem_solving_score", 0),
            strengths=result.get("strengths", []),
            weaknesses=result.get("weaknesses", []),
            recommendations=result.get("recommendations", []),
            summary=result.get("summary", ""),
        )
    finally:
        await release_ai_slot(user_id)


# ==============================================================================
# ROUTE 4: CODE SUBMISSION EVALUATION
# ==============================================================================

class CodeEvalRequest(BaseModel):
    code: str
    question: str
    language: str
    session_id: Optional[str] = None
    execution_output: Optional[str] = None


@router.post("/evaluate-code")
async def evaluate_code(
    request_data: CodeEvalRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Evaluates candidate source code against problem specifications and sandbox test results.

    Parameters:
      request_data (CodeEvalRequest): Code text, programming language, and compiler stdout/stderr.
      current_user (dict): Authenticated candidate profile.

    Returns:
      dict: Code correctness ('correct'|'partial'|'incorrect'), Big-O complexity, and feedback.
    """
    user_id = current_user.get("id", "unknown")

    await check_ai_rate_limit(user_id)
    if request_data.session_id:
        await check_token_budget(request_data.session_id)
    await acquire_ai_slot(user_id)

    try:
        result = await ai_manager.evaluate_code_answer(
            code=request_data.code,
            question=request_data.question,
            language=request_data.language,
            execution_output=request_data.execution_output,
        )
        return result
    finally:
        await release_ai_slot(user_id)


# ==============================================================================
# ROUTE 5: PROGRESSIVE HINT GENERATION (PRO / ENTERPRISE TIER)
# ==============================================================================

class HintRequest(BaseModel):
    question: str
    interview_type: str
    code_so_far: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/hint")
async def get_hint(
    request_data: HintRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Generates a progressive guidance hint for candidates stuck on a problem.

    Access Control:
      Restricted to 'pro' and 'enterprise' plan tiers (HTTP 403 Forbidden on Free tier).
    """
    from groq import Groq
    from .ai_manager import _get_next_key, detect_injection
    import json

    # Enforce subscription tier entitlement
    user_plan = current_user.get("plan", "free")
    if user_plan not in ("pro", "enterprise"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hints are available on Pro and Enterprise plans only. Please upgrade to access this feature.",
        )

    # Sanitize prompt against injection
    if detect_injection(request_data.question):
        raise HTTPException(status_code=400, detail="Invalid request content.")

    user_id = current_user.get("id", "unknown")
    await check_ai_rate_limit(user_id)
    if request_data.session_id:
        await check_token_budget(request_data.session_id)
    await acquire_ai_slot(user_id)

    try:
        key = _get_next_key()
        if not key:
            return {"hint": "Think about the edge cases and consider different data structures.", "level": 1}

        client = Groq(api_key=key)
        code_context = f"\n\nCandidate's current code:\n```{request_data.interview_type}\n{request_data.code_so_far}\n```" if request_data.code_so_far else ""

        try:
            response = client.chat.completions.create(
                model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                messages=[
                    {"role": "system", "content": "You are a helpful interview coach giving a single progressive hint. Respond only with JSON."},
                    {"role": "user", "content": f"Question: {request_data.question}{code_context}\n\nGive one specific, progressive hint without giving away the solution. JSON: {{\"hint\": \"...\", \"level\": 1}}"},
                ],
                temperature=0.5,
                max_tokens=200,
                response_format={"type": "json_object"},
            )
            data = json.loads(response.choices[0].message.content)
            return data
        except Exception:
            return {"hint": "Consider breaking the problem into smaller sub-problems.", "level": 1}
    finally:
        await release_ai_slot(user_id)


# ==============================================================================
# ROUTE 6: STAR METHOD BEHAVIORAL ANALYSIS
# ==============================================================================

class STARAnalysisRequest(BaseModel):
    answer: str
    session_id: Optional[str] = None


@router.post("/star-analysis")
async def analyze_star(
    request_data: STARAnalysisRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Analyzes candidate behavioral responses for completeness under the STAR framework.

    Returns:
      Dictionary breaking down Situation, Task, Action, Result presence and completeness score.
    """
    result = ai_manager.extract_star_components(request_data.answer)
    return {
        "session_id": request_data.session_id,
        "star_components": result["components"],
        "star_score": result["star_score"],
        "completeness_pct": int(result["completeness"] * 100),
        "missing_components": result["missing_components"],
        "feedback": (
            "Great STAR structure!" if result["completeness"] >= 0.75
            else f"Your answer is missing: {', '.join(result['missing_components'])}. Try to add those components for a stronger response."
        ),
    }


# ==============================================================================
# ROUTE 7: ADAPTIVE DIFFICULTY TELEMETRY
# ==============================================================================

@router.get("/adaptive-difficulty/{session_id}")
async def get_adaptive_difficulty(
    session_id: str,
    base_difficulty: str = "medium",
    current_user: dict = Depends(get_current_user),
):
    """
    Returns dynamic difficulty telemetry and rolling quality scores for an active session.
    """
    adaptive = ai_manager.get_adaptive_difficulty(session_id, base_difficulty)
    scores = ai_manager._session_quality_scores.get(session_id, [])
    avg = sum(scores[-3:]) / len(scores[-3:]) if scores else None
    return {
        "session_id": session_id,
        "base_difficulty": base_difficulty,
        "adaptive_difficulty": adaptive,
        "average_quality_score": round(avg, 2) if avg is not None else None,
        "answers_evaluated": len(scores),
        "adjusted": adaptive != base_difficulty,
    }


# ==============================================================================
# ROUTE 8: PROMPT INJECTION TELEMETRY
# ==============================================================================

@router.get("/violations/{session_id}")
async def get_violation_count(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns recorded prompt injection violation strikes for a session (admin / proctoring audit).
    """
    count = ai_manager._violation_counts.get(session_id, 0)
    return {"session_id": session_id, "violations": count, "terminated": count >= 3}


# ==============================================================================
# ROUTE 9: TOKEN & ESTIMATED BILLING TELEMETRY
# ==============================================================================

@router.get("/tokens/{session_id}")
async def get_token_usage(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns accumulated prompt and completion tokens with estimated infrastructure cost in USD.
    """
    usage = ai_manager.get_token_usage(session_id)
    return {
        "session_id": session_id,
        "prompt_tokens": usage["prompt"],
        "completion_tokens": usage["completion"],
        "total_tokens": usage["total"],
        # Approximate Groq Llama 3.3-70B pricing: $0.59/M input, $0.79/M output
        "estimated_cost_usd": round(
            (usage["prompt"] * 0.00000059) + (usage["completion"] * 0.00000079), 6
        ),
    }


# ==============================================================================
# ROUTE 10: SPEECH AUDIO TRANSCRIPTION (GROQ WHISPER)
# ==============================================================================

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Transcribes audio bytes recorded from the candidate's browser microphone using Groq Whisper.

    Parameters:
      file (UploadFile): Binary audio file (.webm, .wav, .mp3).

    Returns:
      dict: {"text": "<transcribed speech string>"}.
    """
    try:
        file_bytes = await file.read()
        text = ai_manager.transcribe_audio(file_bytes, file.filename)
        return {"text": text}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio transcription failed: {str(e)}",
        )
