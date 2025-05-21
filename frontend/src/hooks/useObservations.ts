// src/hooks/useObservations.ts
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { ObservationFeature, ObservationResponse } from '@/types/map';
import { adaptObservations } from '@/utils/adapters';
import { API_BASE_URL } from '@/services/apiConfig';
import type { LatLngBounds } from 'leaflet';

interface UseObservationsParams {
  speciesIds: number[];
  dateRange: [string | null, string | null];
  bounds: LatLngBounds | null;
  forceRefresh?: boolean;
}

/**
 * Хук для загрузки наблюдений по видам и области карты
 */
export function useObservations({ speciesIds, dateRange, bounds, forceRefresh }: UseObservationsParams) {
  const [observations, setObservations] = useState<ObservationFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!bounds || speciesIds.length === 0) {
      setObservations([]);
      return;
    }
    setLoading(true);
    try {
      const res = await Promise.all(
        speciesIds.map(id => {
          const params = new URLSearchParams();
          params.append('species_id', id.toString());
          if (dateRange[0]) params.append('start_date', dateRange[0]!);
          if (dateRange[1]) params.append('end_date', dateRange[1]!);
          params.append('min_lon', bounds.getWest().toString());
          params.append('min_lat', bounds.getSouth().toString());
          params.append('max_lon', bounds.getEast().toString());
          params.append('max_lat', bounds.getNorth().toString());
          return axios.get<ObservationResponse>(
            `${API_BASE_URL}/observations/`, { params }
          );
        })
      );
      const allData = res.flatMap(r => adaptObservations(r.data, {})); // TODO: передавать speciesMap
      setObservations(allData);
    } catch (err: any) {
      setError(err.message || 'Error loading observations');
    } finally {
      setLoading(false);
    }
  }, [speciesIds, dateRange, bounds, forceRefresh]);

  useEffect(() => { fetch(); }, [fetch]);

  return { observations, loading, error, refresh: fetch };
}
