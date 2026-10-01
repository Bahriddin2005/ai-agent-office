#!/usr/bin/env node
// AI Agent Office server (localhost only).
//  - POST /event          Claude Code hook payloads (Bearer token) -> WebSocket
//  - GET  /api/session    token + health for the page (same-origin only)
//  - POST /api/tasks      run a task with an office agent via the Claude CLI
//  - POST /api/hire       install agents/skills/commands into .claude/
//  - POST /api/ai         one agent answer (chat and multi-agent crews)
//  - POST /api/code       the Coder team in a Claude Code session (NDJSON stream)
//  - POST /api/workspaces save a project the Coder team built; served at /workspaces/
//  - WS   /ws             live events for the 3D office
//  - serves dist/ when built (npm start)
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { hire, loadRegistry } from '../scripts/lib/hire.mjs';
import { AiRunner } from './ai.mjs';
import { CodeRunner } from './code.mjs';
import { Dispatcher } from './dispatch.mjs';

const root = resolve(import.meta.dirname, '..');
const configPath = join(root, 'office.config.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const PORT = Number(process.env.OFFICE_PORT || config.port || 3334);
const HOST = process.env.OFFICE_HOST || '127.0.0.1';
const projectDir = resolve(process.env.OFFICE_PROJECT_DIR || config.projectDir || process.cwd());
const allowWrite = process.env.OFFICE_ALLOW_WRITE === '1' || config.allowWrite === true;
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

// Shared secret for hooks and the page. Stored with 0600 permissions.
const tokenDir = join(homedir(), '.ai-agent-office');
const tokenFile = join(tokenDir, 'token');
mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
let token = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '';
if (!token) {
  token = randomBytes(24).toString('hex');
  writeFileSync(tokenFile, token, { mode: 0o600 });
}

let reg = loadRegistry();
const clients = new Set();
const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === 1) ws.send(data);
};
const dispatcher = new Dispatcher({ root, projectDir, allowWrite, maxTurns: config.maxTurns || 12, model: config.model, concurrency: config.concurrency || 2, broadcast });
const ai = new AiRunner({ concurrency: config.aiConcurrency || 3, models: config.models || {}, thinking: config.thinking || {} });
const code = new CodeRunner({ root, lookup: (id) => reg.byId.get(id), models: config.models || {}, concurrency: config.codeConcurrency || 2 });
const health = () => ({ ok: true, claude: dispatcher.claude, code: dispatcher.claude && config.claudeCode !== false, projectDir, version, allowWrite });

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const hostOk = (host = '') => LOCAL.has(host.replace(/:\d+$/, '')) || host === `${HOST}:${PORT}`;
const originOk = (origin) => {
  if (!origin) return true;
  try {
    return LOCAL.has(new URL(origin).hostname);
  } catch {
    return false;
  }
};

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  // DNS-rebinding and cross-site protection: local host names and origins only.
  // Built sites run in an opaque sandbox (Origin: null) and may only read their own static files.
  const sandboxedRead = req.path.startsWith('/workspaces/') && (req.method === 'GET' || req.method === 'HEAD') && req.headers.origin === 'null';
  if (!hostOk(req.headers.host) || (!sandboxedRead && !originOk(req.headers.origin))) {
    if (req.path.startsWith('/workspaces/')) return res.status(403).type('text').send('forbidden');
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
});
app.use(express.json({ limit: '40mb' }));

const needToken = (req, res, next) => {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.headers['x-office-token'];
  if (auth !== token) return res.status(401).json({ error: 'unauthorized' });
  next();
};

// ---------------------------------------------------------------- hooks ---
const clip = (s, n = 200) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n - 1) + '…' : s) : undefined);
function normalize(p) {
  const event = p.hook_event_name;
  if (!event) return null;
  const out = { type: 'hook', event, session: clip(p.session_id, 8), project: p.cwd ? basename(p.cwd) : undefined };
  if (event === 'PreToolUse' || event === 'PostToolUse') {
    const inp = p.tool_input || {};
    let tool = p.tool_name || 'tool';
    out.toolUseId = p.tool_use_id;
    if (tool === 'Task' || tool === 'Agent') {
      out.agent = inp.subagent_type || 'general-purpose';
      out.summary = clip(inp.description || String(inp.prompt || '').split('\n')[0], 160);
    } else if (tool === 'Skill') {
      out.skill = inp.skill || inp.name || inp.command;
    } else {
      if (tool.startsWith('mcp__')) tool = `MCP ${tool.slice(5).replace('__', '/')}`;
      out.summary = clip(inp.command || inp.file_path || inp.pattern || inp.url || inp.query || inp.description || inp.path || inp.notebook_path, 120);
    }
    out.tool = tool;
  } else if (event === 'UserPromptSubmit') out.summary = clip(p.prompt, 200);
  else if (event === 'Notification') out.summary = clip(p.message, 160);
  else if (event === 'SubagentStop') out.agent = p.agent_type || p.subagent_type;
  return out;
}

