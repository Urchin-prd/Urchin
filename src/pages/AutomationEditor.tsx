import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Select from '../components/Select';
import { Link, useParams } from 'react-router-dom';
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, addEdge,
  useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from '../theme';
import { api } from '../api';
import { fmt, useAction } from '../hooks';
import { PageSkeleton } from '../components/Skeleton';

type TriggerEvent = 'incident_opened' | 'incident_diagnosed' | 'service_down' | 'service_recovered';
type Field = 'kind' | 'summary' | 'diagnosis' | 'service' | 'error_count';
type Op = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'gt' | 'lt';
type Kind = 'trigger' | 'condition' | 'telegram';

interface NodeData extends Record<string, unknown> {
  event?: TriggerEvent; field?: Field; op?: Op; value?: string; text?: string;
}
type FNode = Node<NodeData, Kind>;

interface Graph {
  nodes: { id: string; type: Kind; position: { x: number; y: number }; data: NodeData }[];
  edges: { id: string; source: string; target: string; sourceHandle?: string | null }[];
}
interface Run { id: string; trigger: string; status: 'ok' | 'skipped' | 'error'; log: string[]; created_at: number }
interface Detail { automation: { id: string; project_id: string; name: string; enabled: boolean; graph: Graph | null }; runs: Run[] }

const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  incident_opened: 'An incident is opened',
  incident_diagnosed: 'An incident is diagnosed',
  service_down: 'The service goes down',
  service_recovered: 'The service recovers',
};
const FIELD_LABELS: Record<Field, string> = {
  kind: 'Incident type (error / downtime)', summary: 'Summary', diagnosis: 'Diagnosis', service: 'Service name', error_count: 'Error count',
};
const OP_LABELS: Record<Op, string> = {
  equals: 'is', not_equals: 'is not', contains: 'contains', not_contains: 'does not contain', gt: 'is greater than', lt: 'is less than',
};
const VARIABLES = ['service', 'summary', 'diagnosis', 'kind', 'error_count'] as const;
const SAMPLE = { service: 'payments-api', summary: 'TypeError: Cannot read properties of undefined', diagnosis: 'A null check is missing in the user lookup.', kind: 'error', error_count: '3' };

const STARTER: Graph = {
  nodes: [
    { id: 'trigger-1', type: 'trigger', position: { x: 60, y: 100 }, data: { event: 'incident_diagnosed' } },
    { id: 'telegram-1', type: 'telegram', position: { x: 380, y: 100 }, data: { text: '🚨 {{service}}: {{summary}}\n\n{{diagnosis}}' } },
  ],
  edges: [{ id: 'e-trigger-1-telegram-1', source: 'trigger-1', target: 'telegram-1' }],
};

const render = (text: string) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (SAMPLE as Record<string, string>)[k] ?? '');

// ---------------- Blocks ----------------

const Icon = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = { trigger: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', condition: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9', telegram: 'M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z' };

