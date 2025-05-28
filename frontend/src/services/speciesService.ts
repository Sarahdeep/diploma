import { apiClient } from './apiClient'; // Import apiClient
import type { Species, SpeciesCreate } from '../types/api';

// Remove getAuthToken and handleResponse, as apiClient handles these.

export const speciesService = {
  async createSpecies(speciesData: SpeciesCreate): Promise<Species> {
    const response = await apiClient.post<Species>('/species/', speciesData);
    return response.data;
  },

  async getAllSpecies(skip: number = 0, limit: number = 100): Promise<Species[]> {
    const params = { skip, limit };
    const response = await apiClient.get<Species[]>('/species/', { params });
    return response.data;
  },

  async getSpeciesById(speciesId: number): Promise<Species> {
    const response = await apiClient.get<Species>(`/species/${speciesId}`);
    return response.data;
  },

  async updateSpecies(speciesId: number, speciesData: SpeciesCreate): Promise<Species> {
    const response = await apiClient.put<Species>(`/species/${speciesId}`, speciesData);
    return response.data;
  },

  async deleteSpecies(speciesId: number): Promise<Species | null> { 
    const response = await apiClient.delete<Species>(`/species/${speciesId}`);
    // If backend returns 204, response.data might be undefined/null.
    // If backend returns the deleted object (as implied by original Promise<Species | null>), it will be here.
    return response.data; 
  },
}; 