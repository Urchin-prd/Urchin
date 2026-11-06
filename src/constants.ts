/** sessionStorage: which org the user was on when they left to connect GitHub. */
export const ORG_KEY = 'urchin.org';
/** sessionStorage: exact in-app path to return to after the GitHub redirect (e.g. the onboarding page). */
export const RETURN_KEY = 'urchin.return';

/** Setup "tracks": things an org can finish now or later. Pending ones are listed in the sidebar. */
export type TrackId = 'code' | 'service' | 'brain' | 'alerts';
export const TRACKS: { id: TrackId; label: string; question: string; optional: boolean }[] = [
  { id: 'code', label: 'Connect GitHub', question: 'Where does your code live?', optional: false },
  { id: 'service', label: 'Add a service', question: 'Which service should I keep an eye on?', optional: false },
  { id: 'brain', label: 'AI diagnoses', question: 'Which AI should I think with?', optional: true },
  { id: 'alerts', label: 'Telegram alerts', question: 'Where should I tell you when something breaks?', optional: true },
];
export const trackLink = (orgId: string, id: TrackId) => `/orgs/${orgId}/setup?track=${id}`;

export const GITHUB_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: 'GitHub connected.', ok: true },
  pending: { text: 'Install requested — an admin of that GitHub account must approve it.', ok: false },
  denied: { text: 'GitHub could not confirm you own that installation.', ok: false },
  expired: { text: 'That connect link expired. Try again.', ok: false },
  error: { text: 'Something went wrong connecting GitHub.', ok: false },
};

/**
 * Feature flags (set in frontend/.env). The automation flow builder is hidden unless enabled:
 *   VITE_FEATURE_AUTOMATIONS=true
 */
export const FEATURES = {
  automations: import.meta.env.VITE_FEATURE_AUTOMATIONS === 'true',
} as const;

/** Sections of a project, shown as sub-items under the project in the sidebar. */
export type ProjectSection = 'connect' | 'incidents' | 'settings' | 'automations';
export const PROJECT_SECTIONS: { id: ProjectSection; label: string }[] = [
  { id: 'incidents', label: 'Incidents' },
  { id: 'connect', label: 'Connect' },
  { id: 'settings', label: 'Settings' },
  ...(FEATURES.automations ? [{ id: 'automations' as const, label: 'Automations' }] : []),
];
