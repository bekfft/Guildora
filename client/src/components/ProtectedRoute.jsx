import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="route-loader" aria-label="Sitzung wird geladen">
        <span className="spinner spinner--large" />
      </main>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}
