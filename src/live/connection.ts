// Talks to the local office server (server/index.mjs). Without a server the
// office stays in simulation mode and keeps retrying quietly.
import type { LiveEvent } from '../sim/director';

export type Status = 'offline' | 'connecting' | 'live';

export interface Health {
  ok: boolean;
  claude: boolean;
  projectDir: string;
  version: string;
  allowWrite: boolean;
}

export interface TaskEvent {
  type: 'task';
  id: string;
  phase: 'queued' | 'started' | 'progress' | 'tool' | 'done' | 'error';
  agentId?: string;
  text?: string;
  result?: string;
  mode?: 'claude' | 'simulated';
  cost?: number;
}

type ServerMessage = LiveEvent | TaskEvent | { type: 'hello'; health: Health };

export class Connection {
  status: Status = 'offline';
  health: Health | null = null;
  private token = '';
  private retry = 1000;
  private statusFns: ((s: Status) => void)[] = [];
  private eventFns: ((e: LiveEvent) => void)[] = [];
  private taskFns: ((e: TaskEvent) => void)[] = [];

  onStatus(fn: (s: Status) => void) {
    this.statusFns.push(fn);
  }
  onEvent(fn: (e: LiveEvent) => void) {
    this.eventFns.push(fn);
  }
  onTask(fn: (e: TaskEvent) => void) {
    this.taskFns.push(fn);
  }

  private setStatus(s: Status) {
    this.status = s;
    for (const fn of this.statusFns) fn(s);
  }

  async start() {
    this.setStatus('connecting');
    try {
      const res = await fetch('api/session', { headers: { Accept: 'application/json' } });
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(String(res.status));
      const body = await res.json();
      this.token = body.token;
      this.health = body.health;
      this.connect();
    } catch {
      this.setStatus('offline');
      setTimeout(() => this.start(), 15000);
    }
  }

  private connect() {
    const url = new URL('ws', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', this.token);
    const ws = new WebSocket(url);
    ws.onopen = () => {
      this.retry = 1000;
      this.setStatus('live');
    };
    ws.onmessage = (m) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(m.data);
      } catch {
        return;
      }
      if (msg.type === 'hook') for (const fn of this.eventFns) fn(msg);
      else if (msg.type === 'task') for (const fn of this.taskFns) fn(msg);
      else if (msg.type === 'hello') this.health = msg.health;
    };
    ws.onclose = () => {
      this.setStatus('offline');
      setTimeout(() => this.start(), (this.retry = Math.min(this.retry * 2, 15000)));
    };
  }

  private async post(path: string, body: unknown, signal?: AbortSignal) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': this.token },
      body: JSON.stringify(body),
      signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  dispatch(agentId: string, prompt: string): Promise<{ id: string; mode: 'claude' | 'simulated' }> {
    return this.post('api/tasks', { agentId, prompt });
  }

  hire(ids: string[], scope: 'project' | 'user'): Promise<{ installed: string[]; target: string }> {
    return this.post('api/hire', { ids, scope });
  }

  /** One agent answer from the Claude CLI on the office server. */
  ai(body: { system: string; prompt: string; tier: string; images: string[] }, signal?: AbortSignal): Promise<{ text: string; seconds: number; model?: string; truncated?: boolean }> {
    return this.post('api/ai', body, signal);
  }

  /** Save generated project files under workspaces/<id>/ and get a preview URL back. */
  saveWorkspace(id: string, files: Record<string, string>): Promise<{ id: string; url: string; dir: string }> {
    return this.post('api/workspaces', { id, files });
  }
}
