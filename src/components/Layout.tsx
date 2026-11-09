import { useEffect, useRef, useState, type ReactNode } from 'react';
import Feedback from './Feedback';
import { useTheme } from '../theme';
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, type AgentSettings, type GithubStatus, type Org, type Project } from '../api';
import { useLoad, useMediaQuery } from '../hooks';
import { PROJECT_SECTIONS, TRACKS, trackLink, type TrackId } from '../constants';
import { Logo } from './Logo';

const COLLAPSE_KEY = 'urchin.sidebar.collapsed';
const MOBILE_QUERY = '(max-width: 860px)';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

const icon = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const SidebarIcon = () => (<svg {...icon}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>);
const SparkIcon = () => (<svg {...icon}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7L19 16z" /></svg>);
const GearIcon = () => (<svg {...icon}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>);
const ShieldIcon = () => (<svg {...icon}><path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z" /></svg>);
const BackIcon = () => (<svg {...icon}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>);
const InboxIcon = () => (<svg {...icon}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></svg>);
const PlugIcon = () => (<svg {...icon}><path d="M9 2v6M15 2v6" /><path d="M6 8h12v4a6 6 0 0 1-12 0V8z" /><path d="M12 18v4" /></svg>);
const DashedIcon =() => (<svg {...icon}><circle cx="12" cy="12" r="8" strokeDasharray="3.2 3.2" /></svg>);
const GridIcon =() => (<svg {...icon}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);

export default function Layout({ children }: { children: ReactNode }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();

  // Close the mobile drawer on navigation, and on Escape.
  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggle() {
    if (isMobile) return setDrawer((d) => !d);
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  }

  const expanded = isMobile ? drawer : !collapsed;
  return (
    <div className={`layout ${collapsed ? 'collapsed' : ''} ${drawer ? 'drawer-open' : ''}`}>
      <Header onToggle={toggle} expanded={expanded} />
      <Sidebar />
      {isMobile && drawer && <div className="backdrop" onClick={() => setDrawer(false)} />}
      <main className="content">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

// ---------------- Header ----------------

function Header({ onToggle, expanded }: { onToggle: () => void; expanded: boolean }) {
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = user?.displayName ?? user?.email ?? 'Account';
  return (
    <header className="header">
      <div className="header-left">
        <button className="icon-btn" onClick={onToggle} aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={expanded}>
          <SidebarIcon />
        </button>
        <Link to="/" className="brand" aria-label="Urchin home"><Logo size={22} /></Link>
      </div>

      <div className="header-right">
      <Feedback />
      <div className="menu" ref={ref}>
        <button className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
          {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{label[0]?.toUpperCase()}</span>}
        </button>
        {open && (
          <div className="dropdown" role="menu">
            <div className="dropdown-head">
              <div className="dropdown-name">{user?.displayName ?? 'Signed in'}</div>
              {user?.email && <div className="muted small">{user.email}</div>}
            </div>
            <div className="dropdown-theme">
              <span className="muted small">Theme</span>
              <div className="seg" role="radiogroup" aria-label="Theme">
                {(['dark', 'light', 'system'] as const).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={theme.pref === p} className={theme.pref === p ? 'on' : ''} onClick={() => theme.setPref(p)}>
                    {p === 'system' ? 'System' : p === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>
            <button className="dropdown-item" role="menuitem" onClick={() => signOut()}>Sign out</button>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}

// ---------------- Sidebar ----------------

function Sidebar() {
  const loc = useLocation();
  const orgMatch = useMatch('/orgs/:orgId');
  // Prefix match so /projects/:id and /projects/:id/:section both count as "on this project".
  const projectMatch = useMatch({ path: '/projects/:projectId', end: false });

  const orgs = useLoad(() => api<{ organizations: Org[] }>('/orgs'), [loc.pathname], undefined, 'orgs');
  const me = useLoad(() => api<{ is_admin?: boolean }>('/me'), [loc.pathname], undefined, 'me');
  // On a project page, look up its org so the sidebar can expand the right one.
  const project = useLoad(
    async () => (projectMatch?.params.projectId ? api<{ project: Project }>(`/projects/${projectMatch.params.projectId}`) : undefined),
    [projectMatch?.params.projectId],
    undefined,
    projectMatch?.params.projectId ? `project:${projectMatch.params.projectId}` : false,
  );
  const setupMatch = useMatch('/orgs/:orgId/setup');
  const aiMatch = useMatch('/orgs/:orgId/ai');
  const tgMatch = useMatch('/orgs/:orgId/integrations');
  const settingsMatch = useMatch('/orgs/:orgId/settings');
  const knownOrgId =
    orgMatch?.params.orgId ?? setupMatch?.params.orgId ?? aiMatch?.params.orgId ?? tgMatch?.params.orgId ?? settingsMatch?.params.orgId ??
    project.data?.project.org_id;
  // Opening a service from its organization page: the service's own org id arrives a moment later. Keep the
  // organization we were just in, so the sidebar stays put instead of emptying and re-expanding.
  const [lastOrgId, setLastOrgId] = useState<string | undefined>();
  useEffect(() => { if (knownOrgId) setLastOrgId(knownOrgId); }, [knownOrgId]);
  const activeOrgId = knownOrgId ?? (projectMatch ? lastOrgId : undefined);
  const projects = useLoad(
    async () => (activeOrgId ? api<{ projects: Project[] }>(`/orgs/${activeOrgId}/projects`) : { projects: [] }),
    [activeOrgId, loc.pathname, loc.search],
    undefined,
    activeOrgId ? `projects:${activeOrgId}` : false,
  );

  // Setup tracks still to do for the active org. Skipped or optional items live here until finished.
  const github = useLoad(
    async () => (activeOrgId ? api<GithubStatus>(`/orgs/${activeOrgId}/github`) : undefined),
    [activeOrgId, loc.pathname, loc.search],
    undefined,
    activeOrgId ? `github:${activeOrgId}` : false,
  );
  const agent = useLoad(
    async () => (activeOrgId ? api<{ agent_settings: AgentSettings }>(`/orgs/${activeOrgId}/agent-settings`) : undefined),
    [activeOrgId, loc.pathname, loc.search],
    undefined,
    activeOrgId ? `agent:${activeOrgId}` : false,
  );
  // Which dropdowns the user has opened or closed by hand (remembered). Anything not overridden is open
  // while it contains the current page, and closed otherwise.
  const [override, setOverride] = useState<Record<string, boolean>>(readOverrides);
  const activeProjectId = projectMatch?.params.projectId;
  const isOpen = (key: string, active: boolean) => override[key] ?? active;
  const toggle = (key: string, active: boolean) =>
    setOverride((o) => {
      const next = { ...o, [key]: !(o[key] ?? active) };
      saveOverrides(next);
      return next;
    });
  // Navigating into an organization or service always reveals it.
  useEffect(() => {
    setOverride((o) => {
      const keys = [activeOrgId && `org:${activeOrgId}`, activeProjectId && `proj:${activeProjectId}`].filter((k): k is string => !!k && k in o);
      if (!keys.length) return o;
      const next = { ...o };
      keys.forEach((k) => delete next[k]);
      saveOverrides(next);
      return next;
    });
  }, [activeOrgId, activeProjectId]);

  // AI provider and Settings are app-level items; they apply to the organization you are in, else your first one.
  const mainOrgId = activeOrgId ?? orgs.data?.organizations[0]?.id;

  const tracksReady = !!activeOrgId && !!github.data && !!agent.data && !!projects.data;
  const trackDone: Record<TrackId, boolean> = {
    code: !!github.data?.connected,
    service: !!projects.data?.projects.length,
    brain: !!agent.data?.agent_settings.has_api_key,
    alerts: !!agent.data?.agent_settings.telegram_chat_id,
  };
  // AI provider and Telegram are permanent nav items below; only the essentials show as "still to do".
  const pendingTracks = tracksReady ? TRACKS.filter((t) => !t.optional && !trackDone[t.id]) : [];

  if (loc.pathname.startsWith('/admin')) {
    return (
      <aside className="sidebar">
        <nav aria-label="Admin">
          <div className="nav-section" style={{ paddingTop: 12 }}>Admin</div>
          <NavLink to="/admin" end className="nav-item" title="Feedback inbox">
            <span className="nav-ico"><InboxIcon /></span>
            <span className="nav-label">Feedback</span>
          </NavLink>
          <div className="nav-sep" role="separator" />
          <NavLink to="/" end className="nav-item" title="Back to Urchin">
            <span className="nav-ico"><BackIcon /></span>
            <span className="nav-label">Back to Urchin</span>
          </NavLink>
        </nav>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <nav aria-label="Main">
        <NavLink to="/" end className="nav-item" title="All organizations">
          <span className="nav-ico"><GridIcon /></span>
          <span className="nav-label">Organizations</span>
        </NavLink>

        {!!orgs.data?.organizations.length && <div className="nav-section">Your organizations</div>}
        {orgs.data?.organizations.map((o) => (
          <OrgNode
            key={o.id}
            org={o}
            open={isOpen(`org:${o.id}`, o.id === activeOrgId)}
            onToggle={() => toggle(`org:${o.id}`, o.id === activeOrgId)}
            activeProjectId={projectMatch?.params.projectId}
            isProjectOpen={(id) => isOpen(`proj:${id}`, id === projectMatch?.params.projectId)}
            toggleProject={(id) => toggle(`proj:${id}`, id === projectMatch?.params.projectId)}
          />
        ))}

        {mainOrgId && (
          <>
            <div className="nav-section">Workspace</div>
            <NavLink to={`/orgs/${mainOrgId}/ai`} end className="nav-item" title="AI provider">
              <span className="nav-ico"><SparkIcon /></span>
              <span className="nav-label">AI provider</span>
            </NavLink>
            <NavLink to={`/orgs/${mainOrgId}/integrations`} end className="nav-item" title="Integrations">
              <span className="nav-ico"><PlugIcon /></span>
              <span className="nav-label">Integrations</span>
            </NavLink>
            <NavLink to={`/orgs/${mainOrgId}/settings`} end className="nav-item" title="Organization settings">
              <span className="nav-ico"><GearIcon /></span>
              <span className="nav-label">Settings</span>
            </NavLink>
          </>
        )}

        {activeOrgId && pendingTracks.length > 0 && (
          <>
            <div className="nav-section">Finish setting up</div>
            {pendingTracks.map((t) => {
              const active = loc.pathname === `/orgs/${activeOrgId}/setup` && loc.search.includes(`track=${t.id}`);
              return (
                <Link key={t.id} to={trackLink(activeOrgId, t.id)} className={`nav-item${active ? ' active' : ''}`} title={t.label}>
                  <span className="nav-ico"><DashedIcon /></span>
                  <span className="nav-label">{t.label}{t.optional && <span className="nav-tag">optional</span>}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>
      {me.data?.is_admin && (
        <div className="sidebar-foot">
          <NavLink to="/admin" className="nav-item" title="Admin">
            <span className="nav-ico"><ShieldIcon /></span>
            <span className="nav-label">Admin</span>
          </NavLink>
        </div>
      )}
    </aside>
  );
}

// ---------------- Dropdown rows ----------------

const OVERRIDE_KEY = 'urchin.nav.open';
function readOverrides(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function saveOverrides(v: Record<string, boolean>) {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`nav-chev-ico${open ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** An organization: click the name to open its page, click the arrow to show or hide its services. */
function OrgNode({ org, open, onToggle, activeProjectId, isProjectOpen, toggleProject }: {
  org: Org; open: boolean; onToggle: () => void; activeProjectId?: string;
  isProjectOpen: (projectId: string) => boolean; toggleProject: (projectId: string) => void;
}) {
  const loc = useLocation();
  // Services are only fetched while the organization is open, and refreshed as you move around.
  const services = useLoad(
    async () => (open ? api<{ projects: Project[] }>(`/orgs/${org.id}/projects`) : undefined),
    [org.id, open, loc.pathname],
    undefined,
    `services:${org.id}`,
  );
  const list = services.data?.projects ?? [];

  return (
    <div>
      <div className="nav-row">
        <NavLink to={`/orgs/${org.id}`} end className="nav-item" title={org.name}>
          <span className="nav-ico"><span className="avatar-sq">{org.name[0]?.toUpperCase()}</span></span>
          <span className="nav-label">{org.name}</span>
        </NavLink>
        <button className="nav-chev" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} services in ${org.name}`}>
          <Chevron open={open} />
        </button>
      </div>

      {open && (
        <div className="nav-children nav-children-org">
          {services.data && list.length === 0 && <div className="nav-empty">No services yet</div>}
          {list.map((p) => (
            <ServiceNode key={p.id} project={p} open={isProjectOpen(p.id)} onToggle={() => toggleProject(p.id)} current={p.id === activeProjectId} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A service: click the name for its default page, click the arrow to show or hide Incidents, Connect, Settings. */
function ServiceNode({ project: p, open, onToggle, current }: { project: Project; open: boolean; onToggle: () => void; current: boolean }) {
  return (
    <div>
      <div className="nav-row">
        {/* The name is not a link: it only opens and closes the service's pages. */}
        <button type="button" className="nav-item sub" title={p.name} onClick={onToggle} aria-expanded={open}>
          <span className="nav-label">{p.name}</span>
        </button>
        <button className="nav-chev" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} pages for ${p.name}`}>
          <Chevron open={open} />
        </button>
      </div>
      {open && (
        <div className="nav-children">
          {PROJECT_SECTIONS.map((s) => (
            <NavLink key={s.id} to={`/projects/${p.id}/${s.id}`} className={({ isActive }) => `nav-item subsub${isActive && current ? ' active' : ''}`}>
              <span className="nav-label">{s.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
