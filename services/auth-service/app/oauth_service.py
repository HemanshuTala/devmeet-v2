"""
AUTH-02 & AUTH-03: OAuth2 Service for Google and GitHub login
This module provides OAuth2 PKCE flow implementation for Google and GitHub.
"""
import os
import secrets
import logging
import httpx
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException
from authlib.oauth2.rfc7636 import create_s256_code_challenge

logger = logging.getLogger("oauth-service")

# OAuth2 Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
OAUTH_REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:8001/api/v1/auth/oauth/callback")

class OAuthService:
    """OAuth2 service for Google and GitHub authentication."""
    
    def __init__(self):
        self.google_client_id = GOOGLE_CLIENT_ID
        self.google_client_secret = GOOGLE_CLIENT_SECRET
        self.github_client_id = GITHUB_CLIENT_ID
        self.github_client_secret = GITHUB_CLIENT_SECRET
        self.redirect_uri = OAUTH_REDIRECT_URI
        
        # Check if OAuth is configured
        self.google_configured = bool(self.google_client_id and self.google_client_secret)
        self.github_configured = bool(self.github_client_id and self.github_client_secret)
        
        if not self.google_configured:
            logger.warning("Google OAuth2 not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)")
        if not self.github_configured:
            logger.warning("GitHub OAuth2 not configured (missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET)")
    
    def generate_state(self) -> str:
        """Generate a random state parameter for CSRF protection."""
        return secrets.token_urlsafe(32)
    
    def generate_code_verifier(self) -> str:
        """Generate a random code verifier for PKCE."""
        return secrets.token_urlsafe(32)
    
    def generate_code_challenge(self, code_verifier: str) -> str:
        """Generate code challenge from code verifier using SHA-256."""
        return create_s256_code_challenge(code_verifier)
    
    def get_google_auth_url(self, state: str, code_challenge: str) -> str:
        """
        Generate Google OAuth2 authorization URL with PKCE.
        
        Args:
            state: CSRF protection state parameter
            code_challenge: PKCE code challenge
            
        Returns:
            Authorization URL
        """
        if not self.google_configured:
            raise HTTPException(
                status_code=503,
                detail="Google OAuth2 not configured"
            )
        
        params = {
            "client_id": self.google_client_id,
            "redirect_uri": f"{self.redirect_uri}?provider=google",
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256"
        }
        
        base_url = "https://accounts.google.com/o/oauth2/v2/auth"
        auth_url = f"{base_url}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
        
        logger.info(f"Generated Google OAuth2 auth URL with state={state[:8]}...")
        return auth_url
    
    def get_github_auth_url(self, state: str, code_challenge: str) -> str:
        """
        Generate GitHub OAuth2 authorization URL with PKCE.
        
        Args:
            state: CSRF protection state parameter
            code_challenge: PKCE code challenge
            
        Returns:
            Authorization URL
        """
        if not self.github_configured:
            raise HTTPException(
                status_code=503,
                detail="GitHub OAuth2 not configured"
            )
        
        params = {
            "client_id": self.github_client_id,
            "redirect_uri": f"{self.redirect_uri}?provider=github",
            "scope": "user:email",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256"
        }
        
        base_url = "https://github.com/login/oauth/authorize"
        auth_url = f"{base_url}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
        
        logger.info(f"Generated GitHub OAuth2 auth URL with state={state[:8]}...")
        return auth_url
    
    async def exchange_google_code(self, code: str, code_verifier: str) -> Dict[str, Any]:
        """
        Exchange Google authorization code for access token.
        
        Args:
            code: Authorization code from callback
            code_verifier: PKCE code verifier
            
        Returns:
            Token response with access token and user info
        """
        if not self.google_configured:
            raise HTTPException(
                status_code=503,
                detail="Google OAuth2 not configured"
            )
        
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": self.google_client_id,
            "client_secret": self.google_client_secret,
            "code": code,
            "redirect_uri": f"{self.redirect_uri}?provider=google",
            "grant_type": "authorization_code",
            "code_verifier": code_verifier
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            if response.status_code != 200:
                logger.error(f"Google token exchange failed: {response.text}")
                raise HTTPException(
                    status_code=400,
                    detail="Failed to exchange authorization code"
                )
            
            token_data = response.json()
            access_token = token_data.get("access_token")
            
            # Fetch user info
            user_info = await self.fetch_google_user_info(access_token)
            
            return {
                "access_token": access_token,
                "user_info": user_info
            }
    
    async def fetch_google_user_info(self, access_token: str) -> Dict[str, Any]:
        """Fetch user info from Google using access token."""
        user_info_url = "https://www.googleapis.com/oauth2/v2/userinfo"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(user_info_url, headers=headers)
            if response.status_code != 200:
                logger.error(f"Failed to fetch Google user info: {response.text}")
                raise HTTPException(
                    status_code=400,
                    detail="Failed to fetch user information"
                )
            
            user_info = response.json()
            return {
                "provider": "google",
                "provider_id": str(user_info.get("id")),
                "email": user_info.get("email"),
                "name": user_info.get("name"),
                "picture": user_info.get("picture"),
                "verified_email": user_info.get("verified_email", False)
            }
    
    async def exchange_github_code(self, code: str, code_verifier: str) -> Dict[str, Any]:
        """
        Exchange GitHub authorization code for access token.
        
        Args:
            code: Authorization code from callback
            code_verifier: PKCE code verifier
            
        Returns:
            Token response with access token and user info
        """
        if not self.github_configured:
            raise HTTPException(
                status_code=503,
                detail="GitHub OAuth2 not configured"
            )
        
        token_url = "https://github.com/login/oauth/access_token"
        data = {
            "client_id": self.github_client_id,
            "client_secret": self.github_client_secret,
            "code": code,
            "redirect_uri": f"{self.redirect_uri}?provider=github",
            "code_verifier": code_verifier
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data, headers={"Accept": "application/json"})
            if response.status_code != 200:
                logger.error(f"GitHub token exchange failed: {response.text}")
                raise HTTPException(
                    status_code=400,
                    detail="Failed to exchange authorization code"
                )
            
            token_data = response.json()
            access_token = token_data.get("access_token")
            
            # Fetch user info
            user_info = await self.fetch_github_user_info(access_token)
            
            return {
                "access_token": access_token,
                "user_info": user_info
            }
    
    async def fetch_github_user_info(self, access_token: str) -> Dict[str, Any]:
        """Fetch user info from GitHub using access token."""
        user_info_url = "https://api.github.com/user"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(user_info_url, headers=headers)
            if response.status_code != 200:
                logger.error(f"Failed to fetch GitHub user info: {response.text}")
                raise HTTPException(
                    status_code=400,
                    detail="Failed to fetch user information"
                )
            
            user_info = response.json()
            
            # Fetch primary email (GitHub doesn't include email in user endpoint by default)
            email = user_info.get("email")
            if not email:
                email = await self.fetch_github_primary_email(access_token)
            
            return {
                "provider": "github",
                "provider_id": str(user_info.get("id")),
                "email": email,
                "name": user_info.get("name") or user_info.get("login"),
                "picture": user_info.get("avatar_url"),
                "verified_email": True  # GitHub OAuth requires verified email
            }
    
    async def fetch_github_primary_email(self, access_token: str) -> str:
        """Fetch primary email from GitHub."""
        emails_url = "https://api.github.com/user/emails"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(emails_url, headers=headers)
            if response.status_code != 200:
                logger.error(f"Failed to fetch GitHub emails: {response.text}")
                raise HTTPException(
                    status_code=400,
                    detail="Failed to fetch user email"
                )
            
            emails = response.json()
            # Find primary verified email
            for email_data in emails:
                if email_data.get("primary") and email_data.get("verified"):
                    return email_data.get("email")
            
            # Fallback to first verified email
            for email_data in emails:
                if email_data.get("verified"):
                    return email_data.get("email")
            
            # Fallback to first email
            if emails:
                return emails[0].get("email")
            
            raise HTTPException(
                status_code=400,
                detail="No verified email found in GitHub account"
            )


oauth_service = OAuthService()
