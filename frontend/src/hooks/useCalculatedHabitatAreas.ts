// src/hooks/useCalculatedHabitats.ts
import { useState, useCallback } from 'react';
import axios from 'axios';
import type { HabitatAreaPreviewResponse, CalculatedHabitat } from '@/types/map';
import { API_BASE_URL } from '@/services/apiConfig';
import { metersToDegrees } from '@/utils/mapUtils';

interface UseCalculatedHabitatsParams {
  speciesIds: number[];
  dateRange: [string | null, string | null];
  mcpParams: { percentage: number };
  kdeParams: { h_meters: number; level_percent: number; grid_size: number };
}

/**
 * Хук для расчёта ареалов MCP/KDE
 */
export function useCalculatedHabitats({ speciesIds, dateRange, mcpParams, kdeParams }: UseCalculatedHabitatsParams) {
  const [results, setResults] = useState<CalculatedHabitat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(async (method: 'MCP' | 'KDE') => {
    if (speciesIds.length === 0) return;
    setLoading(true);
    try {
      const promises = speciesIds.map(async id => {
        const params = method === 'MCP'
          ? { percentage: mcpParams.percentage }
          : {
              h_meters: metersToDegrees(kdeParams.h_meters),
              level_percent: kdeParams.level_percent,
              grid_size: kdeParams.grid_size
            };
        const res = await axios.post<HabitatAreaPreviewResponse>(
          `${API_BASE_URL}/habitats/preview/${id}/${method.toLowerCase()}`,
          { parameters: params, filters: { start_date: dateRange[0], end_date: dateRange[1] } }
        );
        return {
          ...res.data,
          species_id: id,
          method
        } as CalculatedHabitat;
      });
      const data = await Promise.all(promises);
      setResults(data.filter(r => r.geometry));
    } catch (err: any) {
      setError(err.message || 'Error calculating habitats');
    } finally {
      setLoading(false);
    }
  }, [speciesIds, dateRange, mcpParams, kdeParams]);

  return { results, loading, error, calculate };
}