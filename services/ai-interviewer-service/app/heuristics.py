"""
Heuristic Evaluation Engine and Adaptive Difficulty Calibration.
================================================================
This module provides lightweight, deterministic NLP evaluation algorithms that execute
in sub-millisecond time without invoking costly LLM inference.

Core Capabilities:
------------------
1. Answer Quality Scoring (`score_answer_quality`):
   - Computes a 0 to 10 quality indicator based on response length, depth, and domain-specific
     keyword density (DSA algorithms, System Design architectural components, Behavioral STAR markers).
2. Adaptive Interview Difficulty Adjustment (`calculate_adaptive_difficulty`):
   - Mimics expert human interviewers by dynamically adjusting question difficulty:
     - If candidate consistently excels (average score >= 8/10), escalates difficulty (Easy -> Medium -> Hard).
     - If candidate struggles (average score <= 3/10), offers more accessible questions (Hard -> Medium -> Easy).
3. STAR Method Extraction (`extract_star_components`):
   - Scans behavioral interview answers for the four pillars of the STAR framework:
     Situation, Task, Action, Result. Identifies missing components so the AI can ask
     targeted follow-up questions.
"""

from typing import Dict, List, Any


def score_answer_quality(answer: str, interview_type: str) -> int:
    """
    Evaluates candidate answer quality on a 0-10 scale using fast lexical heuristics.

    Scoring Logic:
    - Base score: 5/10.
    - Length bonus: +1 point if >100 words, +2 points if >200 words.
    - Brevity penalty: -1 point if <20 words (curt/uninformative response).
    - Keyword density bonus: up to +3 points for domain-relevant terminology.
    - Clamped strictly between 0 and 10.

    Parameters:
        answer (str): The candidate's spoken or typed response.
        interview_type (str): 'dsa', 'behavioral', or 'system_design'.

    Returns:
        int: Heuristic score between 0 and 10.
    """
    words = answer.split()
    word_count = len(words)
    score = 5

    # Reward substantive, well-elaborated answers
    if word_count > 200:
        score += 2
    elif word_count > 100:
        score += 1

    # Penalize terse, superficial responses
    if word_count < 20:
        score -= 1

    # Lexical keyword matching tailored by interview domain
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


def calculate_adaptive_difficulty(recent_scores: List[int], base_difficulty: str) -> str:
    """
    Dynamically adjusts question difficulty according to the candidate's trailing performance.

    Rules:
    - Requires at least 2 historical answer scores to establish a trend.
    - Computes moving average of the last 3 response scores.
    - Average >= 8.0 -> Promotes difficulty (Easy -> Medium -> Hard).
    - Average <= 3.0 -> Demotes difficulty (Hard -> Medium -> Easy).
    - Otherwise -> Retains current base difficulty.

    Parameters:
        recent_scores (List[int]): Chronological list of heuristic scores from prior turns.
        base_difficulty (str): Starting difficulty tier ('easy', 'medium', 'hard').

    Returns:
        str: Calibrated difficulty level for the next question.
    """
    if len(recent_scores) < 2:
        return base_difficulty

    # Evaluate the last 3 turns
    recent = recent_scores[-3:]
    avg = sum(recent) / len(recent)

    upgrade_map = {"easy": "medium", "medium": "hard", "hard": "hard"}
    downgrade_map = {"hard": "medium", "medium": "easy", "easy": "easy"}

    if avg >= 8:
        return upgrade_map.get(base_difficulty, base_difficulty)
    elif avg <= 3:
        return downgrade_map.get(base_difficulty, base_difficulty)
    return base_difficulty


def extract_star_components(answer: str) -> Dict[str, Any]:
    """
    Extracts behavioral STAR framework components (Situation, Task, Action, Result) from responses.

    Returns:
        Dict[str, Any]:
            - `components`: Boolean flags for each of the 4 STAR components.
            - `completeness`: Float between 0.0 and 1.0 (e.g. 0.75 if 3 of 4 present).
            - `missing_components`: List of missing pillars (e.g. ['RESULT']).
            - `star_score`: Percentage integer (0 to 100).
    """
    answer_lower = answer.lower()
    
    # Lexical trigger phrases for each STAR component
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
    
    # Calculate completeness ratio
    completeness = sum(components.values()) / 4.0
    missing = [k.upper() for k, v in components.items() if not v]
    
    return {
        "components": components,
        "completeness": completeness,
        "missing_components": missing,
        "star_score": int(completeness * 100),
    }
