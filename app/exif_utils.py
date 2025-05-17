import io
import exifread
from datetime import datetime
from typing import Dict, Optional, Any, Tuple

def convert_to_degrees(value) -> Optional[float]:
    """Convert GPS coordinates stored in EXIF to degrees."""
    try:
        d, m, s = [float(x.num) / float(x.den) for x in value.values]
        return d + (m / 60.0) + (s / 3600.0)
    except (AttributeError, ValueError, ZeroDivisionError, IndexError):
        # Handle potential errors if EXIF data is malformed
        return None

def get_exif_data(image_data: bytes) -> Optional[Dict[str, Any]]:
    """Extract EXIF data from an image file bytes."""
    try:
        return exifread.process_file(io.BytesIO(image_data), details=False)
    except Exception:
        # Handle potential errors during EXIF processing
        return None

def get_gps_coordinates(exif_data: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """Extract GPS latitude and longitude from parsed EXIF data."""
    gps_tags = {tag: value for tag, value in exif_data.items() if tag.startswith("GPS ")}
    
    lat_tag = gps_tags.get('GPS GPSLatitude')
    lon_tag = gps_tags.get('GPS GPSLongitude')
    lat_ref_tag = gps_tags.get('GPS GPSLatitudeRef')
    lon_ref_tag = gps_tags.get('GPS GPSLongitudeRef')

    if not lat_tag or not lon_tag:
        return None

    lat = convert_to_degrees(lat_tag)
    lon = convert_to_degrees(lon_tag)

    if lat is None or lon is None:
        return None
        
    # Adjust sign based on reference (N/S, E/W)
    lat_ref = str(lat_ref_tag.values) if lat_ref_tag else 'N'
    lon_ref = str(lon_ref_tag.values) if lon_ref_tag else 'E'
        
    if 'S' in lat_ref:
        lat = -lat
    if 'W' in lon_ref:
        lon = -lon
        
    return lat, lon

def get_timestamp(exif_data: Dict[str, Any]) -> Optional[datetime]:
    """Extract timestamp (DateTimeOriginal or DateTimeDigitized) from EXIF data."""
    # EXIF standard format: 'YYYY:MM:DD HH:MM:SS'
    date_format = "%Y:%m:%d %H:%M:%S"
    
    timestamp_str = None
    if 'EXIF DateTimeOriginal' in exif_data:
        timestamp_str = str(exif_data['EXIF DateTimeOriginal'])
    elif 'Image DateTime' in exif_data: # Fallback to Image DateTime
        timestamp_str = str(exif_data['Image DateTime'])
    # Add other potential timestamp tags if needed (e.g., EXIF DateTimeDigitized)

    if timestamp_str:
        try:
            return datetime.strptime(timestamp_str, date_format)
        except (ValueError, TypeError):
            return None # Invalid format
    return None

def extract_gps_datetime(image_data: bytes) -> Dict[str, Optional[Any]]:
    """Extract GPS coordinates and timestamp from image bytes.
    
    Returns:
        dict: {'latitude': float | None, 'longitude': float | None, 'timestamp': datetime | None}
    """
    result: Dict[str, Optional[Any]] = {
        'latitude': None,
        'longitude': None,
        'timestamp': None
    }
    exif_data = get_exif_data(image_data)
    
    if not exif_data:
        return result # Failed to parse EXIF at all
        
    gps_coords = get_gps_coordinates(exif_data)
    if gps_coords:
        result['latitude'] = gps_coords[0]
        result['longitude'] = gps_coords[1]
        
    timestamp = get_timestamp(exif_data)
    if timestamp:
        result['timestamp'] = timestamp
        
    return result 