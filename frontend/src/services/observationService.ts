import { API_BASE_URL } from './apiConfig';
import type { ObservationRead, ObservationUpdate, ObservationFilterParams, ObservationListResponse } from '../types/api';

// Placeholder for token retrieval - reuse or centralize
const getAuthToken = (): string | null => {
  // console.warn('(observationService) getAuthToken() is a placeholder. Implement token retrieval.');
  // return null;
  return localStorage.getItem('authToken');
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
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/observations/`, {
      method: 'POST',
      // headers: { // Auth removed
      //   // 'Content-Type': 'multipart/form-data' is set automatically by browser with FormData
      //   'Authorization': `Bearer ${token}`,
      // },
      body: formData,
    });
    return handleResponse(response);
  },

  async getAllObservations(filters?: ObservationFilterParams, skip: number = 0, limit: number = 100): Promise<ObservationListResponse> {
    // const token = getAuthToken(); // Auth removed
    let queryParams = `skip=${skip}&limit=${limit}`;
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams += `&${key}=${encodeURIComponent(String(value))}`;
        }
      });
    }

    const response = await fetch(`${API_BASE_URL}/observations/?${queryParams}`, {
      // headers: { // Auth removed
      //   // 'Authorization': `Bearer ${token}`, // Uncomment if GET requires auth
      //   ...(token && { 'Authorization': `Bearer ${token}` }),
      // },
    });
    return handleResponse(response);
  },

  async getObservationById(observationId: number): Promise<ObservationRead> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/observations/${observationId}`, {
      // headers: { // Auth removed
      //   // 'Authorization': `Bearer ${token}`, // Uncomment if GET requires auth
      //   ...(token && { 'Authorization': `Bearer ${token}` }),
      // },
    });
    return handleResponse(response);
  },

  async updateObservation(observationId: number, observationData: ObservationUpdate): Promise<ObservationRead> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/observations/${observationId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${token}`, // Auth removed
      },
      body: JSON.stringify(observationData),
    });
    return handleResponse(response);
  },

  async deleteObservation(observationId: number): Promise<ObservationRead | null> { // Backend returns deleted observation
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/observations/${observationId}`, {
      method: 'DELETE',
      // headers: { // Auth removed
      //   'Authorization': `Bearer ${token}`,
      // },
    });
    return handleResponse(response);
  },

  async deleteObservationsByArea(area: object): Promise<{ message: string, deleted_count: number } | null> {
    // const token = getAuthToken(); // Auth removed for now
    const response = await fetch(`${API_BASE_URL}/observations/delete_by_area`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: JSON.stringify({ area }), // Send the area GeoJSON in the body
    });
    return handleResponse(response);
  },

  async deleteObservationsBySpecies(speciesId: number): Promise<{ message: string, deleted_count: number } | null> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/observations/by_species/${speciesId}`, {
      method: 'DELETE',
      // headers: { // Auth removed
      //   // ...(token && { 'Authorization': `Bearer ${token}` }),
      // },
    });
    return handleResponse(response);
  },

  async deleteObservationsByTimeRange(startDate: string, endDate: string): Promise<{ message: string, deleted_count: number } | null> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/observations/by_time_range?delete_op_start_date=${encodeURIComponent(startDate)}&delete_op_end_date=${encodeURIComponent(endDate)}`, {
      method: 'DELETE',
      // headers: { // Auth removed
      //   // ...(token && { 'Authorization': `Bearer ${token}` }),
      // },
    });
    return handleResponse(response);
  },
}; 