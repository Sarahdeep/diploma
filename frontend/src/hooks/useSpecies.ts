// src/hooks/useSpecies.ts
import { useState, useEffect } from 'react';
// import axios from 'axios'; // No longer using direct axios
import type { Species } from '@/types/map'; // Keep using map type if hook is specific to map features
// import { API_BASE_URL } from '@/services/apiConfig'; // No longer needed
import { speciesService } from '@/services/speciesService'; // Import speciesService

/**
 * Хук для загрузки списка видов
 */
export function useSpecies() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null); // Reset error before fetching
    speciesService.getAllSpecies()
      .then(data => {
        // The service returns api.Species[], but hook state is map.Species[]
        // We already aligned the types, so direct assignment should be okay.
        setSpecies(data as Species[]); 
      })
      .catch(err => {
        const errorMessage = err.response?.data?.detail || err.message || 'Error loading species';
        setError(errorMessage);
      })
      .finally(() => setLoading(false));
  }, []);

  return { species, loading, error };
}