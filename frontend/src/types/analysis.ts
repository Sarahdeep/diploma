import type { Point, Polygon, MultiPolygon } from 'geojson'; // Using standard GeoJSON types

// Corresponds to Pydantic schema: schemas.AnalysisRequest
export interface AnalysisRequestParams {
  species1_id: number;
  species2_id: number;
  start_date: string; // ISO string date
  end_date: string;   // ISO string date
  time_step_days?: number;
  observation_window_days?: number;
  kde_h_meters?: number;
  kde_level_percent?: number;
  kde_grid_size?: number;
}

// Corresponds to Pydantic schema: schemas.OverlapTrendPoint
export interface OverlapTrendPointData {
  time: string; // ISO string date
  overlap_area: number;
  overlap_index: number;
}

// Corresponds to Pydantic schema: schemas.OverlapTrendResponse
export interface OverlapTrendApiResponse {
  data: OverlapTrendPointData[];
}

// Corresponds to Pydantic schema: schemas.SpeciesHabitatTimePoint
// Using GeoJSON types directly for centroid and kde_polygon
export interface SpeciesHabitatTimePointData {
  time: string; // ISO string date
  species_id: number;
  centroid: Point | null; 
  kde_polygon: Polygon | MultiPolygon | null;
  observation_count: number;
}

// Corresponds to Pydantic schema: schemas.HabitatEvolutionResponse
export interface HabitatEvolutionApiResponse {
  data: SpeciesHabitatTimePointData[];
}

// Adjusted types for AnalysisPage.tsx state and props, derived from API responses
export interface UIExtendedSpecies extends Species { // Assuming Species is already defined elsewhere, e.g. in types/map.ts
    // any additional UI-specific fields if needed
}

// For the chart in AnalysisPage.tsx
export interface UIOverlapChartDataPoint {
  time: string; // Or Date object, depending on chart library requirements
  overlapValue: number; // Corresponds to overlap_index or overlap_area as needed
}

// For map display in AnalysisPage.tsx
export interface UIMapTimeSliceData {
  time: string; // Or Date
  speciesId: number;
  centroid: [number, number] | null; // Leaflet LatLngExpression: [lat, lng]
  kdeArea: Polygon | MultiPolygon | null; 
} 