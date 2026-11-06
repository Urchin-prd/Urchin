import { auth } from './firebase';

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'unauthorized', 'Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(API_URL + path, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? res.statusText);
  }
  return data as T;
}

// ---- types mirrored from the backend ----

export interface Org { id: string; name: string; owner_id: string; created_at: number; role: 'owner' | 'member' }
export type ProviderId = 'anthropic' | 'gemini' | 'groq';
export type FixMode = 'ask' | 'auto';
export interface Project {
  id: string; org_id: string; name: string; github_repo: string | null; project_key: string;
  status: 'up' | 'down' | 'unknown'; last_heartbeat_at: number | null;
  check_interval_minutes: number; down_after_minutes: number; created_at: number;
  live_url: string | null; health_path: string; fix_mode: FixMode; verify_minutes: number;
  /** 1 = on */ review_pushes: number; smoke_checks: number;
  last_smoke_at: number | null; last_smoke_result: string | null;
  railway_project_id: string | null; railway_service_id: string | null; railway_environment_id: string | null;
}
export type IncidentStatus =
  | 'detected' | 'diagnosing' | 'fix_proposed' | 'awaiting_approval' | 'merging' | 'deploying' | 'verifying'
  | 'resolved' | 'reverted' | 'failed';
export interface Incident {
  id: string; project_id: string; kind: 'error' | 'downtime' | 'unreachable' | 'deploy_failed' | 'capacity'; status: IncidentStatus;
  summary: string; route: string | null; ai_diagnosis: string | null; proposed_fix: string | null;
  /** JSON: [{ status, at, note? }] */
  stage_history: string; failure_reason: string | null;
  fix_summary: string | null; fix_patch: string | null; fix_forced_ask: number;
  fix_decision: 'pending' | 'approved' | 'rejected' | null;
  pr_number: number | null; pr_url: string | null; revert_pr_number: number | null; revert_pr_url: string | null;
  merge_sha: string | null; suspect_commit: string | null;
  created_at: number; resolved_at: number | null;
}
export interface EventRow {
  id: string; type: 'error' | 'heartbeat'; message: string | null; stack: string | null;
  route: string | null; metadata: string | null; incident_id: string | null; created_at: number;
}
export interface Automation {
  id: string; project_id: string; name: string; permission: 'read_only' | 'take_action'; enabled: boolean;
  triggers?: string[]; has_graph?: boolean;
}
export interface AgentSettings {
  ai_provider: ProviderId | null; ai_model: string | null; has_api_key: boolean;
  telegram_chat_id: string | null; updated_at: number | null;
}
export interface GithubStatus {
  connected: boolean;
  github: { installation_id: number; account_login: string | null } | null;
  /** Permissions the installation is missing; null when GitHub couldn't be asked. */
  missing?: { key: string; label: string; need: 'read' | 'write'; have: string }[] | null;
  manage_url?: string | null;
}
export interface MapRoute { method?: string; path: string; file?: string; description?: string; source: string; error_count?: number }
export interface ProjectMap {
  summary: string; framework?: string; routes: MapRoute[]; flows: { name: string; steps: string[] }[];
  integrations?: string[]; structure?: { dir: string; files: number }[]; files_analyzed?: string[]; generated_at?: number;
}
