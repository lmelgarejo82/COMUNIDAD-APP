import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function defaultPathForRole(role) {
  return role === 'access_operator' ? '/accesos' : '/dashboard';
}

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles?.length && !roles.includes(user.role)) {
    return <Navigate to={defaultPathForRole(user.role)} replace />;
  }

  return children;
}
