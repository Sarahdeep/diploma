// src/types/map.ts
import { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson';
import L from 'leaflet';

/** Вид (Species) */
export interface Species {
  id: number;
  name: string;
  description?: string;
}

/** Точка сетки для KDE/перекрытий */
export interface GridPoint {
  lat: number;
  lng: number;
  density: number;
}

/** Точка на тепловой карте */
export interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
}

/** Ответ API наблюдений */
export interface ObservationResponse {
  observations: Array<{
    id: number;
    species_id: number;
    location: {
      type: 'Point';
      coordinates: [number, number]; // [longitude, latitude]
    };
    timestamp: string;
    image_url?: string;
    source?: string;
    classification_confidence?: number;
    user_id?: number;
  }>;
  total_count: number;
}

/** GeoJSON-фича наблюдения */
export interface ObservationFeature extends Feature<Point> {
  properties: {
    id: number;
    species_id: number;
    species_name?: string;
    timestamp: string;
    image_url?: string;
    source?: string;
    classification_confidence?: number;
    user_id?: number;
  };
}

/** Ответ API сохранённых ареалов обитания */
export interface HabitatAreaResponse {
  id: number;
  species_id: number;
  polygon: Polygon | MultiPolygon;
  method: string;
  parameters: Record<string, any>;
  calculated_at: string;
  source_observation_count: number;
  species: {
    id: number;
    name: string;
  };
  user_id?: number | null;
}

/** GeoJSON-фича ареала обитания */
export interface HabitatAreaFeature extends Feature<Polygon | MultiPolygon> {
  properties: {
    id: number;
    species_id: number;
    species_name?: string;
    method: 'MCP' | 'KDE';
    parameters: Record<string, any>;
    calculated_at: string;
    source_observation_count?: number;
    user_id?: number | null;
  };
}

/** Объект предварительного расчёта ареала */
export interface HabitatAreaPreviewResponse {
  method: string;
  parameters?: Record<string, any> | null;
  source_observation_count: number;
  polygon?: Polygon | MultiPolygon | null;
  species_id: number;
  grid_points?: GridPoint[] | null;
  max_density?: number | null;
}

/** Параметры запроса предварительного расчёта */
export interface HabitatAreaPreviewParams {
  percentage?: number;
  h_meters?: number;
  level_percent?: number;
}

// Update the OverlapResult interface to include intensity information
export interface OverlapResult {
    overlap_area: number;
    species1_area: number;
    species2_area: number;
    overlap_percentage: number;
    geometry: Feature<Polygon | MultiPolygon>;
    intensity_data?: {
      points: Array<{
        lat: number;
        lng: number;
        intensity: number;
      }>;
      max_intensity: number;
    };
  }
/** Рассчитанный ареал для фронтенда */
export interface CalculatedHabitat {
  id: number;
  species_id: number;
  species_name: string;
  method: 'MCP' | 'KDE';
  geometry: Feature<Polygon | MultiPolygon>;
  parameters: Record<string, any>;
  calculated_at: string;
  source_observation_count: number;
}

/** Оверлап ареалов */
export interface HabitatOverlap {
  species1_id: number;
  species2_id: number;
  overlap_area: number;
  species1_area: number;
  species2_area: number;
  overlap_percentage: number;
  geometry: Feature<Polygon | MultiPolygon>;
}

export type MapFeature = ObservationFeature | HabitatAreaFeature;

export interface HabitatArea {
    id: number;
    species_id: number;
    species_name: string;
    method: 'MCP' | 'KDE';
    geometry: Feature<Polygon | MultiPolygon>;
    parameters: Record<string, any>;
    calculated_at: string;
    source_observation_count: number;
  }

export interface LayerVisibility {
  [speciesId: number]: {
    mcp: boolean;
    kde: boolean;
    heatmap: boolean;
  };
}

export interface ObservationCache {
  bounds: L.LatLngBounds;
  observations: ObservationFeature[];
}

export interface SpeciesSelectorProps {
  speciesList: Species[];
  selectedSpeciesIds: number[];
  onSpeciesChange: (selectedIds: number[]) => void;
  isLoading: boolean;
}

export interface DateRangeSelectorProps {
  onDateChange: (dates: any, dateStrings: [string, string]) => void;
}

export interface HabitatPreviewControlProps {
  selectedSpeciesIds: number[];
  mcpInputParams: { percentage: number };
  kdeInputParams: { h_meters: number; level_percent: number; grid_size: number };
  onMcpParamsChange: (params: { percentage: number }) => void;
  onKdeParamsChange: (params: { h_meters: number; level_percent: number; grid_size: number }) => void;
  onCalculateRequest: (method: 'MCP' | 'KDE') => Promise<void>;
  isLoadingCalculate: boolean;
  calculatedHabitat: HabitatAreaFeature | null;
  onSaveHabitat: () => void;
  isLoadingHabitats: boolean;
  calculatedKDE: HabitatAreaFeature | null;
  calculatedMCP: HabitatAreaFeature | null;
}

