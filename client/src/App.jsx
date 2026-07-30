import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { GuildProvider } from './context/GuildContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppPage from './pages/AppPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import InvitePage from './pages/InvitePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DownloadPage from './pages/DownloadPage.jsx';
import DesktopTitlebar from './components/DesktopTitlebar.jsx';
import DesktopToasts from './components/DesktopToasts.jsx';
import { DesktopProvider, useDesktop } from './context/DesktopContext.jsx';
import { VoiceProvider } from './context/VoiceContext.jsx';

function HomeRoute() {
  const desktop = useDesktop();
  const { user, loading } = useAuth();

  if (!desktop?.isDesktop) return <LandingPage />;
  if (loading) return <div className="route-loader"><span className="spinner spinner--large" /></div>;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

function WebDownloadRoute() {
  const desktop = useDesktop();
  const { user, loading } = useAuth();

  if (!desktop?.isDesktop) return <DownloadPage />;
  if (loading) return <div className="route-loader"><span className="spinner spinner--large" /></div>;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <DesktopProvider>
        <DesktopTitlebar />
        <DesktopToasts />
        <AuthProvider>
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
            <Route element={<GuildProvider><VoiceProvider><AppPage /></VoiceProvider></GuildProvider>}>
              <Route path="/app" element={null} />
              <Route path="/app/channels/@me" element={null} />
              <Route path="/app/channels/:guildId" element={null} />
              <Route path="/app/channels/:guildId/:channelId" element={null} />
              <Route path="/app/discovery" element={null} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </DesktopProvider>
    </BrowserRouter>
  );
}
