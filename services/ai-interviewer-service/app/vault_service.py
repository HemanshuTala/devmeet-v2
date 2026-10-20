"""
================================================================================
AI INTERVIEWER SERVICE — HASHICORP VAULT DYNAMIC SECRET & KEY INTEGRATION
================================================================================
Role & Responsibility:
  This module provides enterprise-grade secret management and zero-trust key retrieval
  via HashiCorp Vault. In production environments, hardcoding external API keys
  (e.g., Groq, OpenAI, Anthropic) or storing them in static environment variables
  violates SOC2 and ISO-27001 compliance standards.

Key Capabilities:
  1. Dynamic Key Harvesting: Reads rotated LLM API keys directly from Vault KV v2
     secrets engines (e.g. `secret/data/groq`).
  2. Lease Management & Renewal: Automatically renews leases on dynamic credentials
     (such as temporary database connection tokens).
  3. Graceful Fallback: If Vault is unavailable or unconfigured (`VAULT_TOKEN` missing),
     the service gracefully logs warnings and falls back to environment variable keys
     managed by `KeyManager`.
================================================================================
"""

import os
import logging
from typing import Optional, List
import hvac

logger = logging.getLogger("vault-service")


class VaultService:
    """
    HashiCorp Vault client encapsulating authentication, KV v2 secret reads, and lease renewal.

    Attributes:
      vault_addr (str): Network URL of the Vault server (e.g. http://vault:8200).
      vault_token (str): Authentication token supplied via Kubernetes secret or CI/CD.
      vault_role (str): AppRole identifier for role-based token delegation.
      secret_path (str): Vault KV path where LLM keys are stored.
      client (hvac.Client | None): Underlying HVAC client instance.
    """

    def __init__(self):
        """
        Loads configuration from environment variables and attempts client connection.
        """
        self.vault_addr = os.getenv("VAULT_ADDR", "http://localhost:8200")
        self.vault_token = os.getenv("VAULT_TOKEN", "")
        self.vault_role = os.getenv("VAULT_ROLE", "devmeet-ai-service")
        self.secret_path = os.getenv("VAULT_SECRET_PATH", "secret/data/groq")
        self.client = None
        self._initialize_client()

    def _initialize_client(self):
        """
        Instantiates the HVAC client and tests token authentication.

        Design Rationale:
          - If VAULT_TOKEN is missing (common in local developer setups), authentication
            is skipped cleanly without throwing exceptions.
          - If the token is invalid or expired, sets `self.client = None` to ensure
            all downstream checks report `is_available() == False`.
        """
        try:
            if not self.vault_token:
                logger.warning("VAULT_TOKEN not set. Vault integration will be disabled.")
                return

            self.client = hvac.Client(
                url=self.vault_addr,
                token=self.vault_token,
            )

            # Test connection and token validity
            if self.client.is_authenticated():
                logger.info(f"Vault client initialized and authenticated: {self.vault_addr}")
            else:
                logger.warning("Vault client failed to authenticate (token may be expired)")
                self.client = None

        except Exception as e:
            logger.error(f"Failed to initialize Vault client: {e}")
            self.client = None

    def is_available(self) -> bool:
        """
        Checks whether the Vault client is connected and successfully authenticated.

        Returns:
          bool: True if Vault operations can be executed safely, False otherwise.
        """
        return self.client is not None and self.client.is_authenticated()

    def get_secret(self, path: str = None) -> Optional[dict]:
        """
        Retrieves a key-value secret payload from Vault's KV v2 secrets engine.

        Parameters:
          path (Optional[str]): The KV path to query (e.g., 'secret/data/groq').
                               Defaults to `self.secret_path`.

        Returns:
          Optional[dict]: The dictionary of secret key-value pairs, or None if failed.

        How KV v2 Works in Vault:
          Vault returns KV v2 secrets nested under `response['data']['data']`.
          This method unpacks that structure transparently for callers.
        """
        if not self.is_available():
            logger.debug("Vault service not available; skipping secret retrieval")
            return None

        try:
            secret_path = path or self.secret_path
            response = self.client.secrets.kv.v2.read_secret_version(path=secret_path)

            if response and "data" in response and "data" in response["data"]:
                return response["data"]["data"]

            logger.warning(f"No data found at Vault path: {secret_path}")
            return None

        except Exception as e:
            logger.error(f"Failed to retrieve secret from Vault: {e}")
            return None

    def get_groq_api_keys(self) -> List[str]:
        """
        Extracts all active Groq LLM API keys from the configured Vault secret.

        Returns:
          List[str]: List of non-empty API key strings.

        Key Rotation Architecture:
          Vault holds multiple keys (`groq_api_key`, `groq_api_key_2`, ...).
          When retrieved, this list populates the `KeyManager` round-robin pool,
          enabling zero-downtime key rotation without restarting containers.
        """
        secret = self.get_secret()
        if not secret:
            return []

        # Extract up to 5 rotated API keys from the secret payload
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
        Generates short-lived dynamic credentials (e.g., temporary database passwords).

        Parameters:
          path (str): The database engine role path (e.g., 'database/creds/devmeet').

        Returns:
          Optional[dict]: Generated credentials containing 'username', 'password', and 'lease_id'.
        """
        if not self.is_available():
            logger.debug("Vault service not available")
            return None

        try:
            role_name = path.split("/")[-1]
            response = self.client.secrets.database.generate_credentials(name=role_name)

            if response and "data" in response:
                return response["data"]

            logger.warning(f"No dynamic secret data found at path: {path}")
            return None

        except Exception as e:
            logger.error(f"Failed to retrieve dynamic secret from Vault: {e}")
            return None

    def renew_lease(self, lease_id: str, increment: int = 3600) -> bool:
        """
        Extends the lifetime of a dynamic secret lease before it expires.

        Parameters:
          lease_id (str): The unique Vault lease identifier.
          increment (int): Additional lease duration in seconds (default: 3600 = 1 hour).

        Returns:
          bool: True if renewal succeeded, False otherwise.
        """
        if not self.is_available():
            return False

        try:
            self.client.secrets.lease.renew(
                lease_id=lease_id,
                increment=increment,
            )
            logger.info(f"Lease successfully renewed: {lease_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to renew lease {lease_id}: {e}")
            return False


# Singleton VaultService instance used across the AI Interviewer service
vault_service = VaultService()
