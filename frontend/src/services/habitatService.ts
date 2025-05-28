import { apiClient } from './apiClient'; // Import apiClient
import type { 
    HabitatAreaRead, 
    HabitatAreaCalculationRequest, 
    StandardResponseMessage, // For messages like trigger response
    HabitatAreaPreviewResponse, // Use the newly added type
    HabitatOverlapResponse    // Use the newly added type
} from '../types/api';

// Remove getAuthToken and handleResponse as apiClient handles these

export const habitatService = {
  async triggerHabitatCalculation(
    speciesId: number,
    method: string,
    requestParams: HabitatAreaCalculationRequest
  ): Promise<StandardResponseMessage> { // Assuming backend returns a standard message for accepted task
    const response = await apiClient.post<StandardResponseMessage>(
        `/habitats/${speciesId}/${method.toLowerCase()}`, 
        requestParams
    );
    return response.data;
  },

  async getAllHabitatAreas(
    speciesId?: number,
    method?: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<HabitatAreaRead[]> {
    const params: Record<string, string | number | boolean> = { skip, limit };
    if (speciesId !== undefined) params.species_id = speciesId;
    if (method !== undefined) params.method = method;

    const response = await apiClient.get<HabitatAreaRead[]>('/habitats/', { params });
    return response.data;
  },

  async getHabitatAreaById(habitatId: number): Promise<HabitatAreaRead> {
    const response = await apiClient.get<HabitatAreaRead>(`/habitats/${habitatId}`);
    return response.data;
  },

  async deleteHabitatArea(habitatId: number): Promise<HabitatAreaRead | null> { 
    const response = await apiClient.delete<HabitatAreaRead>(`/habitats/${habitatId}`);
    // If backend returns 204, response.data might be undefined/null.
    // If it returns the deleted object, it will be here.
    return response.data; 
  },

  // Add new methods that seem to be used in GeoDataMapPage.tsx via axiosInstance
  async getHabitatPreview(
    speciesId: number,
    method: string,
    requestBody: any // Define a more specific type if available, e.g., { parameters: object, filters?: object }
  ): Promise<HabitatAreaPreviewResponse> {
    const response = await apiClient.post<HabitatAreaPreviewResponse>(
      `/habitats/preview/${speciesId}/${method.toLowerCase()}`,
      requestBody
    );
    return response.data;
  },

  async getHabitatOverlap(
    species1Id: number,
    species2Id: number,
    requestBody: any // Define a more specific type if available, e.g., { method: string }
  ): Promise<HabitatOverlapResponse> {
    const response = await apiClient.post<HabitatOverlapResponse>(
      `/habitats/overlap/${species1Id}/${species2Id}`,
      requestBody
    );
    return response.data;
  }
}; 