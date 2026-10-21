"""
================================================================================
AI INTERVIEWER SERVICE — DYNAMIC SYSTEM PROMPTS & INTERVIEW ORCHESTRATION
================================================================================
Role & Responsibility:
  This module acts as the prompt engineering brain for the AI Interviewer service.
  It generates strictly structured, context-aware system prompts and user turn prompts
  tailored to specific interview tracks:
    1. DSA (Data Structures and Algorithms): Emphasizes problem comprehension,
       complexity analysis (Big-O time/space), edge case handling, and iterative coding.
    2. Behavioral: Implements the industry-standard STAR framework (Situation, Task,
       Action, Result) to evaluate leadership, conflict resolution, and communication.
    3. System Design: Evaluates architectural trade-offs, scalability, load balancing,
       caching, database sharding, and resilience for distributed web systems.

Key Features & Architectural Value:
  - Few-Shot / Persona Framing: Enforces a warm, professional, human-like persona that
    addresses the candidate by name and avoids robotic monologues.
  - Conversational Depth Enforcement: Analyzes candidate responses (detecting vague or
    one-word answers like "yes" or "ok") and instructs the LLM to ask targeted probing
    follow-ups rather than prematurely advancing to the next question.
  - Strict JSON Output Contracts: Guarantees consistent response structures containing
    the question text, algorithmic/architectural hints, and follow-up topics so downstream
    orchestration services can render UI components predictably.
  - High-Availability Fallback Bank: Provides hardcoded, field-tested baseline questions
    for all tracks in the event that external LLM APIs (Groq, OpenAI, Anthropic) fail.
================================================================================
"""

from typing import Optional, List, Dict


def build_interview_system_prompt(
    interview_type: str,
    difficulty: str,
    target_company: Optional[str] = None,
    focus_area: Optional[str] = None,
    candidate_name: Optional[str] = "Candidate",
) -> str:
    """
    Constructs the master persona and conduct guidelines for the AI technical interviewer.

    Parameters:
      interview_type (str): Domain of the interview ('dsa', 'behavioral', or 'system_design').
      difficulty (str): Target seniority level ('easy' = junior, 'medium' = mid-level, 'hard' = senior).
      target_company (Optional[str]): Company name to tailor context (e.g., 'Google', 'Amazon', 'Meta').
      focus_area (Optional[str]): Specific sub-discipline or framework (e.g., 'Dynamic Programming', 'Distributed Caching').
      candidate_name (Optional[str]): Candidate's first name for personalized, friendly greetings.

    Returns:
      str: Complete system prompt instructing the LLM on tone, pacing, depth, and JSON output schema.

    How It Works:
      1. Maps the interview type and difficulty to friendly descriptive labels.
      2. Injects instructions for an initial warm greeting when conversation history is empty.
      3. Implements strict interview rules: acknowledge answers first, probe vague answers,
         spend 2-4 turns per topic, and maintain professional conversational pacing.
      4. Appends domain-specific instructions (e.g., STAR framework for behavioral, Big-O for DSA).
      5. Enforces valid JSON-only output without markdown fencing.
    """
    # Map domain identifiers to human-readable interview track descriptions
    type_descriptions = {
        "dsa": "Data Structures and Algorithms coding interview",
        "behavioral": "Behavioral interview using the STAR method",
        "system_design": "System Design and architecture interview",
    }
    # Map difficulty levels to engineer experience benchmarks
    difficulty_descriptions = {
        "easy": "beginner level",
        "medium": "intermediate level",
        "hard": "advanced / senior engineer level",
    }
    
    # Base persona initialization: Establish authority, role, and candidate context
    system = (
        f"You are an expert technical interviewer at a top tech company, conducting a "
        f"{type_descriptions.get(interview_type, 'technical')} interview at "
        f"{difficulty_descriptions.get(difficulty, 'medium')} difficulty with a candidate named {candidate_name}."
    )
    
    # Optionally specialize context if the candidate is preparing for a specific firm or skill
    if target_company:
        system += f" The candidate is interviewing for a role at {target_company}."
    if focus_area:
        system += f" Focus specifically on: {focus_area}."

    # First turn greeting behavior: Reduce candidate anxiety with friendly, welcoming remarks
    system += (
        f"\n\nAt the very start of the interview (when the conversation history is empty), "
        f"begin with a warm, friendly greeting to {candidate_name} by name. "
        f"Welcome them, say something encouraging to make them comfortable and confident, "
        f"introduce yourself briefly as their AI interviewer, and then present the first question."
    )

    # Core pedagogical guidelines: Prevent common LLM interviewer flaws like topic-jumping
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

    # Downstream API parser safety: Require strict JSON serialization
    system += (
        "\n\nIMPORTANT: Always respond ONLY with valid raw JSON matching the exact schema requested. "
        "Do NOT include markdown, backticks, ```json, or any code fences. Start immediately with '{' and end with '}'."
    )

    # Append domain-specific evaluation tracks to ensure deep technical rigor
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


