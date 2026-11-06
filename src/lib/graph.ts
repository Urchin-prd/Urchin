import dagre from '@dagrejs/dagre';
import { Position, type Edge, type Node } from '@xyflow/react';
import type { MapRoute, Project, ProjectMap } from '../api';

export type NodeKind = 'clients' | 'service' | 'file' | 'route' | 'integration' | 'more';
export interface FlowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  label: string;
  sub?: string;
  method?: string;
  errors?: number;
  status?: string;
}

const MAX_ROUTES = 120;
const MAX_FILES = 20;

const SIZE: Record<NodeKind, [number, number]> = {
  clients: [150, 44],
  service: [240, 78],
  file: [210, 46],
  route: [250, 38],
  integration: [150, 40],
  more: [180, 36],
};

const fileLabel = (f: string) => f.split('/').slice(-2).join('/');

/**
 * Turn a repo-derived map into a left-to-right flow chart:
 *   Clients → Service → source files → routes,   and   Service → detected integrations.
 */
export function buildGraph(
  project: Project,
  map: ProjectMap,
  /** 'overview' stops at files (readable at thumbnail size); 'full' includes every route. */
  detail: 'overview' | 'full' = 'full',
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const maxFiles = detail === 'overview' ? 12 : MAX_FILES;
  const raw: { id: string; data: FlowNodeData }[] = [];
  const edges: Edge[] = [];
  const edge = (source: string, target: string, hot = false): Edge => ({
    id: `${source}->${target}`, source, target, type: 'smoothstep', animated: hot,
    style: { stroke: hot ? 'var(--down)' : 'var(--border-strong)', strokeWidth: hot ? 1.6 : 1.2 },
  });

  raw.push({ id: 'clients', data: { kind: 'clients', label: 'Clients' } });
  raw.push({
    id: 'service',
    data: { kind: 'service', label: project.name, sub: [map.framework, project.github_repo].filter(Boolean).join(' · '), status: project.status },
  });
  edges.push(edge('clients', 'service'));

  // Group routes found in code by the file that defines them; routes seen only in errors get their own group.
  const groups = new Map<string, MapRoute[]>();
  for (const r of map.routes) {
    const key = r.source === 'observed' ? '__observed' : (r.file ?? '__unknown');
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0] === '__observed') return 1;
    if (b[0] === '__observed') return -1;
    return b[1].length - a[1].length;
  });

  let routeBudget = MAX_ROUTES;
  let hiddenRoutes = 0;
  ordered.slice(0, maxFiles).forEach(([file, routes], fi) => {
    const fid = `file:${fi}`;
    const label = file === '__observed' ? 'Seen in errors' : file === '__unknown' ? 'Other' : fileLabel(file);
    raw.push({ id: fid, data: { kind: 'file', label, sub: `${routes.length} route${routes.length === 1 ? '' : 's'}`, errors: routes.reduce((n, r) => n + (r.error_count ?? 0), 0) || undefined } });
    const fileHot = routes.some((r) => r.error_count);
    edges.push(edge('service', fid, fileHot));

    if (detail === 'overview') return; // files only
    routes.forEach((r, ri) => {
      if (routeBudget <= 0) { hiddenRoutes++; return; }
      routeBudget--;
      const rid = `route:${fi}:${ri}`;
      raw.push({ id: rid, data: { kind: 'route', label: r.path, method: (r.method ?? '*').toUpperCase(), errors: r.error_count } });
      edges.push(edge(fid, rid, !!r.error_count));
    });
  });
  if (detail === 'overview') {
    const hiddenFiles = ordered.length - maxFiles;
    if (hiddenFiles > 0) {
      raw.push({ id: 'more', data: { kind: 'more', label: `+${hiddenFiles} more files` } });
      edges.push(edge('service', 'more'));
    }
  } else {
    hiddenRoutes += ordered.slice(maxFiles).reduce((n, [, rs]) => n + rs.length, 0);
    if (hiddenRoutes > 0) {
      raw.push({ id: 'more', data: { kind: 'more', label: `+${hiddenRoutes} more routes` } });
      edges.push(edge('service', 'more'));
    }
  }

  for (const name of map.integrations ?? []) {
    const id = `int:${name}`;
    raw.push({ id, data: { kind: 'integration', label: name } });
    edges.push(edge('service', id));
  }

  // Auto-layout, left to right.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  raw.forEach((n) => g.setNode(n.id, { width: SIZE[n.data.kind][0], height: SIZE[n.data.kind][1] }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const nodes: Node<FlowNodeData>[] = raw.map((n) => {
    const pos = g.node(n.id);
    const [w, h] = SIZE[n.data.kind];
    return {
      id: n.id,
      type: n.data.kind,
      data: n.data,
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    };
  });
  return { nodes, edges };
}
