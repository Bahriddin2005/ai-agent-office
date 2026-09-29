// Runs an office task with the Claude Code CLI, using the chosen agent's own
// definition as the system prompt, and streams progress to the office.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const READ_ONLY = ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'];

export function claudeAvailable() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  return r.status === 0 && !!r.stdout.trim();
}

const stripFrontmatter = (s) => s.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

export class Dispatcher {
  constructor({ root, projectDir, allowWrite = false, maxTurns = 12, model, concurrency = 2, broadcast }) {
    Object.assign(this, { root, projectDir, allowWrite, maxTurns, model, concurrency, broadcast });
    this.tasks = [];
    this.running = 0;
    this.queue = [];
    this.claude = claudeAvailable();
  }

  list() {
    return this.tasks.map(({ proc, ...t }) => t);
  }

  submit(item, prompt) {
    const task = { id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, agentId: item.id, agentName: item.name, prompt, status: 'queued', output: '', createdAt: Date.now() };
    this.tasks.unshift(task);
    this.tasks.length = Math.min(this.tasks.length, 100);
    this.queue.push({ task, item });
    this.emit(task, 'queued');
    this.pump();
    return task;
  }

  emit(task, phase, extra = {}) {
    this.broadcast({ type: 'task', id: task.id, agentId: task.agentId, phase, mode: 'claude', ...extra });
  }

  pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const { task, item } = this.queue.shift();
      this.running++;
      this.run(task, item).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  run(task, item) {
    return new Promise((resolve) => {
      let body = '';
      try {
        body = stripFrontmatter(readFileSync(join(this.root, 'library', item.lib), 'utf8'));
      } catch {
        body = item.description;
      }
      const system = [
        `You are "${item.name}", a specialist agent working in the AI Agent Office.`,
        `Your role: ${item.description}`,
        'Answer the task directly and finish with a short summary of what you did or found.',
        '',
        body.slice(0, 90_000),
      ].join('\n');
      const tools = this.allowWrite && item.tools?.length ? item.tools : READ_ONLY;
      const args = ['-p', task.prompt, '--append-system-prompt', system, '--output-format', 'stream-json', '--verbose', '--max-turns', String(this.maxTurns), '--allowedTools', tools.join(',')];
      if (!this.allowWrite) args.push('--disallowedTools', 'Bash,Edit,Write,NotebookEdit,MultiEdit');
      if (this.model) args.push('--model', this.model);

      task.status = 'running';
      task.startedAt = Date.now();
      this.emit(task, 'started', { text: item.name });
      const proc = spawn('claude', args, { cwd: this.projectDir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      let stderr = '';
      let result = null;
      proc.stdout.on('data', (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === 'assistant') {
            for (const block of msg.message?.content || []) {
              if (block.type === 'text' && block.text?.trim()) this.emit(task, 'progress', { text: block.text.trim().slice(0, 160) });
              if (block.type === 'tool_use') {
                const inp = block.input || {};
                const what = inp.file_path || inp.pattern || inp.url || inp.query || inp.path || inp.description || '';
                this.emit(task, 'tool', { text: `🔧 ${block.name}${what ? ': ' + String(what).slice(0, 80) : ''}` });
              }
            }
          } else if (msg.type === 'result') {
            result = msg;
          }
        }
      });
      proc.stderr.on('data', (c) => (stderr = (stderr + c).slice(-4000)));
      proc.on('error', (err) => {
        task.status = 'error';
        task.output = String(err.message || err);
        this.emit(task, 'error', { result: task.output });
        resolve();
      });
      proc.on('close', (code) => {
        if (task.status === 'error') return resolve();
        const ok = result && !result.is_error && code === 0;
        task.status = ok ? 'done' : 'error';
        task.output = result?.result || stderr.trim() || `claude exited with code ${code}`;
        task.cost = result?.total_cost_usd;
        this.emit(task, ok ? 'done' : 'error', { result: task.output, cost: task.cost });
        resolve();
      });
    });
  }
}
