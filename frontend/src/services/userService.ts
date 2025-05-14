import { API_BASE_URL } from './apiConfig';
import type { User, UserCreate, UserUpdate, Token } from '../types/api';

// Placeholder for where you might get your auth token from
// You'll need to implement this based on your auth flow (e.g., localStorage, context, state manager)
const getAuthToken = (): string | null => {
  // Example: return localStorage.getItem('authToken');
  console.warn('getAuthToken() is a placeholder. Implement token retrieval.');
  return null; // Or a dummy token for early testing if backend allows
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(errorData.detail || 'An unknown error occurred');
  }
  return response.json();
};

export const userService = {
  async register(userData: UserCreate): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  async login(loginData: FormData): Promise<Token> { // FastAPI OAuth2PasswordRequestForm expects form data
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      body: loginData, // Directly pass FormData
    });
    return handleResponse(response);
  },

  // Admin routes - these will likely require an auth token
  async getUsers(): Promise<User[]> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/auth/users`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async getUserById(userId: number): Promise<User> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },

  async updateUser(userId: number, userData: UserUpdate): Promise<User> {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  async deleteUser(userId: number): Promise<User> { // Backend returns the deleted user
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(response);
  },
}; 