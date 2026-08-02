"""Shared pytest configuration for all Python microservices."""
import sys
import os

# Ensure the service root is on the Python path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
