import { useState } from 'react';
import Modal from './Modal';

const STEPS: [string, string][] = [
  ['Detects', 'Missing heartbeats, errors from your code, failed deploys, an unreachable URL, slow responses, error spikes, and risky pushes.'],
  ['Opens one incident', 'Repeated errors are grouped, so you get one incident and one Telegram message, edited as it progresses.'],
  ['AI investigates', 'It reads the errors, recent commits and your project map, then explains what is wrong in plain English.'],
  ['Proposes a fix', 'A small change on its own branch, opened as a pull request. Traffic problems get a performance fix instead.'],
  ['You approve', 'Tap Yes in Telegram. In automatic mode bug fixes merge by themselves, but performance changes always ask.'],
  ['Deploys and verifies', 'It watches the deploy and your service for a few minutes.'],
  ['Rolls back if needed', 'If the error returns or the service is still slow, the change is reverted for you.'],
];

/** A "?" button that opens a short explanation of what the AI and incidents are doing. */
export default function HowItWorks({ label = 'How Urchin handles incidents' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="help-btn" onClick={() => setOpen(true)} aria-label={label} title={label}>?</button>
      {open && (
        <Modal title="What Urchin is doing" description="From the first error to a verified fix." onClose={() => setOpen(false)} width={520}>
          <ol className="how-list">
            {STEPS.map(([title, text]) => (
              <li key={title}><b>{title}</b><span>{text}</span></li>
            ))}
          </ol>
          <p className="muted small" style={{ margin: '14px 0 0' }}>
            It never edits env, config, <code>package.json</code>, lockfiles or CI files, and makes one fix attempt per incident.
          </p>
        </Modal>
      )}
    </>
  );
}
