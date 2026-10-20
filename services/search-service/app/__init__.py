"""
DevMeet Search & Question Recommendation Service Package
=========================================================
This microservice provides fuzzy full-text question bank searching, autocomplete queries,
difficulty and tag-based filtering, company-specific interview question recommendations,
and BM25/TF-IDF text similarity scoring for DevMeet.

Key Components:
- `search_engine`: In-memory inverted index and TF-IDF search engine with Levenshtein fuzzy matching.
- `questions_seed`: Pre-seeded question dataset containing curated coding, system design, and behavioral questions.
- `models`: Pydantic request and response schemas for search queries and question cards.
- `routes`: REST endpoints for searching, querying questions by company, and autocomplete suggestions.
- `middleware`: Distributed correlation tracing and latency instrumentation.
"""
