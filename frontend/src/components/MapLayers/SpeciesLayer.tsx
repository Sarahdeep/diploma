// src/components/MapLayers/SpeciesLayer.tsx
import React from 'react';
import { LayersControl, FeatureGroup } from 'react-leaflet';
import type { CalculatedHabitat, GridPoint } from '@/types/map';
import HabitatLayer from './HabitatLayer';
import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import type L from 'leaflet';

interface SpeciesLayerProps {
  speciesId: number;
  speciesName: string;
  habitats: CalculatedHabitat[]; // array with possibly MCP & KDE
  heatmapDataReady: boolean;
}

/**
 * Компонент для рендера слоёв одного вида:
 * - MCP (GeoJSON)
 * - KDE (GeoJSON)
 * - Heatmap (если ready)
 */
const SpeciesLayer: React.FC<SpeciesLayerProps> = ({ speciesId, speciesName, habitats, heatmapDataReady }) => {
  const mcpFeatures = habitats.filter(h => h.method === 'MCP');
  const kdeFeatures = habitats.filter(h => h.method === 'KDE');

  const kdeGridPoints: GridPoint[] = kdeFeatures.flatMap(h => (h.parameters.grid_points || []));
  const maxDensity = kdeFeatures.reduce((max, h) => Math.max(max, h.parameters.max_density || 0), 0);

  return (
    <LayersControl.Overlay name={speciesName} checked>
      <FeatureGroup>
        <LayersControl.Overlay name={`${speciesName} - MCP`} checked>
          <FeatureGroup>
            <HabitatLayer
              features={mcpFeatures as any}
              show={mcpFeatures.length > 0}
              style={(feature: any) => ({
                color: feature.properties.method === 'MCP' ? '#FF0000' : '#888888',
                weight: 3,
                opacity: 0.8,
                fillOpacity: 0.1
              })}
            />
          </FeatureGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay name={`${speciesName} - KDE`} checked>
          <FeatureGroup>
            <HabitatLayer
              features={kdeFeatures as any}
              show={kdeFeatures.length > 0}
              style={(feature: any) => ({
                color: feature.properties.method === 'KDE' ? '#0000FF' : '#888888',
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.2,
                dashArray: '5,5'
              })}
            />
          </FeatureGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay name={`${speciesName} - Heatmap`} checked={false}>
          <FeatureGroup>
            {heatmapDataReady && kdeGridPoints.length > 0 && (
              <HeatmapLayer
                points={kdeGridPoints.map(p => [p.lat, p.lng, p.density] as [number, number, number])}
                latitudeExtractor={m => m[0]}
                longitudeExtractor={m => m[1]}
                intensityExtractor={m => m[2]}
                radius={25}
                blur={15}
                maxZoom={10}
                max={maxDensity}
                gradient={{ 0.4: 'blue', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' }}
              />
            )}
          </FeatureGroup>
        </LayersControl.Overlay>
      </FeatureGroup>
    </LayersControl.Overlay>
  );
};

export default SpeciesLayer;
