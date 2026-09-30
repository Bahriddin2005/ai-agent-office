// Claude Code sessions for the Coder team. Every project gets its own folder
// (~/.ai-agent-office/code/<id>, outside any repository so no CLAUDE.md leaks
// in). The office installs the team there as project subagents
// (.claude/agents), the chosen library skills as project skills
// (.claude/skills) and the project rules as CLAUDE.md, then runs `claude -p`
// in that folder. Tools are fenced to the folder: Read/Glob/Grep/Write/Edit on
// ./** plus skills, subagents and a todo list — no shell, no web, and user
// settings (with their hooks) are not loaded.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';

const MODELS = { quick: 'haiku', default: 'sonnet', complex: 'opus' };
const FENCED = ['Read(./**)', 'Glob(./**)', 'Grep(./**)'];
const WRITE = ['Write(./**)', 'Edit(./**)', 'MultiEdit(./**)'];
const ALWAYS = ['Skill', 'Agent', 'Task', 'TodoWrite'];
const DENY = ['Bash', 'WebFetch', 'WebSearch', 'NotebookEdit'];
const SKIP_DIRS = new Set(['.claude', 'node_modules', '.git']);
const MAX_FILE = 400_000;
const MAX_TOTAL = 4_000_000;
const MAX_TURNS = { build: 90, work: 50, ask: 25 };

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'agent';
const stripFrontmatter = (s) => s.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

export class CodeRunner {
  /**
   * @param {{ root: string, lookup: (id: string) => any, models?: object, concurrency?: number, timeoutMs?: number, base?: string }} o
   */
  constructor({ root, lookup, models = {}, concurrency = 2, timeoutMs = 40 * 60_000, base = join(homedir(), '.ai-agent-office', 'code') }) {
    Object.assign(this, { root, lookup, concurrency, timeoutMs, base });
    this.models = { ...MODELS, ...models };
    this.running = 0;
    this.waiting = [];
    mkdirSync(base, { recursive: true, mode: 0o700 });
  }

  dirOf(id) {
    if (!/^[\w-]{1,64}$/.test(String(id))) throw bad('bad project id');
    return join(this.base, String(id));
  }

