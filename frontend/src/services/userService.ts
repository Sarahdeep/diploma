import { API_BASE_URL } from './apiConfig';
import type { User, UserCreate, UserUpdate, Token } from '../types/api';

// Placeholder for where you might get your auth token from
// You'll need to implement this based on your auth flow (e.g., localStorage, context, state manager)
const getAuthToken = (): string | null => {
  // Example: return localStorage.getItem('authToken');
  // console.warn('getAuthToken() is a placeholder. Implement token retrieval.');
  // return null; // Or a dummy token for early testing if backend allows
  return localStorage.getItem('authToken');
};

// Helper function to process API responses (assuming it's defined elsewhere or you'll add it)
async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'An unexpected error occurred');
  }
  return response.json();
}

export const userService = {
  async register(userData: UserCreate): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header needed for register
      },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  async login(loginData: FormData): Promise<Token> { // FastAPI OAuth2PasswordRequestForm expects form data
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      body: loginData, // Directly pass FormData
      // No Authorization header needed for login
    });
    // return handleResponse(response);
    const tokenData: Token = await handleResponse(response);
    if (tokenData.access_token) {
      localStorage.setItem('authToken', tokenData.access_token);
    }
    return tokenData;
  },

  // Admin routes - these will likely require an auth token
  async getUsers(): Promise<User[]> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/auth/users`, {
      // headers: { // Auth removed
      //   'Authorization': `Bearer ${token}`,
      // },
    });
    return handleResponse(response);
  },

  async getUserById(userId: number): Promise<User> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
      // headers: { // Auth removed
      //   'Authorization': `Bearer ${token}`,
      // },
    });
    return handleResponse(response);
  },

  async updateUser(userId: number, userData: UserUpdate): Promise<User> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${token}`, // Auth removed
      },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  async deleteUser(userId: number): Promise<void> {
    // const token = getAuthToken(); // Auth removed
    const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
      method: 'DELETE',
      // headers: { // Auth removed
      //   'Authorization': `Bearer ${token}`,
      // },
    });
    // return handleResponse(response);
  },
}; 