// src/hooks/useHabitatAreas.ts
import { useState, useEffect } from 'react';
import axios from 'axios';
import type { HabitatAreaFeature, HabitatAreaResponse } from '@/types/map';
import { adaptHabitats } from '@/utils/adapters';
import { API_BASE_URL } from '@/services/apiConfig';

export function useHabitatAreas(speciesIds: number[]) {
  const [habitats, setHabitats] = useState<HabitatAreaFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (speciesIds.length === 0) {
      setHabitats([]);
      return;
    }
    setLoading(true);

    Promise.all(
      speciesIds.map(id =>
        axios.get<HabitatAreaResponse[]>(
          `${API_BASE_URL}/habitats/?species_id=${id}&limit=100`
        )
      )
    )
      .then(resArr => {
        const all = resArr.flatMap(r => adaptHabitats(r.data));
        setHabitats(all);
      })
      .catch(err => setError(err.message || 'Error loading habitats'))
      .finally(() => setLoading(false));
  }, [speciesIds]);

  return { habitats, loading, error };
}

