"""
AI-05: HashiCorp Vault dynamic retrieval for API key rotation
This module provides Vault integration for dynamically retrieving API keys.
"""
import os
import logging
from typing import Optional, List
import hvac

logger = logging.getLogger("vault-service")


class VaultService:
    """HashiCorp Vault service for dynamic API key retrieval."""
    
    def __init__(self):
        self.vault_addr = os.getenv("VAULT_ADDR", "http://localhost:8200")
        self.vault_token = os.getenv("VAULT_TOKEN", "")
        self.vault_role = os.getenv("VAULT_ROLE", "devmeet-ai-service")
        self.secret_path = os.getenv("VAULT_SECRET_PATH", "secret/data/groq")
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Vault client."""
        try:
            if not self.vault_token:
                logger.warning("VAULT_TOKEN not set. Vault integration will be disabled.")
                return
            
            self.client = hvac.Client(
                url=self.vault_addr,
                token=self.vault_token
            )
            
            # Test connection
            if self.client.is_authenticated():
                logger.info(f"Vault client initialized and authenticated: {self.vault_addr}")
            else:
                logger.warning("Vault client failed to authenticate")
                self.client = None
                
        except Exception as e:
            logger.error(f"Failed to initialize Vault client: {e}")
            self.client = None
    
    def is_available(self) -> bool:
        """Check if Vault service is available."""
        return self.client is not None and self.client.is_authenticated()
    
    def get_secret(self, path: str = None) -> Optional[dict]:
        """
        Retrieve a secret from Vault.
        
        Args:
            path: Optional custom path. If not provided, uses default secret_path.
        
        Returns:
            Secret data if successful, None otherwise
        """
        if not self.is_available():
            logger.debug("Vault service not available")
            return None
        
        try:
            secret_path = path or self.secret_path
            response = self.client.secrets.kv.v2.read_secret_version(path=secret_path)
            
            if response and 'data' in response and 'data' in response['data']:
                return response['data']['data']
            
            logger.warning(f"No data found at Vault path: {secret_path}")
            return None
            
        except Exception as e:
            logger.error(f"Failed to retrieve secret from Vault: {e}")
            return None
    
    def get_groq_api_keys(self) -> List[str]:
        """
        Retrieve Groq API keys from Vault.
        
        Returns:
            List of API keys if successful, empty list otherwise
        """
        secret = self.get_secret()
        if not secret:
            return []
        
        # Extract API keys from secret
        keys = []
        for key in ["groq_api_key", "groq_api_key_2", "groq_api_key_3", "groq_api_key_4", "groq_api_key_5"]:
            if key in secret and secret[key]:
                keys.append(secret[key])
        
        if keys:
            logger.info(f"Retrieved {len(keys)} API keys from Vault")
        else:
            logger.warning("No API keys found in Vault secret")
        
        return keys
    
    def get_dynamic_secret(self, path: str) -> Optional[dict]:
        """
        Retrieve a dynamic secret from Vault (e.g., database credentials).
        
        Args:
            path: Path to the dynamic secret (e.g., 'database/creds/devmeet')
        
        Returns:
            Dynamic secret data if successful, None otherwise
        """
        if not self.is_available():
            logger.debug("Vault service not available")
            return None
        
        try:
            response = self.client.secrets.database.generate_credentials(
                name=path.split('/')[-1]
            )
            
            if response and 'data' in response:
                return response['data']
            
            logger.warning(f"No dynamic secret data found at path: {path}")
            return None
            
        except Exception as e:
            logger.error(f"Failed to retrieve dynamic secret from Vault: {e}")
            return None
    
    def renew_lease(self, lease_id: str, increment: int = 3600) -> bool:
        """
        Renew a lease for a dynamic secret.
        
        Args:
            lease_id: The lease ID to renew
            increment: Lease increment in seconds (default: 1 hour)
        
        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            return False
        
        try:
            self.client.secrets.lease.renew(
                lease_id=lease_id,
                increment=increment
            )
            logger.info(f"Lease renewed: {lease_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to renew lease: {e}")
            return False


vault_service = VaultService()
