"""
AUTH-12: IP-based Suspicious Login Detection with GeoIP Lookup.
================================================================
This module provides geolocation lookup and suspicious activity detection
for incoming authentication requests.

Why this module exists:
-----------------------
Account takeover attacks often occur when stolen credentials (passwords, tokens)
are used by attackers in geographically distant locations. By inspecting the user's
client IP address at login time:
1. We determine the physical country, city, and GPS coordinates of the requester
   using the MaxMind GeoLite2 binary database.
2. We compare this against the user's previous successful login location and timestamp.
3. We detect 'Impossible Travel' (e.g., logging in from New York, then from Tokyo
   30 minutes later, which is physically impossible without teleportation).
4. We assign an actionable risk score (low, medium, high) to prompt security alerts,
   step-up MFA challenges, or session revocations.
"""
import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import geoip2.database
import geoip2.errors

# Module-level logger for geoip diagnostics and audit records
logger = logging.getLogger("geoip-service")


class GeoIPService:
    """
    GeoIP lookup and anomaly detection service.
    
    Reads MaxMind `.mmdb` binary city database to map client IPv4/IPv6 addresses
    to country, city, and geographical coordinates (latitude/longitude), then evaluates
    spatial-temporal travel feasibility between consecutive sessions.
    """
    
    def __init__(self):
        """
        Initializes the GeoIP service instance and attempts to load the local MaxMind database.
        
        The path can be overridden using the `GEOIP_DB_PATH` environment variable.
        Defaults to standard Linux package location `/usr/share/GeoIP/GeoLite2-City.mmdb`.
        """
        self.db_path = os.getenv("GEOIP_DB_PATH", "/usr/share/GeoIP/GeoLite2-City.mmdb")
        self.reader = None
        self._load_database()
    
    def _load_database(self):
        """
        Loads the MaxMind GeoLite2 binary database into memory if the file exists on disk.
        
        Graceful Degradation:
        If the .mmdb database file is not installed (e.g. in minimal dev or CI environments),
        this logs a warning and leaves `self.reader = None`. The application continues running
        without crashing; geo-location lookups will safely return `None`.
        """
        try:
            if os.path.exists(self.db_path):
                # MaxMind database reader provides thread-safe, fast binary tree lookups
                self.reader = geoip2.database.Reader(self.db_path)
                logger.info(f"GeoIP database loaded successfully from {self.db_path}")
            else:
                logger.warning(f"GeoIP database not found at {self.db_path}. GeoIP features will be limited.")
        except Exception as e:
            logger.error(f"Failed to load GeoIP database from {self.db_path}: {e}")
    
    def get_ip_location(self, ip_address: str) -> Optional[Dict[str, Any]]:
        """
        Queries the GeoLite2 database for physical location details of a given IP.

        Parameters:
            ip_address (str): The IPv4 or IPv6 client address (e.g., '198.51.100.42').

        Returns:
            Optional[Dict[str, Any]]: A structured dictionary with country code, city,
            approximate latitude/longitude coordinates, and EU residency status; or None
            if lookup fails or IP is unmapped/private.
        """
        # If the database was not loaded (file missing or corrupt), degrade gracefully
        if not self.reader:
            return None
        
        try:
            # Query reader for City level record
            response = self.reader.city(ip_address)
            
            # Extract standard geolocation metadata
            return {
                "country": response.country.iso_code,                                    # e.g., 'US', 'IN', 'DE'
                "country_name": response.country.name,                                  # e.g., 'United States'
                "city": response.city.name,                                              # e.g., 'San Francisco'
                "subdivision": response.subdivisions.most_specific.name if response.subdivisions.most_specific else None, # State/Province
                "latitude": response.location.latitude if response.location else None,   # GPS latitude in decimal degrees
                "longitude": response.location.longitude if response.location else None, # GPS longitude in decimal degrees
                "is_in_eu": response.country.is_in_european_union,                       # Useful for GDPR compliance flags
            }
        except geoip2.errors.AddressNotFoundError:
            # Private network IPs (127.0.0.1, 192.168.x.x, 10.x.x.x) or unassigned IPs are not in the DB
            logger.debug(f"IP address not found in GeoIP database: {ip_address}")
            return None
        except Exception as e:
            logger.error(f"GeoIP lookup error for {ip_address}: {e}")
            return None
    
    def is_suspicious_location(
        self, 
        current_location: Optional[Dict[str, Any]], 
        previous_location: Optional[Dict[str, Any]],
        time_diff_hours: float
    ) -> bool:
        """
        Evaluates whether a login is suspicious based on geographic movement relative to elapsed time.

        Suspicious criteria evaluated:
        1. Country change: Logging in from a completely different nation between sessions.
        2. Impossible Travel (velocity anomaly): Travelling over 500 km within less than 24 hours
           (or faster than standard commercial transit speeds).

        Parameters:
            current_location (Optional[Dict]): Geolocation dict of the current login attempt.
            previous_location (Optional[Dict]): Geolocation dict of the user's prior login.
            time_diff_hours (float): Hours elapsed since the previous login.

        Returns:
            bool: True if the movement violates normal physical travel constraints, False otherwise.
        """
        # If either location is missing (e.g. localhost or first login), we cannot perform spatial analysis
        if not current_location or not previous_location:
            return False
        
        # Criterion 1: Sudden international country change
        if current_location.get("country") != previous_location.get("country"):
            logger.info(f"Country change detected: {previous_location.get('country')} -> {current_location.get('country')}")
            return True
        
        # Criterion 2: Spatial distance calculation using the Haversine formula
        # Checks if GPS coordinates exist for both login records
        if (current_location.get("latitude") and current_location.get("longitude") and
            previous_location.get("latitude") and previous_location.get("longitude")):
            
            from math import radians, sin, cos, sqrt, atan2
            
            # Convert decimal degrees to radians for trigonometric calculation
            lat1, lon1 = radians(previous_location["latitude"]), radians(previous_location["longitude"])
            lat2, lon2 = radians(current_location["latitude"]), radians(current_location["longitude"])
            
            # Difference in coordinates
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            
            # Haversine formula calculates great-circle distance between two points on a sphere:
            # a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
            # c = 2 * atan2(√a, √(1−a))
            # d = R * c (where R is Earth radius ~6371 km)
            a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
            c = 2 * atan2(sqrt(a), sqrt(1 - a))
            distance_km = 6371 * c
            
            # If distance exceeds 500km and occurred in under 24 hours, flag as suspicious travel
            if distance_km > 500 and time_diff_hours < 24:
                logger.info(f"Impossible travel detected: {distance_km:.0f}km in {time_diff_hours:.1f} hours")
                return True
        
        return False
    
    def get_risk_score(self, ip_address: str, user_history: list) -> Dict[str, Any]:
        """
        Calculates a cumulative risk score (0 to 100) and risk category for an incoming login request.

        Parameters:
            ip_address (str): Client IP address attempting authentication.
            user_history (list): Chronological list of user's past login records (most recent first).

        Returns:
            Dict[str, Any]: Contains:
                - `risk_score` (int): Numerical score between 0 and 100.
                - `risk_level` (str): 'low', 'medium', or 'high'.
                - `reasons` (List[str]): Explanations for why the score was elevated.
                - `location` (Optional[Dict]): Resolved geolocation for the current IP.
        """
        current_location = self.get_ip_location(ip_address)
        risk_score = 0
        reasons = []
        
        # Base risk: Unknown / unresolvable IP (e.g. proxy, Tor exit, or missing DB) adds 20 risk points
        if not current_location:
            risk_score += 20
            reasons.append("Unknown IP location")
        
        # Evaluate against the user's most recent prior login
        if user_history:
            most_recent = user_history[0] if user_history else None
            if most_recent:
                prev_location = most_recent.get("location")
                prev_time = most_recent.get("login_time")
                
                if prev_time and prev_location:
                    # Calculate time elapsed between previous login and current attempt
                    time_diff = datetime.utcnow() - prev_time
                    time_diff_hours = time_diff.total_seconds() / 3600
                    
                    # Test for impossible travel or country hopping
                    if self.is_suspicious_location(current_location, prev_location, time_diff_hours):
                        risk_score += 50
                        reasons.append("Suspicious location change")
        
        # Classify the cumulative score into actionable risk buckets:
        # Score >= 50: High risk (potential compromise, requires MFA or block)
        # Score >= 20: Medium risk (unusual location, log security audit event)
        # Score < 20: Low risk (routine login)
        if risk_score >= 50:
            risk_level = "high"
        elif risk_score >= 20:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        return {
            "risk_score": min(risk_score, 100),  # Clamp at 100 maximum
            "risk_level": risk_level,
            "reasons": reasons,
            "location": current_location
        }


# Global singleton instance of GeoIPService for re-use across auth handlers
geoip_service = GeoIPService()
