"""In-memory search over the seeded interview question catalog."""

import random
from typing import Any, Dict, List, Optional

from .questions_seed import SEED_QUESTIONS


class SearchEngine:
    """Search and manage the question records held by this service process."""

    def __init__(self):
        self.local_db: List[Dict[str, Any]] = list(SEED_QUESTIONS)

    async def search(
        self,
        query: Optional[str] = None,
        interview_type: Optional[str] = None,
        difficulty: Optional[str] = None,
        company: Optional[str] = None,
        limit: int = 10,
        offset: int = 0,
    ) -> dict:
        """Filter, rank, and paginate questions using case-insensitive matching."""
        filtered = self.local_db

        if interview_type:
            expected_type = interview_type.casefold()
            filtered = [
                question
                for question in filtered
                if question["interview_type"].casefold() == expected_type
            ]
        if difficulty:
            expected_difficulty = difficulty.casefold()
            filtered = [
                question
                for question in filtered
                if question["difficulty"].casefold() == expected_difficulty
            ]
        if company:
            expected_company = company.casefold()
            filtered = [
                question
                for question in filtered
                if any(
                    expected_company == company_tag.casefold()
                    for company_tag in question["company_tags"]
                )
            ]

        if query:
            search_text = query.casefold()
            ranked_questions = []
            for question in filtered:
                title_match = search_text in question["title"].casefold()
                description_match = search_text in question["description"].casefold()
                tag_match = any(
                    search_text in tag.casefold() for tag in question["tags"]
                )
                company_match = any(
                    search_text in company_tag.casefold()
                    for company_tag in question["company_tags"]
                )

                if title_match or description_match or tag_match or company_match:
                    score = (
                        (2 if title_match else 0)
                        + (1 if description_match else 0)
                        + (1 if tag_match else 0)
                    )
                    ranked_questions.append((score, question))

            ranked_questions.sort(key=lambda item: item[0], reverse=True)
            filtered = [question for _, question in ranked_questions]

        total = len(filtered)
        questions = filtered[offset : offset + limit]
        return {"questions": questions, "total": total, "query": query}

    async def get_question_by_id(self, question_id: str) -> Optional[dict]:
        """Return one question by ID, or None if it is not in the catalog."""
        return next(
            (question for question in self.local_db if question["id"] == question_id),
            None,
        )

    async def get_random_question(
        self,
        interview_type: Optional[str] = None,
        difficulty: Optional[str] = None,
        company: Optional[str] = None,
    ) -> Optional[dict]:
        """Return a random question matching the optional filters."""
        filtered = self.local_db

        if interview_type:
            expected_type = interview_type.casefold()
            filtered = [
                question
                for question in filtered
                if question["interview_type"].casefold() == expected_type
            ]
        if difficulty:
            expected_difficulty = difficulty.casefold()
            filtered = [
                question
                for question in filtered
                if question["difficulty"].casefold() == expected_difficulty
            ]
        if company:
            expected_company = company.casefold()
            filtered = [
                question
                for question in filtered
                if any(
                    company_tag.casefold() == expected_company
                    for company_tag in question["company_tags"]
                )
            ]

        return random.choice(filtered) if filtered else None

    async def add_question(self, question: dict) -> bool:
        """Append a question to this process's in-memory catalog."""
        self.local_db.append(question)
        return True


search_engine = SearchEngine()
