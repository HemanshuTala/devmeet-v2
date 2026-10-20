"""
In-Memory Response Caching Layer for LLM Inference.
===================================================
This module provides an exact-match semantic cache for LLM queries to reduce redundant
external Groq API calls, avoid duplicate billing costs, and deliver sub-millisecond
responses for identical prompts.

How It Works:
-------------
1. Deterministic Prompt Hashing (`_make_key`):
   - Canonicalizes the array of conversation messages using `json.dumps(..., sort_keys=True)`.
   - Combines with the specific model identifier (e.g. `llama-3.3-70b-versatile`).
   - Computes a collision-resistant SHA-256 hexadecimal hash as the cache key.
2. TTL Expiration (Time-To-Live):
   - Entries remain valid for 300 seconds (5 minutes). Stale entries are lazily purged on lookup.
3. Capacity-Bounded Eviction:
   - Caps memory usage at 200 entries (`max_size`). When full, the oldest entry by timestamp
     is automatically evicted to prevent memory bloat.
"""

import time
import json
import hashlib
from typing import List, Dict, Optional, Tuple


class ResponseCache:
    """
    In-memory exact-match response cache with TTL expiration and timestamp-based eviction.
    """
    def __init__(self, max_size: int = 200, ttl_seconds: float = 300.0):
        """
        Parameters:
            max_size (int): Maximum number of cached query responses allowed in memory (default: 200).
            ttl_seconds (float): Lifespan of each cached response in seconds (default: 300.0s = 5 min).
        """
        self._cache: Dict[str, Tuple[dict, float]] = {}  # Map: hash_key -> (response_payload, insertion_timestamp)
        self._max_size = max_size
        self._ttl = ttl_seconds

    def _make_key(self, messages: List[dict], model: str) -> str:
        """
        Constructs a deterministic SHA-256 fingerprint for a sequence of chat messages and model ID.
        """
        # Sort keys to ensure dictionary key order differences do not alter the fingerprint
        content = json.dumps(messages, sort_keys=True) + model
        return hashlib.sha256(content.encode()).hexdigest()

    def get(self, messages: List[dict], model: str) -> Optional[dict]:
        """
        Retrieves a cached LLM response if present and unexpired.

        Returns:
            Optional[dict]: Cached completion response, or None if expired or not found.
        """
        key = self._make_key(messages, model)
        entry = self._cache.get(key)
        if entry is None:
            return None
        
        data, ts = entry
        # Lazy TTL expiration check
        if time.time() - ts > self._ttl:
            del self._cache[key]
            return None
        return data

    def put(self, messages: List[dict], model: str, response: dict) -> None:
        """
        Persists an LLM response in cache, evicting the oldest entry if max capacity is exceeded.
        """
        # Evict oldest entry if size cap is reached
        if len(self._cache) >= self._max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]
            
        key = self._make_key(messages, model)
        self._cache[key] = (response, time.time())


# Singleton instance of the response cache
default_response_cache = ResponseCache(max_size=200, ttl_seconds=300.0)
