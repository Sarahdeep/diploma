import models
from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import to_shape
from geojson_pydantic import Point, Polygon, MultiPolygon

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
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None

class SpeciesCreate(SpeciesBase):
    pass

class SpeciesRead(SpeciesBase):
    id: int

    class Config:
        from_attributes = True

# --- Observation Filter Schemas (Moved Up) ---
class ObservationFilterParams(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    # If you add other filters like min_lat, max_lat, here, ensure the endpoint
    # /observations/ uses them from this model or continues to use direct query params.

# --- Observation Schemas (Replaces GeoData) ---

class ObservationBase(BaseModel):
    timestamp: datetime
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    image_url: Optional[str] = None
    source: Optional[str] = None
    classification_confidence: Optional[float] = Field(None, ge=0, le=1)

class ObservationCreate(ObservationBase):
    species_id: int

class ObservationRead(ObservationBase):
    id: int
    species_id: int
    user_id: Optional[int] = None
    location: Point # This is the field for the GeoJSON Point output, using your custom Point or geojson_pydantic.Point if custom is removed
    image_metadata: Optional[Dict[str, Any]] = None
    species: Optional[SpeciesRead] = None

    @model_validator(mode='before')
    @classmethod
    def _prepare_from_orm(cls, data: Any) -> Any:
        if isinstance(data, models.Observation): # data is the ORM instance
            orm_instance = data
            output_data = {}

            # Populate fields that can be directly mapped or are part of the ORM instance
            # These are fields expected by ObservationRead or its base ObservationBase
            direct_mapping_fields = [
                'id', 'species_id', 'user_id', 'timestamp', 'image_url', 
                'source', 'classification_confidence', 'image_metadata'
            ]
            for field_name in direct_mapping_fields:
                if hasattr(orm_instance, field_name):
                    output_data[field_name] = getattr(orm_instance, field_name)
            
            # Handle nested 'species' relationship
            if hasattr(orm_instance, 'species') and orm_instance.species is not None:
                output_data['species'] = orm_instance.species # Pydantic will convert to SpeciesRead

            # Transform WKBElement 'location' from ORM instance
            if hasattr(orm_instance, 'location') and isinstance(orm_instance.location, WKBElement):
                shape = to_shape(orm_instance.location) # Converts WKBElement to a Shapely Point
                output_data['latitude'] = shape.y
                output_data['longitude'] = shape.x
                # Use the 'Point' type available in this scope (your custom Point or imported geojson_pydantic.Point)
                output_data['location'] = Point(type="Point", coordinates=[shape.x, shape.y])
            
            return output_data
        return data # Pass through if not an ORM Observation instance

    class Config:
        from_attributes = True

# --- HabitatArea Schemas (New) ---

class HabitatAreaCalculationRequest(BaseModel):
    parameters: Dict[str, Any] = Field(default_factory=dict)
    filters: Optional[ObservationFilterParams] = None

class HabitatAreaBase(BaseModel):
    method: str
    parameters: Optional[Dict[str, Any]] = None
    source_observation_count: Optional[int] = None

class HabitatAreaRead(HabitatAreaBase):
    id: int
    species_id: int
    polygon: Polygon # GeoJSON Polygon structure for output
    calculated_at: datetime
    species: Optional[SpeciesRead] = None # Include species info
    user_id: Optional[int] = None # Если добавили user_id в модель

    class Config:
        from_attributes = True

# --- Grid Point Schema ---
class GridPoint(BaseModel):
    lat: float
    lng: float
    density: float

# Новая схема для ответа preview
class HabitatAreaPreviewResponse(BaseModel):
    method: str
    parameters: Optional[Dict[str, Any]] = None
    source_observation_count: int
    polygon: Optional[Union[Polygon, MultiPolygon]] = None
    species_id: int
    grid_points: Optional[List[GridPoint]] = None
    max_density: Optional[float] = None

    class Config:
        from_attributes = True

# --- User Schemas --- (Adjusted)

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int
    is_active: bool
    is_superuser: bool

    class Config:
        from_attributes = True

# --- Auth Schemas --- (Keep as is unless auth logic changes)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

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

class HabitatOverlapResult(BaseModel):
    """Schema for habitat overlap calculation results."""
    intersection_area: float = Field(..., description="Area of intersection between two habitat areas in square kilometers")
    union_area: float = Field(..., description="Area of union between two habitat areas in square kilometers")
    overlap_index: float = Field(..., description="Ratio of intersection area to union area (0-1)")

    class Config:
        from_attributes = True