app.post('/event', needToken, (req, res) => {
  const evt = normalize(req.body || {});
  if (evt) broadcast(evt);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ api ---
app.get('/api/health', (_req, res) => res.json(health()));
// No CORS headers are ever sent, so only the office page itself can read this.
app.get('/api/session', (_req, res) => res.json({ token, health: health() }));
app.get('/api/tasks', needToken, (_req, res) => res.json({ tasks: dispatcher.list() }));

app.post('/api/tasks', needToken, (req, res) => {
  const { agentId, prompt } = req.body || {};
  const item = reg.byId.get(agentId);
  if (!item || item.type !== 'agent') return res.status(400).json({ error: 'unknown agent' });
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) return res.status(400).json({ error: 'bad prompt' });
  if (!dispatcher.claude) return res.status(503).json({ error: 'Claude Code CLI (claude) not found on PATH — task simulated' });
  const task = dispatcher.submit(item, prompt.trim());
  res.json({ id: task.id, mode: 'claude' });
});

app.post('/api/hire', needToken, (req, res) => {
  const { ids, scope } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || ids.length > 200) return res.status(400).json({ error: 'ids required' });
  try {
    reg = loadRegistry();
    const out = hire(ids.map(String), { scope: scope === 'user' ? 'user' : 'project', projectDir, reg });
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// One agent answer (chat, crews). Screenshots arrive as data URLs.
app.post('/api/ai', needToken, async (req, res) => {
  if (!dispatcher.claude) return res.status(503).json({ error: 'Claude Code CLI (claude) not found on PATH' });
  try {
    const { system, prompt, tier, images } = req.body || {};
    // Internet research steps may search and read the web; `"allowWeb": false` in office.config.json turns it off.
    const web = req.body?.web === true && config.allowWeb !== false;
    const out = await ai.run({ system: String(system || ''), prompt, tier: ['quick', 'default', 'complex'].includes(tier) ? tier : 'default', images: images || [], web });
    console.log(`[ai] ${tier || 'default'} ${out.model || ''} ${out.seconds.toFixed(1)}s${images?.length ? ` +${images.length} image(s)` : ''}${web ? ' +web' : ''}`);
    res.json(out);
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
});

// The Coder team working in Claude Code: one session in the project's own
// folder, streamed back as NDJSON (one event per line, then the result).
app.post('/api/code', needToken, async (req, res) => {
  if (!dispatcher.claude || config.claudeCode === false) return res.status(503).json({ error: 'Claude Code is not available' });
  const body = req.body || {};
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (o) => res.write(JSON.stringify(o) + '\n');
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  try {
    const out = await code.run({ id: body.id, prompt: body.prompt, system: body.system, agents: Array.isArray(body.agents) ? body.agents : [], skills: Array.isArray(body.skills) ? body.skills : [], rules: body.rules, tier: body.tier, mode: body.mode }, send, ctrl.signal);
    console.log(`[code] ${body.mode || 'build'} ${body.id} ${out.seconds.toFixed(0)}s ${out.turns} turns ${Object.keys(out.files).length} files${out.denied ? ` ${out.denied} denied` : ''}`);
    send({ type: 'done', ...out });
  } catch (err) {
    send({ type: 'error', status: err.status || 500, error: String(err.message || err) });
  }
  res.end();
});

// Projects built by the Coder team: saved under workspaces/<id>/ and served
// back in an opaque sandbox so their scripts can never reach the office API.
const workspaces = join(root, 'workspaces');
app.post('/api/workspaces', needToken, (req, res) => {
  const { id, files } = req.body || {};
  if (!/^[\w-]{1,64}$/.test(String(id)) || !files || typeof files !== 'object') return res.status(400).json({ error: 'id and files required' });
  const dir = join(workspaces, id);
  for (const [name, content] of Object.entries(files)) {
    // Dotfiles such as .env.example or .gitignore are fine; parent paths and .claude/ are not.
    if (!/^[\w.][\w./-]{0,160}$/.test(name) || name.split('/').some((p) => p === '..' || p === '.') || name.startsWith('.claude') || typeof content !== 'string') return res.status(400).json({ error: `bad file: ${name}` });
    const dest = join(dir, name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
  const entry = files['public/index.html'] ? 'public/index.html' : 'index.html';
  res.json({ id, url: `workspaces/${id}/${entry}`, dir });
});
app.use(
  '/workspaces',
  (_req, res, next) => {
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-modals allow-popups');
    next();
  },
  express.static(workspaces),
);

// --------------------------------------------------------------- static ---
const dist = join(root, 'dist');
if (existsSync(join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
} else {
  app.use('/library', express.static(join(root, 'library')));
  app.get('/', (_req, res) => res.type('text').send('AI Agent Office server is running. Open the Vite dev server (npm run dev -> http://localhost:3333) or build with npm run build.'));
}

// ------------------------------------------------------------ websocket ---
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws' || url.searchParams.get('token') !== token || !hostOk(req.headers.host) || !originOk(req.headers.origin)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'hello', health: health() }));
    ws.on('close', () => clients.delete(ws));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`🏢 AI Agent Office server on http://${HOST}:${PORT}`);
  console.log(`   project dir: ${projectDir}${allowWrite ? ' (agents may edit files)' : ' (read-only agents)'}`);
  console.log(`   Claude CLI: ${dispatcher.claude ? 'found — tasks run for real' : 'not found — tasks are simulated'}`);
  if (existsSync(join(dist, 'index.html'))) console.log(`   office UI: http://localhost:${PORT}`);
});
