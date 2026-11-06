import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Org } from '../api';
import { useAction, useLoad } from '../hooks';
import { CardSkeleton } from '../components/Skeleton';
import Modal from '../components/Modal';

export default function Orgs() {
  const nav = useNavigate();
  const { data, error, loading } = useLoad(() => api<{ organizations: Org[] }>('/orgs'), []);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="row spread" style={{ marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>Your organizations</h1>
        <button className="btn primary" onClick={() => setOpen(true)}>New organization</button>
      </div>
      <p className="muted">An organization groups projects, an AI key, a Telegram chat and a GitHub connection.</p>
      {loading && <CardSkeleton rows={3} />}
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="card">
          {data.organizations.length === 0 && <p className="muted" style={{ margin: 0 }}>No organizations yet. Create your first one.</p>}
          {data.organizations.map((o) => (
            <div className="item row spread" key={o.id}>
              <Link to={`/orgs/${o.id}`}>{o.name}</Link>
              <span className="badge muted">{o.role}</span>
            </div>
          ))}
        </div>
      )}
      {open && <NewOrgModal onClose={() => setOpen(false)} onCreated={(id) => nav(`/orgs/${id}/setup`)} />}
    </>
  );
}

function NewOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const create = useAction();

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await create.run(() => api<{ organization: Org }>('/orgs', { body: { name } }));
    if (res) onCreated(res.organization.id); // new organizations start with the guided setup
  }

  return (
    <Modal title="New organization" description="A home for your projects, AI key, Telegram chat and GitHub connection." onClose={onClose} width={440}>
      <form className="stack" onSubmit={onCreate}>
        <label>Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="Acme" autoComplete="off" />
        </label>
        {create.error && <p className="error small" style={{ margin: 0 }}>{create.error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={create.busy || !name.trim()}>{create.busy ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
