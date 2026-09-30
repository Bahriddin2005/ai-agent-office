// Multi-agent crews. A message from the user becomes one of:
//   chat     — a few agents answer in character ("salom hammaga")
//   website  — Coder team: questions -> plan -> database -> backend | frontend -> QA -> (fix) -> summary
//   project  — a whole product from zero (e.g. "maktabni avtomatlashtir"): interview ->
//              plan -> your approval -> database, backend, web app, MCP server, bot -> QA -> summary
//   content  — Content team: screenshot analysis -> strategy + plan -> ready posts -> summary
//   task     — best team for the job: lead plans -> specialist delivers -> reviewer checks
// A finished site can be revised: the user marks elements on the preview and
// says what to change, the frontend engineer delivers a new version.
// Every step is a real agent call through the Engine, using that agent's own
// instructions (plus what it learned in Claude Academy).
import type { Item, OfficeData } from '../data';
import { currentLang } from '../i18n';
import type { Router } from '../router';
import { EngineError, extractFiles, extractHtml, parseJson, type Engine, type Tier } from './engine';
import { SkillBook } from './skills';

export type CrewKind = 'chat' | 'website' | 'project' | 'content' | 'task';
type L = { uz: string; en: string };

export interface Team {
  id: string;
  emoji: string;
  color: string;
  name: L;
  best: L;
  keywords: string;
  members: { id: string; role: L }[];
  skills: string[];
  test: string;
}

export interface Bench {
  team: string;
  agentId: string;
  model: string;
  seconds: number;
  ok: boolean;
  score: number | null;
  verdict: string;
  words: number;
  answer: string;
}

export interface Step {
  key: string;
  agentId: string;
  label: L;
  status: 'wait' | 'run' | 'done' | 'error' | 'skip';
  seconds?: number;
  live?: string;
  output?: string;
  /** library skills the agent was given for this step */
  skills?: string[];
  /** the step may search and read the web (Agent Reach skills) */
  web?: boolean;
}

export interface ChatMsg {
  from: 'user' | 'system' | string;
  text: string;
  time: number;
  runId?: string;
  images?: string[];
  action?: { label: string; runId: string; retry?: boolean };
  /** this message carries a question card for the run's pending input */
  ask?: boolean;
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  guess?: string;
  multi?: boolean;
}

export type Pending =
  | { kind: 'questions'; understanding: string; confidence?: number; questions: Question[] }
  | { kind: 'approval'; plan: Record<string, unknown> };

/** Something the user marked on the preview. */
export interface Mark {
  n: number;
  kind: 'element' | 'area';
  selector?: string;
  tag?: string;
  text?: string;
  html?: string;
  note?: string;
}

export interface Version {
  n: number;
  html: string;
  note: string;
  at: number;
  check?: { summary?: string; done?: { item: string; ok: boolean }[] };
}

export interface WebsiteResult {
  kind: 'website';
  /** a whole product (web app + API + MCP server / bot) rather than one site */
  project?: boolean;
  deliverables?: string[];
  plan: Record<string, unknown>;
  files: Record<string, string>;
  html: string;
  previewUrl?: string;
  workspaceDir?: string;
  qa?: { score?: number; checks?: { name: string; ok: boolean; note?: string }[]; issues?: { severity: string; note: string }[]; summary?: string };
  summary: string;
  notes: string[];
  /** earlier versions (v1 first); the current one is `html` */
  versions: Version[];
  /** still being tested / finished */
  partial?: boolean;
}

export interface ContentResult {
  kind: 'content';
  analysis: Record<string, unknown>;
  strategy: Record<string, unknown>;
  posts: Record<string, unknown>[];
  summary: string;
}

export interface TaskResult {
  kind: 'task';
  plan?: Record<string, unknown>;
  answer: string;
  review?: { score?: number; strengths?: string[]; improvements?: string[] };
}

export interface CrewRun {
  id: string;
  kind: CrewKind;
  title: string;
  prompt: string;
  images: Blob[];
  imageUrls: string[];
  teamId: string;
  steps: Step[];
  status: 'running' | 'waiting' | 'done' | 'error';
  startedAt: number;
  finishedAt?: number;
  engine: Engine['kind'];
  result: WebsiteResult | ContentResult | TaskResult | null;
  error?: string;
  /** input the crew is waiting for */
  pending?: Pending;
  answers?: Record<string, string>;
  approved?: boolean;
  /** what the user asked to change in the plan */
  planNotes?: string[];
  /** finished step outputs: a retry skips them */
  cache: Record<string, string>;
  pinned?: string;
}

export interface CrewHooks {
  stepStart(run: CrewRun, step: Step): void;
  stepEnd(run: CrewRun, step: Step, next?: Step): void;
  message(msg: ChatMsg): void;
  changed(run?: CrewRun): void;
  done(run: CrewRun): void;
  /** the first version of a site is ready (tests may still be running) */
  preview?(run: CrewRun): void;
  /** the crew needs the user (questions or plan approval) */
  ask?(run: CrewRun): void;
  saveWorkspace?(id: string, files: Record<string, string>): Promise<{ url: string; dir: string } | null>;
}

const lang = () => currentLang();
const tr = (l: L) => l[lang()];
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Everything the user reads comes back in Uzbek when the office is in Uzbek. */
export const languageRule = () =>
  lang() === 'uz'
    ? 'LANGUAGE: the user speaks Uzbek. Write everything the user will read (answers, reports, questions, UI text of sites and apps, bot messages) in Uzbek, Latin script, with correct oʻ/gʻ letters — even if parts of the request are in another language. Code identifiers stay in English.'
    : 'LANGUAGE: write everything the user will read in the same language as the user request (if it is Uzbek, use Uzbek in Latin script with correct oʻ/gʻ letters).';

const GREETING = /^(salom|assalomu?|assalom|va\s?alaykum|hayrli|xayrli|qalay|yaxshimi|rahmat|raxmat|hello|hi|hey|good (morning|evening)|how are|привет|здравствуйте|как дела)/i;
const TASK_VERB = /(qil|tuz|yoz|yarat|tayyorla|tahlil|analiz|hisobla|tekshir|chiz|loyihala|ishlab chiq|avtomatlashtir|build|make|create|write|analy[sz]e|design|plan|generate|develop|code|implement|сделай|создай|напиши)/i;
/** Anything that is best answered with something you can open and click. */
const BUILD =
  /(sayt|site|website|web|veb|landing|sahifa|platforma|ilova|app\b|portal|do['‘’ʻ]?kon|dukon|market|shop|magazin|admin|panel|dashboard|kabinet|o['‘’ʻ]?yin|game|\b3d\b|3d |animats|animation|dizayn|design|maket|prototip|prototype|interfeys|\bui\b|\bux\b|\bbot|\bmcp\b|\bcrm\b|\berp\b|\blms\b|\bmvp\b|kalkulyator|calculator|forma\b|form\b|test oladigan|quiz|portfolio|rezyume sayt|blog sayt|онлайн|сайт)/i;
