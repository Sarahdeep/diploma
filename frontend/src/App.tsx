import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import { UserRole } from './types/user';
import { Sidebar } from './components/Sidebar';
import { Menu } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';

// Page imports
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegistrationPage from './pages/RegistrationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import EmailVerificationPage from './pages/EmailVerificationPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import ObservationsPage from './pages/ObservationsPage';
import NotFoundPage from './pages/NotFoundPage';
import GeoDataMapPage from './pages/GeoDataMapPage';
import PublicProfilePage from './pages/PublicProfilePage';
import AnalysisPage from './pages/AnalysisPage';

// Toast for notifications
import { Toaster } from '@/components/ui/sonner';

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const isAdmin = user?.role === UserRole.ADMIN;

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleSidebarSelect = (section: string) => {
    switch (section) {
      case 'upload':
        navigate('/admin');
        break;
      case 'observations':
        navigate('/observations');
        break;
      case 'analysis':
        navigate('/analysis');
        break;
      case 'map':
        navigate('/geodata-map');
        break;
      case 'profile':
        navigate('/profile');
        break;
      default:
        console.warn(`Unknown sidebar section: ${section}`);
    }
    toggleSidebar();
  };

  // Determine the default active sidebar item
  let defaultActiveSidebar: 'upload' | 'observations' | 'analysis' | 'map' | 'profile' = 'observations';
  if (isAdmin) {
    defaultActiveSidebar = 'upload'; // Admins can default to upload
  }
  
  return (
    <div className="flex flex-col h-screen">
      <Navbar toggleSidebar={toggleSidebar} />
      <div className="flex flex-1 overflow-hidden">
        {isAuthenticated && isSidebarOpen && (
          <Sidebar 
            active={defaultActiveSidebar} 
            onSelect={handleSidebarSelect} 
            isAdmin={isAdmin}
          />
        )}
        <main className="flex-1 overflow-y-auto container mx-auto p-4 md:p-8">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegistrationPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<EmailVerificationPage />} />
            <Route path="/users/:userId/profile" element={<PublicProfilePage />} />

            {/* Protected Routes (General Users) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/observations" element={<ObservationsPage />} />
              <Route path="/geodata-map" element={<GeoDataMapPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
            </Route>

            {/* Protected Routes (Admin Only) */}
            <Route element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]} />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            
            {/* Catch-all for not found pages */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
      <Toaster richColors />
    </div>
  );
}

export default App;