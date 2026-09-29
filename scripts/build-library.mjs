#!/usr/bin/env node
// Gather every agent, skill, command and guide from the upstream repos in
// .sources/ into ONE place:
//   library/                    verbatim copies grouped by type and source
//   library/CATALOG.md          human-readable index (+ one file per department)
//   public/data/registry.json   compact catalogue the 3D office loads
//   public/data/graph.json      graphify-style knowledge graph with 3D layout
//
// Usage: node scripts/build-library.mjs [--dir <sources-dir>]
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceX, forceY, forceZ } from 'd3-force-3d';
import { DEPARTMENTS, classify } from './lib/departments.mjs';
import { SYNTHETIC } from './lib/synthetic.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dirFlag = args.indexOf('--dir');
const sourcesDir = resolve(dirFlag >= 0 ? args[dirFlag + 1] : process.env.SOURCES_DIR || join(root, '.sources'));
const { sources } = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8'));
const libDir = join(root, 'library');
const dataDir = join(root, 'public', 'data');

// ---------------------------------------------------------------- scanning --

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'docs', 'doc', 'tests', 'test', '__tests__', 'fixtures', 'examples', 'example',
  'legacy-command-shims', 'website', 'i18n', 'translations', 'locales', 'index-cache', 'dist', 'build',
  'venv', '.venv', 'site-packages', 'presentation', 'videos', 'reports', 'changelog', 'evals', 'assets',
]);
const SKIP_FILES = /^(readme|claude|agents|template|gemini|contributing|changelog|license)\.md$/i;

function* walk(dir, base = dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.') && e.name !== '.claude') continue;
      yield* walk(full, base);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      yield relative(base, full).split(sep).join('/');
    }
  }
}

function splitFrontmatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  let data = {};
  try {
    data = parseYaml(m[1], { strict: false, uniqueKeys: false }) || {};
  } catch {
    // Fall back to "key: value" lines when the YAML is not valid.
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
  }
  if (typeof data !== 'object' || Array.isArray(data)) data = {};
  return { data, body: text.slice(m[0].length) };
}

