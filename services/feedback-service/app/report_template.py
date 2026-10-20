"""
================================================================================
FEEDBACK SERVICE — HTML / CSS SCORECARD & PDF TEMPLATE GENERATOR
================================================================================
Role & Responsibility:
  This module constructs print-optimized, responsive HTML/CSS documents designed
  for conversion into downloadable PDF scorecards using WeasyPrint.

Design Standards & Layout Specifications:
  1. CSS Paged Media: Configures standard A4 dimensions with 20mm margins and
     dynamic page numbering (`@bottom-right { content: "Page " counter(page)... }`).
  2. Visual Hierarchy:
     - Header block with session metadata (interview type, candidate language,
       target company, timestamp).
     - Responsive flexbox score grid displaying overall, communication, problem-solving,
       code quality, and time-complexity scores.
     - Color-coded badges: Green (>= 7/10), Yellow (5-6/10), Red (<= 4/10).
     - Categorized qualitative lists (strengths, weaknesses, technical improvements).
     - Question-by-Question breakdown table with AI commentary per conversational turn.
================================================================================
"""

from datetime import datetime, timezone
from typing import Dict, Any, List


def generate_question_scores_html(question_scores: List[dict]) -> str:
    """
    Renders an HTML table detailing question-by-question scoring and commentary.

    Parameters:
      question_scores (List[dict]): List of dictionaries with 'turn', 'question_summary',
                                    'score' (0-10), and 'feedback'.

    Returns:
      str: Formatted HTML table markup, or an empty string if no question scores exist.
    """
    if not question_scores:
        return ""

    rows_html = ""
    for qs in question_scores:
        # Color coding: Green for strong answers (>=7), Red for weak (<=4), Amber for average
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


def render_html_report(feedback_data: Dict[str, Any], session_info: Dict[str, Any]) -> str:
    """
    Renders the complete evaluation document in print-ready HTML/CSS.

    Parameters:
      feedback_data (Dict[str, Any]): Aggregated scores and qualitative feedback items.
      session_info (Dict[str, Any]): Metadata about the interview (session_id, type, company, language).

    Returns:
      str: Complete HTML document string ready for WeasyPrint PDF compilation.
    """
    scores = feedback_data["scores"]
    detailed = feedback_data["detailed_feedback"]

    # Main score grid containing overall composite score and primary sub-dimensions
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

    # Conditionally append optional tracks (Code Quality, Complexity, Behavioral)
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

    # Build qualitative list HTML
    strengths_html = "".join([f"<li>{s}</li>" for s in detailed.get("strengths", [])])
    weaknesses_html = "".join([f"<li>{w}</li>" for w in detailed.get("weaknesses", [])])
    improvements_html = "".join([f"<li>{i}</li>" for i in detailed.get("code_improvements", [])])
    recs_html = "".join([f"<li>{r}</li>" for r in detailed.get("recommendations", [])])

    eval_date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

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
                    <td><strong>Interview Type:</strong> {str(session_info.get('interview_type', '')).upper()}</td>
                </tr>
                <tr>
                    <td><strong>Target Company:</strong> {session_info.get('target_company', 'N/A')}</td>
                    <td><strong>Difficulty:</strong> {str(session_info.get('difficulty', '')).upper()}</td>
                </tr>
                <tr>
                    <td><strong>Language:</strong> {str(session_info.get('language', 'N/A')).upper()}</td>
                    <td><strong>Date Evaluated:</strong> {eval_date}</td>
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

        {generate_question_scores_html(feedback_data.get('question_scores', [])) if feedback_data.get('question_scores') else ''}
    </body>
    </html>
    """
    return html_content
