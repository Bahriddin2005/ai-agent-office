#!/usr/bin/env node
// Writes the data the office needs to run agents without the server:
//   public/data/teams.json    task teams (coder, content, ...) with validated members and skills
//   public/data/prompts.json  every agent's own instructions (frontmatter removed, trimmed)
// Needs only library/ and registry.json, so it also runs without .sources/.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TEAMS } from './lib/teams.mjs';

const root = resolve(import.meta.dirname, '..');
const dataDir = join(root, 'public', 'data');
const PROMPT_CHARS = 3500;

export function buildTeams() {
  const registry = JSON.parse(readFileSync(join(dataDir, 'registry.json'), 'utf8'));
  const byId = new Map(registry.items.map((i) => [i.id, i]));
  const teams = TEAMS.map((t) => {
    const members = t.members.filter(([id]) => byId.get(id)?.type === 'agent').map(([id, role]) => ({ id, role }));
    const skills = t.skills.filter((id) => byId.has(id));
    for (const [id] of t.members) if (byId.get(id)?.type !== 'agent') console.warn(`! team ${t.id}: unknown agent ${id}`);
    for (const id of t.skills) if (!byId.has(id)) console.warn(`! team ${t.id}: unknown skill ${id}`);
    return { ...t, members, skills };
  });
  writeFileSync(join(dataDir, 'teams.json'), JSON.stringify({ teams }));

  const prompts = {};
  for (const it of registry.items) {
    if (it.type !== 'agent') continue;
    const raw = readFileSync(join(root, 'library', it.lib), 'utf8');
    const body = raw.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    prompts[it.id] = body.length > PROMPT_CHARS ? body.slice(0, PROMPT_CHARS) + '\n…' : body;
  }
  writeFileSync(join(dataDir, 'prompts.json'), JSON.stringify(prompts));
  console.log(`✓ teams.json (${teams.length} teams), prompts.json (${Object.keys(prompts).length} agents)`);
}

if (import.meta.url === `file://${process.argv[1]}`) buildTeams();