def build_question_user_message(conversation_history: List[dict]) -> str:
    """
    Builds the dynamic user prompt asking the LLM to generate the next interview turn.

    Parameters:
      conversation_history (List[dict]): Chronological list of message dictionaries
                                         (e.g., [{'role': 'user', 'content': '...'}, ...]).

    Returns:
      str: Formatted user prompt directing the LLM's next conversational action and JSON schema.

    How It Works:
      1. Inspects whether the conversation is starting (empty history). If so, commands an
         initial introduction and opening question.
      2. If ongoing, scans backwards to retrieve the candidate's latest response.
      3. Checks if the response is overly brief (< 15 words). If brief, directs the LLM
         to probe deeper on the SAME topic rather than advancing to a new question.
      4. If thorough, directs the LLM to acknowledge the answer and either ask an in-depth
         follow-up or proceed to the next technical challenge.
    """
    # Enforce standard JSON response structure for downstream parsing in ai_manager
    schema = '{"question": "<your response to candidate + your next question or probing follow-up>", "hints": ["hint1", "hint2"], "follow_up_questions": ["q1"]}'
    
    # Case 1: First turn in the session — trigger friendly welcome and first challenge
    if not conversation_history:
        return (
            "This is the very start of the interview. Greet the candidate warmly by name, make them feel "
            "comfortable, introduce yourself, and present the first interview question clearly. "
            f"Return JSON: {schema}"
        )

    # Extract the most recent candidate and assistant utterances from the history
    last_user_msg = ""
    last_assistant_msg = ""
    for turn in reversed(conversation_history):
        if turn.get("role") == "user" and not last_user_msg:
            last_user_msg = turn.get("content", "").strip()
        elif turn.get("role") == "assistant" and not last_assistant_msg:
            last_assistant_msg = turn.get("content", "").strip()
        if last_user_msg and last_assistant_msg:
            break

    # Heuristic check: Short candidate responses (< 15 words) indicate hesitation or vagueness
    word_count = len(last_user_msg.split()) if last_user_msg else 0
    is_short_vague = word_count < 15

    # Case 2: Candidate answered with minimal detail — instruct the LLM to probe rather than advance
    if is_short_vague:
        return (
            f"The candidate just gave a very short answer: \"{last_user_msg}\". "
            "This is too brief and vague — do NOT move to a new topic. "
            "Instead, acknowledge what they said briefly and ask a probing follow-up question "
            "to encourage them to elaborate and give a more complete answer. "
            "Be encouraging and guide them toward a better response. "
            f"Return JSON: {schema}"
        )
    # Case 3: Candidate provided a substantial response — acknowledge and determine next progression
    else:
        return (
            "The candidate has given an answer. First, briefly acknowledge what they said (1-2 sentences). "
            "Then, based on whether their answer is complete or not: "
            "- If complete and thorough: give brief positive feedback and present the next interview question. "
            "- If incomplete (missing key details, complexity analysis, examples, etc.): ask a targeted "
            "follow-up to deepen their answer on the current topic. "
            f"Return JSON: {schema}"
        )


# ==============================================================================
# FALLBACK QUESTION REPOSITORY (CIRCUIT BREAKER / OFFLINE SAFEGUARD)
# ==============================================================================
# When LLM providers experience outages, network timeouts, or rate limits (HTTP 429),
# this dictionary supplies verified, interview-grade baseline questions with hints
# and follow-ups so the candidate's interview session is never abruptly aborted.
FALLBACK_QUESTIONS: Dict[str, Dict[str, any]] = {
    "dsa": {
        "question": "Given an array of integers, find two numbers that add up to a target sum. Return their indices.",
        "hints": [
            "Consider using a hash map to store previously seen numbers and their indices.",
            "Think about a one-pass traversal: as you iterate, check if (target - current_number) is already in the map.",
            "What is the time and space complexity of using a hash map versus brute-force nested loops?"
        ],
        "follow_up_questions": [
            "Can you solve it in O(n) time complexity and O(n) space complexity?",
            "What if the input array is already sorted? Can we solve it with O(1) auxiliary space using two pointers?",
            "How would your approach handle duplicate elements in the input array?"
        ],
    },
    "behavioral": {
        "question": "Tell me about a time when you had to lead a project under significant time pressure. What did you do?",
        "hints": [
            "Structure your answer using the STAR method: Situation, Task, Action, and Result.",
            "Be specific about your personal leadership decisions, prioritization, and technical trade-offs.",
            "Quantify the business or technical outcome if possible (e.g., delivered 2 days early, 99.9% uptime)."
        ],
        "follow_up_questions": [
            "Looking back, what would you do differently if faced with the same deadline constraints?",
            "How did you prioritize critical features versus technical debt during the crunch period?",
            "How did the team respond to the pressure, and how did you keep morale high?"
        ],
    },
    "system_design": {
        "question": "Design a URL shortening service like bit.ly. Walk me through your approach.",
        "hints": [
            "Start with requirements gathering: estimated daily active users, read-to-write ratio, and URL expiration.",
            "Consider read-heavy vs write-heavy workloads: what caching layers (e.g. Redis) are appropriate?",
            "Think about the encoding strategy (Base62 vs MD5/SHA-256 hash truncation) and collision avoidance."
        ],
        "follow_up_questions": [
            "How would your architecture scale to handle 1 million write requests and 100 million read requests per second?",
            "How do you ensure global uniqueness across multiple distributed database shards?",
            "What is your caching eviction strategy (e.g., LRU), and how do you protect against cache penetration?"
        ],
    },
}
