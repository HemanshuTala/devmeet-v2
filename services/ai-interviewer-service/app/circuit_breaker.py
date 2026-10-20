"""
Circuit Breaker Pattern for External AI Provider APIs.
======================================================
This module implements Michael Nygard's Circuit Breaker pattern to protect
the AI Interviewer service from cascading failures when upstream LLM APIs
(e.g., Groq Cloud LPUs) experience outages, severe rate limiting, or network timeouts.

Why Circuit Breaking is Essential for AI Mock Interviews:
---------------------------------------------------------
When an external LLM API goes down or returns continuous 503/429 errors:
1. Without a Circuit Breaker:
   Every candidate request hangs for 15-30 seconds waiting for connection timeouts.
   Threads and connection pools exhaust quickly, bringing down the entire microservice stack.
2. With a Circuit Breaker:
   - CLOSED (Normal): All generation requests proceed directly to Groq.
   - OPEN (Tripped): When 5 failures occur within 60 seconds, the breaker trips OPEN.
     For the next 30 seconds (`reset_timeout`), requests fail fast immediately without
     making external network calls.
   - Graceful Degradation: When OPEN, the system instantly switches to local heuristic
     fallbacks (`heuristics.py`), generating realistic questions without candidate interruption.
   - HALF-OPEN (Testing): After 30 seconds, a request is permitted through. If successful,
     the breaker resets to CLOSED.
"""

import time
import logging
from typing import List

# Logger for circuit breaker state transitions
logger = logging.getLogger("circuit-breaker")


class CircuitBreaker:
    """
    Sliding-window circuit breaker tracking failure frequencies and managing trip timeouts.
    """
    def __init__(self, threshold: int = 5, window: float = 60.0, reset_timeout: float = 30.0):
        """
        Parameters:
            threshold (int): Number of failures required to trip the circuit (default: 5).
            window (float): Sliding timeframe in seconds for counting failures (default: 60.0s).
            reset_timeout (float): Duration the circuit remains OPEN before probing recovery (default: 30.0s).
        """
        self.threshold = threshold
        self.window = window
        self.reset_timeout = reset_timeout
        self._failures: List[float] = []  # Timestamps of recent errors
        self._open_until: float = 0.0     # Wall clock time when circuit transitions to half-open

    def record_failure(self) -> None:
        """
        Records an error timestamp, purges failures older than `window`, and trips circuit if threshold met.
        """
        now = time.time()
        # Sliding window pruning: retain only failures that occurred within the last 60 seconds
        self._failures = [t for t in self._failures if now - t < self.window]
        self._failures.append(now)
        
        # If failure count reaches threshold, trip the circuit
        if len(self._failures) >= self.threshold:
            self._open_until = now + self.reset_timeout
            logger.warning(
                "[CIRCUIT-BREAKER] Tripped OPEN — %d failures recorded in %.0fs window. Fast-failing for %.0fs.",
                len(self._failures), self.window, self.reset_timeout
            )

    def record_success(self) -> None:
        """
        Resets failure counters and closes the circuit upon a successful LLM response.
        """
        self._failures.clear()
        self._open_until = 0.0

    @property
    def is_open(self) -> bool:
        """
        Returns True if the circuit breaker is currently OPEN (blocking external calls).
        Returns False if CLOSED or if reset_timeout has elapsed (transitioning to HALF-OPEN).
        """
        if time.time() >= self._open_until:
            return False
        return True


# Global default circuit breaker instance shared across AI handlers
default_circuit_breaker = CircuitBreaker(threshold=5, window=60.0, reset_timeout=30.0)