const clean = (s, max = 420) => {
  const t = String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
const list = (v) => {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.flatMap(list);
  if (typeof v === 'object') return Object.keys(v);
  return String(v).split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
};
const firstHeading = (body) => /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
const firstParagraph = (body) =>
  body.split(/\r?\n\r?\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !p.startsWith('```') && !p.startsWith('|') && !p.startsWith('<')) || '';

function kindOf(rel, sourceId) {
  const parts = rel.split('/');
  const file = parts.at(-1);
  if (/^skill\.md$/i.test(file)) return 'skill';
  if (SKIP_FILES.test(file)) return null;
  if (parts.slice(0, -1).includes('agents')) return 'agent';
  if (parts.slice(0, -1).includes('commands')) return 'command';
  if (sourceId === 'best-practice' && /^(best-practice|tips|orchestration-workflow)\//.test(rel)) return 'guide';
  return null;
}

// Paths inside dot-dirs (.claude) or deeper trees lose ties against canonical ones.
const pathRank = (rel) => (rel.includes('/.') || rel.startsWith('.') ? 1000 : 0) + rel.split('/').length;

const items = [];
const seen = new Map();
const lockPath = join(root, 'sources.lock.json');
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : {};

for (const src of sources) {
  const dir = join(sourcesDir, src.id);
  if (!existsSync(dir)) {
    console.warn(`! ${src.id}: not found in ${sourcesDir} — run \`npm run sync\` first`);
    continue;
  }
  const ref = lock[src.id]?.commit || src.branch;
  const files = [...walk(dir)].sort((a, b) => pathRank(a) - pathRank(b) || a.localeCompare(b));
  let count = 0;
  for (const rel of files) {
    const type = kindOf(rel, src.id);
    if (!type) continue;
    const text = readFileSync(join(dir, rel), 'utf8');
    const { data, body } = splitFrontmatter(text);
    const parts = rel.split('/');
    let name;
    if (type === 'skill') name = data.name || parts.at(-2);
    else if (type === 'command') {
      const at = parts.lastIndexOf('commands');
      name = data.name || parts.slice(at + 1).join(':').replace(/\.md$/i, '');
    } else name = data.name || parts.at(-1).replace(/\.md$/i, '');
    name = String(name).trim();
    const description = clean(data.description || firstParagraph(body) || firstHeading(body) || name);
    if (type === 'agent' && !data.description) continue; // not an agent definition
    if (type === 'command' && !data.description && !firstHeading(body)) continue;
    const id = `${type}:${src.id}:${slug(name)}`;
    if (seen.has(id)) continue; // duplicate mirror (e.g. .claude/ copy) — keep the canonical one
    const dupKey = `${type}|${src.id}|${description}`;
    if (seen.has(dupKey)) continue; // same definition shipped twice under different names
    seen.set(dupKey, true);
    const hermes = data.metadata?.hermes || {};
    const item = {
      id,
      type,
      name,
      title: type === 'guide' ? firstHeading(body) || name : undefined,
      source: src.id,
      description,
      path: rel,
      url: `https://github.com/${src.repo}/blob/${ref}/${rel.split('/').map(encodeURIComponent).join('/')}`,
      tools: list(data.tools || data.allowedTools || data['allowed-tools']).slice(0, 20),
      model: typeof data.model === 'string' ? data.model : undefined,
      tags: [...list(hermes.tags), ...list(data.tags)].slice(0, 12),
      domain: typeof data.domain === 'string' ? data.domain : undefined,
      skillRefs: list(data.skills).map((s) => s.split('/').at(-1)),
      relatedRefs: list(hermes.related_skills),
      body,
      raw: text,
    };
    items.push(item);
    seen.set(id, item);
    count++;
  }
  console.log(`• ${src.id.padEnd(14)} ${count} items`);
}

for (const s of SYNTHETIC(sourcesDir, lock)) {
  if (!existsSync(join(sourcesDir, s.source))) continue;
  items.push(s);
  seen.set(s.id, s);
}

// ------------------------------------------------------------ classifying --

for (const it of items) {
  it.dept ||= classify({ name: it.name, path: it.path, description: it.description, tags: it.tags, domain: it.domain, source: it.source });
}

// ----------------------------------------------------------------- linking --

const edges = [];
const edgeKeys = new Set();
const link = (a, b, rel, conf) => {
  if (!a || !b || a === b) return;
  const k = `${a}|${b}|${rel}`;
  if (edgeKeys.has(k)) return;
  edgeKeys.add(k);
  edges.push({ s: a, t: b, rel, conf });
};

const byName = new Map();
for (const it of items) {
  for (const n of new Set([it.name.toLowerCase(), slug(it.name)])) {
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(it);
  }
}
function resolveRef(ref, from, types) {
  const cands = (byName.get(String(ref).toLowerCase()) || byName.get(slug(ref)) || []).filter((c) => types.includes(c.type));
  return cands.find((c) => c.source === from.source) || (cands.length === 1 ? cands[0] : undefined);
}

// EXTRACTED: explicit frontmatter references.
for (const it of items) {
  for (const ref of it.skillRefs) {
    const t = resolveRef(ref, it, ['skill']);
    if (t) link(it.id, t.id, 'uses_skill', 'EXTRACTED');
  }
  for (const ref of it.relatedRefs) {
    const t = resolveRef(ref, it, ['skill']);
    if (t) link(it.id, t.id, 'related_to', 'EXTRACTED');
  }
}

// INFERRED: an item's body mentions another item by its exact name in backticks
// or as a slash-command / subagent_type.
const GENERIC = new Set(['review', 'test', 'tests', 'debug', 'plan', 'build', 'agent', 'agents', 'skill', 'skills', 'commands', 'status', 'help', 'setup', 'init', 'docs', 'deploy', 'research', 'search', 'config', 'memory', 'update', 'install', 'report', 'verify', 'checkpoint', 'context']);
const mentionRe = /`\/?([a-z0-9][a-z0-9:_-]{3,60})`|subagent_type["']?\s*[:=]\s*["']([a-z0-9:_-]+)["']|(?:^|\s)\/([a-z][a-z0-9-]{4,40})\b/gi;
for (const it of items) {
  let n = 0;
  const found = new Set();
  for (const m of it.body.matchAll(mentionRe)) {
    const ref = (m[1] || m[2] || m[3]).split(':').at(-1).toLowerCase();
    if (GENERIC.has(ref) || ref.length < 5 || found.has(ref) || ref === it.name.toLowerCase()) continue;
    found.add(ref);
    const t = resolveRef(ref, it, ['agent', 'skill', 'command']);
    if (!t) continue;
    const rel = t.type === 'agent' ? 'delegates_to' : t.type === 'skill' ? 'uses_skill' : 'invokes';
    link(it.id, t.id, rel, 'INFERRED');
    if (++n >= 24) break;
  }
}

// Structural: every item belongs to its source and its department.
const sourceNodes = sources.filter((s) => items.some((i) => i.source === s.id)).map((s) => ({ id: `source:${s.id}`, type: 'source', name: s.label, source: s.id }));
const deptNodes = DEPARTMENTS.map((d) => ({ id: `dept:${d.id}`, type: 'dept', name: d.name, dept: d.id }));
for (const it of items) {
  link(it.id, `source:${it.source}`, 'from_source', 'EXTRACTED');
  link(it.id, `dept:${it.dept}`, 'works_in', 'INFERRED');
}

// ------------------------------------------------------------------ layout --

const nodes = [
  ...sourceNodes,
  ...deptNodes,
  ...items.map((it) => ({ id: it.id, type: it.type, name: it.name, source: it.source, dept: it.dept })),
];
const index = new Map(nodes.map((n, i) => [n.id, i]));
const degree = new Array(nodes.length).fill(0);
for (const e of edges) { degree[index.get(e.s)]++; degree[index.get(e.t)]++; }

// Seed departments on a sphere so communities separate cleanly.
const deptSeed = {};
DEPARTMENTS.forEach((d, i) => {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / DEPARTMENTS.length);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  deptSeed[d.id] = [Math.sin(phi) * Math.cos(theta) * 260, Math.cos(phi) * 260, Math.sin(phi) * Math.sin(theta) * 260];
});
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const simNodes = nodes.map((n) => {
  const base = n.type === 'source' ? [0, 0, 0] : deptSeed[n.dept] || [0, 0, 0];
  return { id: n.id, x: base[0] + rand() * 60, y: base[1] + rand() * 60, z: base[2] + rand() * 60, dept: n.dept, type: n.type };
});
const simLinks = edges
  .filter((e) => e.rel !== 'from_source')
  .map((e) => ({ source: e.s, target: e.t, rel: e.rel }));
console.log(`… laying out ${nodes.length} nodes / ${edges.length} edges`);
const sim = forceSimulation(simNodes, 3)
  .force('charge', forceManyBody().strength((n) => (n.type === 'dept' ? -400 : -18)).theta(0.9).distanceMax(400))
  .force('link', forceLink(simLinks).id((n) => n.id).distance((l) => (l.rel === 'works_in' ? 70 : 30)).strength((l) => (l.rel === 'works_in' ? 0.08 : 0.25)))
  .force('x', forceX((n) => deptSeed[n.dept]?.[0] ?? 0).strength((n) => (n.type === 'dept' ? 0.4 : 0.02)))
  .force('y', forceY((n) => deptSeed[n.dept]?.[1] ?? 0).strength((n) => (n.type === 'dept' ? 0.4 : 0.02)))
  .force('z', forceZ((n) => deptSeed[n.dept]?.[2] ?? 0).strength((n) => (n.type === 'dept' ? 0.4 : 0.02)))
  .force('center', forceCenter(0, 0, 0))
  .stop();
for (let i = 0; i < 260; i++) sim.tick();

// -------------------------------------------------------------- outputs ----

rmSync(libDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const libPathOf = (it) => {
  const s = slug(it.name);
  if (it.type === 'skill') return `skills/${it.source}/${s}/SKILL.md`;
  return `${it.type}s/${it.source}/${s}.md`;
};
for (const it of items) {
  it.lib = libPathOf(it);
  const dest = join(libDir, it.lib);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, it.raw);
}

// Licenses for everything we redistribute.
mkdirSync(join(libDir, 'LICENSES'), { recursive: true });
for (const s of sources) {
  const dir = join(sourcesDir, s.id);
  for (const f of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'NOTICE']) {
    if (existsSync(join(dir, f))) cpSync(join(dir, f), join(libDir, 'LICENSES', `${s.id}-${f}`));
  }
}

