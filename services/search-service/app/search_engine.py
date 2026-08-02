import os
import random
import time
from typing import Optional, List, Dict, Any
from elasticsearch import Elasticsearch
from .questions_seed import SEED_QUESTIONS

ELASTICSEARCH_HOST = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
INDEX_NAME = "devmeet_questions"
ES_RETRY_INTERVAL = 30  # seconds between reconnect attempts


class SearchEngine:
    def __init__(self):
        self.es_client: Optional[Elasticsearch] = None
        self.use_es = False
        self.local_db: List[Dict[str, Any]] = list(SEED_QUESTIONS)
        self._last_connect_attempt: float = 0

        # Attempt initial connection (non-blocking)
        self._try_connect()

    def _try_connect(self) -> bool:
        """Try to connect to Elasticsearch. Returns True on success."""
        self._last_connect_attempt = time.monotonic()
        try:
            client = Elasticsearch(
                ELASTICSEARCH_HOST,
                max_retries=2,
                retry_on_timeout=True,
                request_timeout=5,
            )
            if client.ping():
                self.es_client = client
                self.use_es = True
                print(f"[SearchEngine] Connected to Elasticsearch at {ELASTICSEARCH_HOST}")
                self._initialize_index()
                return True
            else:
                print("[SearchEngine] Elasticsearch ping failed — using in-memory fallback.")
                self.use_es = False
                return False
        except Exception as e:
            print(f"[SearchEngine] Elasticsearch connection failed: {e} — using in-memory fallback.")
            self.use_es = False
            return False

    def _ensure_connection(self):
        """Re-attempt connection if it was previously unavailable (rate-limited)."""
        if self.use_es:
            return
        elapsed = time.monotonic() - self._last_connect_attempt
        if elapsed >= ES_RETRY_INTERVAL:
            print("[SearchEngine] Retrying Elasticsearch connection...")
            self._try_connect()

    def _initialize_index(self):
        try:
            if not self.es_client.indices.exists(index=INDEX_NAME):
                self.es_client.indices.create(
                    index=INDEX_NAME,
                    body={
                        "mappings": {
                            "properties": {
                                "id": {"type": "keyword"},
                                "title": {"type": "text", "analyzer": "standard"},
                                "description": {"type": "text", "analyzer": "standard"},
                                "interview_type": {"type": "keyword"},
                                "difficulty": {"type": "keyword"},
                                "tags": {"type": "keyword"},
                                "company_tags": {"type": "keyword"},
                                "hints": {"type": "text"}
                            }
                        }
                    }
                )
                print(f"[SearchEngine] Created index '{INDEX_NAME}'.")
            
            es_count = self.es_client.count(index=INDEX_NAME)["count"]
            if es_count < len(self.local_db):
                print(f"[SearchEngine] ES count ({es_count}) is less than local seed ({len(self.local_db)}). Re-seeding index...")
                for q in self.local_db:
                    self.es_client.index(index=INDEX_NAME, id=q["id"], body=q)
                print(f"[SearchEngine] Seeded {len(self.local_db)} questions into Elasticsearch.")
            else:
                print(f"[SearchEngine] Index '{INDEX_NAME}' is up-to-date with {es_count} questions.")
        except Exception as e:
            print(f"[SearchEngine] Failed to initialise Elasticsearch index: {e}. Reverting to local mode.")
            self.use_es = False

    async def search(
        self,
        query: Optional[str] = None,
        interview_type: Optional[str] = None,
        difficulty: Optional[str] = None,
        company: Optional[str] = None,
        limit: int = 10,
        offset: int = 0
    ) -> dict:
        self._ensure_connection()
        if self.use_es and self.es_client:
            return await self._search_es(query, interview_type, difficulty, company, limit, offset)
        return await self._search_local(query, interview_type, difficulty, company, limit, offset)

    async def get_question_by_id(self, question_id: str) -> Optional[dict]:
        self._ensure_connection()
        if self.use_es and self.es_client:
            try:
                res = self.es_client.get(index=INDEX_NAME, id=question_id)
                return res["_source"]
            except Exception:
                return None
        for q in self.local_db:
            if q["id"] == question_id:
                return q
        return None

    async def get_random_question(
        self,
        interview_type: Optional[str] = None,
        difficulty: Optional[str] = None
    ) -> Optional[dict]:
        filtered = self.local_db
        if interview_type:
            filtered = [q for q in filtered if q["interview_type"] == interview_type]
        if difficulty:
            filtered = [q for q in filtered if q["difficulty"] == difficulty]
        if not filtered:
            return None
        return random.choice(filtered)

    async def add_question(self, question: dict) -> bool:
        self.local_db.append(question)
        self._ensure_connection()
        if self.use_es and self.es_client:
            try:
                self.es_client.index(index=INDEX_NAME, id=question["id"], body=question)
                return True
            except Exception as e:
                print(f"[SearchEngine] Failed to index new question in ES: {e}")
                return False
        return True

    # ─── Private Helpers ──────────────────────────────────────────────────────────

    async def _search_es(
        self,
        query: Optional[str],
        interview_type: Optional[str],
        difficulty: Optional[str],
        company: Optional[str],
        limit: int,
        offset: int
    ) -> dict:
        must_queries = []
        filter_queries = []

        if query:
            must_queries.append({
                "multi_match": {
                    "query": query,
                    "fields": ["title^2", "description", "tags", "company_tags"]
                }
            })
        else:
            must_queries.append({"match_all": {}})

        if interview_type:
            filter_queries.append({"term": {"interview_type": interview_type}})
        if difficulty:
            filter_queries.append({"term": {"difficulty": difficulty}})
        if company:
            filter_queries.append({"term": {"company_tags": company}})

        body = {
            "query": {
                "bool": {
                    "must": must_queries,
                    "filter": filter_queries
                }
            },
            "from": offset,
            "size": limit
        }

        try:
            res = self.es_client.search(index=INDEX_NAME, body=body)
            hits = res["hits"]["hits"]
            total = res["hits"]["total"]["value"]
            questions = [h["_source"] for h in hits]
            return {"questions": questions, "total": total, "query": query}
        except Exception as e:
            print(f"[SearchEngine] ES search failed: {e}. Falling back to local search.")
            self.use_es = False
            self._last_connect_attempt = time.monotonic()
            return await self._search_local(query, interview_type, difficulty, company, limit, offset)

    async def _search_local(
        self,
        query: Optional[str],
        interview_type: Optional[str],
        difficulty: Optional[str],
        company: Optional[str],
        limit: int,
        offset: int
    ) -> dict:
        filtered = self.local_db

        if interview_type:
            filtered = [q for q in filtered if q["interview_type"].lower() == interview_type.lower()]
        if difficulty:
            filtered = [q for q in filtered if q["difficulty"].lower() == difficulty.lower()]
        if company:
            filtered = [q for q in filtered if any(company.lower() == c.lower() for c in q["company_tags"])]

        if query:
            q_lower = query.lower()
            matching = []
            for q in filtered:
                in_title = q_lower in q["title"].lower()
                in_desc = q_lower in q["description"].lower()
                in_tags = any(q_lower in t.lower() for t in q["tags"])
                in_companies = any(q_lower in c.lower() for c in q["company_tags"])
                if in_title or in_desc or in_tags or in_companies:
                    score = (2 if in_title else 0) + (1 if in_desc else 0) + (1 if in_tags else 0)
                    matching.append((score, q))
            matching.sort(key=lambda x: x[0], reverse=True)
            filtered = [item[1] for item in matching]

        total = len(filtered)
        paginated = filtered[offset: offset + limit]
        return {"questions": paginated, "total": total, "query": query}


search_engine = SearchEngine()
