#!/usr/bin/env node
// Register the office hook in Claude Code settings so every session shows up
// live in the 3D office.
//   npm run hooks:install                    -> ~/.claude/settings.json
//   npm run hooks:install -- --project <dir> -> <dir>/.claude/settings.json
//   npm run hooks:install -- --remove        -> take it out again
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const pi = args.indexOf('--project');
const settingsPath = pi >= 0 ? join(resolve(args[pi + 1]), '.claude', 'settings.json') : join(homedir(), '.claude', 'settings.json');
const remove = args.includes('--remove');
const hookScript = resolve(import.meta.dirname, '..', 'hooks', 'office-hook.mjs');
const command = `node "${hookScript}"`;
const EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'SessionStart', 'SessionEnd', 'Notification'];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse']);

let settings = {};
if (existsSync(settingsPath)) {
  settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  copyFileSync(settingsPath, `${settingsPath}.bak-${Date.now()}`);
}
settings.hooks ||= {};
const isOurs = (h) => typeof h?.command === 'string' && h.command.includes('office-hook.mjs');

for (const ev of EVENTS) {
  const groups = (settings.hooks[ev] || [])
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length);
  if (!remove) groups.push({ ...(TOOL_EVENTS.has(ev) ? { matcher: '*' } : {}), hooks: [{ type: 'command', command, timeout: 5 }] });
  if (groups.length) settings.hooks[ev] = groups;
  else delete settings.hooks[ev];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;

mkdirSync(dirname(settingsPath), { recursive: true });
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`${remove ? '✓ removed office hooks from' : '✓ office hooks installed in'} ${settingsPath}`);
if (!remove) console.log('  Start the office (npm run dev) and use Claude Code as usual — agents will light up live.');
