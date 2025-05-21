// src/components/MapLayers/ObservationsLayer.tsx
import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import type { ObservationFeature } from '@/types/map';
import { formatObservationPopup } from '@/components/common/PopupFormatter';

interface ObservationsLayerProps {
  observations: ObservationFeature[];
  show: boolean;
}

/**
 * Отображает слой наблюдений с кластеризацией
 */
const ObservationsLayer: React.FC<ObservationsLayerProps> = ({ observations, show }) => {
  if (!show || observations.length === 0) return null;

  return (
    <MarkerClusterGroup>
      {observations.map(obs => (
        <Marker
          key={`obs-${obs.properties.id}`}
          position={[obs.geometry.coordinates[1], obs.geometry.coordinates[0]]}
        >
          <Popup>
            <div dangerouslySetInnerHTML={{ __html: formatObservationPopup(obs) }} />
          </Popup>
        </Marker>
      ))}
    </MarkerClusterGroup>
  );
};

export default ObservationsLayer;
