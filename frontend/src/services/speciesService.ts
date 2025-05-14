import { API_BASE_URL } from './apiConfig';
import type { Species, SpeciesCreate } from '../types/api';

// Placeholder for token retrieval - reuse from userService or centralize it
const getAuthToken = (): string | null => {
  // Example: return localStorage.getItem('authToken');
  console.warn('(speciesService) getAuthToken() is a placeholder. Implement token retrieval.');
  return null;
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || 'An unknown error occurred');
  }
  // For DELETE requests that might return 204 No Content or the deleted object
  if (response.status === 204) {
    return null; // Or a specific success object if your app needs it
  }
  return response.json();
};

export const speciesService = {
  async createSpecies(speciesData: SpeciesCreate): Promise<Species> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/species/`, { // Note: species endpoint in backend is /species/
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(speciesData),
    });
    return handleResponse(response);
  },

  async getAllSpecies(skip: number = 0, limit: number = 100): Promise<Species[]> {
    const token = getAuthToken(); // May or may not require token depending on your backend setup for GETs
    const response = await fetch(`${API_BASE_URL}/species/?skip=${skip}&limit=${limit}`, {
      headers: {
        // 'Authorization': `Bearer ${token}`, // Uncomment if GET requires auth
      },
    });
    return handleResponse(response);
  },

  async getSpeciesById(speciesId: number): Promise<Species> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/species/${speciesId}`, {
      headers: {
        // 'Authorization': `Bearer ${token}`, // Uncomment if GET requires auth
      },
    });
    return handleResponse(response);
  },

  async updateSpecies(speciesId: number, speciesData: SpeciesCreate): Promise<Species> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/species/${speciesId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(speciesData),
    });
    return handleResponse(response);
  },

  async deleteSpecies(speciesId: number): Promise<Species | null> { // Backend returns the deleted species
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/species/${speciesId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
}; 