/** Words that ask for a site even when social media is mentioned. */
const SITE = /(sayt|site|website|\bweb|\bveb|landing|ilova|platforma|portal|\bapp\b)/i;
/** A product from zero rather than one page. */
const PROJECT = /(avtomatlashtir|automat|tizim|system|\bmvp\b|\bmcp\b|\bcrm\b|\berp\b|\blms\b|\bbot|ekotizim|0 ?dan|noldan|from scratch|to['‘’ʻ]?liq loyiha|katta loyiha|startap|startup)/i;
const CONTENT = /(instagram|insta\b|telegram kanal|tiktok|youtube|reels|\bpost|kontent|content|\bsmm\b|\bblog|kanal|akkaunt|akaunt|account|obunachi|followers|caption|hashtag|story|uslub|stil)/i;

/** How the interviewer should think (from addyosmani/agent-skills "interview-me"). */
const INTERVIEW_METHOD = [
  'Method (interview-me): what people ask for and what they actually want differ. Before any plan exists, find out WHO it is for, WHY they want it, what SUCCESS looks like and the binding CONSTRAINT.',
  'State your best one-sentence understanding and an honest confidence (0-100). Ask only questions whose answers would change the plan, each with 2-5 concrete options and your best guess, so the user can answer in seconds.',
].join(' ');

const OFFLINE_NOTE =
  'Intentional and required: when ./api is unreachable the app switches to a built-in demo database in localStorage (or memory) so the preview works without a server. Real security (answers, auth) is enforced by server.js in production. Do not report this, and never remove it.';

/**
 * What each kind of step needs from the skill library (search words). The
 * user's request is added, so a school project's database step finds database
 * design skills and a research task finds the Agent Reach skills.
 */
const SKILL_HINTS: Record<string, string> = {
  ask: 'interview requirements product discovery clarifying questions',
  plan: 'product discovery prd architecture plan requirements',
  db: 'database schema designer sql',
  backend: 'api design rest backend endpoints security',
  frontend: 'frontend ui engineering design system responsive',
  mcp: 'mcp server builder patterns tools',
  bot: 'chatbot bot messaging notifications',
  qa: 'senior qa testing browser qa',
  recheck: 'senior qa testing code review',
  fix: 'debugging error recovery frontend',
  revise: 'frontend ui engineering',
  check: 'code review qa',
  summary: 'report summary',
  analyze: 'social media analyzer account audit instagram',
  strategy: 'content strategy social media content calendar',
  posts: 'social content copywriting',
};

/** The internet scout (Agent Reach): its steps may search and read the web. */
const SCOUT = 'agent:agent-reach:reach-scout';
/** How much of an app QA reads in one go (a large single-file app is ~100 KB). */
const REVIEW_CHARS = 150000;
let seq = 0;
const HISTORY_KEY = 'office.runs.v1';
const HISTORY_RUNS = 8;
const HISTORY_CHAT = 120;
const newId = () => `run-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT = new Set(['rate_limited', 'overloaded', 'upstream_error', 'server_error', 'timeout', 'network', 'unavailable']);
/** The Claude plan's usage limit: waiting a few seconds will not help. */
const USAGE_LIMIT = /session limit|usage limit|hit your .{0,20}limit|limit reached|resets \d/i;

/** A short, human explanation of an engine error in the UI language. */
export function explainError(e: unknown): string {
  const uz = lang() === 'uz';
  const code = e instanceof EngineError ? e.code : '';
  const msg = String((e as Error)?.message || e);
  const map: Record<string, [string, string]> = {
    not_granted: ['Claude’dan foydalanishga ruxsat berilmadi. Sahifadagi ruxsat oynasida “Allow / Ruxsat berish”ni bosing va qayta urinib ko‘ring.', 'Permission to use Claude was not granted. Click “Allow” in the permission prompt and try again.'],
    rate_limited: ['Claude limiti vaqtincha tugadi. Bir necha daqiqadan keyin “Qayta urinish”ni bosing — tugagan bosqichlar qayta bajarilmaydi.', 'Claude’s rate limit was hit. Press “Retry” in a few minutes — finished steps are kept.'],
    cancelled: ['Bekor qilindi.', 'Cancelled.'],
    no_engine: ['AI ulanmagan: ofisni claude.ai ichida oching yoki kompyuterda npm run dev bilan ishga tushiring.', 'No AI connected: open the office in claude.ai or run npm run dev.'],
    invalid_json: ['Agent javobi kutilgan formatda kelmadi. “Qayta urinish”ni bosing.', 'An agent reply was not in the expected format. Press “Retry”.'],
    no_html: ['Frontend agent sayt kodini qaytarmadi. “Qayta urinish”ni bosing.', 'The frontend agent returned no site code. Press “Retry”.'],
  };
  if (USAGE_LIMIT.test(msg)) {
    const at = /resets? ([^.·\n]{3,40})/i.exec(msg)?.[1]?.trim();
    return uz
      ? `Claude foydalanish limiti tugadi${at ? ` (qayta tiklanadi: ${at})` : ''}. Limit tiklangach “Qayta urinish”ni bosing — tugagan bosqichlar saqlanadi, ish shu joydan davom etadi.`
      : `Claude’s usage limit was reached${at ? ` (resets ${at})` : ''}. Press “Retry” once it resets — finished steps are kept and the work continues from here.`;
  }
  const hit = map[code];
  if (hit) return uz ? hit[0] : hit[1];
  return uz ? `Xatolik: ${clip(msg, 220)}. “Qayta urinish”ni bosing — tugagan bosqichlar saqlanadi.` : `Error: ${clip(msg, 220)}. Press “Retry” — finished steps are kept.`;
}

export class Crews {
  readonly runs: CrewRun[] = [];
  readonly chat: ChatMsg[] = [];
  /** Extra knowledge an agent brings to every call (Claude Academy). */
  knowledge?: (agentId: string) => string;
  /** The library's skills, handed to agents step by step. */
  readonly skillBook: SkillBook;
  private teamById: Map<string, Team>;
  private benchByAgent = new Map<string, Bench>();
  private waiters = new Map<string, (v: unknown) => void>();

  constructor(
    readonly data: OfficeData,
    readonly teams: Team[],
    readonly bench: Bench[],
    readonly prompts: Record<string, string>,
    readonly router: Router,
    readonly engine: () => Promise<Engine>,
    readonly hooks: CrewHooks,
  ) {
    this.teamById = new Map(teams.map((t) => [t.id, t]));
    this.skillBook = new SkillBook(data);
    for (const b of bench) {
      const prev = this.benchByAgent.get(b.agentId);
      if (!prev || (b.score ?? 0) > (prev.score ?? 0)) this.benchByAgent.set(b.agentId, b);
    }
  }

  team(id: string) {
    return this.teamById.get(id)!;
  }

  // ------------------------------------------------------------ history --
  /** Keep the latest runs and the chat in this browser so a reload loses nothing. */
  save() {
    const runs = this.runs.slice(0, HISTORY_RUNS).map((r) => ({ ...r, images: [], imageUrls: [], steps: r.steps.map((s) => ({ ...s, live: undefined })) }));
    const chat = this.chat.slice(-HISTORY_CHAT).map((m) => ({ ...m, images: m.images?.length ? [] : undefined }));
    // Drop the oldest runs until it fits the browser's storage quota.
    for (let n = runs.length; n >= 0; n--) {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify({ runs: runs.slice(0, n), chat }));
        return;
      } catch {
        /* quota exceeded or storage blocked: try with fewer runs */
      }
    }
  }

  /** Bring back what `save()` kept; a run cut off by the reload can be resumed with “Retry”. */
  load() {
    let saved: { runs?: CrewRun[]; chat?: ChatMsg[] } = {};
    try {
      saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    } catch {
      return;
    }
    const uz = lang() === 'uz';
    const cut = new Set<string>();
    for (const r of saved.runs || []) {
      if (!r?.id || this.runs.some((x) => x.id === r.id)) continue;
      r.cache ||= {};
      if (r.status === 'running' || r.status === 'waiting') {
        cut.add(r.id);
        r.status = 'error';
        r.pending = undefined;
        r.error = uz ? 'Sahifa yangilangani uchun jarayon to‘xtadi. “Qayta urinish”ni bosing — tugagan bosqichlar saqlangan.' : 'The page was reloaded mid-run. Press “Retry” — finished steps are kept.';
        for (const s of r.steps) if (s.status === 'run') s.status = 'wait';
      }
      this.runs.push(r);
    }
    const known = new Set(this.runs.map((r) => r.id));
    const msgs = (saved.chat || []).filter((m) => m && typeof m.text === 'string' && (!m.runId || known.has(m.runId)));
    // A question card of a cut-off run would read as answered: the retry asks again.
    this.chat.unshift(...msgs.map((m) => ({ ...m, images: undefined, ask: m.ask && !cut.has(m.runId || '') })));
    for (const r of this.runs) {
      if (r.status === 'error' && r.error && !this.chat.some((m) => m.runId === r.id && m.action?.retry))
        this.chat.push({ from: 'system', text: `⚠️ ${r.error}`, time: Date.now(), runId: r.id, action: { label: uz ? '🔁 Qayta urinish' : '🔁 Retry', runId: r.id, retry: true } });
    }
  }

  /** Team members ordered by measured quality, then speed. */
  ranked(teamId: string) {
    const t = this.team(teamId);
    return [...t.members].sort((a, b) => {
      const A = this.bench.find((x) => x.team === teamId && x.agentId === a.id);
      const B = this.bench.find((x) => x.team === teamId && x.agentId === b.id);
      return (B?.score ?? 0) - (A?.score ?? 0) || (A?.seconds ?? 99) - (B?.seconds ?? 99);
    });
  }

  benchFor(teamId: string, agentId: string) {
    return this.bench.find((x) => x.team === teamId && x.agentId === agentId);
  }

  /** Best benchmark result of an agent in any team. */
  bestBench(agentId: string) {
    return this.benchByAgent.get(agentId);
  }

  // ------------------------------------------------------------ routing --
  classify(text: string, images: Blob[]): CrewKind {
    const t = text.trim();
    const build = BUILD.test(t);
    if (images.length) return build && !CONTENT.test(t) ? 'website' : 'content';
    if (GREETING.test(t) && !TASK_VERB.test(t) && t.length < 140) return 'chat';
    if (PROJECT.test(t) && (TASK_VERB.test(t) || t.length > 25)) return 'project';
    if (CONTENT.test(t) && !SITE.test(t)) return 'content';
    if (build && (TASK_VERB.test(t) || t.length > 12)) return 'website';
    if (CONTENT.test(t)) return 'content';
    if (t.length < 25 && !TASK_VERB.test(t)) return 'chat';
    return 'task';
  }

  teamFor(text: string): Team {
    const words = text.toLowerCase().split(/[^\p{L}\p{N}ʻʼ‘’']+/u);
    let best = this.teams[0];
    let bestScore = 0;
    for (const t of this.teams) {
      if (t.id === 'office') continue;
      const kw = new Set(t.keywords.split(/\s+/));
      let s = 0;
      for (const w of words) if (w && [...kw].some((k) => w.startsWith(k) || k.startsWith(w) && w.length > 3)) s++;
      if (s > bestScore) {
        best = t;
        bestScore = s;
      }
    }
    if (bestScore) return best;
    // Fall back to the router: the team whose members the best agent belongs to.
    const top = this.router.route(text, 5).map((r) => r.item.id);
    return this.teams.find((t) => t.members.some((m) => top.includes(m.id))) || this.team('office');
  }

  // ----------------------------------------------------------- personas --
  item(id: string): Item {
    return this.data.byId.get(id)!;
  }

  /** An agent's system prompt: its own instructions, what it learned, the skills for this task. */
  persona(agentId: string, skills = '', web = false) {
    const it = this.item(agentId);
    const learned = this.knowledge?.(agentId) || '';
    return [
      `You are "${it.name}", an AI agent working in the AI Agent Office (a team of specialist agents).`,
      `Your role: ${it.description}`,
      '',
      web
        ? 'Your own instructions (follow their spirit). In this office you can search the web (WebSearch) and read pages (WebFetch): use them for current facts and cite the links; you have no other tools.'
        : 'Your own instructions (follow their spirit; you have no tools in this office, so answer directly):',
      this.prompts[agentId] || '',
      learned ? `\n${learned}` : '',
      skills ? `\n${skills}` : '',
      '',
      languageRule(),
    ].join('\n');
  }

  private async call(run: CrewRun, step: Step, prompt: string, tier: Tier, opts: { images?: Blob[] } = {}) {
    const cached = run.cache[step.key];
    if (cached !== undefined) {
      step.status = 'done';
      step.output = cached;
      this.hooks.changed(run);
      return { text: cached, truncated: false };
    }
    const engine = await this.engine();
    const t0 = performance.now();
    // The skills that fit this step best: the agent follows them.
    const kind = step.key.replace(/\d+$/, '');
    const hint = run.kind === 'task' ? step.label.en : SKILL_HINTS[kind] || step.label.en;
    const picked = kind === 'summary' ? [] : this.skillBook.pick(step.agentId, hint, run.prompt, 3, this.teamById.get(run.teamId)?.skills || []);
    step.skills = picked.map((x) => x.id);
    step.web = step.agentId === SCOUT || picked.some((x) => x.source === 'agent-reach');
    const skillText = await this.skillBook.block(picked);
    step.status = 'run';
    this.hooks.stepStart(run, step);
    this.hooks.changed(run);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await engine.ask(prompt, {
            system: this.persona(step.agentId, skillText, step.web),
            tier,
            web: step.web,
            images: opts.images,
            onText: (text) => {
              step.live = clip(text.replace(/\s+/g, ' ').trim(), 160);
              this.hooks.changed(run);
            },
          });
          step.seconds = Math.round((performance.now() - t0) / 100) / 10;
          step.output = r.text;
          step.status = 'done';
          run.cache[step.key] = r.text;
          return r;
        } catch (e) {
          const code = e instanceof EngineError ? e.code : 'server_error';
          const limit = code === 'server_error' ? 1 : 2;
          if (attempt >= limit || !TRANSIENT.has(code) || USAGE_LIMIT.test(String((e as Error)?.message))) throw e;
          step.live = lang() === 'uz' ? `⏳ qayta urinish (${attempt + 1})…` : `⏳ retrying (${attempt + 1})…`;
          this.hooks.changed(run);
          await sleep(5000 * (attempt + 1) ** 2);
        }
      }
    } catch (e) {
      step.seconds = Math.round((performance.now() - t0) / 100) / 10;
      step.status = 'error';
      step.output = e instanceof EngineError ? `${e.code}: ${e.message}` : String((e as Error)?.message || e);
      throw e;
    } finally {
      this.hooks.changed(run);
    }
  }

  /**
   * A call whose answer is one long HTML file. If the reply is cut off (length
   * or time limit), ask the same agent to continue from where it stopped.
   */
  private async callHtml(run: CrewRun, step: Step, prompt: string, tier: Tier, opts: { images?: Blob[] } = {}) {
    const key = `${step.key}:html`;
    if (run.cache[key] !== undefined) {
      step.status = 'done';
      this.hooks.changed(run);
      return { text: run.cache[key], truncated: false };
    }
    const first = await this.call(run, step, prompt, tier, opts);
    let text = first.text;
    let truncated = first.truncated;
    const engine = await this.engine();
    const open = () => /<!doctype html|<html/i.test(text) && !/<\/html>/i.test(text);
    for (let i = 0; i < 3 && (truncated || open()); i++) {
      step.status = 'run';
      step.live = lang() === 'uz' ? `davom ettirmoqda (${i + 1})…` : `continuing (${i + 1})…`;
      this.hooks.changed(run);
      const r = await engine.ask(
        [
          'You were writing one HTML file and your reply was cut off. This is the END of what you wrote so far:',
          '<<<',
          text.slice(-4000),
          '>>>',
          'Continue from the exact next character. Output ONLY the continuation: no code fence, no repetition, no explanation. Finish the file with </html>.',
        ].join('\n'),
        { system: this.persona(step.agentId), tier },
      );
      text += r.text.replace(/^\s*```[a-z]*[ \t]*\r?\n/i, '').replace(/\n?```\s*$/, '');
      truncated = r.truncated;
    }
    step.status = 'done';
    step.live = undefined;
    run.cache[key] = text;
    this.hooks.changed(run);
    return { text, truncated };
  }

  private step(key: string, agentId: string, label: L): Step {
    return { key, agentId, label, status: 'wait' };
  }

  private end(run: CrewRun, step: Step, next?: Step) {
    this.hooks.stepEnd(run, step, next);
  }

  private say(from: string, text: string, extra: Partial<ChatMsg> = {}) {
    const msg: ChatMsg = { from, text, time: Date.now(), ...extra };
    this.chat.push(msg);
    this.hooks.message(msg);
    this.save();
  }

  // ----------------------------------------------------- waiting on you --
  private waitFor<T>(run: CrewRun, pending: Pending, from: string, text: string): Promise<T> {
    run.pending = pending;
    run.status = 'waiting';
    this.hooks.changed(run);
    this.say(from, text, { runId: run.id, ask: true });
    this.hooks.ask?.(run);
    return new Promise<T>((resolve) => this.waiters.set(run.id, resolve as (v: unknown) => void));
  }

  /** The user answered the questions or decided on the plan. */
  answer(runId: string, value: Record<string, string> | { ok: boolean; note?: string }) {
    const resolve = this.waiters.get(runId);
    const run = this.runs.find((r) => r.id === runId);
    if (!resolve || !run) return;
    this.waiters.delete(runId);
    run.pending = undefined;
    run.status = 'running';
    this.hooks.changed(run);
    resolve(value);
  }

  // --------------------------------------------------------------- entry --
  async send(text: string, images: Blob[] = [], forced?: CrewKind, pinnedAgent?: string) {
    const clean = text.trim();
    if (!clean && !images.length) return;
    const imageUrls = images.map((b) => URL.createObjectURL(b));
    this.say('user', clean || '🖼️', { images: imageUrls });
    const engine = await this.engine();
    const kind = forced || (pinnedAgent ? 'task' : this.classify(clean, images));
    if (engine.kind === 'none') return this.offline(kind, clean);
    if (kind === 'chat') return this.runChat(clean);
    const run: CrewRun = {
      id: newId(), kind, title: clip(clean || 'Screenshot', 70), prompt: clean, images, imageUrls, teamId: 'office',
      steps: [], status: 'running', startedAt: Date.now(), engine: engine.kind, result: null, cache: {}, pinned: pinnedAgent,
    };
    this.runs.unshift(run);
    await this.execute(run);
  }

  /** Run again after an error; finished steps come from the cache. */
  retry(runId: string) {
    const run = this.runs.find((r) => r.id === runId);
    if (!run || run.status === 'running' || run.status === 'waiting') return;
    this.say('system', lang() === 'uz' ? `🔁 Qayta urinilmoqda: “${run.title}” (tugagan bosqichlar saqlanadi)` : `🔁 Retrying “${run.title}” (finished steps are kept)`, { runId });
    void this.execute(run);
  }

  private async execute(run: CrewRun) {
    run.status = 'running';
    run.error = undefined;
    run.finishedAt = undefined;
    this.hooks.changed(run);
    try {
      if (run.kind === 'website' || run.kind === 'project') await this.runBuild(run);
      else if (run.kind === 'content') await this.runContent(run);
      else await this.runTask(run, run.pinned);
      run.status = 'done';
    } catch (e) {
      run.status = 'error';
      run.error = explainError(e);
      for (const s of run.steps) if (s.status === 'run') s.status = 'error';
      this.say('system', `⚠️ ${run.error}`, { runId: run.id, action: { label: lang() === 'uz' ? '🔁 Qayta urinish' : '🔁 Retry', runId: run.id, retry: true } });
    }
    run.finishedAt = Date.now();
    this.save();
    this.hooks.changed(run);
    this.hooks.done(run);
  }

  private offline(kind: CrewKind, text: string) {
    const uz = lang() === 'uz';
    if (kind === 'chat') {
      this.say('agent:claude-office:office-manager', uz ? 'Salom! 👋 Hammasi joyida. (Bu javob oflayn — AI ulanmagan.)' : 'Hi! 👋 All good here. (Offline reply — no AI connected.)');
    }
    this.say(
      'system',
      uz
        ? `AI ulanmagan, shuning uchun “${clip(text, 40)}” bajarilmadi. Ofisni claude.ai ichida oching (Claude’dan foydalanishga ruxsat bering) yoki kompyuteringizda npm run dev bilan ishga tushiring.`
        : `No AI is connected, so “${clip(text, 40)}” did not run. Open the office inside claude.ai (allow it to use Claude) or run npm run dev locally.`,
    );
  }

  // ---------------------------------------------------------------- chat --
  private pickResponders(text: string) {
    const out = ['agent:claude-office:office-manager'];
    const team = this.teamFor(text);
    const pool = team.id !== 'office' ? this.ranked(team.id).map((m) => m.id) : [];
    const friendly = ['coder', 'content', 'design', 'business', 'education', 'marketing'].map((id) => this.ranked(id)[0]?.id).filter(Boolean) as string[];
    for (const id of [...pool, ...friendly.sort(() => Math.random() - 0.5)]) {
      if (out.length >= 4) break;
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  private async runChat(text: string) {
    const engine = await this.engine();
    const responders = this.pickResponders(text);
    const history = this.chat.slice(-9, -1).map((m) => `${m.from === 'user' ? 'User' : m.from === 'system' ? 'System' : this.item(m.from)?.name || m.from}: ${clip(m.text, 300)}`);
    const cast = responders.map((id, i) => {
      const it = this.item(id);
      const team = this.teams.find((t) => t.members.some((m) => m.id === id));
      const role = team?.members.find((m) => m.id === id)?.role;
      return `${i + 1}. id="${id}" name="${it.name}" role="${role ? tr(role) : it.dept}" — ${clip(it.description, 220)}`;
    });
    const prompt = [
      'You voice several AI agents who work together in the AI Agent Office, a 3D office. The user just wrote to everyone.',
      history.length ? `Recent conversation:\n${history.join('\n')}` : '',
      `User: """${text}"""`,
      '',
      'Agents who reply, in this order:',
      ...cast,
      '',
      'Each agent replies once, in character, 1-2 short friendly sentences: answer the user naturally and, where it fits, mention one concrete thing they are great at in this office. No two replies alike.',
      languageRule(),
      'Reply with ONLY a JSON array: [{"agent": "<id>", "text": "<reply>"}], one object per agent above.',
    ].join('\n');
    const seats: Step[] = responders.map((id) => ({ key: 'chat', agentId: id, label: { uz: 'Suhbat', en: 'Chat' }, status: 'run' }));
    const pseudo: CrewRun = { id: newId(), kind: 'chat', title: text, prompt: text, images: [], imageUrls: [], teamId: 'office', steps: seats, status: 'running', startedAt: Date.now(), engine: engine.kind, result: null, cache: {} };
    for (const s of seats) this.hooks.stepStart(pseudo, s);
    try {
      const r = await engine.ask(prompt, { tier: 'quick' });
      const replies = parseJson<{ agent: string; text: string }[]>(r.text);
      const list = Array.isArray(replies) ? replies : [];
      list.forEach((rep, i) => {
        const id = responders.includes(rep.agent) ? rep.agent : responders[i] || responders[0];
        setTimeout(() => {
          this.say(id, String(rep.text || '').trim());
          const s = seats.find((x) => x.agentId === id);
          if (s) {
            s.status = 'done';
            this.hooks.stepEnd(pseudo, s);
          }
        }, i * 900);
      });
    } catch (e) {
      for (const s of seats) {
        s.status = 'error';
        this.hooks.stepEnd(pseudo, s);
      }
      this.say('system', `⚠️ ${e instanceof EngineError ? e.code : String(e)}`);
    }
  }

  // --------------------------------------------------- website / project --
  private interviewText(run: CrewRun) {
    const iv = run.cache['interview'] ? (JSON.parse(run.cache['interview']) as { understanding?: string; questions?: Question[] }) : null;
    if (!iv || !run.answers) return '';
    const lines = (iv.questions || []).map((q) => `- ${q.question}\n  → ${run.answers?.[q.id] || '(decide yourself)'}`);
    return [`Clarifying interview (the user's answers are binding):`, iv.understanding ? `Understanding: ${iv.understanding}` : '', ...lines].filter(Boolean).join('\n');
  }

  private async runBuild(run: CrewRun): Promise<void> {
    const project = run.kind === 'project';
    const uz = lang() === 'uz';
    const engine = await this.engine();
    run.teamId = 'coder';
    const A = {
      ask: project ? 'agent:claude-skills:cs-product-manager' : 'agent:ecc:planner',
      plan: project ? 'agent:ecc:architect' : 'agent:ecc:planner',
      report: 'agent:claude-office:office-manager',
    };
    const revisions = run.planNotes?.length || 0;
    const S = {
      ask: this.step('ask', A.ask, { uz: 'Aniqlashtiruvchi savollar', en: 'Clarifying questions' }),
      plan: this.step(`plan${revisions}`, A.plan, project ? { uz: 'Loyiha rejasi (MVP)', en: 'Project plan (MVP)' } : { uz: 'Mukammal reja', en: 'Complete plan' }),
      approve: this.step('approve', A.report, { uz: 'Sizning tasdiqingiz', en: 'Your approval' }),
      db: this.step('db', 'agent:ecc:database-reviewer', { uz: 'Maʼlumotlar bazasi', en: 'Database' }),
      backend: this.step('backend', 'agent:claude-skills:cs-backend-engineer', { uz: 'Backend (API)', en: 'Backend (API)' }),
      frontend: this.step('frontend', 'agent:claude-skills:cs-frontend-engineer', project ? { uz: 'Veb-ilova', en: 'Web app' } : { uz: 'Frontend (sayt)', en: 'Frontend (site)' }),
      mcp: this.step('mcp', 'agent:hermes:hermes', { uz: 'MCP server (AI uchun)', en: 'MCP server (for AI)' }),
      bot: this.step('bot', 'agent:claude-skills:cs-fullstack-engineer', { uz: 'Telegram bot', en: 'Telegram bot' }),
      qa: this.step('qa', 'agent:ecc:tdd-guide', { uz: 'Test va sifat nazorati', en: 'Testing & QA' }),
      fix: this.step('fix', 'agent:claude-skills:cs-frontend-engineer', { uz: 'Xatolarni tuzatish', en: 'Fixes' }),
      recheck: this.step('recheck', 'agent:ecc:code-reviewer', { uz: 'Qayta tekshiruv', en: 'Re-check' }),
      summary: this.step('summary', A.report, { uz: 'Hisobot', en: 'Report' }),
    };
    const base = [S.ask, S.plan, ...(project ? [S.approve] : []), S.db, S.backend, S.frontend];
    const tail = [S.qa, S.fix, S.recheck, S.summary];
    run.steps = [...base, ...tail];
    if (!run.cache['intro']) {
      run.cache['intro'] = '1';
      this.say(
        A.report,
        project
          ? uz
            ? '👌 Katta loyiha! Avval sizga bir nechta savol beramiz, keyin to‘liq reja tuzib tasdiqlashingizga beramiz, so‘ng jamoa noldan quradi: baza, backend, veb-ilova, kerak bo‘lsa MCP server va Telegram bot.'
            : '👌 A big project! First a few questions, then a full plan for your approval, then the team builds it from zero: database, backend, web app and, if needed, an MCP server and a Telegram bot.'
          : uz
            ? '👌 Coder jamoasi ishga tushdi: avval qisqa savollar, keyin reja, baza, backend va frontend, oxirida test. Birinchi versiya tayyor bo‘lishi bilan ochib ko‘rsataman.'
            : '👌 The Coder team started: a few questions, then plan, database, backend and frontend, then tests. I will open the first version as soon as it is ready.',
        { runId: run.id },
      );
    }

    // 0. Clarifying questions (like Claude does before a big job).
    if (!run.answers) {
      const qR = await this.call(run, S.ask, [
        `The user asked the office to ${project ? 'build a whole product from zero' : 'build a website / web app'}:`,
        `"""${run.prompt}"""`,
        '',
        `You lead the ${project ? 'product discovery' : 'planning'}. ${INTERVIEW_METHOD}`,
        project
          ? 'Ask 4-6 questions. Always include one about which parts to build (options such as: web app for staff/students/parents, admin panel, Telegram bot, MCP server so AI assistants can use the system, mobile-friendly PWA — mark it "multi": true), and one about the most important first release (MVP) outcome.'
          : 'Ask 2-4 short questions (audience, must-have features, style/mood, language of the site). If the request is already fully specified, ask none.',
        'Reply with ONLY a JSON object: {"understanding": "", "confidence": 0-100, "questions": [{"id": "q1", "question": "", "options": ["", ""], "guess": "", "multi": false}]}',
        languageRule(),
      ].join('\n'), 'default');
      let parsed: { understanding?: string; confidence?: number; questions?: Question[] } = {};
      try {
        parsed = parseJson(qR.text);
      } catch {
        parsed = {};
      }
      const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .filter((q) => q && q.question)
        .slice(0, 6)
        .map((q, i) => ({ id: String(q.id || `q${i + 1}`), question: String(q.question), options: (Array.isArray(q.options) ? q.options : []).map(String).slice(0, 6), guess: q.guess ? String(q.guess) : undefined, multi: !!q.multi }));
      run.cache['interview'] = JSON.stringify({ understanding: parsed.understanding || '', questions });
      this.end(run, S.ask, S.plan);
      if (questions.length) {
        run.answers = await this.waitFor<Record<string, string>>(
          run,
          { kind: 'questions', understanding: String(parsed.understanding || ''), confidence: parsed.confidence, questions },
          A.ask,
          uz ? `❓ Rejani aniq qilish uchun ${questions.length} ta savol. Variantni tanlang yoki o‘zingiz yozing — “O‘zingiz hal qiling” desangiz, taxminlarim bilan davom etaman.` : `❓ ${questions.length} questions to get the plan right. Pick an option or type your own — or let us decide.`,
        );
      } else run.answers = {};
    } else {
      S.ask.status = 'done';
    }
    const interview = this.interviewText(run);
    // Real agent projects like this one (500 AI Agents catalogue), as examples for the plan.
    const similar = project ? this.skillBook.useCases(`${run.prompt} ${interview}`, 5) : [];

    // 1. Plan (a product plan with MVP scope for projects).
    const planR = await this.call(run, S.plan, [
      `User request: """${run.prompt}"""`,
      interview,
      run.planNotes?.length ? `The user reviewed your previous plan and asked for these changes (apply all):\n${run.planNotes.map((n) => `- ${n}`).join('\n')}` : '',
      run.images.length ? 'The user also attached reference image(s) of the look they want.' : '',
      similar.length ? `Similar real AI-agent projects from the 500 AI Agents catalogue (ideas to borrow, not requirements):\n${similar.map((u) => `- ${u.title || u.name}: ${u.description} — ${u.url}`).join('\n')}` : '',
      '',
      project
        ? 'You are the architect. Produce a complete, buildable product plan: a real MVP that works end to end, plus what comes later.'
        : 'You are the planner of the Coder team. Produce a complete, buildable plan for a small but polished web app that fully satisfies the request.',
      'Reply with ONLY a JSON object:',
      project
        ? '{"title": "", "summary": "", "problem": "", "users": [{"role": "", "needs": ""}], "mvp": [{"name": "", "detail": ""}], "later": [""], "modules": [{"name": "", "detail": ""}], "features": [{"name": "", "detail": ""}], "pages": [{"name": "", "purpose": ""}], "entities": [{"name": "", "fields": [{"name": "", "type": "", "note": ""}]}], "api": [{"method": "GET", "path": "/api/...", "purpose": ""}], "roles": [""], "deliverables": ["web", "api", "mcp", "bot"], "mcpTools": [{"name": "", "purpose": ""}], "bot": {"platform": "telegram", "commands": [{"command": "/start", "purpose": ""}]}, "stack": {"frontend": "HTML/CSS/JS (single file, PWA-ready)", "backend": "Node.js + Express", "database": "SQLite", "mcp": "Node.js MCP SDK", "bot": "grammY"}, "risks": [""], "metrics": [""], "milestones": [""]}'
        : '{"title": "", "summary": "", "audience": [""], "features": [{"name": "", "detail": ""}], "pages": [{"name": "", "purpose": ""}], "entities": [{"name": "", "fields": [{"name": "", "type": "", "note": ""}]}], "api": [{"method": "GET", "path": "/api/...", "purpose": ""}], "roles": [""], "style": {"mood": "", "palette": ["#hex"], "motion": ""}, "stack": {"frontend": "HTML/CSS/JS", "backend": "Node.js + Express", "database": "SQLite"}, "milestones": [""]}',
      project
        ? 'Scope the MVP so one team can ship it: 4-8 views, 4-8 entities, 10-18 API endpoints. "deliverables" lists only what the user wants (web and api always; mcp and/or bot when chosen or clearly useful).'
        : 'Realistic scope for one polished release: 3-6 pages or views, 3-6 entities, 6-12 API endpoints.',
      languageRule(),
    ].join('\n'), project ? 'complex' : 'default', { images: run.images.length && engine.images ? run.images : undefined });
    const plan = parseJson<Record<string, unknown>>(planR.text);
    run.title = String(plan.title || run.title);
    const planJson = JSON.stringify(plan, null, 1);
    const count = (k: string) => (Array.isArray(plan[k]) ? (plan[k] as unknown[]).length : 0);
    if (!run.cache[`said-${S.plan.key}`]) {
      run.cache[`said-${S.plan.key}`] = '1';
      this.say(S.plan.agentId, uz ? `🧭 Reja tayyor: “${run.title}” — ${count(project ? 'mvp' : 'features')} ta ${project ? 'MVP funksiyasi' : 'funksiya'}, ${count('pages')} ta sahifa, ${count('api')} ta API.` : `🧭 Plan ready: “${run.title}” — ${count(project ? 'mvp' : 'features')} ${project ? 'MVP features' : 'features'}, ${count('pages')} pages, ${count('api')} API endpoints.`, { runId: run.id });
    }

    // 2. Projects: you approve the plan (or ask for changes) before anything is built.
    if (project && !run.approved) {
      this.end(run, S.plan, S.approve);
      S.approve.status = 'run';
      const decision = await this.waitFor<{ ok: boolean; note?: string }>(run, { kind: 'approval', plan }, A.report, uz ? '📋 Reja tayyor. Ko‘rib chiqing: tasdiqlasangiz qurishni boshlaymiz, o‘zgartirish kerak bo‘lsa yozing.' : '📋 The plan is ready. Approve it to start building, or tell us what to change.');
      if (!decision.ok) {
        (run.planNotes ||= []).push(decision.note || '');
        this.say('user', `✏️ ${decision.note || ''}`, { runId: run.id });
        return this.runBuild(run);
      }
      run.approved = true;
      S.approve.status = 'done';
      this.say('user', uz ? '✅ Reja tasdiqlandi — qurishni boshlang.' : '✅ Plan approved — start building.', { runId: run.id });
    }
    this.end(run, project ? S.approve : S.plan, S.db);

    const deliverables = new Set((Array.isArray(plan.deliverables) ? plan.deliverables : []).map((d) => String(d).toLowerCase()));
    const answers = Object.values(run.answers || {}).join(' ');
    const wantMcp = project && (deliverables.has('mcp') || /\bmcp\b/i.test(`${run.prompt} ${answers}`));
    const wantBot = project && (deliverables.has('bot') || /\bbot|telegram bot/i.test(`${run.prompt} ${answers}`));
    const extras = [...(wantMcp ? [S.mcp] : []), ...(wantBot ? [S.bot] : [])];
    run.steps = [...base, ...extras, ...tail];
    this.hooks.changed(run);

    // 3. Database -> backend, in parallel with the web app, MCP server and bot.
    const backendChain = (async () => {
      const dbR = await this.call(run, S.db, [
        `Plan:\n${planJson}`,
        interview,
        '',
        'You are the database engineer. Write the SQLite schema for this plan and realistic seed data.',
        'Reply with exactly two code blocks, each preceded by its FILE line:',
        'FILE: schema.sql',
        '```sql\n...\n```',
        'FILE: seed.sql',
        '```sql\n... INSERT statements, 4-12 rows per main table, realistic content ...\n```',
        'Then one short paragraph on key decisions (keys, indexes, relations).',
        languageRule(),
      ].join('\n'), 'default');
      const dbFiles = extractFiles(dbR.text);
      this.end(run, S.db, S.backend);
      const schema = dbFiles.find((f) => f.name.includes('schema'))?.content || dbFiles[0]?.content || '';
      const beR = await this.call(run, S.backend, [
        `Plan:\n${planJson}`,
        '',
        `schema.sql:\n${schema}`,
        '',
        'You are the backend engineer. Write a Node.js backend with Express and better-sqlite3 that implements every API endpoint in the plan.',
        'It serves the frontend from ./public, creates the database from schema.sql and seed.sql on first run, validates input, returns JSON errors, has GET /api/health, and protects admin actions with a password from the ADMIN_PASSWORD environment variable when the plan has admin roles.',
        'Reply with exactly two code blocks, each preceded by its FILE line:',
        'FILE: package.json',
        '```json\n...\n```',
        'FILE: server.js',
        '```js\n...\n```',
        `Keep server.js under about ${project ? 380 : 250} lines.`,
      ].join('\n'), 'default');
      this.end(run, S.backend, S.qa);
      return { dbFiles, beFiles: extractFiles(beR.text), dbNote: dbR.text.replace(/```[\s\S]*?```/g, '').replace(/FILE:.*\n/g, '').trim() };
    })();

    const frontendChain = (async () => {
      const r = await this.callHtml(run, S.frontend, this.frontendPrompt(run.prompt, planJson, interview, project, run.images.length > 0 && engine.images), 'default', { images: run.images.length && engine.images ? run.images : undefined });
      const got = extractHtml(r.text);
      if (!got) throw new EngineError('no_html', uz ? 'Frontend agent HTML qaytarmadi' : 'The frontend agent returned no HTML');
      this.end(run, S.frontend, S.qa);
      // Show the first version right away; tests keep running.
      if (!run.result) {
        run.result = { kind: 'website', project, plan, files: { 'public/index.html': got.html }, html: got.html, summary: '', notes: [], versions: [], partial: true };
        this.hooks.preview?.(run);
        this.say(S.frontend.agentId, uz ? '👀 Birinchi versiya tayyor — ochib qo‘ydim. Hozir test qilinyapti, xatolar topilsa tuzatamiz.' : '👀 The first version is ready and open. Testing now; we will fix what we find.', { runId: run.id, action: { label: uz ? '🌐 Ko‘rish' : '🌐 View', runId: run.id } });
      }
      return { html: got.html, repaired: got.repaired || r.truncated };
    })();

    const apiList = JSON.stringify(plan.api || [], null, 1);
    const mcpChain = wantMcp
      ? (async () => {
          const r = await this.call(run, S.mcp, [
            `Product: ${run.title}. ${String(plan.summary || '')}`,
            `REST API of the product (served by server.js at API_URL, default http://localhost:3000):\n${apiList}`,
            plan.mcpTools ? `Tools the architect wants:\n${JSON.stringify(plan.mcpTools, null, 1)}` : '',
            '',
            'You are the AI integration engineer. Write a Model Context Protocol (MCP) server so AI assistants (Claude Desktop, Claude Code) can use this product.',
            'Node.js (ES modules) with "@modelcontextprotocol/sdk" (McpServer from "@modelcontextprotocol/sdk/server/mcp.js", StdioServerTransport from "@modelcontextprotocol/sdk/server/stdio.js") and "zod". Register 4-8 tools with server.tool(name, description, zodShape, handler) that map to the main actions (list, search, create, update, reports). Each handler calls the REST API with fetch, returns { content: [{ type: "text", text }] } and turns HTTP errors into readable text. Log only to stderr.',
            'Reply with exactly three code blocks, each preceded by its FILE line:',
            'FILE: mcp-server/package.json',
            '```json\n...\n```',
            'FILE: mcp-server/index.js',
            '```js\n...\n```',
            'FILE: mcp-server/README.md',
            '```md\n... how to run it and how to add it to Claude Desktop (claude_desktop_config.json) and Claude Code (claude mcp add) ...\n```',
            languageRule(),
          ].join('\n'), 'default');
          this.end(run, S.mcp, S.qa);
          return extractFiles(r.text);
        })()
      : Promise.resolve([]);

    const botChain = wantBot
      ? (async () => {
          const r = await this.call(run, S.bot, [
            `Product: ${run.title}. ${String(plan.summary || '')}`,
            `REST API (API_URL, default http://localhost:3000):\n${apiList}`,
            plan.bot ? `Bot the architect wants:\n${JSON.stringify(plan.bot, null, 1)}` : '',
            '',
            'You are the bot engineer. Write a Telegram bot for this product with Node.js (ES modules) and "grammy": token from BOT_TOKEN, API base from API_URL, a /start menu with inline keyboard buttons, the commands from the plan, friendly error messages and simple per-chat state where a flow needs several answers.',
            'Reply with exactly three code blocks, each preceded by its FILE line:',
            'FILE: bot/package.json',
            '```json\n...\n```',
            'FILE: bot/bot.js',
            '```js\n...\n```',
            'FILE: bot/README.md',
            '```md\n... how to create the bot with @BotFather and run it ...\n```',
            'All bot messages in the user’s language.',
            languageRule(),
          ].join('\n'), 'default');
          this.end(run, S.bot, S.qa);
          return extractFiles(r.text);
        })()
      : Promise.resolve([]);

    const [be, fe, mcpFiles, botFiles] = await Promise.all([backendChain, frontendChain, mcpChain, botChain]);
    let html = fe.html;
    const notes: string[] = [];
    if (fe.repaired) notes.push(uz ? 'Frontend javobi uzilib qolgan edi, oxiri avtomatik yopildi.' : 'The frontend reply was cut off; its end was closed automatically.');

    // 4. QA -> fix -> re-check. The offline demo database is a requirement of the
    // preview, so QA must not report it and the fix must never remove it.
    const review = async (step: Step, code: string) => {
      const r = await this.call(run, step, [
        `Plan:\n${planJson}`,
        '',
        code.length <= REVIEW_CHARS ? 'index.html (the whole app):' : `index.html — the file is ${code.length} characters and complete; you see its first ${REVIEW_CHARS - 20000} and last 20000 characters. Do not report the middle as missing or the file as cut off:`,
        code.length <= REVIEW_CHARS ? code : `${code.slice(0, REVIEW_CHARS - 20000)}\n/* … middle of the file omitted for review … */\n${code.slice(-20000)}`,
        '',
        'You are QA. Review the app against the plan like a careful tester reading the code: missing pages or features, broken handlers, JavaScript errors you can see, data that is never saved, layout that breaks on phones, text not in the user’s language.',
        OFFLINE_NOTE,
        'Reply with ONLY a JSON object: {"score": 0-100, "checks": [{"name": "", "ok": true, "note": ""}], "issues": [{"severity": "high|medium|low", "note": ""}], "summary": ""}',
        'Use "high" only for a broken core feature or a missing required page.',
        languageRule(),
      ].join('\n'), 'default');
      return parseJson<NonNullable<WebsiteResult['qa']>>(r.text);
    };
    let qa: WebsiteResult['qa'];
    try {
      qa = await review(S.qa, html);
    } catch {
      S.qa.status = 'error';
    }
    const toFix = (qa?.issues || []).filter((i) => i.severity === 'high' || i.severity === 'medium').slice(0, 8);
    if (toFix.length && html.length < 160000) {
      this.end(run, S.qa, S.fix);
      try {
        const fixR = await this.callHtml(run, S.fix, [
          'Fix these problems a tester found in your app. Keep everything else as it is.',
          ...toFix.map((i) => `- [${i.severity}] ${i.note}`),
          '',
          `Keep the offline fallback: ${OFFLINE_NOTE}`,
          '',
          'Current index.html:',
          '```html',
          html,
          '```',
          '',
          'Reply with ONLY the complete corrected file:',
          'FILE: public/index.html',
          '```html\n<!doctype html>...\n```',
        ].join('\n'), 'default');
        const fixed = extractHtml(fixR.text);
        if (fixed && !fixed.repaired) {
          html = fixed.html;
          this.end(run, S.fix, S.recheck);
          try {
            const after = await review(S.recheck, html);
            qa = { ...after, summary: `${after.summary || ''}${qa?.score !== undefined ? ` (${uz ? 'tuzatishdan oldin' : 'before fixes'}: ${qa.score})` : ''}` };
          } catch {
            S.recheck.status = 'error';
          }
        } else {
          S.recheck.status = 'skip';
        }
        this.end(run, S.recheck, S.summary);
      } catch {
        S.fix.status = 'error';
        S.recheck.status = 'skip';
      }
    } else {
      S.fix.status = 'skip';
      S.recheck.status = 'skip';
      this.end(run, S.qa, S.summary);
    }

    const files: Record<string, string> = { 'public/index.html': html };
    const addFiles = (list: { name: string; lang: string; content: string }[], fallbackDir = '') => {
      for (const f of list) {
        const name = f.name || (f.lang === 'sql' ? 'schema.sql' : f.lang === 'json' ? `${fallbackDir}package.json` : f.lang === 'js' || f.lang === 'javascript' ? `${fallbackDir}${fallbackDir ? 'index.js' : 'server.js'}` : f.lang === 'md' || f.lang === 'markdown' ? `${fallbackDir}README.md` : '');
        if (name) files[name.replace(/^\/+/, '')] = f.content;
      }
    };
    addFiles([...be.dbFiles, ...be.beFiles]);
    addFiles(mcpFiles, 'mcp-server/');
    addFiles(botFiles, 'bot/');
    files['README.md'] = this.websiteReadme(plan, qa, be.dbNote, Object.keys(files));
    if (project) files['docs/PLAN.md'] = this.planMarkdown(plan, interview);

    // 5. Report
    let summary = '';
    try {
      const sR = await this.call(run, S.summary, [
        `The team finished this request: """${run.prompt}"""`,
        `Plan title: ${run.title}. ${project ? `MVP: ${JSON.stringify(plan.mvp).slice(0, 1500)}` : `Features: ${JSON.stringify(plan.features).slice(0, 1500)}`}`,
        `QA score: ${qa?.score ?? 'n/a'}. Issues left: ${JSON.stringify((qa?.issues || []).slice(0, 6))}`,
        `Files: ${Object.keys(files).join(', ')}`,
        '',
        `Write the report for the user in ${project ? '6-10' : '4-7'} short lines: what was built, the main features, the QA result, and how to use it (the preview is open in the office and can be marked up to request changes; to run the real backend: npm install && npm start in the project folder${wantMcp ? '; the MCP server: cd mcp-server && npm install, then add it to Claude' : ''}${wantBot ? '; the bot: cd bot && npm install && BOT_TOKEN=... npm start' : ''}). Plain text, no headings.`,
        languageRule(),
      ].join('\n'), 'quick');
      summary = sR.text.trim();
    } catch {
      summary = '';
    }
    this.end(run, S.summary);

    const result: WebsiteResult = {
      kind: 'website', project, deliverables: ['web', 'api', ...(wantMcp ? ['mcp'] : []), ...(wantBot ? ['bot'] : [])],
      plan, files, html, qa, summary, notes, versions: [{ n: 1, html, note: uz ? 'Birinchi versiya' : 'First version', at: Date.now() }],
    };
    if (this.hooks.saveWorkspace) {
      try {
        const saved = await this.hooks.saveWorkspace(run.id, files);
        if (saved) {
          result.previewUrl = saved.url;
          result.workspaceDir = saved.dir;
        }
      } catch (e) {
        notes.push(String((e as Error).message || e));
      }
    }
    run.result = result;
    this.say(S.summary.agentId, summary || (uz ? '✅ Tayyor.' : '✅ Ready.'), { runId: run.id, action: { label: uz ? '🌐 Natijani ko‘rish' : '🌐 Open the result', runId: run.id } });
  }

  private frontendPrompt(request: string, planJson: string, interview: string, project: boolean, withImages: boolean) {
    return [
      `User request: """${request}"""`,
      interview,
      withImages ? 'The user attached reference image(s): match their layout, colours and mood as closely as you can.' : '',
      '',
      `Plan:\n${planJson}`,
      '',
      `You are the frontend engineer. Build the complete ${project ? 'web app (every role’s screens, including the admin panel)' : 'web app'} as ONE self-contained HTML file.`,
      'Hard requirements:',
      '- Everything inline: CSS in <style>, JavaScript in <script>. No remote images, fonts or requests to other sites. Use emoji, CSS, gradients and inline SVG for visuals.',
      '- The ONLY allowed external scripts, and only when the request needs them: 3D → https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js (global THREE), rich animation → https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js (global gsap). If a library fails to load, the page must still work (CSS fallback). For “3D”, “animatsion” or “interaktiv” requests really use them: a live 3D scene or 3D product cards, smooth scroll/hover animations, micro-interactions.',
      '- Implement every page and feature in the plan with real, working interactions (forms, validation, lists, search, carts, scoring, admin tools), never placeholders or "coming soon".',
      '- Data layer: one `api` object whose methods match the plan’s API. On first use it probes fetch("./api/health"); if that throws, times out after 3 seconds, returns a non-2xx status or a non-JSON body, it switches for the rest of the session to a built-in demo database in localStorage (in-memory if localStorage throws) seeded with realistic demo data, and the app keeps working normally. Show a small "Demo rejim" badge in that case. The preview runs inside a sandboxed iframe with no server, so this path must work end to end.',
      '- Demo data must make every flow usable immediately: include ready examples (for a quiz app: a published test with a short code such as DEMO1 and 5+ questions; for a shop: 8+ products with prices; for a school system: classes, students, teachers, grades) and show demo logins or entry points on the home page.',
      '- Hash-based navigation between views; responsive from 360px phones to desktop; labelled form fields; visible focus; a clean, modern, distinctive look with one consistent palette.',
      '- Show real feedback: empty states, success and error messages, results screens.',
      `- Keep the file compact so it can be written quickly: roughly ${project ? '700-1200' : '500-900'} lines, concise CSS, no code comments, no repeated markup (render lists from data).`,
      languageRule(),
      'Reply with ONLY the file:',
      'FILE: public/index.html',
      '```html\n<!doctype html>\n...\n```',
    ].join('\n');
  }

  private websiteReadme(plan: Record<string, unknown>, qa: WebsiteResult['qa'], dbNote: string, fileNames: string[]) {
    const list = (x: unknown) => (Array.isArray(x) ? x : []);
    const has = (p: string) => fileNames.some((f) => f.startsWith(p));
    return [
      `# ${plan.title || 'Website'}`,
      '',
      String(plan.summary || ''),
      '',
      '## Features',
      ...list(plan.mvp || plan.features).map((f: { name?: string; detail?: string }) => `- **${f.name}** — ${f.detail || ''}`),
      '',
      '## Pages',
      ...list(plan.pages).map((p: { name?: string; purpose?: string }) => `- ${p.name}: ${p.purpose || ''}`),
      '',
      '## API',
      ...list(plan.api).map((a: { method?: string; path?: string; purpose?: string }) => `- \`${a.method} ${a.path}\` — ${a.purpose || ''}`),
      '',
      '## Run',
      '',
      '```bash',
      'npm install',
      'npm start   # http://localhost:3000',
      '```',
      '',
      '`public/index.html` also works on its own: without the server it keeps data in the browser (localStorage).',
      has('mcp-server/') ? '\n## MCP server\n\nSee `mcp-server/README.md`: `cd mcp-server && npm install`, then add it to Claude Desktop or `claude mcp add`.\n' : '',
      has('bot/') ? '\n## Telegram bot\n\nSee `bot/README.md`: create a bot with @BotFather, then `cd bot && npm install && BOT_TOKEN=... API_URL=http://localhost:3000 npm start`.\n' : '',
      dbNote ? `## Database notes\n\n${dbNote}\n` : '',
      qa ? `## QA\n\nScore: ${qa.score ?? '—'}\n\n${(qa.issues || []).map((i) => `- [${i.severity}] ${i.note}`).join('\n')}\n` : '',
      '_Built by the AI Agent Office team._',
      '',
    ].join('\n');
  }

  private planMarkdown(plan: Record<string, unknown>, interview: string) {
    const list = (x: unknown) => (Array.isArray(x) ? x : []);
    const s = (x: unknown) => (typeof x === 'string' ? x : x && typeof x === 'object' ? Object.values(x as Record<string, unknown>).filter((v) => typeof v === 'string').join(' — ') : String(x ?? ''));
    return [
      `# ${plan.title || 'Project'} — plan`,
      '',
      String(plan.summary || ''),
      plan.problem ? `\n**Problem:** ${plan.problem}\n` : '',
      '## Users',
      ...list(plan.users).map((u) => `- ${s(u)}`),
      '',
      '## MVP',
      ...list(plan.mvp).map((u) => `- ${s(u)}`),
      '',
      '## Later',
      ...list(plan.later).map((u) => `- ${s(u)}`),
      '',
      '## Modules',
      ...list(plan.modules).map((u) => `- ${s(u)}`),
      '',
      '## Risks',
      ...list(plan.risks).map((u) => `- ${s(u)}`),
      '',
      '## Success metrics',
      ...list(plan.metrics).map((u) => `- ${s(u)}`),
      '',
      '## Milestones',
      ...list(plan.milestones).map((u, i) => `${i + 1}. ${s(u)}`),
      '',
      interview ? `## Interview\n\n${interview}\n` : '',
    ].join('\n');
  }

  // --------------------------------------------------------- revisions --
  /** The user marked things on the preview and said what to change: build the next version. */
  async revise(runId: string, fb: { text: string; marks: Mark[]; errors: string[] }) {
    const run = this.runs.find((r) => r.id === runId);
    const r = run?.result;
    if (!run || !r || r.kind !== 'website' || run.status === 'running' || run.status === 'waiting') return false;
    const uz = lang() === 'uz';
    if (!r.versions.length) r.versions.push({ n: 1, html: r.html, note: uz ? 'Birinchi versiya' : 'First version', at: run.finishedAt || Date.now() });
    const n = r.versions.length + 1;
    const S = {
      fix: this.step(`revise${n}`, 'agent:claude-skills:cs-frontend-engineer', { uz: `Tuzatish → v${n}`, en: `Changes → v${n}` }),
      check: this.step(`check${n}`, 'agent:ecc:code-reviewer', { uz: `Tekshiruv v${n}`, en: `Check v${n}` }),
    };
    run.steps.push(S.fix, S.check);
    run.status = 'running';
    this.hooks.changed(run);
    const what = fb.text.trim() || (fb.errors.length ? (uz ? 'Saytdagi xatolarni tuzat' : 'Fix the errors in the site') : '');
    this.say('user', `✏️ v${n - 1} → ${what}${fb.marks.length ? ` (${fb.marks.length} ${uz ? 'ta belgi' : 'marks'})` : ''}`, { runId });
    const marks = fb.marks.map((m) => `#${m.n} ${m.kind === 'area' ? 'marked area around' : 'element'} ${m.selector || ''} <${m.tag || '?'}> text: "${clip(m.text || '', 140)}" html: ${clip(m.html || '', 320)}${m.note ? `\n   user note: ${m.note}` : ''}`);
    try {
      const fr = await this.callHtml(run, S.fix, [
        'The user reviewed your app in the office preview and wants changes.',
        `User’s request: """${what}"""`,
        marks.length ? `Places the user marked on the page (numbers match their notes):\n${marks.join('\n')}` : '',
        fb.errors.length ? `JavaScript errors the preview reported (fix their causes):\n${fb.errors.slice(0, 10).join('\n')}` : '',
        '',
        'Rules: change exactly what was asked and fix the reported errors; keep everything else as it is; keep the file complete and working.',
        `Keep the offline fallback: ${OFFLINE_NOTE}`,
        languageRule(),
        '',
        'Current index.html:',
        '```html',
        r.html,
        '```',
        '',
        'Reply with ONLY the complete updated file:',
        'FILE: public/index.html',
        '```html\n<!doctype html>...\n```',
      ].join('\n'), 'default');
      const got = extractHtml(fr.text);
      if (!got) throw new EngineError('no_html', 'no html');
      this.end(run, S.fix, S.check);
      let check: Version['check'];
      try {
        const cR = await this.call(run, S.check, [
          `The user asked for these changes: """${what}"""`,
          marks.length ? `Marked places:\n${marks.join('\n')}` : '',
          '',
          'New index.html:',
          clip(got.html, 60000),
          '',
          'Check whether the new file really implements each requested change. Reply with ONLY a JSON object: {"done": [{"item": "", "ok": true}], "summary": ""}',
          languageRule(),
        ].join('\n'), 'quick');
        check = parseJson<Version['check']>(cR.text);
      } catch {
        S.check.status = 'error';
      }
      this.end(run, S.check);
      r.versions.push({ n, html: got.html, note: what, at: Date.now(), check });
      r.html = got.html;
      r.files['public/index.html'] = got.html;
      if (this.hooks.saveWorkspace) {
        try {
          const saved = await this.hooks.saveWorkspace(`${run.id}-v${n}`, r.files);
          if (saved) {
            r.previewUrl = saved.url;
            r.workspaceDir = saved.dir;
          }
        } catch {
          /* the in-office preview still works */
        }
      }
      run.status = 'done';
      this.say(S.fix.agentId, `✅ v${n} ${uz ? 'tayyor' : 'ready'}: ${check?.summary || what}`, { runId, action: { label: uz ? '🌐 Ko‘rish' : '🌐 View', runId } });
    } catch (e) {
      run.status = 'done';
      if (S.fix.status === 'run') S.fix.status = 'error';
      this.say('system', `⚠️ ${explainError(e)}`, { runId });
    }
    run.finishedAt = Date.now();
    this.save();
    this.hooks.changed(run);
    this.hooks.done(run);
    return true;
  }

  /** Make an earlier version current again (as a new version). */
  restore(runId: string, n: number) {
    const run = this.runs.find((r) => r.id === runId);
    const r = run?.result;
    if (!run || !r || r.kind !== 'website') return;
    const v = r.versions.find((x) => x.n === n);
    if (!v) return;
    const next = r.versions.length + 1;
    r.versions.push({ n: next, html: v.html, note: lang() === 'uz' ? `v${n} ga qaytarildi` : `Restored v${n}`, at: Date.now() });
    r.html = v.html;
    r.files['public/index.html'] = v.html;
    this.save();
    this.hooks.changed(run);
  }

  // ------------------------------------------------------------- content --
  private async runContent(run: CrewRun) {
    run.teamId = 'content';
    const uz = lang() === 'uz';
    const engine = await this.engine();
    const S = {
      analyze: this.step('analyze', 'agent:claude-skills:cs-content-creator', { uz: 'Akkaunt tahlili', en: 'Account analysis' }),
      strategy: this.step('strategy', 'agent:claude-skills:content-strategist', { uz: 'Strategiya va kontent reja', en: 'Strategy & content plan' }),
      posts: this.step('posts', 'agent:claude-skills:cs-growth-strategist', { uz: 'Tayyor postlar', en: 'Ready posts' }),
      summary: this.step('summary', 'agent:claude-office:office-manager', { uz: 'Hisobot', en: 'Report' }),
    };
    run.steps = Object.values(S);
    const hasImages = run.images.length > 0 && engine.images;
    if (run.images.length && !engine.images) {
      this.say('system', uz ? '⚠️ Bu yerda rasmlarni yuborib bo‘lmaydi — tahlil faqat matn asosida qilinadi.' : '⚠️ Images cannot be sent here, so the analysis uses your text only.', { runId: run.id });
    }
    this.say('agent:claude-office:office-manager', uz ? '👌 Kontent jamoasi ishni boshladi: tahlil → strategiya → postlar.' : '👌 The Content team started: analysis → strategy → posts.', { runId: run.id });

    const aR = await this.call(run, S.analyze, [
      hasImages ? `The user sent ${run.images.length} screenshot(s) of a social media account (Instagram, Telegram or similar). Study them carefully: profile, bio, grid/feed, post designs, captions, numbers you can read.` : 'The user described an account or content idea (no screenshots available).',
      `User request: """${run.prompt || (uz ? 'Akkauntni tahlil qil va uslubini mening kontentimga qo‘lla' : 'Analyse this account and apply its style to my content')}"""`,
      '',
      'Analyse the account like a senior social media strategist. Reply with ONLY a JSON object:',
      '{"platform": "", "account": "", "niche": "", "audience": "", "positioning": "", "metrics": [{"name": "", "value": ""}], "tone": "", "visualStyle": {"palette": ["#hex"], "typography": "", "layout": "", "imagery": ""}, "contentPillars": [{"name": "", "share": "30%", "examples": ""}], "formats": [{"type": "", "share": "", "note": ""}], "hooks": [""], "cta": [""], "cadence": "", "strengths": [""], "weaknesses": [""], "opportunities": [""]}',
      'Only report numbers you can actually read; otherwise say it is an estimate.',
      languageRule(),
    ].join('\n'), 'default', { images: hasImages ? run.images : undefined });
    const analysis = parseJson<Record<string, unknown>>(aR.text);
    this.say(S.analyze.agentId, uz ? `📊 Tahlil tayyor: ${analysis.niche || analysis.platform || ''}. Kuchli tomonlar va uslub aniqlandi.` : `📊 Analysis ready: ${analysis.niche || analysis.platform || ''}. Strengths and style identified.`, { runId: run.id });
    this.end(run, S.analyze, S.strategy);

    const aJson = JSON.stringify(analysis, null, 1);
    const sR = await this.call(run, S.strategy, [
      `Analysis of the reference account:\n${aJson}`,
      '',
      `User request: """${run.prompt}"""`,
      '',
      'Apply what works in that account to the USER’s own content (their niche comes from the request; if it is not given, adapt to the same niche).',
      'Reply with ONLY a JSON object:',
      '{"positioning": "", "audience": "", "pillars": [{"name": "", "why": "", "share": ""}], "tone": {"do": [""], "dont": [""]}, "visual": {"palette": ["#hex"], "fonts": "", "templates": [""]}, "schedule": {"postsPerWeek": 0, "bestTimes": [""]}, "plan": [{"day": 1, "pillar": "", "format": "Reels|Carousel|Post|Story|Telegram post", "topic": "", "hook": "", "cta": ""}], "kpis": [""]}',
      'The plan has exactly 14 days.',
      languageRule(),
    ].join('\n'), 'default');
    const strategy = parseJson<Record<string, unknown>>(sR.text);
    this.say(S.strategy.agentId, uz ? `🗓️ 14 kunlik kontent reja va uslub qo‘llanmasi tayyor.` : `🗓️ 14-day content plan and style guide ready.`, { runId: run.id });
    this.end(run, S.strategy, S.posts);

    const pR = await this.call(run, S.posts, [
      `Reference analysis:\n${clip(aJson, 6000)}`,
      `Strategy:\n${clip(JSON.stringify(strategy, null, 1), 6000)}`,
      `User request: """${run.prompt}"""`,
      '',
      'Write 5 ready-to-publish posts for the user in this style (mix of formats from the plan).',
      'Reply with ONLY a JSON array: [{"title": "", "format": "", "hook": "", "caption": "", "hashtags": [""], "visual": "", "cta": ""}]',
      languageRule(),
    ].join('\n'), 'default');
    const posts = parseJson<Record<string, unknown>[]>(pR.text);
    this.end(run, S.posts, S.summary);

    let summary = '';
    try {
      const r = await this.call(run, S.summary, [
        `Content team results for: """${run.prompt}"""`,
        `Niche: ${analysis.niche}. Strengths: ${JSON.stringify(analysis.strengths)}. Pillars: ${JSON.stringify(strategy.pillars)}.`,
        'Write the report for the user in 4-6 short lines: what the reference account does well, the style to copy, the plan, and the first 3 actions for this week. Plain text.',
        languageRule(),
      ].join('\n'), 'quick');
      summary = r.text.trim();
    } catch {
      summary = '';
    }
    this.end(run, S.summary);
    run.title = `${clip(String(analysis.account || analysis.platform || 'Kontent').split(/[—(|]/)[0].trim(), 40)} → ${uz ? 'kontent reja' : 'content plan'}`;
    run.result = { kind: 'content', analysis, strategy, posts: Array.isArray(posts) ? posts : [], summary };
    this.say(S.summary.agentId, summary || '✅', { runId: run.id, action: { label: uz ? '📊 Natijani ko‘rish' : '📊 Open the results', runId: run.id } });
  }

  // ---------------------------------------------------------------- task --
  private async runTask(run: CrewRun, pinned?: string) {
    const uz = lang() === 'uz';
    const team = pinned ? this.teams.find((t) => t.members.some((m) => m.id === pinned)) || this.teamFor(run.prompt) : this.teamFor(run.prompt);
    run.teamId = team.id;
    const ranked = this.ranked(team.id);
    const routed = this.router.route(run.prompt, 8).map((r) => r.item.id);
    const specialist = pinned || routed.find((id) => team.members.some((m) => m.id === id)) || ranked[0].id;
    const lead = ranked.find((m) => m.id !== specialist)?.id || specialist;
    const reviewer = ranked.find((m) => m.id !== specialist && m.id !== lead)?.id || lead;
    const S = {
      plan: this.step('plan', lead, { uz: 'Reja', en: 'Plan' }),
      work: this.step('work', specialist, { uz: 'Bajarish', en: 'Delivery' }),
      review: this.step('review', reviewer, { uz: 'Tekshiruv', en: 'Review' }),
    };
    run.steps = Object.values(S);
    this.say('agent:claude-office:office-manager', uz ? `👌 “${tr(team.name)}” jamoasiga topshirildi: ${this.item(specialist).name} bajaradi, ${this.item(reviewer).name} tekshiradi.` : `👌 Handed to ${tr(team.name)}: ${this.item(specialist).name} delivers, ${this.item(reviewer).name} reviews.`, { runId: run.id });

    const pR = await this.call(run, S.plan, [
      `Task from the user: """${run.prompt}"""`,
      `Your team: ${tr(team.name)}. ${this.item(specialist).name} will do the work.`,
      'Reply with ONLY a JSON object: {"goal": "", "steps": [""], "deliverable": "", "quality": [""]}',
      languageRule(),
    ].join('\n'), 'quick');
    let plan: Record<string, unknown> | undefined;
    try {
      plan = parseJson<Record<string, unknown>>(pR.text);
    } catch {
      plan = undefined;
    }
    this.end(run, S.plan, S.work);

    const wR = await this.call(run, S.work, [
      `Task from the user: """${run.prompt}"""`,
      plan ? `Plan from ${this.item(lead).name}:\n${JSON.stringify(plan, null, 1)}` : '',
      '',
      'Deliver the finished result now, in Markdown, complete and ready to use. Use headings, lists and tables where they help. Say clearly when something is an estimate.',
      languageRule(),
    ].join('\n'), 'default', { images: run.images.length ? run.images : undefined });
    this.end(run, S.work, S.review);

    let review: TaskResult['review'];
    try {
      const rR = await this.call(run, S.review, [
        `Task: """${run.prompt}"""`,
        `Result from ${this.item(specialist).name}:\n${clip(wR.text, 20000)}`,
        'Review it. Reply with ONLY a JSON object: {"score": 0-100, "strengths": [""], "improvements": [""]}',
        languageRule(),
      ].join('\n'), 'default');
      review = parseJson<TaskResult['review']>(rR.text);
    } catch {
      S.review.status = 'error';
    }
    this.end(run, S.review);
    run.result = { kind: 'task', plan, answer: wR.text, review };
    const first = wR.text.replace(/[#*`>|-]/g, ' ').replace(/\s+/g, ' ').trim();
    this.say(specialist, `✅ ${clip(first, 180)}`, { runId: run.id, action: { label: uz ? '📄 To‘liq natija' : '📄 Full result', runId: run.id } });
  }
}
