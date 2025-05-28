import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient, handleApiError, HandledApiError } from '../services/apiClient';
import { User } from '../types/user'; // Assuming you have a User type

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: HandledApiError | null;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (userData: any) => Promise<void>; // Define a more specific type later
  refreshAuthToken: () => Promise<string | null>; // Renamed for clarity
  verifyEmail: (token: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPass: string) => Promise<void>;
  updateUserProfile: (formData: FormData) => Promise<void>; // Added for profile updates
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start with loading true to check initial auth state
  const [error, setError] = useState<HandledApiError | null>(null);

  const clearError = () => setError(null);

  // Effect to load token and user from localStorage on initial mount
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      const storedAccessToken = localStorage.getItem('access_token');

      if (storedAccessToken) {
        setAccessToken(storedAccessToken);
        try {
          const response = await apiClient.get('/users/me');
          setUser(response.data as User);
        } catch (e) {
          console.error("Failed to fetch user on init with existing access token:", e);
          await refreshAuthToken();
        }
      }
      setIsLoading(false);
    };
    initializeAuth();
  }, []);

  const updateStateAndStorage = (access: string | null, usr: User | null) => {
    setAccessToken(access);
    setUser(usr);

    if (access) localStorage.setItem('access_token', access);
    else localStorage.removeItem('access_token');
  };

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.post('/auth/login', { username: email, password: pass }, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        transformRequest: (data) => {
            const formData = new URLSearchParams();
            for (const key in data) {
                formData.append(key, data[key]);
            }
            return formData.toString();
        }
      });
      const { access_token } = response.data;
      const userResponse = await apiClient.get('/users/me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      updateStateAndStorage(access_token, userResponse.data as User);
    } catch (err: any) {
      const handledError = handleApiError(err, 'Login failed');
      setError(handledError);
      updateStateAndStorage(null, null);
      throw handledError;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: any) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.post('/auth/register', userData);
    } catch (err: any) {
      const handledError = handleApiError(err, 'Registration failed');
      setError(handledError);
      throw handledError;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.post('/auth/logout');
    } catch (err: any) {
      console.error("Logout API call failed:", handleApiError(err));
    } finally {
      updateStateAndStorage(null, null);
      setIsLoading(false);
    }
  };

  const refreshAuthToken = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/auth/refresh', {});
      const { access_token } = response.data;
      
      const userResponse = await apiClient.get('/users/me', {
          headers: { Authorization: `Bearer ${access_token}` }
      });
      updateStateAndStorage(access_token, userResponse.data as User);
      setIsLoading(false);
      return access_token;
    } catch (err: any) {
      console.error("Token refresh failed in AuthContext:", handleApiError(err));
      await logout();
      setIsLoading(false);
      return null;
    }
  };
  
  const verifyEmail = async (token: string) => {
    setIsLoading(true);
    setError(null);
    try {
        await apiClient.post('/auth/verify-email', { token });
    } catch (err:any) {
        const handledError = handleApiError(err, 'Email verification failed');
        setError(handledError);
        throw handledError;
    } finally {
        setIsLoading(false);
    }
  };

  const forgotPassword = async (email: string) => {
    setIsLoading(true);
    setError(null);
    try {
        await apiClient.post('/auth/forgot-password', { email }, {
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (err:any) {
        const handledError = handleApiError(err, 'Forgot password request failed');
        setError(handledError);
        throw handledError;
    } finally {
        setIsLoading(false);
    }
  };

  const resetPassword = async (token: string, newPass: string) => {
    setIsLoading(true);
    setError(null);
    try {
        await apiClient.post('/auth/reset-password', { token, new_password: newPass });
    } catch (err:any) {
        const handledError = handleApiError(err, 'Password reset failed');
        setError(handledError);
        throw handledError;
    } finally {
        setIsLoading(false);
    }
  };

  const updateUserProfile = async (formData: FormData) => {
    setIsLoading(true);
    setError(null);
    try {
      // apiClient should be configured to send FormData correctly
      const response = await apiClient.patch('/users/me', formData, {
        headers: {
          // 'Content-Type': 'multipart/form-data', // Axios might set this automatically with FormData
        },
      });
      setUser(response.data as User); // Update user state with new data
    } catch (err: any) {
      const handledError = handleApiError(err, 'Profile update failed');
      setError(handledError);
      throw handledError;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!accessToken && !!user,
        isLoading,
        error,
        login,
        logout,
        register,
        refreshAuthToken,
        verifyEmail,
        forgotPassword,
        resetPassword,
        updateUserProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 