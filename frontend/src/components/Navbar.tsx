import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button'; // Assuming shadcn/ui Button
import { Menu, UserCircle2 } from 'lucide-react'; // Import Menu icon and UserCircle2 for fallback avatar

interface NavbarProps {
  toggleSidebar: () => void; // Add prop type for toggleSidebar
}

const Navbar: React.FC<NavbarProps> = ({ toggleSidebar }) => { // Destructure toggleSidebar
  const { isAuthenticated, user, logout, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login'); // Redirect to login after logout
    } catch (error) {
      console.error("Failed to logout:", error);
      // Optionally show a toast message for logout failure
    }
  };

  return (
    <nav style={navStyle}>
      <div>
        {isAuthenticated && (
          <Button onClick={toggleSidebar} variant="ghost" size="icon" className="mr-2">
            <Menu />
          </Button>
        )}
        {/* <Link to="/" style={linkStyle}>Home</Link> */} {/* Remove Home link */}
        {/* Add other public links here */}
      </div>
      <div>
        {isLoading ? (
          <span>Loading...</span>
        ) : isAuthenticated && user ? (
          <div style={userInfoStyle}>
            <Link to="/profile" style={{ ...linkStyle, display: 'flex', alignItems: 'center' }}>
              {/* Replace with actual avatar if available, otherwise use fallback */}
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="User Avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', marginRight: '8px' }} />
              ) : (
                <UserCircle2 style={{ width: '32px', height: '32px', marginRight: '8px' }} />
              )}
              <span>{user.username}</span>
            </Link>
            {/* Logout button will be moved to ProfilePage */}
          </div>
        ) : (
          <Link to="/login">
            <Button variant="default" size="sm">Login</Button>
          </Link>
        )}
        {/* Optionally, add a Register button if not authenticated */}
        {!isAuthenticated && !isLoading && (
             <Link to="/register" style={{ marginLeft: '10px' }}>
                <Button variant="outline" size="sm">Register</Button>
            </Link>
        )}
      </div>
    </nav>
  );
};

// Basic styling (replace with your actual styling solution, e.g., Tailwind classes)
const navStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem 2rem',
  backgroundColor: '#f0f0f0',
  borderBottom: '1px solid #ddd',
};

const linkStyle: React.CSSProperties = {
  marginRight: '1rem',
  textDecoration: 'none',
  color: '#333',
};

const userInfoStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
};

export default Navbar;
