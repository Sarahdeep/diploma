// src/components/MapLayers/HabitatLayer.tsx
import React from 'react';
import { GeoJSON } from 'react-leaflet';
import type { HabitatAreaFeature } from '@/types/map';
import { formatHabitatPopup } from '@/components/common/PopupFormatter';
import type L from 'leaflet';

interface HabitatLayerProps {
  features: HabitatAreaFeature[];
  show: boolean;
  style?: L.PathOptions | ((feature: any) => L.PathOptions);
}

/**
 * Универсальный компонент для отображения GeoJSON-ареалов обитания (MCP/KDE)
 */
const HabitatLayer: React.FC<HabitatLayerProps> = ({ features, show, style }) => {
  if (!show || features.length === 0) return null;

  const featureCollection = React.useMemo(
    () => ({ type: 'FeatureCollection', features }),
    [features]
  );

  const handleEach = (feature: any, layer: L.Layer) => {
    // @ts-ignore
    const html = formatHabitatPopup(feature as HabitatAreaFeature);
    layer.bindPopup(html);
  };

  return (
    <GeoJSON
      data={featureCollection as any}
      style={style}
      onEachFeature={handleEach}
    />
  );
};

export default HabitatLayer;
