// src/components/common/PopupFormatter.ts

import type { ObservationFeature, HabitatAreaFeature } from '@/types/map';

/**
 * Форматирует HTML-содержимое для попапа Observation
 */
export function formatObservationPopup(feature: ObservationFeature): string {
  const props = feature.properties;
  return `
    <div style="max-width: 300px;">
      <strong>Observation ${props.id}</strong><br/>
      Species: ${props.species_name || 'N/A'} (ID: ${props.species_id})<br/>
      Date: ${new Date(props.timestamp).toLocaleString()}<br/>
      Source: ${props.source || 'N/A'}<br/>
      ${props.image_url ?
        `<div style="margin-top:10px;"><img src="${props.image_url}" alt="Observation ${props.id}" "` +
        `style="width:100%;height:auto;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.1)"/></div>`
        : ''
      }
    </div>
  `;
}

/**
 * Форматирует HTML-содержимое для попапа HabitatArea
 */
export function formatHabitatPopup(feature: HabitatAreaFeature): string {
  const props = feature.properties;
  const areaKm2 = ((window as any).turf.area(feature) / 1_000_000).toFixed(2);
  return `
    <div style="max-width: 300px;">
      <strong>${props.species_name || 'Habitat Area'} (${props.method})</strong><br/>
      Species ID: ${props.species_id}<br/>
      Method: ${props.method}<br/>
      Area: ${areaKm2} км²<br/>
      Calculated: ${new Date(props.calculated_at).toLocaleString()}<br/>
      Parameters: ${JSON.stringify(props.parameters)}<br/>
      ${props.source_observation_count ? `Source Points: ${props.source_observation_count}<br/>` : ''}
    </div>
  `;
}
