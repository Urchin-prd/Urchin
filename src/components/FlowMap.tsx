import { useEffect, useMemo } from 'react';
import {
  Background, Controls, Handle, MiniMap, Position, ReactFlow, useReactFlow, useStore,
  type Node, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Project, ProjectMap } from '../api';
import { useTheme } from '../theme';
import { buildGraph, type FlowNodeData } from '../lib/graph';

type N = NodeProps<Node<FlowNodeData>>;

const Handles = () => (
  <>
    <Handle type="target" position={Position.Left} className="flow-handle" isConnectable={false} />
    <Handle type="source" position={Position.Right} className="flow-handle" isConnectable={false} />
  </>
);

const ClientsNode = ({ data }: N) => (<div className="fnode fclients"><Handles />{data.label}</div>);

const ServiceNode = ({ data }: N) => (
  <div className="fnode fservice">
    <Handles />
    <div className="row" style={{ gap: 8 }}>
      <span className={`dot ${data.status ?? 'unknown'}`} />
      <b>{data.label}</b>
    </div>
    {data.sub && <div className="muted small fsub">{data.sub}</div>}
  </div>
);

const FileNode = ({ data }: N) => (
  <div className="fnode ffile">
    <Handles />
    <div className="ffile-name">{data.label}</div>
    <div className="row spread small">
      <span className="muted">{data.sub}</span>
      {!!data.errors && <span className="badge down">{data.errors}</span>}
    </div>
  </div>
);

const RouteNode = ({ data }: N) => {
  const m = (data.method ?? '*').toLowerCase();
  return (
    <div className={`fnode froute${data.errors ? ' hot' : ''}`}>
      <Handles />
      <span className={`method m-${m === '*' ? 'any' : m}`}>{m === '*' ? 'ANY' : m.toUpperCase()}</span>
      <code>{data.label}</code>
      {!!data.errors && <span className="badge down">{data.errors}</span>}
    </div>
  );
};

const IntegrationNode = ({ data }: N) => (<div className="fnode fint"><Handles />{data.label}</div>);
const MoreNode = ({ data }: N) => (<div className="fnode fmore"><Handles />{data.label}</div>);

const nodeTypes: NodeTypes = {
  clients: ClientsNode, service: ServiceNode, file: FileNode, route: RouteNode, integration: IntegrationNode, more: MoreNode,
};

/** Re-fits the chart whenever its container changes size (e.g. dragging the workspace divider). */
function FitOnResize() {
  const { fitView } = useReactFlow();
  const w = useStore((s) => s.width);
  const h = useStore((s) => s.height);
  useEffect(() => {
    if (!w || !h) return;
    const id = requestAnimationFrame(() => fitView({ padding: 0.1, duration: 0 }));
    return () => cancelAnimationFrame(id);
  }, [w, h, fitView]);
  return null;
}

/**
 * The project map as a flow chart on a pan/zoom canvas (React Flow).
 * `preview` is a small non-interactive thumbnail; `full` is the interactive canvas.
 */
export default function FlowMap({
  project, map, variant, detail,
}: {
  project: Project;
  map: ProjectMap;
  /** preview: static thumbnail · embedded: interactive inside the workspace · full: full-screen canvas */
  variant: 'preview' | 'embedded' | 'full';
  /** Defaults to every route for 'full', files only otherwise. */
  detail?: 'overview' | 'full';
}) {
  const { resolved } = useTheme();
  const full = variant === 'full';
  const interactive = variant !== 'preview';
  const level = detail ?? (full ? 'full' : 'overview');
  const { nodes, edges } = useMemo(() => buildGraph(project, map, level), [project, map, level]);

  return (
    <ReactFlow
      key={map.generated_at ?? 0}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode={resolved}
      fitView
      fitViewOptions={{ padding: full ? 0.15 : 0.1 }}
      minZoom={interactive ? 0.05 : 0.01}
      maxZoom={interactive ? 1.6 : 1}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={interactive}
      panOnDrag={interactive}
      zoomOnScroll={full}
      zoomOnPinch={interactive}
      zoomOnDoubleClick={false}
      preventScrolling={full}
      aria-label="Project flow chart"
    >
      <FitOnResize />
      <Background gap={20} size={1} />
      {interactive && <Controls showInteractive={false} />}
      {full && <MiniMap pannable zoomable className="flow-minimap" />}
    </ReactFlow>
  );
}