  /** Install the team, the skills and the rules into the project folder. */
  setup(dir, { agents = [], skills = [], rules = '', readOnly = false }) {
    const agentsDir = join(dir, '.claude', 'agents');
    rmSync(agentsDir, { recursive: true, force: true });
    mkdirSync(agentsDir, { recursive: true });
    const tools = readOnly ? 'Read, Glob, Grep, Skill' : 'Read, Glob, Grep, Write, Edit, MultiEdit, Skill';
    for (const a of agents.slice(0, 12)) {
      if (!a?.name || !a?.prompt) continue;
      const name = slug(a.name);
      const fm = ['---', `name: ${name}`, `description: ${JSON.stringify(String(a.description || name).slice(0, 400))}`, `tools: ${tools}`, '---', ''].join('\n');
      writeFileSync(join(agentsDir, `${name}.md`), fm + String(a.prompt).slice(0, 60_000) + '\n');
    }
    const installed = [];
    for (const id of skills.slice(0, 16)) {
      const it = this.lookup(String(id));
      if (!it || it.type !== 'skill' || !it.lib) continue;
      const src = join(this.root, 'library', it.lib);
      if (!existsSync(src)) continue;
      const dest = join(dir, '.claude', 'skills', slug(it.name), 'SKILL.md');
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(src, 'utf8'));
      installed.push(slug(it.name));
    }
    if (rules) writeFileSync(join(dir, 'CLAUDE.md'), String(rules).slice(0, 60_000));
    return installed;
  }

  /** The project's own files (text only, without the office's .claude folder). */
  files(dir) {
    const out = {};
    let total = 0;
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) walk(join(d, e.name));
          continue;
        }
        if (!e.isFile() || e.name === 'CLAUDE.md') continue;
        const p = join(d, e.name);
        const size = statSync(p).size;
        if (size > MAX_FILE || total + size > MAX_TOTAL) continue;
        const buf = readFileSync(p);
        if (buf.includes(0)) continue; // binary
        total += size;
        out[relative(dir, p).split(sep).join('/')] = buf.toString('utf8');
      }
    };
    if (existsSync(dir)) walk(dir);
    return out;
  }

  async slot() {
    if (this.running >= this.concurrency) await new Promise((r) => this.waiting.push(r));
    this.running++;
  }

  release() {
    this.running--;
    this.waiting.shift()?.();
  }

  /**
   * Run one Claude Code session in the project folder.
   * mode: build (write), work (answer or change files as asked), ask (read only).
   * `onEvent` gets what the team does as it happens.
   */
  async run({ id, prompt, system = '', agents = [], skills = [], rules = '', tier = 'default', mode = 'build' }, onEvent, signal) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw bad('prompt required');
    if (prompt.length > 300_000 || String(system).length > 100_000) throw bad('prompt too large', 413);
    if (!['build', 'work', 'ask'].includes(mode)) throw bad('bad mode');
    const dir = this.dirOf(id);
    mkdirSync(dir, { recursive: true });
    const readOnly = mode === 'ask';
    const installed = this.setup(dir, { agents, skills, rules, readOnly });
    onEvent({ type: 'setup', agents: agents.map((a) => slug(a.name)), skills: installed });

    await this.slot();
    const started = Date.now();
    try {
      const allowed = [...FENCED, ...(readOnly ? [] : WRITE), ...ALWAYS];
      const deny = [...DENY, ...(readOnly ? ['Write', 'Edit', 'MultiEdit'] : [])];
      const args = [
        '-p', prompt,
        '--append-system-prompt', system || 'You lead a small software team.',
        '--output-format', 'stream-json', '--verbose',
        '--setting-sources', 'project,local',
        '--model', this.models[tier] || this.models.default,
        '--max-turns', String(MAX_TURNS[mode]),
        '--allowedTools', allowed.join(','),
        '--disallowedTools', deny.join(','),
      ];
      return await new Promise((resolve, reject) => {
        const p = spawn('claude', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
        const timer = setTimeout(() => p.kill('SIGTERM'), this.timeoutMs);
        const stop = () => p.kill('SIGTERM');
        signal?.addEventListener('abort', stop);
        const agentsById = new Map();
        let buf = '';
        let err = '';
        let result = null;
        const handle = (msg) => {
          const parent = msg.parent_tool_use_id || null;
          if (msg.type === 'assistant') {
            for (const b of msg.message?.content || []) {
              if (b.type === 'text' && b.text?.trim()) onEvent({ type: 'text', text: b.text.trim().slice(0, 600), parent });
              if (b.type !== 'tool_use') continue;
              const inp = b.input || {};
              if (b.name === 'Agent' || b.name === 'Task') {
                agentsById.set(b.id, inp.subagent_type);
                onEvent({ type: 'agent', id: b.id, name: inp.subagent_type || 'general-purpose', description: String(inp.description || '').slice(0, 160), parent });
              } else if (b.name === 'Skill') onEvent({ type: 'skill', name: String(inp.skill || inp.command || ''), parent });
              else if (b.name === 'Write' || b.name === 'Edit' || b.name === 'MultiEdit') {
                const path = inp.file_path ? relative(dir, String(inp.file_path)).split(sep).join('/') : '';
                onEvent({ type: 'file', op: b.name, path, parent, content: b.name === 'Write' && /(^|\/)index\.html$/.test(path) ? String(inp.content || '') : undefined });
              } else if (b.name === 'TodoWrite') onEvent({ type: 'todo', todos: (inp.todos || []).slice(0, 20).map((t) => ({ text: String(t.content || '').slice(0, 120), status: t.status })), parent });
              else onEvent({ type: 'tool', name: b.name, what: String(inp.file_path || inp.pattern || inp.path || '').slice(0, 120), parent });
            }
          } else if (msg.type === 'user') {
            for (const b of msg.message?.content || []) {
              if (b.type !== 'tool_result' || !agentsById.has(b.tool_use_id)) continue;
              // A background subagent only reports that it started; it finishes with a task_notification.
              const txt = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '');
              if (/async agent launched/i.test(txt) && !b.is_error) continue;
              onEvent({ type: 'agent-done', id: b.tool_use_id, error: !!b.is_error });
            }
          } else if (msg.type === 'system' && msg.subtype === 'task_notification' && agentsById.has(msg.tool_use_id)) {
            onEvent({ type: 'agent-done', id: msg.tool_use_id, error: msg.status !== 'completed', summary: String(msg.summary || '').slice(0, 300) });
          } else if (msg.type === 'system' && msg.subtype === 'task_progress' && agentsById.has(msg.tool_use_id)) {
            onEvent({ type: 'agent-progress', id: msg.tool_use_id, text: String(msg.description || '').slice(0, 160), tool: msg.last_tool_name || '' });
          } else if (msg.type === 'result') result = msg; // the last one counts: background work can add turns
        };
        p.stdout.on('data', (c) => {
          buf += c;
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            try {
              handle(JSON.parse(line));
            } catch {
              /* not a JSON line */
            }
          }
        });
        p.stderr.on('data', (c) => (err = (err + c).slice(-4000)));
        p.on('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        p.on('close', (code) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', stop);
          // Out of turns still leaves real work on disk: hand it back as partial.
          const partial = !!result && /max_turns/.test(String(result.subtype || ''));
          if (!result || ((result.is_error || code !== 0) && !partial)) {
            return reject(Object.assign(new Error(result?.result || err.trim() || `claude exited with code ${code}`), { status: 502 }));
          }
          resolve({
            partial,
            text: result.result || '',
            files: this.files(dir),
            seconds: (Date.now() - started) / 1000,
            turns: result.num_turns,
            cost: result.total_cost_usd,
            denied: (result.permission_denials || []).length,
          });
        });
      });
    } finally {
      this.release();
    }
  }
}
