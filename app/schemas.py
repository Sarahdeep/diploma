from pydantic import BaseModel, EmailStr, Field, computed_field
from typing import List, Optional, Dict, Any
from datetime import datetime
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import to_shape

# --- Base Schemas ---

class Point(BaseModel):
    type: str = "Point"
    coordinates: List[float] # [longitude, latitude]

class Polygon(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]] # [[[lon, lat], [lon, lat], ...]]

# Generic GeoJSON Geometry for request bodies
class GeoJsonGeometry(BaseModel):
    type: str
    coordinates: Any # Coordinates can be complex and vary by type

class ObservationDeleteByAreaRequest(BaseModel):
    area: GeoJsonGeometry

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
    species_id: int
    user_id: Optional[int] = None
    created_at: datetime
    species: Species # Include species info

    # This field holds the raw WKBElement from the ORM.
    # It's populated from the SQLAlchemy model's 'location' attribute via alias.
    # It is NOT included in the output JSON due to exclude=True.
    location_orm_wkb: Optional[WKBElement] = Field(alias='location', default=None, exclude=True)

    @computed_field(description="GeoJSON Point structure for output")
    @property
    def location(self) -> Optional[Point]:
        raw_location_value = self.location_orm_wkb # Use the renamed, aliased field

        if raw_location_value is None:
            return None

        if isinstance(raw_location_value, WKBElement):
            try:
                shapely_point = to_shape(raw_location_value)
                return Point(coordinates=[shapely_point.x, shapely_point.y])
            except Exception as e:
                # Log error during conversion if necessary
                # print(f"Error converting WKBElement to Point: {e}")
                return None # Or raise, depending on how strict we want to be
        elif isinstance(raw_location_value, dict) and 'coordinates' in raw_location_value:
            return Point(**raw_location_value)
        elif isinstance(raw_location_value, Point):
            return raw_location_value
        
        # If it's not None and not any of the expected types, it's an issue.
        # print(f"Warning: location_orm_wkb had unexpected type: {type(raw_location_value)}")
        return None # Fallback for unexpected types after None check

    class Config:
        from_attributes = True
        populate_by_name = True # To allow alias 'location' to populate 'location_orm_wkb'
        arbitrary_types_allowed = True # Allow WKBElement type

class ObservationFilterParams(BaseModel):
    species_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    min_lat: Optional[float] = None
    min_lon: Optional[float] = None
    max_lat: Optional[float] = None
    max_lon: Optional[float] = None
    min_confidence: Optional[float] = None

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

class DBSpeciesBase(BaseModel): # For the list of DB species
    id: int
    name: str

class SpeciesCheckResponse(BaseModel):
    csv_species_names: List[str]
    db_species: List[DBSpeciesBase]
    unmatched_csv_species: List[str]

class StandardResponseMessage(BaseModel):
    message: str
    deleted_count: Optional[int] = None # Added to accommodate deletion counts

class ObservationListResponse(BaseModel):
    observations: List[ObservationRead]
    total_count: int