const counts = (arr) => arr.reduce((acc, it) => ((acc[it.type] = (acc[it.type] || 0) + 1), acc), {});
const round = (v) => Math.round(v * 10) / 10;

const registry = {
  generatedAt: new Date().toISOString(),
  sources: sources.map((s) => ({ ...s, commit: lock[s.id]?.commit, counts: counts(items.filter((i) => i.source === s.id)) })),
  departments: DEPARTMENTS.map((d) => ({ ...d, counts: counts(items.filter((i) => i.dept === d.id)) })),
  counts: counts(items),
  items: items.map((it) => ({
    id: it.id,
    type: it.type,
    name: it.name,
    ...(it.title && it.title !== it.name ? { title: clean(it.title, 120) } : {}),
    source: it.source,
    dept: it.dept,
    description: it.description,
    url: it.url,
    lib: it.lib,
    ...(it.tools.length ? { tools: it.tools } : {}),
    ...(it.model ? { model: it.model } : {}),
    ...(it.tags.length ? { tags: it.tags } : {}),
  })),
};
writeFileSync(join(dataDir, 'registry.json'), JSON.stringify(registry));

const graph = {
  nodes: nodes.map((n, i) => ({ id: n.id, t: n.type, n: n.name, s: n.source, d: n.dept, deg: degree[i], p: [round(simNodes[i].x), round(simNodes[i].y), round(simNodes[i].z)] })),
  edges: edges.map((e) => [index.get(e.s), index.get(e.t), e.rel, e.conf === 'EXTRACTED' ? 1 : 0]),
};
writeFileSync(join(dataDir, 'graph.json'), JSON.stringify(graph));

