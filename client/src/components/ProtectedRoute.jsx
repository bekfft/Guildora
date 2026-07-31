import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import SessionRecovery from './SessionRecovery.jsx';

export default function ProtectedRoute() {
  const { user, loading, sessionUnavailable, restoreSession } = useAuth();
  const location = useLocation();

  if (loading || sessionUnavailable) {
    return <SessionRecovery loading={loading} onRetry={restoreSession} />;
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
