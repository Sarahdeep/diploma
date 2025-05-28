export interface Point {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Polygon {
  type: "Polygon";
  coordinates: number[][][]; // [[[lon, lat], [lon, lat], ...]]
}

// --- User Schemas ---
export interface User {
  id: number;
  email: string;
  is_active?: boolean;
  is_admin?: boolean;
}

export interface UserCreate {
  email: string;
  username: string;
  password: string;
  role?: UserRole; // Optional, backend might default it
}

export interface UserUpdate {
  email?: string;
  username?: string;
  password?: string; // For password changes
  role?: UserRole;
  avatar_url?: string | null;
  is_active?: boolean;
  is_verified?: boolean;
  // profile updates would likely be separate or nested
}

export interface UserProfileData { // Renamed from UserProfile to avoid conflict if there's a component named UserProfile
    bio?: string | null;
    location?: string | null;
    website?: string | null;
    social_links?: Record<string, string> | null; // Assuming JSON string keys
    preferences?: Record<string, any> | null;
    notification_settings?: Record<string, any> | null;
}

export interface UserRead {
    id: number;
    email: string;
    username: string;
    role: UserRole;
    avatar_url?: string | null;
    is_active: boolean;
    is_verified: boolean;
    created_at: string; // ISO datetime string
    updated_at: string; // ISO datetime string
    last_login?: string | null; // ISO datetime string
    profile?: UserProfileData | null; // Nested profile data
}

export interface UserProfileUpdate extends UserProfileData {}

// --- Auth Schemas ---
export interface Token {
  access_token: string;
  refresh_token?: string; // Added refresh_token
  token_type: string;
}

// --- Species Schemas ---
export interface Species {
  id: number;
  name: string;
  description?: string | null;
}

export interface SpeciesCreate {
  name: string;
  description?: string | null;
}

export interface DBSpeciesBase { // For species check response
    id: number;
    name: string;
}

export interface SpeciesCheckResponse { // For species check response
    csv_species_names: string[];
    db_species: DBSpeciesBase[];
    unmatched_csv_species: string[];
}

// --- Observation Schemas ---
export interface ObservationBase {
  timestamp: string; // ISO datetime string
  source: string;
  image_metadata?: Record<string, any> | null;
  classification_confidence?: number | null;
  image_url?: string | null;
}

export interface ObservationRead extends ObservationBase {
  id: number;
  location: Point;
  species_id: number;
  user_id?: number | null;
  created_at: string; // ISO datetime string
  species: Species; // Nested species info
}

export interface ObservationCreate {
  latitude: number;
  longitude: number;
  species_id: number;
  timestamp: string; // ISO datetime string
  source?: string;
  image_metadata?: Record<string, any> | null;
  classification_confidence?: number | null;
  // image_url is handled by backend from file upload
}

export interface ObservationUpdate {
  species_id?: number;
  timestamp?: string; // ISO datetime string
  latitude?: number;
  longitude?: number;
  classification_confidence?: number | null;
}

export interface ObservationFilterParams {
  // id?: string; // Removed ID filter
  species_id?: number;
  start_date?: string; // ISO datetime string
  end_date?: string; // ISO datetime string
  min_lat?: number;
  min_lon?: number;
  max_lat?: number;
  max_lon?: number;
  min_confidence?: number; // Added for filtering by minimum confidence
}

export interface ObservationListResponse {
  observations: ObservationRead[];
  total_count: number;
}

// --- HabitatArea Schemas ---
export interface HabitatAreaBase {
  method: string;
  parameters?: Record<string, any> | null;
  source_observation_count?: number | null;
}

export interface HabitatAreaRead extends HabitatAreaBase {
  id: number;
  species_id: number;
  polygon: Polygon;
  calculated_at: string; // ISO datetime string
  species: Species; // Nested species info
}

export interface HabitatAreaCalculationRequest {
  parameters: Record<string, any>;
  filters?: ObservationFilterParams;
}

// Added for habitat preview endpoint
export interface HabitatAreaPreviewResponse {
  method: string;
  parameters?: Record<string, any> | null;
  source_observation_count: number;
  polygon?: Polygon | MultiPolygon | null;
  species_id: number; // Though not directly used in GeoDataMapPage from response, good to have
  grid_points?: Array<{ lat: number; lng: number; density: number }> | null; // from types/map GridPoint
  max_density?: number | null;
}

// Added for habitat overlap endpoint
export interface HabitatOverlapResponse { // Renamed to avoid conflict if a component uses HabitatOverlap
  species1_id: number;
  species2_id: number;
  overlap_area: number;
  species1_area: number;
  species2_area: number;
  overlap_percentage: number;
  geometry?: Feature<Polygon | MultiPolygon>; // GeoJSON Feature for the overlap area
  // Potentially add intensity_data if backend provides it directly for overlap
}

// --- User Activity Schemas ---
export interface UserActivityRead {
    id: number;
    user_id: number;
    activity_type: string;
    activity_data?: Record<string, any> | null;
    ip_address?: string | null;
    user_agent?: string | null;
    created_at: string; // ISO datetime string
    user?: UserRead; // Optional: include user details if backend provides
}

// --- Admin Schemas ---
export interface AdminStatistics {
    total_users: number;
    active_users: number;
    verified_users: number;
    admin_users: number;
    total_activities: number;
    total_observations: number;
    total_species: number;
    activity_by_type: Record<string, number>;
    recent_activities: UserActivityRead[];
}

// --- User Role Schemas ---
export enum UserRole {
    ADMIN = "admin",
    USER = "user",
}

// Generic Message Response
export interface StandardResponseMessage {
  message: string;
  deleted_count?: number; 
  // Add any other common fields if they exist across various standard responses
} 