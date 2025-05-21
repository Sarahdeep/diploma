// src/utils/adapters.ts
// Преобразование данных API в GeoJSON-фичи для отображения на карте

import type { ObservationResponse, HabitatAreaResponse } from '@/types/map';
import type { ObservationFeature, HabitatAreaFeature } from '@/types/map';

/**
 * Преобразует ответ API наблюдений в массив GeoJSON-фич.
 * @param apiData - ответ API
 * @param speciesMap - мапа id->название вида
 */
export function adaptObservations(
  apiData: ObservationResponse,
  speciesMap: Record<number, string>
): ObservationFeature[] {
  return apiData.observations.map(obs => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [obs.location.coordinates[0], obs.location.coordinates[1]]
    },
    properties: {
      id: obs.id,
      species_id: obs.species_id,
      species_name: speciesMap[obs.species_id] || `Species ${obs.species_id}`,
      timestamp: obs.timestamp,
      image_url: obs.image_url,
      source: obs.source,
      classification_confidence: obs.classification_confidence,
      user_id: obs.user_id
    }
  }));
}

/**
 * Преобразует ответ API ареалов обитания в массив GeoJSON-фич.
 * @param apiData - массив ответов API
 */
export function adaptHabitats(
  apiData: HabitatAreaResponse[]
): HabitatAreaFeature[] {
  return apiData.map(habitat => ({
    type: 'Feature',
    geometry: habitat.polygon,
    properties: {
      id: habitat.id,
      species_id: habitat.species_id,
      species_name: habitat.species.name,
      method: habitat.method.toUpperCase() as 'MCP' | 'KDE',
      parameters: habitat.parameters,
      calculated_at: habitat.calculated_at,
      source_observation_count: habitat.source_observation_count,
      user_id: habitat.user_id || null
    }
  }));
}
