"""
AUTH-12: IP-based suspicious login detection with GeoIP lookup
This module provides GeoIP location lookup and suspicious activity detection.
"""
import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import geoip2.database
import geoip2.errors

logger = logging.getLogger("geoip-service")


class GeoIPService:
    """GeoIP lookup service for detecting suspicious login patterns."""
    
    def __init__(self):
        self.db_path = os.getenv("GEOIP_DB_PATH", "/usr/share/GeoIP/GeoLite2-City.mmdb")
        self.reader = None
        self._load_database()
    
    def _load_database(self):
        """Load GeoIP database if available."""
        try:
            if os.path.exists(self.db_path):
                self.reader = geoip2.database.Reader(self.db_path)
                logger.info(f"GeoIP database loaded from {self.db_path}")
            else:
                logger.warning(f"GeoIP database not found at {self.db_path}. GeoIP features will be limited.")
        except Exception as e:
            logger.error(f"Failed to load GeoIP database: {e}")
    
    def get_ip_location(self, ip_address: str) -> Optional[Dict[str, Any]]:
        """
        Get location information for an IP address.
        Returns None if GeoIP database is unavailable or lookup fails.
        """
        if not self.reader:
            return None
        
        try:
            response = self.reader.city(ip_address)
            return {
                "country": response.country.iso_code,
                "country_name": response.country.name,
                "city": response.city.name,
                "subdivision": response.subdivisions.most_specific.name if response.subdivisions.most_specific else None,
                "latitude": response.location.latitude if response.location else None,
                "longitude": response.location.longitude if response.location else None,
                "is_in_eu": response.country.is_in_european_union,
            }
        except geoip2.errors.AddressNotFoundError:
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
        Determine if a login from current_location is suspicious given previous_location.
        
        Suspicious criteria:
        1. Different country from previous login
        2. Large distance (>500km) with short time window (<24 hours)
        3. Login from high-risk country (optional, can be configured)
        """
        if not current_location or not previous_location:
            return False
        
        # Check for country change
        if current_location.get("country") != previous_location.get("country"):
            logger.info(f"Country change detected: {previous_location.get('country')} -> {current_location.get('country')}")
            return True
        
        # Check for impossible travel (large distance in short time)
        if (current_location.get("latitude") and current_location.get("longitude") and
            previous_location.get("latitude") and previous_location.get("longitude")):
            
            from math import radians, sin, cos, sqrt, atan2
            
            # Calculate distance using Haversine formula
            lat1, lon1 = radians(previous_location["latitude"]), radians(previous_location["longitude"])
            lat2, lon2 = radians(current_location["latitude"]), radians(current_location["longitude"])
            
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            distance_km = 6371 * c  # Earth's radius in km
            
            # If distance > 500km and time < 24 hours, flag as suspicious
            if distance_km > 500 and time_diff_hours < 24:
                logger.info(f"Impossible travel detected: {distance_km:.0f}km in {time_diff_hours:.1f} hours")
                return True
        
        return False
    
    def get_risk_score(self, ip_address: str, user_history: list) -> Dict[str, Any]:
        """
        Calculate a risk score for a login attempt based on IP and user history.
        
        Returns:
            {
                "risk_score": 0-100,
                "risk_level": "low"|"medium"|"high",
                "reasons": ["reason1", "reason2"],
                "location": {...}
            }
        """
        current_location = self.get_ip_location(ip_address)
        risk_score = 0
        reasons = []
        
        # Base risk from location
        if not current_location:
            # Unknown location - moderate risk
            risk_score += 20
            reasons.append("Unknown IP location")
        
        # Check against recent login history
        if user_history:
            most_recent = user_history[0] if user_history else None
            if most_recent:
                prev_location = most_recent.get("location")
                prev_time = most_recent.get("login_time")
                
                if prev_time and prev_location:
                    time_diff = datetime.utcnow() - prev_time
                    time_diff_hours = time_diff.total_seconds() / 3600
                    
                    if self.is_suspicious_location(current_location, prev_location, time_diff_hours):
                        risk_score += 50
                        reasons.append("Suspicious location change")
        
        # Check for multiple failed attempts from same IP (would need DB integration)
        # This is a placeholder for future enhancement
        
        # Determine risk level
        if risk_score >= 50:
            risk_level = "high"
        elif risk_score >= 20:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        return {
            "risk_score": min(risk_score, 100),
            "risk_level": risk_level,
            "reasons": reasons,
            "location": current_location
        }


geoip_service = GeoIPService()
