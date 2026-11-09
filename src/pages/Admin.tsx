import { useState } from 'react';
import { api } from '../api';
import { fmt, useAction, useLoad } from '../hooks';
import { useConfirm } from '../components/Confirm';
import { ListSkeleton } from '../components/Skeleton';

type Status = 'new' | 'read' | 'done';
interface Item { id: string; email: string | null; org_id: string | null; page: string | null; message: string; status: Status; created_at: number }
interface Inbox { items: Item[]; counts: Record<Status, number> }

const FILTERS: { id: Status | 'all'; label: string }[] = [
  { id: 'new', label: 'New' }, { id: 'read', label: 'Read' }, { id: 'done', label: 'Done' }, { id: 'all', label: 'All' },
];

/** The owner's feedback inbox. Only people listed as admins on the backend can load it. */
export default function AdminPage() {
  const [filter, setFilter] = useState<Status | 'all'>('new');
  const inbox = useLoad(() => api<Inbox>(`/admin/feedback${filter === 'all' ? '' : `?status=${filter}`}`), [filter], 30000);
  const act = useAction();
  const confirm = useConfirm();

  if (inbox.error && !inbox.data) {
    return <p className="error">{/admin|forbidden/i.test(inbox.error) ? 'This page is for the owner of this Urchin deployment.' : inbox.error}</p>;
  }

  const counts = inbox.data?.counts;
  const total = counts ? counts.new + counts.read + counts.done : 0;

  async function mark(id: string, status: Status) {
    await act.run(() => api(`/admin/feedback/${id}`, { method: 'PATCH', body: { status } }));
    inbox.reload();
  }
  async function remove(id: string) {
    const ok = await confirm({ title: 'Delete this message?', description: 'It is removed for good.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    await act.run(() => api(`/admin/feedback/${id}`, { method: 'DELETE' }));
    inbox.reload();
  }

  return (
    <>
      <h1>Feedback</h1>
      <p className="muted">What people send from the dashboard’s feedback box{counts ? ` · ${total} in total` : ''}.</p>

      <div className="seg" role="tablist" aria-label="Filter" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            {f.label}{counts && f.id !== 'all' ? ` ${counts[f.id]}` : ''}
          </button>
        ))}
      </div>

      {inbox.loading && <ListSkeleton rows={3} />}
      {act.error && <p className="error small">{act.error}</p>}
      {inbox.data && inbox.data.items.length === 0 && (
        <div className="card"><p className="muted" style={{ margin: 0 }}>{filter === 'new' ? 'Nothing new. You’re all caught up.' : 'Nothing here yet.'}</p></div>
      )}

      {inbox.data?.items.map((m) => (
        <div className="card fb-item" key={m.id}>
          <div className="row spread" style={{ alignItems: 'flex-start' }}>
            <div className="fb-meta">
              <b>{m.email ?? 'Unknown sender'}</b>
              <span className="muted small">{fmt(m.created_at)}{m.page ? ` · ${m.page}` : ''}</span>
            </div>
            <span className={`badge ${m.status === 'new' ? 'pending' : m.status === 'done' ? 'resolved' : 'muted'}`}>{m.status}</span>
          </div>
          <p className="fb-text">{m.message}</p>
          <div className="row">
            {m.status !== 'read' && <button className="btn small-btn" onClick={() => mark(m.id, 'read')} disabled={act.busy}>Mark read</button>}
            {m.status !== 'done' && <button className="btn small-btn" onClick={() => mark(m.id, 'done')} disabled={act.busy}>Done</button>}
            {m.status !== 'new' && <button className="btn small-btn" onClick={() => mark(m.id, 'new')} disabled={act.busy}>Mark new</button>}
            {m.email && <a className="btn small-btn" style={{ textDecoration: 'none' }} href={`mailto:${m.email}?subject=${encodeURIComponent('Your Urchin feedback')}`}>Reply</a>}
            <button className="btn small-btn danger" onClick={() => remove(m.id)} disabled={act.busy}>Delete</button>
          </div>
        </div>
      ))}
    </>
  );
}
