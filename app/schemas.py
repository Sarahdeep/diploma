from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# --- Base Schemas ---

class Point(BaseModel):
    type: str = "Point"
    coordinates: List[float] # [longitude, latitude]

class Polygon(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]] # [[[lon, lat], [lon, lat], ...]]

# --- Species Schemas (Renamed from AnimalClass) ---

class SpeciesBase(BaseModel):
    name: str
    description: Optional[str] = None

class SpeciesCreate(SpeciesBase):
    pass

class Species(SpeciesBase): # Renamed from AnimalClass (used for reading)
    id: int

    class Config:
        from_attributes = True # Changed from orm_mode = True


# --- Observation Schemas (Replaces GeoData) ---

class ObservationBase(BaseModel):
    timestamp: datetime
    source: str = 'unknown'
    image_metadata: Optional[Dict[str, Any]] = None
    classification_confidence: Optional[float] = None
    image_url: Optional[str] = None # URL from MinIO

class ObservationCreate(ObservationBase):
    latitude: float
    longitude: float
    species_id: int
    # user_id will be set based on authenticated user

class ObservationUpdate(BaseModel):
    species_id: Optional[int] = None
    timestamp: Optional[datetime] = None
    latitude: Optional[float] = None # For updating location
    longitude: Optional[float] = None # For updating location
    # Potentially add other fields like source, image_metadata if they should be updatable
    # image_url update is complex, usually involves re-upload. Not included for now.
    classification_confidence: Optional[float] = None

class ObservationRead(ObservationBase):
    id: int
    location: Point # GeoJSON Point structure for output
    species_id: int
    user_id: Optional[int] = None
    created_at: datetime
    species: Species # Include species info

    class Config:
        from_attributes = True

class ObservationFilterParams(BaseModel):
    species_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    min_lat: Optional[float] = None
    min_lon: Optional[float] = None
    max_lat: Optional[float] = None
    max_lon: Optional[float] = None

# --- HabitatArea Schemas (New) ---

class HabitatAreaBase(BaseModel):
    method: str
    parameters: Optional[Dict[str, Any]] = None
    source_observation_count: Optional[int] = None

class HabitatAreaRead(HabitatAreaBase):
    id: int
    species_id: int
    polygon: Polygon # GeoJSON Polygon structure for output
    calculated_at: datetime
    species: Species # Include species info

    class Config:
        from_attributes = True

class HabitatAreaCalculationRequest(BaseModel):
    # Parameters specific to the calculation method (MCP/KDE)
    parameters: Dict[str, Any] = Field(..., example={"percentage": 95}) # Example for MCP
    # Optional filters for selecting observations for calculation
    filters: Optional[ObservationFilterParams] = None


# --- User Schemas --- (Adjusted)

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class User(UserBase): # Renamed from User (used for reading)
    id: int
    # Removed datasets relationship
    # observations: List[ObservationRead] = [] # Uncomment if adding relationship back

    class Config:
        from_attributes = True


# --- Auth Schemas --- (Keep as is unless auth logic changes)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# Removed Dataset schemas
# Removed Image schemas