import { apiClient } from './apiClient'; // Import apiClient
import type { ObservationRead, ObservationUpdate, ObservationFilterParams, ObservationListResponse, StandardResponseMessage } from '../types/api';

export const observationService = {
  // Create observation involves FormData
  async createObservation(formData: FormData): Promise<ObservationRead[]> {
    // apiClient's interceptor will handle Authorization header.
    // Content-Type for FormData is typically set by the browser/axios automatically.
    const response = await apiClient.post<ObservationRead[]>('/observations/', formData, {
      headers: {
        // Overriding Content-Type can be problematic with FormData; let axios handle it.
        // 'Content-Type': 'multipart/form-data', // Let axios set this
      }
    });
    return response.data;
  },

  async getAllObservations(filters?: ObservationFilterParams, skip: number = 0, limit: number = 100): Promise<ObservationListResponse> {
    const params: Record<string, string | number | boolean> = { skip, limit };

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          // Ensure all potential value types from ObservationFilterParams are converted to string for URLSearchParams
          params[key] = String(value);
        }
      }
    }
    // apiClient's interceptor will handle Authorization header.
    const response = await apiClient.get<ObservationListResponse>('/observations/', { params });
    return response.data;
  },

  async getUserObservations(skip: number = 0, limit: number = 100): Promise<ObservationListResponse> {
    const params: Record<string, string | number> = { skip, limit };
    // apiClient's interceptor will handle Authorization header for /me routes
    const response = await apiClient.get<ObservationListResponse>('/users/me/observations', { params });
    return response.data;
  },

  async getObservationById(observationId: number): Promise<ObservationRead> {
    // apiClient's interceptor will handle Authorization header.
    const response = await apiClient.get<ObservationRead>(`/observations/${observationId}`);
    return response.data;
  },

  async updateObservation(observationId: number, observationData: ObservationUpdate): Promise<ObservationRead> {
    // apiClient's interceptor will handle Authorization header.
    const response = await apiClient.put<ObservationRead>(`/observations/${observationId}`, observationData);
    return response.data;
  },

  async deleteObservation(observationId: number): Promise<ObservationRead | null> {
    // apiClient's interceptor will handle Authorization header.
    const response = await apiClient.delete<ObservationRead>(`/observations/${observationId}`);
    // For 204 No Content, axios might return undefined or null in response.data.
    // Depending on backend, it might return the deleted object or nothing.
    // The original code expected null for 204.
    return response.data; // Assuming backend returns the deleted object or axios handles 204 appropriately
  },

  async deleteObservationsByArea(area: object): Promise<StandardResponseMessage> {
    // apiClient's interceptor will handle Authorization header.
    const response = await apiClient.post<StandardResponseMessage>('/observations/delete_by_area', { area });
    return response.data;
  },

  async deleteObservationsBySpecies(speciesId: number): Promise<StandardResponseMessage> {
    // apiClient's interceptor will handle Authorization header.
    const response = await apiClient.delete<StandardResponseMessage>(`/observations/by_species/${speciesId}`);
    return response.data;
  },

  async deleteObservationsByTimeRange(startDate: string, endDate: string): Promise<StandardResponseMessage> {
    // apiClient's interceptor will handle Authorization header.
    const params = {
      delete_op_start_date: startDate,
      delete_op_end_date: endDate,
    };
    const response = await apiClient.delete<StandardResponseMessage>('/observations/by_time_range', { params });
    return response.data;
  },
}; 