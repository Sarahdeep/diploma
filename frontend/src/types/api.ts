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
  password: string;
  is_active?: boolean;
  is_admin?: boolean;
}

export interface UserUpdate {
  email?: string;
  password?: string;
  is_active?: boolean;
  is_admin?: boolean;
}

// --- Auth Schemas ---
export interface Token {
  access_token: string;
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
  species_id?: number;
  start_date?: string; // ISO datetime string
  end_date?: string; // ISO datetime string
  min_lat?: number;
  min_lon?: number;
  max_lat?: number;
  max_lon?: number;
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