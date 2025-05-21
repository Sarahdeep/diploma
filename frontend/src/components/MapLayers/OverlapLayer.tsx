// src/components/MapLayers/OverlapLayer.tsx
import React from 'react';
import { LayersControl, FeatureGroup, GeoJSON } from 'react-leaflet';
import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { Spin } from 'antd';
import type { CalculatedHabitat, OverlapResult } from '@/types/map';
import type L from 'leaflet';

interface OverlapItem {
  species1: CalculatedHabitat;
  species2: CalculatedHabitat;
  overlap: OverlapResult;
}

interface OverlapLayerProps {
  items: OverlapItem[];
  loading: boolean;
  progress: number;
}

/**
 * Слой пересечений ареалов с отображением полигонов и тепловой карты интенсивности
 */
const OverlapLayer: React.FC<OverlapLayerProps> = ({ items, loading, progress }) => {
  return (
    <LayersControl.Overlay name="Пересечения" checked>
      <FeatureGroup>
        {items.map((item, idx) => (
          <React.Fragment key={`overlap-${idx}`}>            
            <GeoJSON
              data={item.overlap.geometry as any}
              style={() => ({
                color: '#FF4500',
                weight: 2,
                opacity: 0.7,
                fillColor: '#FF4500',
                fillOpacity: 0.3
              })}
              onEachFeature={(feature, layer) => {
                const { species1, species2, overlap } = item;
                layer.bindPopup(
                  `<div>
                    <strong>Пересечение ареалов</strong><br/>
                    ${species1.species_name} &amp; ${species2.species_name}<br/>
                    Площадь: ${overlap.overlap_area.toFixed(2)} км²<br/>
                    Процент: ${overlap.overlap_percentage.toFixed(2)}%<br/>
                  </div>`
                );
              }}
            />
            {/* Heatmap intensity if data available */}
            {item.overlap.intensity_data && item.overlap.intensity_data.points.length > 0 && !loading && (
              <HeatmapLayer
                points={item.overlap.intensity_data.points.map(p => [p.lat, p.lng, p.intensity] as [number, number, number])}
                latitudeExtractor={m => m[0]}
                longitudeExtractor={m => m[1]}
                intensityExtractor={m => m[2]}
                radius={25}
                blur={15}
                maxZoom={10}
                max={item.overlap.intensity_data.max_intensity}
                gradient={{ 0.4: 'blue', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' }}
              />
            )}
          </React.Fragment>
        ))}
        {/* Spinner overlay during calculation */}
        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5000 }}>
            <Spin tip={`Расчет интенсивности: ${Math.round(progress)}%`} />
          </div>
        )}
      </FeatureGroup>
    </LayersControl.Overlay>
  );
};

export default OverlapLayer;
