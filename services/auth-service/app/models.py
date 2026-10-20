"""
================================================================================
DevMeet v2.0 - Auth Data Models & Validation Schemas (`models.py`)
================================================================================
Responsibility:
    Defines Pydantic models for request parsing, data validation, and response serialization.
    Enforces security invariants before requests reach database or business logic layers:
    1. Strong password complexity enforcement (upper, lower, digit, special character).
    2. Input sanitization against Cross-Site Scripting (XSS) via HTML tag stripping.
    3. Strict type casting for authentication tokens and MFA payloads.
================================================================================
"""

from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from datetime import datetime
import re


class UserRegister(BaseModel):
    """
    Incoming request payload schema for candidate account registration.
    """
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128, description="Strong user password")
    display_name: str = Field(..., min_length=2, max_length=100, description="Public profile name")

    @validator('password')
    def validate_password_strength(cls, v: str) -> str:
        """
        Validates that the proposed password meets industry-standard complexity requirements:
        - At least one uppercase letter (A-Z)
        - At least one lowercase letter (a-z)
        - At least one numeric digit (0-9)
        - At least one special symbol (!@#$%^&*...)
        """
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v

    @validator('display_name')
    def validate_display_name(cls, v: str) -> str:
        """
        Sanitizes display names to prevent Stored Cross-Site Scripting (XSS) attacks.
        Disallows `<script>` or other HTML tags from being persisted to the database.
        """
        if re.search(r'<[^>]*>', v):
            raise ValueError('Display name cannot contain HTML tags')
        return v.strip()


class UserLogin(BaseModel):
    """
    Incoming request payload schema for user password authentication.
    """
    email: EmailStr
    password: str


class ChangePassword(BaseModel):
    """
    Incoming request payload for an authenticated user changing their own password.
    Requires validating the old password before updating to the new one.
    """
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @validator('new_password')
    def validate_password_strength(cls, v: str) -> str:
        """Enforces complexity requirements on the newly chosen password."""
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


class ResetPasswordRequest(BaseModel):
    """
    Incoming request payload when a user triggers 'Forgot Password'.
    """
    email: EmailStr


class ResetPasswordConfirm(BaseModel):
    """
    Incoming request payload to confirm password reset using a cryptographic reset token.
    """
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @validator('new_password')
    def validate_password_strength(cls, v: str) -> str:
        """Enforces complexity requirements on the new password during reset."""
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


class TokenResponse(BaseModel):
    """
    Standard OAuth2-compliant token issuance response returned after successful login.
    """
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int


class MfaLoginChallengeResponse(BaseModel):
    """
    Intermediate response returned during login if Multi-Factor Authentication (MFA)
    is enabled on the account. Instructs the client to prompt for a TOTP authenticator code.
    """
    mfa_required: bool = True
    mfa_token: str
    expires_in: int = 300  # Challenge valid for 5 minutes


class MfaLoginVerify(BaseModel):
    """
    Verification payload containing the MFA challenge token and either a 6-digit TOTP code
    or an 8-character backup recovery code.
    """
    mfa_token: str
    totp_code: Optional[str] = None
    backup_code: Optional[str] = None


class TokenRefresh(BaseModel):
    """
    Request schema to exchange an unexpired refresh token for a new access token.
    """
    refresh_token: str


class UserProfile(BaseModel):
    """
    Public profile representation of an authenticated user returned by /api/v1/auth/me.
    """
    id: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    role: str = "user"
    created_at: datetime