function TriggerBlock({ data, selected }: NodeProps<FNode>) {
  return (
    <div className={`anode atrigger${selected ? ' sel' : ''}`}>
      <div className="anode-head"><Icon d={ICONS.trigger} /> When</div>
      <div className="anode-body">{TRIGGER_LABELS[data.event ?? 'incident_opened']}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConditionBlock({ data, selected }: NodeProps<FNode>) {
  return (
    <div className={`anode acond${selected ? ' sel' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="anode-head"><Icon d={ICONS.condition} /> If</div>
      <div className="anode-body">
        {FIELD_LABELS[data.field ?? 'kind'].split(' (')[0]} {OP_LABELS[data.op ?? 'equals']} <b>“{data.value ?? ''}”</b>
      </div>
      <Handle id="true" type="source" position={Position.Right} style={{ top: '34%' }} />
      <Handle id="false" type="source" position={Position.Right} style={{ top: '72%' }} />
      <span className="anode-yes">yes</span>
      <span className="anode-no">no</span>
    </div>
  );
}

function TelegramBlock({ data, selected }: NodeProps<FNode>) {
  return (
    <div className={`anode atg${selected ? ' sel' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="anode-head"><Icon d={ICONS.telegram} /> Send Telegram message</div>
      <div className="anode-body anode-clamp">{data.text || <span className="muted">Empty message</span>}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { trigger: TriggerBlock, condition: ConditionBlock, telegram: TelegramBlock };

const decorate = (e: Edge): Edge => ({
  ...e,
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed },
  label: e.sourceHandle === 'true' ? 'yes' : e.sourceHandle === 'false' ? 'no' : undefined,
});

const toFlow = (g: Graph) => ({
  nodes: g.nodes.map((n) => ({ ...n, selected: false })) as FNode[],
  edges: g.edges.map((e) => decorate({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined })),
});

function cleanData(n: FNode): NodeData {
  if (n.type === 'trigger') return { event: n.data.event ?? 'incident_opened' };
  if (n.type === 'condition') return { field: n.data.field ?? 'kind', op: n.data.op ?? 'equals', value: n.data.value ?? '' };
  return { text: n.data.text ?? '' };
}

// ---------------- Editor ----------------

export default function AutomationEditor() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}

function Editor() {
  const { resolved } = useTheme();
  const { projectId = '', automationId = '' } = useParams();
  const { screenToFlowPosition } = useReactFlow();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<FNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saved, setSaved] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useAction();
  const test = useAction();
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Detail>(`/automations/${automationId}`);
      const g = d.automation.graph ?? STARTER;
      const f = toFlow(g);
      setDetail(d);
      setName(d.automation.name);
      setEnabled(d.automation.enabled);
      setNodes(f.nodes);
      setEdges(f.edges);
      setRuns(d.runs);
      setSaved(JSON.stringify({ n: d.automation.name, e: d.automation.enabled, g: serialize(f.nodes, f.edges) }));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [automationId, setNodes, setEdges]);

  useEffect(() => { void load(); }, [load]);

  const graph = useMemo(() => serialize(nodes, edges), [nodes, edges]);
  const snapshot = JSON.stringify({ n: name, e: enabled, g: graph });
  const dirty = detail !== null && snapshot !== saved;

  const selected = nodes.filter((n) => n.selected);
  const current = selected.length === 1 ? selected[0]! : null;

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge(decorate({ ...c, id: `e-${c.source}-${c.sourceHandle ?? 'out'}-${c.target}` } as Edge), es)),
    [setEdges],
  );

  function addBlock(type: Kind) {
    const rect = wrapRef.current?.getBoundingClientRect();
    const jitter = (nodes.length % 5) * 24;
    const pos = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2 + jitter, y: rect.top + rect.height / 2 + jitter })
      : { x: 200 + jitter, y: 200 + jitter };
    const data: NodeData =
      type === 'trigger' ? { event: 'incident_opened' }
      : type === 'condition' ? { field: 'kind', op: 'equals', value: 'error' }
      : { text: '🚨 {{service}}: {{summary}}' };
    const id = `${type}-${Date.now().toString(36)}`;
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type, position: pos, data, selected: true } as FNode]);
  }

  function patchData(id: string, patch: Partial<NodeData>) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }
  function removeNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }

  /** Problems that would stop a flow from doing anything useful. */
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!nodes.some((n) => n.type === 'trigger')) out.push('Add a trigger block, it decides when the flow runs.');
    nodes.forEach((n) => {
      if (n.type === 'telegram' && !(n.data.text ?? '').trim()) out.push('A Telegram block has an empty message.');
      if (n.type !== 'trigger' && !edges.some((e) => e.target === n.id)) out.push(`A ${n.type === 'condition' ? 'condition' : 'Telegram'} block isn't connected to anything.`);
    });
    return [...new Set(out)];
  }, [nodes, edges]);

  async function doSave(): Promise<boolean> {
    if (!nodes.some((n) => n.type === 'trigger')) {
      setNotice({ ok: false, text: 'Add a trigger block first.' });
      return false;
    }
    const res = await save.run(() => api(`/automations/${automationId}`, { method: 'PATCH', body: { name: name.trim() || 'Untitled automation', enabled, graph } }));
    if (!res) return false;
    setSaved(snapshot);
    setNotice({ ok: true, text: 'Saved.' });
    return true;
  }

  async function runTest() {
    if (dirty && !(await doSave())) return;
    const res = await test.run(() => api<{ status: string; log: string[] }>(`/automations/${automationId}/test`, { method: 'POST' }));
    if (res) {
      setNotice({ ok: res.status !== 'error', text: res.log.join(' · ') || 'Test finished.' });
      const d = await api<Detail>(`/automations/${automationId}`).catch(() => null);
      if (d) setRuns(d.runs);
    }
  }

  if (loadError) return <p className="error">{loadError}</p>;
  if (!detail) return <PageSkeleton />;

  return (
    <div className="editor">
      <div className="editor-bar">
        <div className="row" style={{ gap: 10, flexWrap: 'nowrap', minWidth: 0 }}>
          <Link to={`/projects/${projectId}/automations`} className="muted small" style={{ textDecoration: 'none' }}>← Automations</Link>
          <input className="editor-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Automation name" maxLength={100} />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <label className="switch" title="Disabled automations never run">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>{enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          {dirty && <span className="muted small">Unsaved changes</span>}
          <button className="btn" onClick={runTest} disabled={test.busy || save.busy}>{test.busy ? 'Testing…' : 'Test run'}</button>
          <button className="btn primary" onClick={doSave} disabled={!dirty || save.busy}>{save.busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {(notice || save.error || test.error) && (
        <p className={`${notice?.ok && !save.error && !test.error ? 'ok' : 'error'} small`} style={{ margin: '0 0 8px' }} role="status">
          {save.error ?? test.error ?? notice?.text}
        </p>
      )}

      <div className="editor-body">
        <div className="editor-canvas" ref={wrapRef}>
          <div className="editor-palette" role="toolbar" aria-label="Add a block">
            <span className="muted small">Add</span>
            <button className="btn small-btn" onClick={() => addBlock('trigger')}>Trigger</button>
            <button className="btn small-btn" onClick={() => addBlock('condition')}>If / else</button>
            <button className="btn small-btn" onClick={() => addBlock('telegram')}>Telegram</button>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={(c) => c.source !== c.target}
            colorMode={resolved}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            deleteKeyCode={['Backspace', 'Delete']}
            minZoom={0.3}
            maxZoom={1.6}
            aria-label="Automation flow"
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="editor-side">
          {!current ? (
            <div className="stack">
              <h3>How this works</h3>
              <p className="muted small">Click a block to edit it. Drag from a block’s dot to another block to connect them. A flow starts at a <b>Trigger</b> and follows the lines.</p>
              <p className="muted small">Use <code>{'{{service}}'}</code>, <code>{'{{summary}}'}</code> and <code>{'{{diagnosis}}'}</code> in messages.</p>
              {problems.length > 0 && (
                <div className="problems">
                  {problems.map((p) => <p key={p} className="small">⚠ {p}</p>)}
                </div>
              )}
            </div>
          ) : (
            <Inspector node={current} onChange={(p) => patchData(current.id, p)} onDelete={() => removeNode(current.id)} />
          )}
        </aside>
      </div>

      <div className="card editor-runs">
        <h2>Recent runs</h2>
        {runs.length === 0 && <p className="muted small">No runs yet. Use <b>Test run</b>, or wait for the trigger to happen.</p>}
        {runs.map((r) => (
          <div className="item" key={r.id}>
            <div className="row spread">
              <span className="small"><span className={`badge ${r.status === 'ok' ? 'up' : r.status === 'error' ? 'down' : 'unknown'}`}>{r.status}</span> <span className="muted">{r.trigger.replace('_', ' ')}</span></span>
              <span className="muted small">{fmt(r.created_at)}</span>
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>{r.log.join(' → ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function serialize(nodes: FNode[], edges: Edge[]): Graph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type as Kind, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: cleanData(n) })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  };
}

// ---------------- Inspector ----------------

function Inspector({ node, onChange, onDelete }: { node: FNode; onChange: (p: Partial<NodeData>) => void; onDelete: () => void }) {
  const d = node.data;
  const textRef = useRef<HTMLTextAreaElement>(null);

  function insertVar(v: string) {
    const el = textRef.current;
    const text = d.text ?? '';
    const token = `{{${v}}}`;
    const at = el?.selectionStart ?? text.length;
    onChange({ text: text.slice(0, at) + token + text.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => el?.focus());
  }

  return (
    <div className="stack">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>{node.type === 'trigger' ? 'Trigger' : node.type === 'condition' ? 'If / else' : 'Send Telegram message'}</h3>
        <button className="btn small-btn danger" onClick={onDelete}>Delete</button>
      </div>

      {node.type === 'trigger' && (
        <label>Run when
          <Select value={d.event ?? Object.keys(TRIGGER_LABELS)[0] ?? ''} onChange={(v) => onChange({ event: v as TriggerEvent })} ariaLabel="Run when"
            options={(Object.keys(TRIGGER_LABELS) as TriggerEvent[]).map((k) => ({ value: k, label: TRIGGER_LABELS[k] }))} />
        </label>
      )}

      {node.type === 'condition' && (
        <>
          <label>Check
            <Select value={d.field ?? Object.keys(FIELD_LABELS)[0] ?? ''} onChange={(v) => onChange({ field: v as Field })} ariaLabel="Check"
              options={(Object.keys(FIELD_LABELS) as Field[]).map((k) => ({ value: k, label: FIELD_LABELS[k] }))} />
          </label>
          <label>Condition
            <Select value={d.op ?? Object.keys(OP_LABELS)[0] ?? ''} onChange={(v) => onChange({ op: v as Op })} ariaLabel="Condition"
              options={(Object.keys(OP_LABELS) as Op[]).map((k) => ({ value: k, label: OP_LABELS[k] }))} />
          </label>
          <label>Value
            <input value={d.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} placeholder={d.field === 'kind' ? 'error or downtime' : 'text to compare'} />
          </label>
          <p className="muted small">Connect the <b>yes</b> dot to what should happen when it matches, and the <b>no</b> dot to what should happen otherwise.</p>
        </>
      )}

      {node.type === 'telegram' && (
        <>
          <label>Message
            <textarea ref={textRef} rows={6} value={d.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} maxLength={1500} />
          </label>
          <div className="row" style={{ gap: 4 }}>
            {VARIABLES.map((v) => <button key={v} type="button" className="btn small-btn" onClick={() => insertVar(v)}>{`{{${v}}}`}</button>)}
          </div>
          <div>
            <p className="muted small" style={{ margin: '0 0 4px' }}>Preview</p>
            <pre style={{ margin: 0 }}>{render(d.text ?? '') || ' '}</pre>
          </div>
        </>
      )}
    </div>
  );
}
