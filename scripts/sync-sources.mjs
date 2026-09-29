#!/usr/bin/env node
// Clone (or fast-forward) every upstream repo listed in sources.json into
// .sources/<id>. Pass --dir <path> or SOURCES_DIR to use another location.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dirFlag = args.indexOf('--dir');
const sourcesDir = resolve(dirFlag >= 0 ? args[dirFlag + 1] : process.env.SOURCES_DIR || join(root, '.sources'));
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--dir');

const { sources } = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8'));
mkdirSync(sourcesDir, { recursive: true });

const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const lock = {};

for (const s of sources) {
  if (only.length && !only.includes(s.id)) continue;
  const dest = join(sourcesDir, s.id);
  const url = `https://github.com/${s.repo}.git`;
  if (existsSync(join(dest, '.git'))) {
    console.log(`↻ ${s.id}: updating ${url}`);
    git(dest, 'fetch', '--depth', '1', 'origin', s.branch);
    git(dest, 'reset', '--hard', 'FETCH_HEAD');
  } else {
    console.log(`⤓ ${s.id}: cloning ${url}`);
    git(sourcesDir, 'clone', '--depth', '1', '--branch', s.branch, url, s.id);
  }
  lock[s.id] = { repo: s.repo, branch: s.branch, commit: git(dest, 'rev-parse', 'HEAD') };
}

const lockPath = join(root, 'sources.lock.json');
const prev = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : {};
writeFileSync(lockPath, JSON.stringify({ ...prev, ...lock }, null, 2) + '\n');
console.log(`✓ ${Object.keys(lock).length} source(s) ready in ${sourcesDir}`);
console.log('  next: npm run build:library' + (dirFlag >= 0 || process.env.SOURCES_DIR ? ` -- --dir ${sourcesDir}` : ''));
