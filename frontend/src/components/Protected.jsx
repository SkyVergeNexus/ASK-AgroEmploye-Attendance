import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Protected = ({ children }) => {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? children : <Navigate to="/login" replace />;
};

export const AdminRoute = ({ children }) => {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  return user.system_role === 'admin' ? children : <Navigate to="/dashboard" replace />;
};

export const EmployeeRoute = ({ children }) => {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  return user.system_role === 'admin' ? <Navigate to="/admin" replace /> : children;
};