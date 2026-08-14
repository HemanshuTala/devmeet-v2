from fastapi import APIRouter, HTTPException, Depends, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio
import json as json_module
import httpx
import os
from typing import Optional, List
from pydantic import BaseModel
from .models import InterviewRequest, InterviewResponse, FeedbackRequest, FeedbackResponse
from .ai_manager import ai_manager
from .ai_limiter import (
    check_ai_rate_limit, acquire_ai_slot, release_ai_slot,
    check_token_budget, record_tokens_used,
)

router = APIRouter(prefix="/api/v1/interview", tags=["interview"])
security = HTTPBearer()

AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:8001")


async def verify_token(token: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{AUTH_SERVICE_URL}/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"}
            )
            if response.status_code == 200:
                return response.json()
            return None
    except Exception:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user = await verify_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return user


# ─── Generate Interview Question ──────────────────────────────────────────────

@router.post("/question", response_model=InterviewResponse)
async def generate_question(
    request_data: InterviewRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate the next interview question using Groq AI.
    Applies prompt injection detection, context pruning, and retry logic.
    """
    session_id = request_data.session_id or current_user.get("id", "default")
    user_id = current_user.get("id", "unknown")

    await check_ai_rate_limit(user_id)
    await check_token_budget(session_id)
    await acquire_ai_slot(user_id)

    try:
        candidate_name = current_user.get("display_name") or current_user.get("email") or "Candidate"

        question_dict, terminated = await ai_manager.generate_interview_question(
            interview_type=request_data.interview_type,
            difficulty=request_data.difficulty,
            target_company=request_data.target_company,
            focus_area=request_data.focus_area,
            conversation_history=[m.dict() for m in request_data.conversation_history],
            session_id=session_id,
            candidate_name=candidate_name,
        )

        if terminated:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Session terminated: repeated prompt injection policy violations detected.",
            )

        # Track token usage
        usage = ai_manager.get_token_usage(session_id)
        await record_tokens_used(session_id, usage.get("total", 0))

        return InterviewResponse(
            question=question_dict.get("question", "Can you describe your approach?"),
            hints=question_dict.get("hints", []),
            follow_up_questions=question_dict.get("follow_up_questions", []),
        )
    finally:
        await release_ai_slot(user_id)


# ─── AI-02: Streaming Question via SSE ───────────────────────────────────────

@router.post("/question/stream")
async def generate_question_stream(
    request_data: InterviewRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    AI-02: Server-Sent Events streaming for real-time question generation.
    The client receives tokens as they are generated rather than waiting for
    the full response. Each SSE event is a JSON chunk: {"token": "...", "done": false}
    Final event: {"token": "", "done": true, "question": "...", "hints": [...]}
    """
    from groq import Groq
    from .ai_manager import _get_next_key, detect_injection, prune_conversation_history

    session_id = request_data.session_id or current_user.get("id", "default")
    user_id = current_user.get("id", "unknown")

    # Rate limit and token budget checks before streaming
    await check_ai_rate_limit(user_id)
    await check_token_budget(session_id)
    await acquire_ai_slot(user_id)

    # Check injection before streaming
    last_user_msg = next(
        (m.content for m in reversed(request_data.conversation_history) if m.role == "user"),
        ""
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
    # Use the smart message builder that detects vague/short answers
    user_turn = ai_manager._build_question_user_message(history)
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": user_turn},
    ]

    async def event_generator():
        try:
            key = _get_next_key()
            if not key:
                fallback_q = "Welcome to your interview! Can you start by introducing yourself and summarizing your technical background?"
                yield f"data: {json_module.dumps({'token': fallback_q, 'done': True, 'question': fallback_q, 'hints': []})}\n\n"
                return

            from groq import AsyncGroq
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
                    async for chunk in stream:
                        delta = chunk.choices[0].delta.content or ""
                        if delta:
                            full_text += delta
                            yield f"data: {json_module.dumps({'token': delta, 'done': False})}\n\n"
                            await asyncio.sleep(0)
                    stream_success = True
                    break
                except Exception as model_err:
                    logger.warning(f"Model {model} failed: {model_err}. Trying next fallback...")
                    continue

            if not stream_success or not full_text.strip():
                fallback_q = "Welcome! Let's get started. Could you walk me through your recent technical projects and core skills?"
                yield f"data: {json_module.dumps({'token': fallback_q, 'done': True, 'question': fallback_q, 'hints': []})}\n\n"
                return

            # Parse final JSON and emit done event
            parsed = None
            start_idx = -1
            try:
                parsed = json_module.loads(full_text)
            except Exception:
                start_idx = full_text.find('{')
                end_idx = full_text.rfind('}')
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    try:
                        parsed = json_module.loads(full_text[start_idx:end_idx+1])
                    except Exception:
                        pass

            if parsed and isinstance(parsed, dict):
                pre_text = full_text[:start_idx].strip() if start_idx != -1 else ""
                main_q = parsed.get("question", "")
                final_q = f"{pre_text}\n\n{main_q}".strip() if pre_text else main_q
                yield f"data: {json_module.dumps({'token': '', 'done': True, 'question': final_q or full_text.strip(), 'hints': parsed.get('hints', []), 'follow_up_questions': parsed.get('follow_up_questions', [])})}\n\n"
            else:
                yield f"data: {json_module.dumps({'token': '', 'done': True, 'question': full_text.strip(), 'hints': [], 'follow_up_questions': []})}\n\n"

        except Exception as e:
            fallback_q = "Let's begin. Can you share an overview of your technical background and experience?"
            yield f"data: {json_module.dumps({'token': fallback_q, 'done': True, 'question': fallback_q, 'hints': []})}\n\n"
        finally:
            await release_ai_slot(user_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─── Generate Feedback ─────────────────────────────────────────────────────────

@router.post("/feedback", response_model=FeedbackResponse)
async def generate_feedback(
    request_data: FeedbackRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generate comprehensive end-of-session feedback with scores and recommendations."""
    user_id = current_user.get("id", "unknown")

    await check_ai_rate_limit(user_id)
    await acquire_ai_slot(user_id)

    try:
        history = [m.dict() for m in request_data.conversation_history]

        # ── Guard: detect incomplete/empty interview ────────────────────────────────
        user_messages = [m for m in history if m.get("role") == "user"]
        total_user_words = sum(len(m.get("content", "").split()) for m in user_messages)
        meaningful_turns = sum(1 for m in user_messages if len(m.get("content", "").split()) >= 5)

        # If fewer than 2 meaningful responses, return an honest incomplete result
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
        # ── End guard ────────────────────────────────────────────────────────────────

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


# ─── Evaluate Code Submission ─────────────────────────────────────────────────

class CodeEvalRequest(BaseModel):
    code: str
    question: str
    language: str
    session_id: Optional[str] = None
    execution_output: Optional[str] = None


@router.post("/evaluate-code")
async def evaluate_code(
    request_data: CodeEvalRequest,
    current_user: dict = Depends(get_current_user)
):
    """AI evaluation of a submitted code solution against the interview question."""
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


# ─── Hint Request ──────────────────────────────────────────────────────────────

class HintRequest(BaseModel):
    question: str
    interview_type: str
    code_so_far: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/hint")
async def get_hint(
    request_data: HintRequest,
    current_user: dict = Depends(get_current_user)
):
    """Get an AI-generated hint for the current question (Pro/Enterprise plan feature)."""
    from groq import Groq
    from .ai_manager import _get_next_key, detect_injection
    import json

    # AI-09: Hints are a Pro/Enterprise feature
    user_plan = current_user.get("plan", "free")
    if user_plan not in ("pro", "enterprise"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hints are available on Pro and Enterprise plans only. Please upgrade to access this feature."
        )

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
        except Exception as e:
            return {"hint": "Consider breaking the problem into smaller sub-problems.", "level": 1}
    finally:
        await release_ai_slot(user_id)


# ─── AI-10: STAR Analysis ──────────────────────────────────────────────────────

class STARAnalysisRequest(BaseModel):
    answer: str
    session_id: Optional[str] = None


@router.post("/star-analysis")
async def analyze_star(request_data: STARAnalysisRequest, current_user: dict = Depends(get_current_user)):
    """AI-10: Analyze a behavioral answer for STAR method completeness."""
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


# ─── AI-03: Adaptive Difficulty ────────────────────────────────────────────────

@router.get("/adaptive-difficulty/{session_id}")
async def get_adaptive_difficulty(
    session_id: str,
    base_difficulty: str = "medium",
    current_user: dict = Depends(get_current_user)
):
    """AI-03: Returns the current adaptive difficulty for a session based on answer quality scores."""
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


# ─── Injection Report ──────────────────────────────────────────────────────────

@router.get("/violations/{session_id}")
async def get_violation_count(session_id: str, current_user: dict = Depends(get_current_user)):
    """Returns the number of prompt injection violations for a session (admin/debug use)."""
    count = ai_manager._violation_counts.get(session_id, 0)
    return {"session_id": session_id, "violations": count, "terminated": count >= 3}


# ─── Token Usage (AI-12) ───────────────────────────────────────────────

@router.get("/tokens/{session_id}")
async def get_token_usage(session_id: str, current_user: dict = Depends(get_current_user)):
    """Returns accumulated Groq token usage for a session (AI-12)."""
    usage = ai_manager.get_token_usage(session_id)
    return {
        "session_id": session_id,
        "prompt_tokens": usage["prompt"],
        "completion_tokens": usage["completion"],
        "total_tokens": usage["total"],
        # Approximate cost: llama3-70b pricing $0.59/M input, $0.79/M output
        "estimated_cost_usd": round(
            (usage["prompt"] * 0.00000059) + (usage["completion"] * 0.00000079), 6
        ),
    }


# ─── Audio Transcription (Whisper) ─────────────────────────────────────────────
from fastapi import UploadFile, File

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Transcribe recorded candidate speech using Groq's Whisper model."""
    try:
        file_bytes = await file.read()
        text = ai_manager.transcribe_audio(file_bytes, file.filename)
        return {"text": text}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio transcription failed: {str(e)}"
        )
