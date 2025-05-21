// src/hooks/useSpecies.ts
import { useState, useEffect } from 'react';
import axios from 'axios';
import type { Species } from '@/types/map';
import { API_BASE_URL } from '@/services/apiConfig';

/**
 * Хук для загрузки списка видов
 */
export function useSpecies() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios.get<Species[]>(`${API_BASE_URL}/species/`)
      .then(res => setSpecies(res.data))
      .catch(err => setError(err.message || 'Error loading species'))
      .finally(() => setLoading(false));
  }, []);

  return { species, loading, error };
}