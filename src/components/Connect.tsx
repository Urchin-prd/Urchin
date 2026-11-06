import { useState } from 'react';
import { API_URL, api, type Project } from '../api';
import { fmt, useLoad } from '../hooks';

type Lang = 'node' | 'python' | 'curl';
const LANGS: { id: Lang; label: string }[] = [
  { id: 'node', label: 'Node / Express' },
  { id: 'python', label: 'Python' },
  { id: 'curl', label: 'curl' },
];

interface FileStep {
  /** Heading above the block, e.g. "Create a new file". */
  title: string;
  /** File name shown in the block's header bar. */
  file: string;
  note?: string;
  code: string;
}

function steps(lang: Lang, key: string): FileStep[] {
  if (lang === 'node') {
    return [
      {
        title: 'Create a new file next to your main server file',
        file: 'urchin.js',
        note: 'Needs Node 18 or newer. Using ES modules? Swap module.exports for export { setupUrchin, reportError }.',
        code: `const URCHIN_URL = '${API_URL}';

// Fire-and-forget: monitoring must never break (or slow down) your app.
const send = (path, body = {}) =>
  fetch(URCHIN_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-urchin-key': process.env.URCHIN_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});

const reportError = (err, route) =>
  send('/ingest/error', {
    message: String(err?.message ?? err).slice(0, 2000),
    stack: String(err?.stack ?? '').slice(0, 10000),
    route,
  });

// Crash handlers are installed the moment this file is required, which is why it must be required first.
// They report the crash, then exit like Node normally would.
const crash = (label) => async (e) => {
  await reportError(e, label);
  process.exit(1);
};
process.on('uncaughtException', crash('uncaughtException'));
process.on('unhandledRejection', crash('unhandledRejection'));

function setupUrchin(app) {
  // Heartbeat: keep it more frequent than your "down after" setting
  send('/ingest/heartbeat');
  setInterval(() => send('/ingest/heartbeat'), 60_000);

  // Express error handler. Registered last, so it sees errors from all your routes.
  app.use((err, req, res, next) => {
    reportError(err, \`\${req.method} \${req.baseUrl}\${req.route?.path ?? req.path}\`);
    next(err);
  });
}

module.exports = { setupUrchin, reportError };`,
      },
      {
        title: 'Then wire it into your main file',
        file: 'server.js  ·  app.js  ·  index.js (whichever starts your server)',
        note: 'Require it on the very first line, before anything else, so the crash handlers are in place before anything can fail. Call setupUrchin(app) after all your routes. On Express 4, errors thrown inside async route handlers are not caught by Express: pass them on with next(err), or Urchin never sees them.',
        code: `// FIRST line of the file, before every other require
const { setupUrchin } = require('./urchin');

// ... your other requires, your app, your routes ...

// Express 4: pass async errors on, or they are never reported
app.get('/users/:id', async (req, res, next) => {
  try {
    res.json(await loadUser(req.params.id));
  } catch (err) {
    next(err);
  }
});

setupUrchin(app); // AFTER all your routes`,
      },
    ];
  }
  if (lang === 'python') {
    return [
      {
        title: 'Create a new file next to your main app file',
        file: 'urchin.py',
        note: 'Standard library only, no packages to install.',
        code: `import os, json, threading, time, traceback, urllib.request

URCHIN_URL = "${API_URL}"
KEY = os.environ["URCHIN_KEY"]

def _post(path, body=None):
    req = urllib.request.Request(
        URCHIN_URL + path,
        data=json.dumps(body or {}).encode(),
        headers={"content-type": "application/json", "x-urchin-key": KEY},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # never let monitoring break your app

def report_error(exc, route=None):
    body = {
        "message": str(exc)[:2000],
        "stack": "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[:10000],
    }
    if route:
        body["route"] = route
    _post("/ingest/error", body)

def start():
    """Send a heartbeat every minute (keep it shorter than your "down after" setting)."""
    def loop():
        while True:
            _post("/ingest/heartbeat")
            time.sleep(60)
    threading.Thread(target=loop, daemon=True).start()

def flask_hook(app):
    """Flask only: report unhandled errors."""
    from flask import request
    from werkzeug.exceptions import HTTPException

    @app.errorhandler(Exception)
    def _on_error(e):
        if isinstance(e, HTTPException):
            return e  # 404s and the like aren't incidents
        report_error(e, f"{request.method} {request.url_rule.rule if request.url_rule else request.path}")
        raise e`,
      },
      {
        title: 'Then add this to your main file',
        file: 'app.py  ·  main.py (whichever creates your app)',
        note: 'Not using Flask? Skip flask_hook and call urchin.report_error(exc) from your framework’s error handler.',
        code: `import urchin

urchin.start()           # heartbeat every minute
urchin.flask_hook(app)   # Flask only: reports unhandled errors`,
      },
    ];
  }
  return [
    {
      title: 'No file needed. Run these from any terminal, cron job, or scheduler',
      file: 'terminal  ·  crontab',
      note: 'Send the heartbeat every minute, and call the error command wherever you catch a failure.',
      code: `# Heartbeat
curl -X POST ${API_URL}/ingest/heartbeat \\
  -H 'x-urchin-key: ${key}'

# Report an error
curl -X POST ${API_URL}/ingest/error \\
  -H 'x-urchin-key: ${key}' -H 'content-type: application/json' \\
  -d '{"message":"Test error","route":"GET /health"}'`,
    },
  ];
}

