"""
================================================================================
AI INTERVIEWER SERVICE — PROMPT INJECTION DEFENSE & CONTEXT PRUNING
================================================================================
Role & Responsibility:
  This module acts as the security perimeter and token economy manager for LLM interactions.
  It performs three vital defensive functions:
    1. Prompt Injection & Jailbreak Detection: Scans candidate speech/text submissions
       against a compiled bank of known adversarial regex heuristics (e.g., "DAN",
       "ignore previous instructions", "system prompt reveal") to prevent role hijacking.
    2. Context Pruning (Sliding Memory Window): Dynamically limits message history
       to the most recent turns and enforces character budgets, preventing context window
       overflows and quadratic LLM token cost inflation.
    3. Structural Output Validation: Validates that raw LLM completion payloads conform
       to expected JSON contracts before returning them to downstream services.
================================================================================
"""

import re
from typing import List

# ==============================================================================
# PROMPT INJECTION & JAILBREAK SIGNATURES
# ==============================================================================
# Regex patterns targeting adversarial prompt injection techniques:
# - Instruction overrides ("ignore previous instructions")
# - Role impersonation / DAN jailbreaks ("you are now unrestricted", "developer mode")
# - Delimiter injection ("<system>", "[INST]")
# - System prompt data exfiltration ("reveal system prompt", "what are your instructions")
_INJECTION_PATTERNS = [
    # Classic instruction bypass attempts
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
    # System prompt exfiltration attempts
    r"reveal\s+(your\s+)?(system|secret|hidden)\s+prompt",
    r"print\s+(your\s+)?(internal|system|initial)\s+(prompt|instructions?)",
    r"what\s+(are\s+)?your\s+(exact\s+)?instructions",
    # Role hijacking & persona redirection
    r"from\s+now\s+on\s+(you\s+are|act|behave)",
    r"your\s+new\s+role\s+is",
]

# Precompile all regular expressions with case insensitivity for high-throughput scanning
_INJECTION_RE = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]


def detect_injection(text: str) -> bool:
    """
    Scans candidate input for adversarial prompt injection or jailbreak indicators.

    Parameters:
      text (str): Raw candidate message or audio transcription string.

    Returns:
      bool: True if an adversarial injection pattern is detected, False otherwise.

    Design Rationale:
      - Quick regex scanning in memory runs in sub-millisecond time.
      - If flagged, the caller immediately rejects the turn or sanitizes it,
        preventing malicious inputs from ever reaching the LLM's attention layers.
    """
    for pattern in _INJECTION_RE:
        if pattern.search(text):
            return True
    return False


# ==============================================================================
# CONTEXT SLIDING WINDOW CONSTANTS
# ==============================================================================
# Keep the most recent 6 conversational exchanges (6 assistant + 6 user = 12 messages)
MAX_CONTEXT_TURNS = 6

# Approximate ratio of characters per token for English text (standard rule of thumb)
APPROX_CHARS_PER_TOKEN = 4

# Maximum context length in characters (~8,192 tokens * 4 chars/token = ~32,768 characters)
MAX_CONTEXT_CHARS = 8192 * APPROX_CHARS_PER_TOKEN


def prune_conversation_history(
    conversation_history: List[dict],
    system_prompt: str,
    current_question: str = "",
) -> List[dict]:
    """
    Prunes the conversational history to fit within strict token and turn budgets.

    Parameters:
      conversation_history (List[dict]): Full list of previous dialogue turns.
      system_prompt (str): The master system persona prompt.
      current_question (str): The current challenge or prompt being injected.

    Returns:
      List[dict]: Pruned list containing only the most relevant, recent dialogue turns.

    Algorithm:
      1. Preserves only the last `MAX_CONTEXT_TURNS * 2` messages (recent context).
      2. Computes the combined character weight of the system prompt and history.
      3. If total characters exceed `MAX_CONTEXT_CHARS`, drops the oldest (assistant, user)
         message pair in a FIFO queue fashion until the payload fits the budget.
    """
    if not conversation_history:
        return []

    # Slice the trailing turns (e.g. 12 messages)
    pruned = conversation_history[-(MAX_CONTEXT_TURNS * 2):]

    # Calculate base character consumption of non-negotiable prompt components
    base_chars = len(system_prompt) + len(current_question)

    # Iteratively prune oldest message pairs if cumulative character budget is exceeded
    while pruned and (base_chars + sum(len(m.get("content", "")) for m in pruned)) > MAX_CONTEXT_CHARS:
        pruned = pruned[2:]  # Remove oldest assistant/user turn pair

    return pruned


def validate_question_response(data: dict) -> bool:
    """
    Validates that a parsed LLM dictionary represents a valid interview question payload.

    Parameters:
      data (dict): Parsed JSON dictionary returned by the LLM.

    Returns:
      bool: True if 'question' is a non-empty string with at least 5 characters.
    """
    return isinstance(data.get("question"), str) and len(data["question"]) > 5


def validate_feedback_response(data: dict) -> bool:
    """
    Validates that a parsed LLM dictionary represents a valid evaluation report.

    Parameters:
      data (dict): Parsed JSON dictionary returned by the feedback generation prompt.

    Returns:
      bool: True if overall_score is between 0 and 100, and strengths/weaknesses are lists.
    """
    return (
        isinstance(data.get("overall_score"), (int, float))
        and 0 <= data["overall_score"] <= 100
        and isinstance(data.get("strengths"), list)
        and isinstance(data.get("weaknesses"), list)
    )
