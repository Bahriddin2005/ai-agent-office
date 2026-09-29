#!/usr/bin/env node
// Hire agents / skills / commands from the office library into Claude Code.
//
//   npm run hire -- agent:ecc:code-reviewer             # by id
//   npm run hire -- code-reviewer security-reviewer     # by name
//   npm run hire -- --dept security --type agent        # a whole department
//   npm run hire -- --source hermes --type skill --list # preview only
//   options: --scope project|user  --project <dir>  --force  --no-skills
import { hire, loadRegistry } from './lib/hire.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const valued = new Set(['--scope', '--project', '--dept', '--source', '--type']);
const terms = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));

const reg = loadRegistry();
const dept = opt('dept');
const source = opt('source');
const type = opt('type');

let items = [];
for (const term of terms) {
  const byId = reg.byId.get(term);
  if (byId) {
    items.push(byId);
    continue;
  }
  const matches = reg.registry.items.filter((i) => i.name.toLowerCase() === term.toLowerCase() && (!type || i.type === type) && (!source || i.source === source));
  if (matches.length === 1) items.push(matches[0]);
  else if (!matches.length) {
    console.error(`✗ nothing called "${term}". Try: npm run hire -- --list --type agent`);
    process.exit(1);
  } else {
    console.error(`✗ "${term}" is ambiguous, use one of:\n${matches.map((m) => `   ${m.id}`).join('\n')}`);
    process.exit(1);
  }
}
if (!terms.length && (dept || source || type)) {
  items = reg.registry.items.filter((i) => (!dept || i.dept === dept) && (!source || i.source === source) && (!type || i.type === type));
}

if (flag('list') || !items.length) {
  const list = items.length ? items : reg.registry.items.filter((i) => (!dept || i.dept === dept) && (!source || i.source === source) && (!type || i.type === type));
  for (const i of list) console.log(`${i.id.padEnd(60)} ${i.description.slice(0, 70)}`);
  console.log(`\n${list.length} item(s). Install with: npm run hire -- <id> [--scope user]`);
  process.exit(0);
}

const res = hire(
  items.map((i) => i.id),
  { scope: opt('scope', 'project'), projectDir: opt('project', process.env.INIT_CWD || process.cwd()), force: flag('force'), withSkills: !flag('no-skills'), reg },
);
for (const p of res.installed) console.log(`✓ ${p}`);
for (const p of res.skipped) console.log(`• exists, skipped (use --force): ${p}`);
console.log(`\n${res.installed.length} installed into ${res.target}`);
