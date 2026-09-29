// Install ("hire") agents, skills and commands from library/ into a Claude
// Code config directory (<project>/.claude or ~/.claude). Shared by
// scripts/hire.mjs and the office server.
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..', '..');

export function loadRegistry() {
  const registry = JSON.parse(readFileSync(join(root, 'public', 'data', 'registry.json'), 'utf8'));
  const graph = JSON.parse(readFileSync(join(root, 'public', 'data', 'graph.json'), 'utf8'));
  return { registry, graph, byId: new Map(registry.items.map((i) => [i.id, i])) };
}

/** Skills an agent declares in its own frontmatter (EXTRACTED uses_skill edges). */
export function declaredSkills(id, { graph }) {
  const idx = graph.nodes.findIndex((n) => n.id === id);
  if (idx < 0) return [];
  return graph.edges.filter(([a, , rel, ex]) => a === idx && rel === 'uses_skill' && ex).map(([, b]) => graph.nodes[b].id);
}

const upstreamPath = (item) => decodeURIComponent(item.url.replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\//, ''));
const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

export function targetDir(scope, projectDir) {
  return scope === 'user' ? join(homedir(), '.claude') : join(resolve(projectDir || process.cwd()), '.claude');
}

/**
 * @returns {{ installed: string[], skipped: string[], target: string }}
 */
export function hire(ids, { scope = 'project', projectDir, sourcesDir = join(root, '.sources'), force = false, withSkills = true, reg = loadRegistry() } = {}) {
  const target = targetDir(scope, projectDir);
  const installed = [];
  const skipped = [];
  const queue = [...ids];
  const done = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (done.has(id)) continue;
    done.add(id);
    const item = reg.byId.get(id);
    if (!item) throw new Error(`unknown id: ${id}`);
    const lib = join(root, 'library', item.lib);
    if (!existsSync(lib)) throw new Error(`missing library file for ${id} — run npm run build:library`);
    let dest;
    if (item.type === 'agent') {
      dest = join(target, 'agents', `${safeName(item.name)}.md`);
      if (withSkills) queue.push(...declaredSkills(id, reg));
    } else if (item.type === 'skill') {
      dest = join(target, 'skills', safeName(item.name));
    } else if (item.type === 'command') {
      dest = join(target, 'commands', ...item.name.split(':').map(safeName)) + '.md';
    } else {
      dest = join(target, 'office-guides', `${safeName(item.name)}.md`);
    }
    if (existsSync(dest) && !force) {
      skipped.push(dest);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    if (item.type === 'skill') {
      // Prefer the full upstream skill folder (scripts, references) when .sources/ is present.
      const full = join(sourcesDir, item.source, dirname(upstreamPath(item)));
      if (existsSync(join(full, 'SKILL.md')) || existsSync(join(full, 'skill.md'))) {
        cpSync(full, dest, { recursive: true, filter: (p) => !/(^|\/)(node_modules|\.git)(\/|$)/.test(p) && statSync(p).size < 5_000_000 });
      } else {
        mkdirSync(dest, { recursive: true });
        writeFileSync(join(dest, 'SKILL.md'), readFileSync(lib));
      }
    } else {
      writeFileSync(dest, readFileSync(lib));
    }
    installed.push(dest);
  }
  return { installed, skipped, target };
}
