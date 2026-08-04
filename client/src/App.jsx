import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { GuildProvider } from './context/GuildContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import DesktopTitlebar from './components/DesktopTitlebar.jsx';
import DesktopToasts from './components/DesktopToasts.jsx';
import SessionRecovery from './components/SessionRecovery.jsx';
import { DesktopProvider, useDesktop } from './context/DesktopContext.jsx';
import { VoiceProvider } from './context/VoiceContext.jsx';
import { GuildoraDialogProvider } from './context/GuildoraDialogContext.jsx';

const AppPage = lazy(() => import('./pages/AppPage.jsx'));
const DownloadPage = lazy(() => import('./pages/DownloadPage.jsx'));
const InvitePage = lazy(() => import('./pages/InvitePage.jsx'));
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const StaffPage = lazy(() => import('./pages/StaffPage.jsx'));

function MobileAppRouteSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    const mobileAppQuery = window.matchMedia('(max-width: 1024px)');
    const update = () => {
      const isMobileApp = mobileAppQuery.matches
        && ['/app', '/staff'].some((prefix) => pathname.startsWith(prefix));
      document.documentElement.toggleAttribute('data-mobile-app', isMobileApp);
    };
    update();
    mobileAppQuery.addEventListener?.('change', update);
    return () => mobileAppQuery.removeEventListener?.('change', update);
  }, [pathname]);

  return null;
}

function StaffRoute() {
  const { user } = useAuth();
  return user?.staff ? <StaffPage /> : <Navigate to="/app" replace />;
}

function RouteFallback() {
  return <main className="route-loader" role="status" aria-label="Guildora wird geladen"><span className="route-loader__spinner" /></main>;
}

function HomeRoute() {
  const desktop = useDesktop();
  const { user, loading, sessionUnavailable, restoreSession } = useAuth();
  const isStandalone = document.documentElement.dataset.displayMode === 'standalone';

  if (!desktop?.isDesktop && !isStandalone) return <LandingPage />;
  if (loading || sessionUnavailable) {
    return <SessionRecovery loading={loading} onRetry={restoreSession} />;
  }
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

function WebDownloadRoute() {
  const desktop = useDesktop();
  const { user, loading, sessionUnavailable, restoreSession } = useAuth();
  const isStandalone = document.documentElement.dataset.displayMode === 'standalone';

  if (!desktop?.isDesktop && !isStandalone) return <DownloadPage />;
  if (loading || sessionUnavailable) {
    return <SessionRecovery loading={loading} onRetry={restoreSession} />;
  }
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MobileAppRouteSync />
      <DesktopProvider>
        <DesktopTitlebar />
        <DesktopToasts />
        <AuthProvider>
          <GuildoraDialogProvider>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/download" element={<WebDownloadRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/invite/:code" element={<InvitePage />} />
          <Route path="/passwort-vergessen" element={<PlaceholderPage title="Passwort zurücksetzen" />} />
          <Route path="/nutzungsbedingungen" element={<PlaceholderPage title="Nutzungsbedingungen" />} />
          <Route path="/datenschutz" element={<PlaceholderPage title="Datenschutzerklärung" />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/staff" element={<StaffRoute />} />
            <Route element={<GuildProvider><VoiceProvider><AppPage /></VoiceProvider></GuildProvider>}>
              <Route path="/app" element={null} />
              <Route path="/app/channels/@me" element={null} />
              <Route path="/app/channels/@me/:channelId" element={null} />
              <Route path="/app/channels/:guildId" element={null} />
              <Route path="/app/channels/:guildId/:channelId" element={null} />
              <Route path="/app/discovery" element={null} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </GuildoraDialogProvider>
        </AuthProvider>
      </DesktopProvider>
    </BrowserRouter>
  );
}
