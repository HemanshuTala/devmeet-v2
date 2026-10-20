"""
API Key Management and Model Degradation Fallback for Groq LPUs.
=================================================================
This module manages credentials and multi-model failover strategies for external AI calls.

Key High-Availability Features:
-------------------------------
1. Dual-Tier Secret Resolution:
   - Tier 1: HashiCorp Vault dynamic secret management (`vault_service.get_groq_api_keys`).
   - Tier 2: Static environment variable fallback (`GROQ_API_KEY`, `GROQ_API_KEY_2`, etc.).
2. Round-Robin Key Load Balancing (`_get_next_key`):
   - Rotates requests across all active API keys to evenly distribute request volume
     and avoid tripping per-key Rate Limits (RPM/TPM).
3. Multi-Model Failover Cascade (`_get_next_model`):
   - Tier 1 (Primary): `llama-3.3-70b-versatile` (Deep technical reasoning, nuanced system design).
   - Tier 2 (Speed Fallback): `llama-3.1-8b-instant` (Ultra low latency, resilient under load).
   - Tier 3 (Long Context): `mixtral-8x7b-32768` (Mixture-of-Experts with 32,768 token window).
   - Tier 4 (Emergency Backup): `gemma2-9b-it` (Google's compact instruction-tuned model).
"""

import os
import logging
from typing import List, Optional
from .vault_service import vault_service

logger = logging.getLogger("key-manager")

# In-memory pool of active Groq API keys
_GROQ_KEYS: List[str] = []

# ─── 1. Attempt Dynamic Secret Resolution from HashiCorp Vault ────────────────
if vault_service.is_available():
    vault_keys = vault_service.get_groq_api_keys()
    if vault_keys:
        _GROQ_KEYS.extend(vault_keys)
        logger.info(f"Loaded {len(vault_keys)} dynamic API keys from HashiCorp Vault")

# ─── 2. Fallback to Environment Variables (GROQ_API_KEY, GROQ_API_KEY_2, ...) ──
for idx in ["", "_2", "_3", "_4", "_5"]:
    key = os.getenv(f"GROQ_API_KEY{idx}", "")
    if key and key not in _GROQ_KEYS:
        _GROQ_KEYS.append(key)

if not _GROQ_KEYS:
    print("[key-manager] WARNING: No GROQ_API_KEY configured (env or Vault). AI will use fallback responses.")

_key_index = 0


def _get_next_key() -> Optional[str]:
    """
    Selects the next available Groq API key using round-robin rotation.

    Returns:
        Optional[str]: An API key string, or None if no keys are configured.
    """
    global _key_index
    if not _GROQ_KEYS:
        return None
    key = _GROQ_KEYS[_key_index % len(_GROQ_KEYS)]
    _key_index += 1
    return key


# Model fallback hierarchy: if the primary model fails or is rate-limited,
# requests degrade down the chain to ensure the interview continues uninterrupted
_MODEL_FALLBACKS = [
    os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),  # Primary high-capacity model
    "openai/gpt-oss-120b",                       # High reasoning backup
    "openai/gpt-oss-20b",                        # Emergency compact backup
]
_model_index = 0


def _get_next_model() -> str:
    """
    Cycles to the next model in the fallback chain upon API exception.
    """
    global _model_index
    model = _MODEL_FALLBACKS[_model_index % len(_MODEL_FALLBACKS)]
    _model_index += 1
    return model
