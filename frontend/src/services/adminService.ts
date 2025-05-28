import type { UserRead, UserActivityRead, AdminStatistics, UserUpdate, UserCreate } from '@/types/api';
import { apiClient, handleApiError } from './apiClient'; // Assuming you have an apiClient setup

// Define params types for list functions if they accept query params
interface GetUsersParams {
  skip?: number;
  limit?: number;
  search?: string;
  role?: string;
  is_active?: boolean;
  is_verified?: boolean;
}

interface GetUserActivitiesParams {
  skip?: number;
  limit?: number;
  activity_type?: string;
  start_date?: string; // ISO string
  end_date?: string;   // ISO string
}

export const adminService = {
  async getUsers(params?: GetUsersParams): Promise<UserRead[]> {
    try {
      const response = await apiClient.get(`/admin/users`, { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to fetch users');
    }
  },

  async getUserById(userId: number): Promise<UserRead> {
    try {
      const response = await apiClient.get(`/admin/users/${userId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to fetch user');
    }
  },

  async updateUser(userId: number, userData: UserUpdate): Promise<UserRead> {
    try {
      const response = await apiClient.put(`/admin/users/${userId}`, userData);
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to update user');
    }
  },

  async deleteUser(userId: number): Promise<{ message: string }> {
    try {
      const response = await apiClient.delete(`/admin/users/${userId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to delete user');
    }
  },

  async activateUser(userId: number): Promise<{ message: string }> {
    try {
      const response = await apiClient.post(`/admin/users/${userId}/activate`);
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to activate user');
    }
  },

  async deactivateUser(userId: number): Promise<{ message: string }> {
    try {
      const response = await apiClient.post(`/admin/users/${userId}/deactivate`);
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to deactivate user');
    }
  },

  async getUserActivities(userId: number, params?: GetUserActivitiesParams): Promise<UserActivityRead[]> {
    try {
      const response = await apiClient.get(`/admin/users/${userId}/activities`, { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to fetch user activities');
    }
  },
  
  // If you need a function to get ALL activities for the admin panel (not tied to a specific user)
  // you would need a separate backend endpoint or adjust an existing one.
  // For now, assuming this would be part of a more general activity log if needed.
  // async getAllSystemActivities(params?: GetUserActivitiesParams): Promise<UserActivityRead[]> { ... }

  async getStatistics(): Promise<AdminStatistics> {
    try {
      const response = await apiClient.get(`/admin/statistics`);
      return response.data;
    } catch (error) {
      throw handleApiError(error, 'Failed to fetch admin statistics');
    }
  },

  // You might not need createUser from admin panel if registration is public
  // but if admins can create users directly:
  // async createUser(userData: UserCreate): Promise<UserRead> {
  //   try {
  //     const response = await apiClient.post(`${API_PREFIX}/admin/users`, userData); // Assuming such endpoint
  //     return response.data;
  //   } catch (error) {
  //     throw handleApiError(error, 'Failed to create user by admin');
  //   }
  // },
};

// Note: apiClient and handleApiError would typically be in a shared file like 'apiClient.ts'
// Example apiClient.ts structure:
/*
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token'); // Or get from AuthContext
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const handleApiError = (error: any, defaultMessage: string) => {
  if (axios.isAxiosError(error) && error.response) {
    return {
      message: error.response.data.detail || defaultMessage,
      status: error.response.status,
      data: error.response.data,
    };
  } else {
    return {
      message: defaultMessage,
      status: 500,
      data: null,
    };
  }
  // Or simply: throw error; to let the caller handle it with toast
};
*/ 