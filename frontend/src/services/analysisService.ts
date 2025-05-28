import { apiClient } from './apiClient'; 
import type {
    AnalysisRequestParams,
    OverlapTrendApiResponse,
    HabitatEvolutionApiResponse
} from '@/types/analysis';

const API_PREFIX = '/analysis'; // Corresponds to the backend router prefix in app/main.py

export const analysisService = {
    getOverlapTrend: async (params: AnalysisRequestParams): Promise<OverlapTrendApiResponse> => {
        try {
            const response = await apiClient.post<OverlapTrendApiResponse>(
                `${API_PREFIX}/overlap-trend`,
                params
            );
            return response.data;
        } catch (error) {
            // console.error('Error fetching overlap trend:', error); // Error logging can be handled by a global error handler or component
            throw error; // Re-throw to be caught by the calling component or a global error handler
        }
    },

    getHabitatEvolution: async (params: AnalysisRequestParams): Promise<HabitatEvolutionApiResponse> => {
        try {
            const response = await apiClient.post<HabitatEvolutionApiResponse>(
                `${API_PREFIX}/habitat-evolution`,
                params
            );
            return response.data;
        } catch (error) {
            // console.error('Error fetching habitat evolution:', error);
            throw error;
        }
    },
}; 