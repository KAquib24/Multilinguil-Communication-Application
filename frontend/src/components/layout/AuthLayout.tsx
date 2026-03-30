import React, { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../../features/auth/authSlice.js';

interface AuthLayoutProps {
  children: ReactNode;
  type: 'auth' | 'protected';
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children, type }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  
  useEffect(() => {
    if (type === 'auth' && isAuthenticated) {
      // Redirect to home if already authenticated
      navigate('/', { replace: true });
    } else if (type === 'protected' && !isAuthenticated) {
      // Redirect to login if not authenticated
      navigate('/login', { 
        replace: true,
        state: { from: location.pathname }
      });
    }
  }, [isAuthenticated, navigate, type, location]);
  
  // Show loading while checking authentication
  if (type === 'protected' && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-whatsapp-green-light mx-auto"></div>
          <p className="mt-4 text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }
  
  if (type === 'auth' && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-whatsapp-green-light mx-auto"></div>
          <p className="mt-4 text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
            Redirecting...
          </p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
};

export default AuthLayout;