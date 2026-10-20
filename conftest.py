"""
DevMeet Platform - Root Pytest Configuration & Test Fixture Loader
==================================================================
This root configuration file configures test discovery, package path resolution,
and cross-service mock fixtures for all 10 Python microservices.

Key Architectural Responsibilities:
1. Python Path Injection:
   - Injects the repository root directory into `sys.path` so tests can import
     sibling packages, mock fixtures, and service modules without relative path fragility.
2. Unified Test Discovery:
   - Enables executing `pytest` from the root workspace directory across all services
     (`services/*/app/test_*.py`).
"""

import sys
import os

# Inject repository root into the active Python import search path
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
