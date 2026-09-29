#!/usr/bin/env node
// AI Agent Office server (localhost only).
//  - POST /event          Claude Code hook payloads (Bearer token) -> WebSocket
//  - GET  /api/session    token + health for the page (same-origin only)
//  - POST /api/tasks      run a task with an office agent via the Claude CLI
//  - POST /api/hire       install agents/skills/commands into .claude/
//  - WS   /ws             live events for the 3D office
//  - serves dist/ when built (npm start)
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { hire, loadRegistry } from '../scripts/lib/hire.mjs';
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
const health = () => ({ ok: true, claude: dispatcher.claude, projectDir, version, allowWrite });

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
  if (!hostOk(req.headers.host) || !originOk(req.headers.origin)) return res.status(403).json({ error: 'forbidden' });
  next();
});
app.use(express.json({ limit: '2mb' }));

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
