import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAction } from '../hooks';
import Modal from './Modal';

const MAX = 2000;

/** Header button that opens a one-box form for suggestions, upgrades and problems. */
export default function Feedback() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn small-btn feedback-btn" onClick={() => setOpen(true)} aria-label="Send feedback">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="feedback-label">Feedback</span>
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const loc = useLocation();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const act = useAction();
  const orgId = /^\/orgs\/([^/]+)/.exec(loc.pathname)?.[1];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await act.run(() => api('/feedback', { body: { message, page: loc.pathname, org_id: orgId } }));
    if (res) setSent(true);
  }

  if (sent) {
    return (
      <Modal title="Thank you" description="Your note reached the team. We read every one." onClose={onClose} width={420}>
        <div className="dialog-actions"><button className="btn primary" onClick={onClose}>Close</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Feedback" description="A suggestion, an upgrade you’d like, or something that’s broken." onClose={onClose} width={480}>
      <form className="stack" onSubmit={submit}>
        <label>
          <span className="sr-only">Your message</span>
          <textarea
            className="feedback-text" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MAX} rows={5} required
            placeholder="What would make Urchin better for you?"
          />
        </label>
        <span className="muted small" style={{ textAlign: 'right' }}>{message.length}/{MAX}</span>
        {act.error && <p className="error small" style={{ margin: 0 }}>{act.error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={act.busy || message.trim().length < 3}>{act.busy ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </Modal>
  );
}
