// Registry + knowledge graph produced by scripts/build-library.mjs.

export type ItemType = 'agent' | 'skill' | 'command' | 'guide';

export interface Source {
  id: string;
  repo: string;
  label: string;
  short: string;
  license: string;
  color: string;
  role: string;
  commit?: string;
  counts: Partial<Record<ItemType, number>>;
}

export interface Department {
  id: string;
  name: string;
  uz: string;
  emoji: string;
  color: string;
  counts: Partial<Record<ItemType, number>>;
}

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  title?: string;
  source: string;
  dept: string;
  description: string;
  url: string;
  lib: string;
  tools?: string[];
  model?: string;
  tags?: string[];
}

export interface Registry {
  generatedAt: string;
  sources: Source[];
  departments: Department[];
  counts: Partial<Record<ItemType, number>>;
  items: Item[];
}

export type NodeType = ItemType | 'dept' | 'source';

export interface GraphNode {
  id: string;
  t: NodeType;
  n: string;
  s?: string;
  d?: string;
  deg: number;
  p: [number, number, number];
}

/** [sourceIndex, targetIndex, relation, extracted(1) | inferred(0)] */
export type GraphEdge = [number, number, string, 0 | 1];

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface OfficeData {
  registry: Registry;
  graph: Graph;
  byId: Map<string, Item>;
  dept: Map<string, Department>;
  source: Map<string, Source>;
  nodeIndex: Map<string, number>;
  /** item id -> ids of directly connected items (no dept/source nodes) */
  neighbors: Map<string, { id: string; rel: string; out: boolean; extracted: boolean }[]>;
}

export async function loadData(): Promise<OfficeData> {
  const [registry, graph] = await Promise.all([
    fetch('data/registry.json').then((r) => r.json() as Promise<Registry>),
    fetch('data/graph.json').then((r) => r.json() as Promise<Graph>),
  ]);
  const byId = new Map(registry.items.map((i) => [i.id, i]));
  const nodeIndex = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const neighbors: OfficeData['neighbors'] = new Map();
  for (const [a, b, rel, ex] of graph.edges) {
    const na = graph.nodes[a];
    const nb = graph.nodes[b];
    if (!byId.has(na.id) || !byId.has(nb.id)) continue;
    if (!neighbors.has(na.id)) neighbors.set(na.id, []);
    if (!neighbors.has(nb.id)) neighbors.set(nb.id, []);
    neighbors.get(na.id)!.push({ id: nb.id, rel, out: true, extracted: !!ex });
    neighbors.get(nb.id)!.push({ id: na.id, rel, out: false, extracted: !!ex });
  }
  return {
    registry,
    graph,
    byId,
    dept: new Map(registry.departments.map((d) => [d.id, d])),
    source: new Map(registry.sources.map((s) => [s.id, s])),
    nodeIndex,
    neighbors,
  };
}

export const displayName = (it: Pick<Item, 'name' | 'title'>) => it.title || it.name;
