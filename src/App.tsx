import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { AppSkeleton } from './components/Skeleton';
import Login from './pages/Login';
import Orgs from './pages/Orgs';
import OrgPage from './pages/Org';
import ProjectPage from './pages/Project';
import Onboarding from './pages/Onboarding';
import { PageSkeleton } from './components/Skeleton';

// The flow editor pulls in the canvas library, so it loads on demand.
const AutomationEditor = lazy(() => import('./pages/AutomationEditor'));
import { AiProviderPage, IntegrationsPage } from './pages/Integrations';
import OrgSettingsPage from './pages/OrgSettings';
import { FEATURES, ORG_KEY, RETURN_KEY } from './constants';

/** Old bookmarks to the Telegram page land on Integrations. */
function ToIntegrations() {
  const { orgId } = useParams();
  return <Navigate to={`/orgs/${orgId}/integrations`} replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();

  // GitHub redirects the browser to DASHBOARD_ORIGIN/?github=<status>; send the user back to where they started
  // (the onboarding page, or their org).
  useEffect(() => {
    const status = new URLSearchParams(loc.search).get('github');
    if (!status || loc.pathname !== '/') return;
    let ret: string | null = null;
    let orgId: string | null = null;
    try {
      ret = sessionStorage.getItem(RETURN_KEY);
      orgId = sessionStorage.getItem(ORG_KEY);
      sessionStorage.removeItem(RETURN_KEY);
    } catch {
      /* storage unavailable */
    }
    const sep = (p: string) => (p.includes('?') ? '&' : '?');
    nav(ret ? `${ret}${sep(ret)}github=${status}` : orgId ? `/orgs/${orgId}?github=${status}` : '/', { replace: true });
  }, [loc.search, loc.pathname, nav]);

  if (loading) return <AppSkeleton />;
  if (!user) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Orgs />} />
        <Route path="/orgs/:orgId" element={<OrgPage />} />
        {/* Guided setup lives inside the dashboard; ?track=<id> focuses a single question. */}
        <Route path="/orgs/:orgId/setup" element={<Onboarding />} />
        <Route path="/orgs/:orgId/ai" element={<AiProviderPage />} />
        <Route path="/orgs/:orgId/settings" element={<OrgSettingsPage />} />
        <Route path="/orgs/:orgId/integrations" element={<IntegrationsPage />} />
        <Route path="/orgs/:orgId/telegram" element={<ToIntegrations />} />
        {FEATURES.automations && (
          <Route path="/projects/:projectId/automations/:automationId" element={<Suspense fallback={<PageSkeleton />}><AutomationEditor /></Suspense>} />
        )}
        <Route path="/projects/:projectId/:section?" element={<ProjectPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