/**
 * A ready-made instruction for AI coding assistants (Claude Code, Cursor, ChatGPT, ...).
 * It deliberately does NOT contain the project key: the key is a secret and the prompt gets pasted into
 * a third-party tool, so the user sets URCHIN_KEY themselves.
 */
function buildPrompt(project: Project): string {
  return `Add Urchin monitoring to this backend (service name: "${project.name}").

Urchin is an incident-response service. My backend must (1) send a heartbeat every 60 seconds and (2) report unhandled errors to it.

First, inspect this codebase to find the language, the framework, and the file that starts the server. Then implement the integration idiomatically for that stack.

API
Base URL: ${API_URL}
Auth: send the header "x-urchin-key" with the value of the URCHIN_KEY environment variable.

POST /ingest/heartbeat
  - Body: optional JSON {"metadata": {...}}. An empty body is fine.
  - Success: 202 {"accepted": true}

POST /ingest/error
  - Body (JSON): {
      "message": string (required, max 2000 chars),
      "stack": string (optional, max 10000 chars),
      "route": string (optional, max 500 chars, format "METHOD /full/path/with/:params", e.g. "POST /api/checkout/:id"),
      "metadata": object (optional, under 8KB when serialized)
    }
  - Success: 202 {"accepted": true}

Requirements
- Read the key from the URCHIN_KEY environment variable. Never hardcode it, never log it, never commit it. Add URCHIN_KEY= (no real value) to .env.example if the project has one.
- Put the Urchin code in a small separate module (for example urchin.js or urchin.py) and wire it into the main entry file with minimal changes.
- Heartbeat: send one at startup, then every 60 seconds. This must stay shorter than ${project.down_after_minutes} minutes, the "down after" setting for this service.
- Errors: report unhandled exceptions from request handlers using the framework's error-handling hook, plus process-level crashes (uncaught exceptions and unhandled promise rejections). After reporting a crash, keep the app's normal crash behavior (still exit).
- Do not report expected client errors such as 404s or validation failures (4xx).
- Truncate message and stack to the limits above, and omit "route" instead of sending null.
- Monitoring must never break or slow the app: fire-and-forget, 5 second timeout, swallow its own network errors, and add no new dependencies (use the built-in HTTP client).
- Build the route as \`\${req.method} \${req.baseUrl}\${req.route?.path ?? req.path}\` (Express), so mounted routers keep their full path.
- Node: the Urchin module must be required on the very first line of the entry file, so its crash handlers load before anything else; setupUrchin(app) goes after all routes. Needs Node 18 or newer (built-in fetch).
- Express 4: errors thrown inside async route handlers are not caught by Express. Make sure they are passed to next(err) (a try/catch or a small wrapper), otherwise they are never reported.
- Do not change any other existing behavior.

When you are done, tell me which files you changed and how to test it (confirm a heartbeat arrives and trigger a test error).`;
}

function CopyButton({ text, label = 'Copy', primary = false }: { text: string; label?: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn small-btn${primary ? ' primary' : ''}`}
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {})
      }
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function FileBlock({ step }: { step: FileStep }) {
  return (
    <div>
      <h3>{step.title}</h3>
      {step.note && <p className="muted small" style={{ margin: '0 0 8px' }}>{step.note}</p>}
      <div className="file-block">
        <div className="file-head">
          <span className="file-name">{step.file}</span>
          <CopyButton text={step.code} />
        </div>
        <pre className="code-block">{step.code}</pre>
      </div>
    </div>
  );
}

/**
 * "Connect your service": project key, which file to create/edit per language, and a live indicator that
 * flips as soon as the first heartbeat arrives.
 */
export default function ConnectPanel({ project }: { project: Project }) {
  const [lang, setLang] = useState<Lang>('node');
  const live = useLoad(() => api<{ project: Project }>(`/projects/${project.id}`), [project.id], 4000);
  const heard = live.data?.project.last_heartbeat_at ?? project.last_heartbeat_at;
  const envLine = `URCHIN_KEY=${project.project_key}`;
  const prompt = buildPrompt(project);

  return (
    <div className="stack">
      <div className="prompt-box">
        <div className="row spread">
          <div>
            <h3>Let your AI assistant do it</h3>
            <p className="muted small" style={{ margin: 0 }}>
              Paste this prompt into Claude Code, Cursor, ChatGPT, or similar. It doesn’t include your key, so you still set
              <code>URCHIN_KEY</code> yourself (below).
            </p>
          </div>
          <CopyButton text={prompt} label="Copy prompt" primary />
        </div>
        <details>
          <summary>Preview prompt</summary>
          <pre className="code-block">{prompt}</pre>
        </details>
      </div>

      <div>
        <h3>Add the key to your service’s environment</h3>
        <p className="muted small">
          Set it in your host’s environment variables (Vercel, Render, Railway, Fly, and so on) or a local <code>.env</code> file.
          Treat it like a password and keep it out of your code.
        </p>
        <div className="row">
          <code style={{ wordBreak: 'break-all' }}>{envLine}</code>
          <CopyButton text={envLine} />
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Language">
        {LANGS.map((l) => (
          <button type="button" key={l.id} role="tab" aria-selected={lang === l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      {steps(lang, project.project_key).map((s) => <FileBlock key={s.file} step={s} />)}

      <div>
        <h3>Deploy it, and we’ll hear from you</h3>
        <p className="ob-wait">
          {heard
            ? <><span className="pulse live" /> Heard from {project.name} · {fmt(heard)}</>
            : <><span className="pulse" /> Listening for {project.name}…</>}
        </p>
      </div>
    </div>
  );
}
