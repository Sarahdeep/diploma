import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

interface ProtectedRouteProps {
  allowedRoles?: string[]; // Optional: specify roles that are allowed to access this route
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) {
      return; // Don't do anything if authentication state is still loading
    }

    if (!isAuthenticated) {
      // This case is primarily handled by the direct return of <Navigate> below for synchronous redirect,
      // but good to have a guard here if we were to use navigate() for all cases.
      return;
    }

    if (allowedRoles && allowedRoles.length > 0 && user?.role) {
      if (!allowedRoles.includes(user.role)) {
        toast.error("У вас нет доступа к этой странице.");
        navigate('/observations', { replace: true });
      }
    }
  }, [isLoading, isAuthenticated, user, allowedRoles, location, navigate]); // Dependency array

  if (isLoading) {
    // You can return a loading spinner or a blank page while checking auth state
    return <div>Loading authentication state...</div>; // Or a proper loading component
  }

  if (!isAuthenticated) {
    // User not authenticated, redirect to login page
    // Pass the current location so we can redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If roles are specified and user doesn't have the role, 
  // useEffect will handle the redirect. Render null in the meantime.
  if (allowedRoles && allowedRoles.length > 0 && user?.role && !allowedRoles.includes(user.role)) {
    return null; 
  }

  // User is authenticated and (if roles specified) has the required role
  return <Outlet />; // Render the child route components
};

export default ProtectedRoute; 