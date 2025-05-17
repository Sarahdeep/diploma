import { API_BASE_URL } from './apiConfig';
import type { HabitatAreaRead, HabitatAreaCalculationRequest } from '../types/api';

// Placeholder for token retrieval - reuse or centralize
const getAuthToken = (): string | null => {
  // console.warn('(habitatService) getAuthToken() is a placeholder. Implement token retrieval.');
  // return null;
  return localStorage.getItem('authToken');
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || 'An unknown error occurred');
  }
  if (response.status === 202 || response.status === 204) { // 202 for accepted, 204 for no content (e.g. delete)
    // For 202, backend sends a message. For 204, no content.
    return response.status === 202 ? response.json() : null;
  }
  return response.json();
};

export const habitatService = {
  async triggerHabitatCalculation(
    speciesId: number,
    method: string,
    requestParams: HabitatAreaCalculationRequest
  ): Promise<{ message: string }> { // Backend returns a message for accepted task
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/habitats/${speciesId}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${token}`, // Auth removed
      },
      body: JSON.stringify(requestParams),
    });
    return handleResponse(response);
  },

  async getAllHabitatAreas(
    speciesId?: number,
    method?: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<HabitatAreaRead[]> {
    // const token = getAuthToken(); // Auth removed
    let queryParams = `skip=${skip}&limit=${limit}`;
    if (speciesId !== undefined) queryParams += `&species_id=${speciesId}`;
    if (method !== undefined) queryParams += `&method=${method}`;

    const response = await fetch(`${API_BASE_URL}/habitats/?${queryParams}`, {
      // headers: { // Auth removed
      //   // 'Authorization': `Bearer ${token}`, // Uncomment if GET requires auth
      //   ...(token && { 'Authorization': `Bearer ${token}` }),
      // },
    });
    return handleResponse(response);
  },

  async getHabitatAreaById(habitatId: number): Promise<HabitatAreaRead> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/habitats/${habitatId}`, {
      // headers: { // Auth removed
      //   // 'Authorization': `Bearer ${token}`, // Uncomment if GET requires auth
      //   ...(token && { 'Authorization': `Bearer ${token}` }),
      // },
    });
    return handleResponse(response);
  },

  async deleteHabitatArea(habitatId: number): Promise<HabitatAreaRead | null> { // Backend returns deleted area
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/habitats/${habitatId}`, {
      method: 'DELETE',
      // headers: { // Auth removed
      //   'Authorization': `Bearer ${token}`,
      // },
    });
    return handleResponse(response);
  },
}; 