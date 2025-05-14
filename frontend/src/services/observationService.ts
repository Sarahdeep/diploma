import { API_BASE_URL } from './apiConfig';
import type { ObservationRead, ObservationUpdate, ObservationFilterParams } from '../types/api';

// Placeholder for token retrieval - reuse or centralize
const getAuthToken = (): string | null => {
  console.warn('(observationService) getAuthToken() is a placeholder. Implement token retrieval.');
  return null;
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || 'An unknown error occurred');
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

export const observationService = {
  // Create observation involves FormData
  async createObservation(formData: FormData): Promise<ObservationRead> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/observations/`, {
      method: 'POST',
      headers: {
        // 'Content-Type': 'multipart/form-data' is set automatically by browser with FormData
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    return handleResponse(response);
  },

  async getAllObservations(filters?: ObservationFilterParams, skip: number = 0, limit: number = 100): Promise<ObservationRead[]> {
    const token = getAuthToken();
    let queryParams = `skip=${skip}&limit=${limit}`;
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams += `&${key}=${encodeURIComponent(String(value))}`;
        }
      });
    }

    const response = await fetch(`${API_BASE_URL}/observations/?${queryParams}`, {
      headers: {
        // 'Authorization': `Bearer ${token}`, // Uncomment if GET requires auth
      },
    });
    return handleResponse(response);
  },

  async getObservationById(observationId: number): Promise<ObservationRead> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/observations/${observationId}`, {
      headers: {
        // 'Authorization': `Bearer ${token}`, // Uncomment if GET requires auth
      },
    });
    return handleResponse(response);
  },

  async updateObservation(observationId: number, observationData: ObservationUpdate): Promise<ObservationRead> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/observations/${observationId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(observationData),
    });
    return handleResponse(response);
  },

  async deleteObservation(observationId: number): Promise<ObservationRead | null> { // Backend returns deleted observation
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/observations/${observationId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
}; 