import models
from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import to_shape
from geojson_pydantic import Point, Polygon, MultiPolygon
from models import UserRole

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
    species_id: Optional[int] = None

class ObservationUpdate(BaseModel): # New schema for updates
    species_id: Optional[int] = None
    # Add other fields here if they should be updatable, e.g.:
    # timestamp: Optional[datetime] = None
    # latitude: Optional[float] = Field(None, ge=-90, le=90)
    # longitude: Optional[float] = Field(None, ge=-180, le=180)

class ObservationRead(ObservationBase):
    id: int
    species_id: Optional[int] = None
    user_id: Optional[int] = None
    location: Point # This is the field for the GeoJSON Point output, using your custom Point or geojson_pydantic.Point if custom is removed
    image_metadata: Optional[Dict[str, Any]] = None
    is_verified: bool
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
                'source', 'classification_confidence', 'image_metadata', 'is_verified'
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

# --- User Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

    @model_validator(mode='after')
    def passwords_match(self) -> 'UserCreate':
        if self.password != self.confirm_password:
            raise ValueError('Passwords do not match')
        return self

class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None # Allow role updates by admin

class UserRead(UserBase):
    id: int
    role: UserRole
    avatar_url: Optional[str] = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserProfile(UserRead):
    observation_count: int
    last_observation_date: Optional[datetime] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    social_links: Optional[Dict[str, str]] = None
    preferences: Optional[Dict[str, Any]] = None
    notification_settings: Optional[Dict[str, bool]] = None

    class Config:
        from_attributes = True

class UserProfileUpdate(BaseModel):
    bio: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    social_links: Optional[Dict[str, str]] = None
    preferences: Optional[Dict[str, Any]] = None
    notification_settings: Optional[Dict[str, bool]] = None

class PublicUserProfile(BaseModel):
    id: int
    username: str
    avatar_url: Optional[str] = None
    created_at: datetime
    observation_count: int
    last_observation_date: Optional[datetime] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    social_links: Optional[Dict[str, str]] = None
    # Fields from UserRead to include (excluding sensitive ones)
    role: UserRole # Assuming role is okay to be public, otherwise remove

    # Fields from UserProfile to include
    # observation_count: int # Already included
    # last_observation_date: Optional[datetime] = None # Already included
    # bio: Optional[str] = None # Already included
    # location: Optional[str] = None # Already included
    # website: Optional[str] = None # Already included
    # social_links: Optional[Dict[str, str]] = None # Already included
    # preferences: Optional[Dict[str, Any]] = None # Excluded as potentially sensitive
    # notification_settings: Optional[Dict[str, bool]] = None # Excluded as potentially sensitive


    class Config:
        from_attributes = True

class UserActivityBase(BaseModel):
    activity_type: str
    activity_data: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

class UserActivityCreate(UserActivityBase):
    user_id: int

class UserActivityRead(UserActivityBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class UserStatistics(BaseModel):
    total_observations: int
    total_uploads: int
    total_edits: int
    last_activity: Optional[datetime] = None
    activity_by_type: Dict[str, int]
    recent_activities: List[UserActivityRead]

    class Config:
        from_attributes = True

# --- Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str
    refresh_token: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[UserRole] = None

class RefreshToken(BaseModel):
    refresh_token: str

# New response model for login when refresh token is in cookie
class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str

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

class AdminStatistics(BaseModel):
    total_users: int
    active_users: int
    verified_users: int
    admin_users: int
    total_observations: int
    total_species: int
    total_activities: int
    activity_by_type: Dict[str, int]
    recent_activities: List[UserActivityRead]

    class Config:
        from_attributes = True

# --- Analysis Schemas ---
class AnalysisRequest(BaseModel):
    species1_id: int
    species2_id: int
    start_date: datetime
    end_date: datetime
    time_step_days: int = Field(default=7, description="Time step for analysis in days (e.g., 7 for weekly)")
    observation_window_days: int = Field(default=30, description="Sliding window for observations in days (e.g., 30 days of data for each step)")
    kde_h_meters: Optional[float] = Field(default=10000, description="Bandwidth for KDE in meters") # Default to 10km
    kde_level_percent: Optional[float] = Field(default=95, description="Contour level for KDE")
    kde_grid_size: Optional[int] = Field(default=100, description="Grid size for KDE calculation")

class OverlapTrendPoint(BaseModel):
    time: datetime # Midpoint of the window, or start of the step
    overlap_area: float # Actual area, not just index
    overlap_index: float # Intersection / Union

class OverlapTrendResponse(BaseModel):
    data: List[OverlapTrendPoint]

class SpeciesHabitatTimePoint(BaseModel):
    time: datetime
    species_id: int
    centroid: Optional[Point] = None # GeoJSON Point for centroid
    kde_polygon: Optional[Union[Polygon, MultiPolygon]] = None # GeoJSON Polygon/MultiPolygon for KDE
    observation_count: int # Number of observations used for this specific KDE/centroid calculation

class HabitatEvolutionResponse(BaseModel):
    data: List[SpeciesHabitatTimePoint]