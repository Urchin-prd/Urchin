import { Link } from 'react-router-dom';
import { api, type AgentSettings, type Project } from '../api';
import { useLoad } from '../hooks';

/**
 * Service page checklist: snippet connected, AI key added, Telegram linked.
 * Disappears once all three are done.
 */
export default function SetupChecklist({ project }: { project: Project }) {
  const settings = useLoad(() => api<{ agent_settings: AgentSettings }>(`/orgs/${project.org_id}/agent-settings`), [project.org_id], 20000);
  const s = settings.data?.agent_settings;
  if (!s) return null; // wait for the data so the list doesn't flash

  const items = [
    { done: project.last_heartbeat_at !== null, label: 'Snippet connected', to: `/projects/${project.id}/connect` },
    { done: s.has_api_key, label: 'AI key added', to: `/projects/${project.id}/settings` },
    { done: !!s.telegram_chat_id, label: 'Telegram linked', to: `/orgs/${project.org_id}/integrations` },
  ];
  if (items.every((i) => i.done)) return null;

  return (
    <div className="checklist" role="list" aria-label="Setup checklist">
      {items.map((i) => (
        <Link key={i.label} to={i.to} role="listitem" className={`check-item${i.done ? ' done' : ''}`}>
          <span className="check-box" aria-hidden="true">{i.done ? '✓' : ''}</span>
          {i.label}
        </Link>
      ))}
    </div>
  );
}
