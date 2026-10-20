"""
================================================================================
DevMeet v2.0 - JWT Token & Cryptographic Security Manager (`auth.py`)
================================================================================
Responsibility:
    Provides cryptographic primitives for secure credential storage and token operations:
    1. Secure password hashing and verification using Bcrypt with salted rounds.
    2. Generation of short-lived JSON Web Token (JWT) access tokens (default: 15-60 min).
    3. Generation of long-lived JWT refresh tokens (default: 7 days) for session continuity.
    4. Cryptographic decoding and payload validation with algorithm matching.

Security Philosophy:
    - Passwords are never stored in plaintext; bcrypt generates a unique salt per user.
    - Access tokens are intentionally short-lived to minimize damage if intercepted.
    - Refresh tokens are tagged with type="refresh" to prevent using a refresh token as an access token.
================================================================================
"""

import jwt
from datetime import datetime, timedelta
from typing import Optional
import os
import bcrypt


class AuthManager:
    """
    Singleton service manager handling password hashing and JWT token lifecycles.
    """

    def __init__(self):
        """
        Initializes authentication configuration from environment variables,
        with secure fallbacks for local development testing.
        """
        # Secret key used for signing and verifying cryptographic signatures
        self.secret_key = os.getenv("JWT_SECRET_KEY", "your_jwt_secret_key_here")
        # Cryptographic hashing algorithm (HMAC with SHA-256)
        self.algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        # Duration an access token remains valid before requiring a refresh
        self.access_token_expire_minutes = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
        # Duration a refresh token remains valid for issuing new access tokens
        self.refresh_token_expire_days = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    def hash_password(self, password: str) -> str:
        """
        Hashes a plaintext password using the Bcrypt algorithm with a randomly generated salt.

        Why Bcrypt?
            Bcrypt includes a built-in work factor (cost) that makes brute-force
            and dictionary attacks computationally infeasible even on modern GPUs.

        Args:
            password (str): The plaintext password provided by the user.

        Returns:
            str: The salted bcrypt hash string (starts with $2b$).
        """
        # Convert string to UTF-8 bytes, generate salt, compute hash, and decode back to string
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def verify_password(self, password: str, hashed: str) -> bool:
        """
        Verifies whether an entered plaintext password matches an existing bcrypt hash.

        Args:
            password (str): Plaintext password entered during login.
            hashed (str): Salted bcrypt hash retrieved from PostgreSQL.

        Returns:
            bool: True if password matches the hash; False otherwise.
        """
        # Bcrypt extracts the salt embedded inside the hash and performs constant-time comparison
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

    def create_access_token(self, data: dict) -> str:
        """
        Generates a digitally signed JWT access token for API authorization.

        Contains claims:
            - `sub`: User ID
            - `email`: User email address
            - `role`: Role identifier ('candidate', 'admin')
            - `exp`: Expiration UNIX timestamp
            - `type`: Explicitly marked as "access" to reject unauthorized refresh tokens

        Args:
            data (dict): User claims dictionary to embed into the token payload.

        Returns:
            str: Encoded, cryptographically signed JWT string.
        """
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        # Add standard expiration timestamp and token type claim
        to_encode.update({"exp": expire, "type": "access"})
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)

    def create_refresh_token(self, data: dict) -> str:
        """
        Generates a long-lived refresh token used exclusively to renew expired access tokens
        without forcing the candidate to re-enter their username and password.

        Args:
            data (dict): User identity payload (usually user ID).

        Returns:
            str: Encoded, cryptographically signed JWT string with type="refresh".
        """
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=self.refresh_token_expire_days)
        # Tag token specifically as "refresh" so it cannot be used directly on resource endpoints
        to_encode.update({"exp": expire, "type": "refresh"})
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)

    def decode_token(self, token: str) -> Optional[dict]:
        """
        Decodes and verifies a JWT's cryptographic signature and expiration time.

        Args:
            token (str): The raw bearer token string from authorization headers.

        Returns:
            Optional[dict]: Decoded payload claims dictionary if signature is valid and
                            token is not expired; None if tampered or expired.
        """
        try:
            return jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
        except jwt.PyJWTError:
            # Handles ExpiredSignatureError, InvalidSignatureError, DecodeError gracefully
            return None

    def verify_access_token(self, token: str) -> Optional[dict]:
        """
        Specialized validator that ensures the decoded token is valid AND has type="access".

        Why this check matters:
            Prevents "Token Type Confusion Attacks" where an attacker passes a valid
            7-day refresh token to a protected API endpoint instead of a short-lived access token.

        Args:
            token (str): JWT token string.

        Returns:
            Optional[dict]: Valid payload dictionary if token is an access token; None otherwise.
        """
        payload = self.decode_token(token)
        if payload and payload.get("type") == "access":
            return payload
        return None


# Global singleton instance exported for application-wide reuse
auth_manager = AuthManager()
