import { apiClient } from './apiClient';
import type { User, UserCreate, UserUpdate, Token, UserRead } from '../types/api';

// Define a type for the public author info we need
export interface AuthorInfo {
  id: number;
  username: string;
  avatar_url?: string | null;
  // Add other fields from PublicUserProfile if needed by ObservationCard in the future
}

const userCache = new Map<number, UserRead>();
const publicAuthorCache = new Map<number, AuthorInfo>(); // Cache for public author info

export const userService = {
  async register(userData: UserCreate): Promise<UserRead> {
    const response = await apiClient.post<UserRead>('/auth/register', userData);
    return response.data;
  },

  async login(loginData: FormData): Promise<Token> {
    const response = await apiClient.post<Token>('/auth/login', loginData, {
    });
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
    }
    return response.data;
  },

  async getCurrentUser(): Promise<UserRead> {
    const response = await apiClient.get<UserRead>('/users/me');
    return response.data;
  },

  async getUsers(): Promise<UserRead[]> {
    const response = await apiClient.get<UserRead[]>('/admin/users/');
    return response.data;
  },

  async getUserById(userId: number): Promise<UserRead> {
    if (userCache.has(userId)) {
      return Promise.resolve(userCache.get(userId)!);
    }
    const response = await apiClient.get<UserRead>(`/admin/users/${userId}`);
    userCache.set(userId, response.data);
    return response.data;
  },

  async getPublicAuthorInfo(userId: number): Promise<AuthorInfo> {
    if (publicAuthorCache.has(userId)) {
      return Promise.resolve(publicAuthorCache.get(userId)!);
    }
    const response = await apiClient.get<AuthorInfo>(`/users/${userId}/profile`);
    const authorData: AuthorInfo = {
      id: response.data.id,
      username: response.data.username,
      avatar_url: response.data.avatar_url
    };
    publicAuthorCache.set(userId, authorData);
    return authorData;
  },

  async updateUser(userId: number, userData: UserUpdate): Promise<UserRead> {
    const response = await apiClient.put<UserRead>(`/admin/users/${userId}`, userData);
    return response.data;
  },

  async deleteUser(userId: number): Promise<void> {
    await apiClient.delete(`/admin/users/${userId}`);
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
    localStorage.removeItem('access_token');
  }
}; 