// ---------------------------------------------------- markdown catalogue ---

const esc = (s) => String(s).replace(/\|/g, '\\|');
const row = (it) => `| [${esc(it.name)}](${it.lib}) | ${it.type} | ${sources.find((s) => s.id === it.source).short} | ${esc(clean(it.description, 160))} |`;
const TYPES = ['agent', 'skill', 'command', 'guide'];
const total = counts(items);

mkdirSync(join(libDir, 'departments'), { recursive: true });
for (const d of DEPARTMENTS) {
  const its = items.filter((i) => i.dept === d.id).sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.name.localeCompare(b.name));
  const lines = [`# ${d.emoji} ${d.name} — ${d.uz}`, '', `${its.length} items in this department.`, '', '| Name | Type | Source | What it does |', '|---|---|---|---|'];
  for (const it of its) lines.push(row({ ...it, lib: `../${it.lib}` }));
  writeFileSync(join(libDir, 'departments', `${d.id}.md`), lines.join('\n') + '\n');
}

const godNodes = graph.nodes.filter((n) => !['dept', 'source'].includes(n.t)).sort((a, b) => b.deg - a.deg).slice(0, 15);
const catalog = [
  '# 📚 AI Agent Office — Library Catalog',
  '',
  'Everything from the six upstream repositories, gathered into one place (Graphify-style).',
  'Barcha agentlar, skillar va buyruqlar bitta joyda jamlangan.',
  '',
  `**${total.agent || 0} agents · ${total.skill || 0} skills · ${total.command || 0} commands · ${total.guide || 0} guides** · ${edges.length} graph edges`,
  '',
  '## Sources',
  '',
  '| Source | Repo | License | Agents | Skills | Commands | Guides |',
  '|---|---|---|---|---|---|---|',
  ...registry.sources.map((s) => `| ${s.label} | [${s.repo}](https://github.com/${s.repo}) | ${s.license} | ${s.counts.agent || 0} | ${s.counts.skill || 0} | ${s.counts.command || 0} | ${s.counts.guide || 0} |`),
  '',
  '## Departments',
  '',
  '| Department | Agents | Skills | Commands |',
  '|---|---|---|---|',
  ...registry.departments.map((d) => `| [${d.emoji} ${d.name}](departments/${d.id}.md) — ${d.uz} | ${d.counts.agent || 0} | ${d.counts.skill || 0} | ${d.counts.command || 0} |`),
  '',
  '## Most connected ("god nodes")',
  '',
  ...godNodes.map((n) => `- **${n.n}** (${n.t}, ${sources.find((s) => s.id === n.s)?.short}) — ${n.deg} connections`),
  '',
  '## All agents',
  '',
  '| Name | Type | Source | What it does |',
  '|---|---|---|---|',
  ...items.filter((i) => i.type === 'agent').sort((a, b) => a.name.localeCompare(b.name)).map(row),
  '',
  'Skills, commands and guides are listed per department in [departments/](departments/).',
  '',
];
writeFileSync(join(libDir, 'CATALOG.md'), catalog.join('\n'));

writeFileSync(
  join(libDir, 'README.md'),
  [
    '# library/',
    '',
    'Generated by `npm run build:library` — do not edit by hand.',
    '',
    '- `agents/<source>/<name>.md` — subagent definitions (drop into `.claude/agents/`)',
    '- `skills/<source>/<name>/SKILL.md` — skills (drop into `.claude/skills/<name>/`)',
    '- `commands/<source>/<name>.md` — slash commands (drop into `.claude/commands/`)',
    '- `guides/<source>/<name>.md` — Claude Code best-practice guides',
    '- `departments/*.md`, `CATALOG.md` — index of everything',
    '- `LICENSES/` — upstream licenses. Every file keeps its original license and author.',
    '',
    'Skills are copied as their `SKILL.md` only. Use `npm run hire -- <id>` with `.sources/` present to install a skill with all of its scripts and references.',
    '',
  ].join('\n'),
);

const statSize = (p) => statSync(p).size;
console.log(`✓ ${items.length} items → library/ (${total.agent} agents, ${total.skill} skills, ${total.command} commands, ${total.guide || 0} guides)`);
console.log(`✓ registry.json ${(statSize(join(dataDir, 'registry.json')) / 1024).toFixed(0)} KB, graph.json ${(statSize(join(dataDir, 'graph.json')) / 1024).toFixed(0)} KB (${edges.length} edges)`);
console.log('  departments:', registry.departments.map((d) => `${d.id}=${d.counts.agent || 0}a/${d.counts.skill || 0}s`).join(' '));
