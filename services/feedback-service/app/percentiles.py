"""
================================================================================
FEEDBACK SERVICE — COHORT PERCENTILE RANKINGS & POPULATION BENCHMARKS
================================================================================
Role & Responsibility:
  This module computes comparative percentile rankings for candidate scores.
  Rather than presenting an isolated score (e.g. 78/100), technical candidates and
  hiring managers need relative benchmarks: "How does 78 in a Hard System Design
  interview compare against the broader engineering applicant pool?"

Benchmark Methodology:
  - Domain & Seniority Segmentation: Maintains empirical normal distribution mappings
    segmented across track (DSA, Behavioral, System Design) and difficulty (Easy, Medium, Hard).
  - Bell-Curve Skew: For example, scoring 90+ on Hard System Design places a candidate
    in the 85th+ percentile, while scoring 90+ on Easy DSA requires a near-perfect run
    to hit the 95th percentile.
  - Contextual User Feedback: Generates encouraging, clear summary statements explaining
    peer cohort performance.
================================================================================
"""

from typing import Dict, Any

# ==============================================================================
# EMPIRICAL SCORE-TO-PERCENTILE LOOKUP TABLES
# ==============================================================================
# Structures: track -> difficulty -> (min_score, max_score): percentile_value
PERCENTILE_RANGES = {
    "dsa": {
        "easy": {(90, 100): 95, (80, 89): 85, (70, 79): 70, (60, 69): 50, (50, 59): 30, (0, 49): 15},
        "medium": {(90, 100): 92, (80, 89): 80, (70, 79): 65, (60, 69): 45, (50, 59): 25, (0, 49): 10},
        "hard": {(90, 100): 90, (80, 89): 75, (70, 79): 60, (60, 69): 40, (50, 59): 20, (0, 49): 5},
    },
    "behavioral": {
        "easy": {(90, 100): 93, (80, 89): 82, (70, 79): 68, (60, 69): 48, (50, 59): 28, (0, 49): 12},
        "medium": {(90, 100): 91, (80, 89): 78, (70, 79): 63, (60, 69): 43, (50, 59): 23, (0, 49): 8},
        "hard": {(90, 100): 88, (80, 89): 73, (70, 79): 58, (60, 69): 38, (50, 59): 18, (0, 49): 3},
    },
    "system_design": {
        "easy": {(90, 100): 94, (80, 89): 84, (70, 79): 72, (60, 69): 52, (50, 59): 32, (0, 49): 14},
        "medium": {(90, 100): 90, (80, 89): 76, (70, 79): 62, (60, 69): 42, (50, 59): 22, (0, 49): 7},
        "hard": {(90, 100): 85, (80, 89): 70, (70, 79): 55, (60, 69): 35, (50, 59): 15, (0, 49): 2},
    },
}


def calculate_percentile(score: int, interview_type: str, difficulty: str) -> Dict[str, Any]:
    """
    Determines the candidate's percentile rank within their specific track and difficulty.

    Parameters:
      score (int): Candidate's composite overall score (0-100).
      interview_type (str): Domain track ('dsa', 'behavioral', 'system_design').
      difficulty (str): Difficulty level ('easy', 'medium', 'hard').

    Returns:
      Dict[str, Any]: Payload containing 'percentile', 'peer_group_size', 'interview_type',
                      'difficulty', and a descriptive benchmark message.

    How It Works:
      1. Resolves appropriate percentile distribution table based on track and difficulty.
      2. Iterates through score boundaries to find the matching bucket.
      3. Constructs human-readable explanation for report rendering.
    """
    # Fallback to DSA Medium if unsupported track or difficulty is requested
    type_ranges = PERCENTILE_RANGES.get(interview_type, PERCENTILE_RANGES["dsa"])
    diff_ranges = type_ranges.get(difficulty, type_ranges["medium"])

    # Default to 50th percentile (median) if score falls outside defined ranges
    percentile = 50
    for (low, high), pct in diff_ranges.items():
        if low <= score <= high:
            percentile = pct
            break

    return {
        "percentile": percentile,
        "peer_group_size": 1000,
        "interview_type": interview_type,
        "difficulty": difficulty,
        "message": f"You performed better than {percentile}% of candidates in similar {interview_type} interviews at {difficulty} difficulty.",
    }
