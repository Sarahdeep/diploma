import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Uses VITE_API_BASE_URL from .env files (e.g., .env.development, .env.production)
// Falls back to localhost:8000/api/v1 if not set, common for local development.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // headers: {
  //   'Content-Type': 'application/json',
  // },
});

// Optional: Add a request interceptor to include the token if available
apiClient.interceptors.request.use(
  (config) => {
    // Assuming you store your token in localStorage
    const token = localStorage.getItem('access_token'); 
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling global errors or token refresh logic
apiClient.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      originalRequest.url !== '/auth/refresh' && 
      originalRequest.url !== '/auth/login'
    ) {
      originalRequest._retry = true;
      try {
        // The /auth/refresh endpoint now uses HttpOnly cookie automatically sent by browser.
        // It expects an empty body or specific body if your backend requires it (ours is empty now).
        const refreshResponse = await apiClient.post('/auth/refresh', {}); 
        const { access_token } = refreshResponse.data; // Only access_token is expected in response body
        
        localStorage.setItem('access_token', access_token); // Store new access token
        
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed in apiClient interceptor:', refreshError);
        localStorage.removeItem('access_token'); // Clear stale access token
        
        // Redirecting to login will trigger AuthContext to clear user state.
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Standardized API error handling.
 * This function processes an error (typically from an Axios catch block)
 * and returns a more structured error object or throws it for the caller to handle.
 */
interface ApiErrorDetail {
  loc?: (string | number)[];
  msg: string;
  type?: string;
}

interface ApiErrorResponse {
  detail?: string | ApiErrorDetail[];
}

export interface HandledApiError {
  message: string;
  status?: number;
  data?: any; // Original error data for more specific handling if needed
  isValidationError?: boolean;
  validationErrors?: Record<string, string>; // Field-specific errors
}

export const handleApiError = (error: any, defaultMessage: string = 'An unexpected error occurred'): HandledApiError => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorResponse>;
    const responseData = axiosError.response?.data;
    let message = defaultMessage;
    let isValidationError = false;
    const validationErrors: Record<string, string> = {};

    if (responseData) {
      if (typeof responseData.detail === 'string') {
        message = responseData.detail;
      } else if (Array.isArray(responseData.detail)) {
        // Handle FastAPI validation errors (HTTP 422)
        isValidationError = true;
        message = 'Validation Error. Please check the fields below.'; // General message
        responseData.detail.forEach((err: ApiErrorDetail) => {
          if (err.loc && err.loc.length > 1) {
            const fieldName = err.loc[err.loc.length - 1].toString();
            validationErrors[fieldName] = err.msg;
          } else {
            // Non-field specific validation error, or malformed error
            message = err.msg; // Fallback to the first error message
          }
        });
        if (Object.keys(validationErrors).length === 0 && Array.isArray(responseData.detail) && responseData.detail.length > 0) {
             message = responseData.detail[0].msg; // Fallback if no field names extracted but detail array exists
        }
      } else if (axiosError.message) {
        message = axiosError.message;
      }
    }

    return {
      message,
      status: axiosError.response?.status,
      data: responseData,
      isValidationError,
      validationErrors: isValidationError ? validationErrors : undefined,
    };
  }
  // Fallback for non-Axios errors
  return {
    message: error.message || defaultMessage,
  };
};

export { apiClient }; 