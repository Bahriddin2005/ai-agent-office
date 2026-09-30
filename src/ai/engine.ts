// Where agent answers come from:
//  - "server": the local office server runs the Claude Code CLI (npm run dev)
//  - "claude": inside claude.ai the page asks Claude through the `sample` capability
//  - "none":   neither is available; crews fall back to a clearly marked simulation
import type { Connection } from '../live/connection';

export type Tier = 'quick' | 'default' | 'complex';

export interface AskOptions {
  /** The agent's instructions. Sent as the system prompt (server) or a leading block (claude.ai). */
  system?: string;
  tier?: Tier;
  images?: Blob[];
  signal?: AbortSignal;
  onText?: (text: string) => void;
  /** allow web search and page reading (office server only) */
  web?: boolean;
}

export interface AskResult {
  text: string;
  truncated: boolean;
}

export interface Engine {
  kind: 'server' | 'claude' | 'none';
  images: boolean;
  ask(prompt: string, opts?: AskOptions): Promise<AskResult>;
}

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly partial?: string,
  ) {
    super(message);
  }
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

class ServerEngine implements Engine {
  kind = 'server' as const;
  images = true;
  constructor(private conn: Connection) {}
  async ask(prompt: string, o: AskOptions = {}): Promise<AskResult> {
    const images = o.images?.length ? await Promise.all(o.images.map(blobToDataUrl)) : [];
    const res = await this.conn.ai({ system: o.system || '', prompt, tier: o.tier || 'default', images, web: !!o.web }, o.signal);
    o.onText?.(res.text);
    return { text: res.text, truncated: !!res.truncated };
  }
}

type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string; truncated: boolean }>) & {
  limits?: () => Promise<{ images?: { maxCount: number; mediaTypes: string[] } }>;
};

class SampleEngine implements Engine {
  kind = 'claude' as const;
  images = false;
  maxImages = 0;
  constructor(private sample: SampleFn) {}
  async init() {
    try {
      const lim = await this.sample.limits?.();
      this.maxImages = lim?.images?.maxCount || 0;
      this.images = this.maxImages > 0;
    } catch {
      this.images = false;
    }
    return this;
  }
  async ask(prompt: string, o: AskOptions = {}): Promise<AskResult> {
    const input = o.system ? `${o.system}\n\n=====\n\n${prompt}` : prompt;
    const opts: Record<string, unknown> = { modelTier: o.tier || 'default', cache: false };
    if (o.signal) opts.signal = o.signal;
    if (o.onText) opts.onText = ({ text }: { text: string }) => o.onText!(text);
    if (o.images?.length && this.images) opts.images = o.images.slice(0, this.maxImages);
    try {
      const r = await this.sample(input, opts);
      return { text: r.text, truncated: !!r.truncated };
    } catch (e) {
      const err = e as { code?: string; message?: string; text?: string };
      throw new EngineError(err.code || 'upstream_error', err.message || 'Claude request failed', err.text);
    }
  }
}

class NoEngine implements Engine {
  kind = 'none' as const;
  images = false;
  async ask(): Promise<AskResult> {
    throw new EngineError('no_engine', 'No AI engine available');
  }
}

/** Server when the office server has the Claude CLI, else claude.ai sampling, else none. */
export async function pickEngine(conn: Connection): Promise<Engine> {
  if (conn.status === 'live' && conn.health?.claude) return new ServerEngine(conn);
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (c?.use) {
    try {
      const sample = (await c.use('sample')) as SampleFn | null;
      if (sample) return new SampleEngine(sample).init();
    } catch {
      /* not available in this view */
    }
  }
  return new NoEngine();
}

/** Read one JSON value from a model reply (whole text, a fenced block, or first bracket to last). */
export function parseJson<T = unknown>(text: string): T {
  const tries = [text.trim()];
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(text);
  if (fence) tries.push(fence[1].trim());
  const first = text.search(/[[{]/);
  const last = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (first >= 0 && last > first) tries.push(text.slice(first, last + 1));
  for (const t of tries) {
    try {
      return JSON.parse(t) as T;
    } catch {
      /* next */
    }
  }
  throw new EngineError('invalid_json', 'Reply was not valid JSON', text);
}

export interface CodeFile {
  name: string;
  lang: string;
  content: string;
}

/** Pull fenced code blocks out of a reply; a preceding "FILE: name" line names the file. */
export function extractFiles(text: string): CodeFile[] {
  const out: CodeFile[] = [];
  const re = /(?:^|\n)(?:[#*\s]*FILE:\s*`?([\w./-]+)`?\s*\n)?```([\w+-]*)[^\n]*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ name: m[1] || '', lang: (m[2] || '').toLowerCase(), content: m[3] });
  return out;
}

/** The HTML document in a reply, repairing a reply that was cut off before its closing fence. */
export function extractHtml(text: string): { html: string; repaired: boolean } | null {
  const files = extractFiles(text);
  const f = files.find((x) => x.lang === 'html' || /\.html?$/.test(x.name)) || files.find((x) => /<html|<!doctype/i.test(x.content));
  if (f) return { html: f.content, repaired: false };
  const start = text.search(/<!doctype html|<html/i);
  if (start < 0) return null;
  let html = text.slice(start).replace(/```\s*$/, '');
  let repaired = false;
  if (!/<\/html>\s*$/i.test(html)) {
    if (/<script(?![\s\S]*<\/script>)/i.test(html)) html += '\n</script>';
    html += '\n</body></html>';
    repaired = true;
  }
  return { html, repaired };
}
