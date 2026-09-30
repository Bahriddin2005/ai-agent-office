// One agent answer through the Claude Code CLI: the agent's instructions as
// the system prompt, no tools (or only Read, to look at uploaded screenshots;
// WebSearch/WebFetch for internet research steps), run from an empty folder so
// no project CLAUDE.md leaks in.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_MODELS = { quick: 'haiku', default: 'sonnet', complex: 'opus' };
const DEFAULT_THINKING = { quick: 0, default: 4000, complex: 12000 };
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export class AiRunner {
  constructor({ concurrency = 3, models = {}, thinking = {}, timeoutMs = 15 * 60_000 } = {}) {
    this.models = { ...DEFAULT_MODELS, ...models };
    this.thinking = { ...DEFAULT_THINKING, ...thinking };
    this.concurrency = concurrency;
    this.timeoutMs = timeoutMs;
    this.running = 0;
    this.waiting = [];
    this.base = join(tmpdir(), 'ai-agent-office-run');
    mkdirSync(this.base, { recursive: true });
  }

  async slot() {
    if (this.running < this.concurrency) {
      this.running++;
      return;
    }
    await new Promise((r) => this.waiting.push(r));
    this.running++;
  }

  release() {
    this.running--;
    this.waiting.shift()?.();
  }

  /** @returns {Promise<{text: string, seconds: number, model?: string}>} */
  async run({ system = '', prompt, tier = 'default', images = [], web = false }) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw Object.assign(new Error('prompt required'), { status: 400 });
    if (prompt.length > 400_000 || String(system).length > 100_000) throw Object.assign(new Error('prompt too large'), { status: 413 });
    if (!Array.isArray(images) || images.length > MAX_IMAGES) throw Object.assign(new Error(`at most ${MAX_IMAGES} images`), { status: 400 });

    await this.slot();
    if (process.env.OFFICE_DEBUG_AI) writeFileSync(join(this.base, 'last-request.json'), JSON.stringify({ system, prompt, tier }, null, 1));
    const dir = mkdtempSync(join(this.base, 'job-'));
    try {
      const paths = images.map((url, i) => {
        const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(url));
        if (!m || !IMAGE_TYPES[m[1]]) throw Object.assign(new Error('images must be PNG, JPEG, WebP or GIF data URLs'), { status: 400 });
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('image too large'), { status: 413 });
        const p = join(dir, `screenshot-${i + 1}.${IMAGE_TYPES[m[1]]}`);
        writeFileSync(p, buf);
        return p;
      });
      let fullPrompt = prompt;
      const args = ['--system-prompt', system || 'You are a helpful agent.', '--no-session-persistence', '--output-format', 'json', '--model', this.models[tier] || this.models.default];
      // Chat should come back in seconds: no extended thinking on the quick tier,
      // and a bounded budget elsewhere so a crew step never thinks for minutes.
      const thinking = this.thinking[tier] ?? this.thinking.default;
      // Read-only tools only: Read for screenshots, web search and fetch for research.
      const tools = [...(paths.length ? ['Read'] : []), ...(web ? ['WebSearch', 'WebFetch'] : [])];
      if (paths.length) fullPrompt += `\n\nThe images are saved as files. Open every one with the Read tool before answering:\n${paths.map((p) => `- ${p}`).join('\n')}`;
      if (tools.length) args.push('--tools', tools.join(','), '--allowedTools', tools.join(','), '--max-turns', web ? '16' : '10');
      else args.push('--tools', '');
      return await this.spawn(['-p', fullPrompt, ...args], dir, { MAX_THINKING_TOKENS: String(thinking) });
    } finally {
      rmSync(dir, { recursive: true, force: true });
      this.release();
    }
  }

  spawn(args, cwd, env = {}) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const p = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
      let out = '';
      let err = '';
      const timer = setTimeout(() => p.kill('SIGTERM'), this.timeoutMs);
      p.stdout.on('data', (c) => (out += c));
      p.stderr.on('data', (c) => (err = (err + c).slice(-4000)));
      p.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      p.on('close', (code) => {
        clearTimeout(timer);
        let j = null;
        try {
          j = JSON.parse(out);
        } catch {
          /* not JSON */
        }
        if (!j || j.is_error || code !== 0) {
          return reject(Object.assign(new Error(j?.result || err.trim() || `claude exited with code ${code}`), { status: 502 }));
        }
        resolve({ text: j.result || '', seconds: (Date.now() - started) / 1000, model: Object.keys(j.modelUsage || {})[0], truncated: j.stop_reason === 'max_tokens' });
      });
    });
  }
}
