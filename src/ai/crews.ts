// Multi-agent crews. A message from the user becomes one of:
//   chat     — a few agents answer in character ("salom hammaga")
//   website  — Coder team: plan -> database -> backend | frontend -> QA -> (fix) -> summary
//   content  — Content team: screenshot analysis -> strategy + plan -> ready posts -> summary
//   task     — best team for the job: lead plans -> specialist delivers -> reviewer checks
// Every step is a real agent call through the Engine, using that agent's own
// instructions; the office animates who is working through the hooks.
import type { Item, OfficeData } from '../data';
import { currentLang } from '../i18n';
import type { Router } from '../router';
import { EngineError, extractFiles, extractHtml, parseJson, type Engine, type Tier } from './engine';

export type CrewKind = 'chat' | 'website' | 'content' | 'task';
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
}

export interface ChatMsg {
  from: 'user' | 'system' | string;
  text: string;
  time: number;
  runId?: string;
  images?: string[];
  action?: { label: string; runId: string };
}

export interface WebsiteResult {
  kind: 'website';
  plan: Record<string, unknown>;
  files: Record<string, string>;
  html: string;
  previewUrl?: string;
  workspaceDir?: string;
  qa?: { score?: number; checks?: { name: string; ok: boolean; note?: string }[]; issues?: { severity: string; note: string }[]; summary?: string };
  summary: string;
  notes: string[];
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
  status: 'running' | 'done' | 'error';
  startedAt: number;
  finishedAt?: number;
  engine: Engine['kind'];
  result: WebsiteResult | ContentResult | TaskResult | null;
  error?: string;
}

export interface CrewHooks {
  stepStart(run: CrewRun, step: Step): void;
  stepEnd(run: CrewRun, step: Step, next?: Step): void;
  message(msg: ChatMsg): void;
  changed(run?: CrewRun): void;
  done(run: CrewRun): void;
  saveWorkspace?(id: string, files: Record<string, string>): Promise<{ url: string; dir: string } | null>;
}

const lang = () => currentLang();
const tr = (l: L) => l[lang()];
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const LANGUAGE_RULE =
  'Write everything the user will read in the SAME language and script as the user request (if it is Uzbek, use Uzbek in Latin script with correct oʻ/gʻ letters).';

const GREETING = /^(salom|assalomu?|assalom|va\s?alaykum|hayrli|xayrli|qalay|yaxshimi|rahmat|raxmat|hello|hi|hey|good (morning|evening)|how are|привет|здравствуйте|как дела)/i;
const TASK_VERB = /\b(qil|qilib|tuz|tuzib|yoz|yozib|yarat|tayyorla|tahlil|analiz|hisobla|tekshir|build|make|create|write|analy[sz]e|design|plan)\w*/i;
const WEBSITE = /\b(sayt|site|website|web[- ]?sayt|veb|web ?app|landing|platforma|ilova|dastur|app|portal|internet[- ]?do‘kon|internet[- ]?dokon|admin ?panel)\b/i;
const CONTENT = /\b(instagram|insta|telegram|tiktok|youtube|reels|post|kontent|content|smm|blog|kanal|akkaunt|akaunt|account|obunachi|followers|caption|hashtag|story|uslub|stil)\w*/i;

let seq = 0;
const newId = () => `run-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export class Crews {
  readonly runs: CrewRun[] = [];
  readonly chat: ChatMsg[] = [];
  private teamById: Map<string, Team>;
  private benchByAgent = new Map<string, Bench>();

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
    for (const b of bench) {
      const prev = this.benchByAgent.get(b.agentId);
      if (!prev || (b.score ?? 0) > (prev.score ?? 0)) this.benchByAgent.set(b.agentId, b);
    }
  }

  team(id: string) {
    return this.teamById.get(id)!;
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

  // ------------------------------------------------------------ routing --
  classify(text: string, images: Blob[]): CrewKind {
    const t = text.trim();
    if (images.length) return 'content';
    if (GREETING.test(t) && !TASK_VERB.test(t) && t.length < 140) return 'chat';
    if (WEBSITE.test(t) && TASK_VERB.test(t)) return 'website';
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

  persona(agentId: string, extra = '') {
    const it = this.item(agentId);
    return [
      `You are "${it.name}", an AI agent working in the AI Agent Office (a team of specialist agents).`,
      `Your role: ${it.description}`,
      '',
      'Your own instructions (follow their spirit; you have no tools in this office, so answer directly):',
      this.prompts[agentId] || '',
      '',
      LANGUAGE_RULE,
      extra,
    ].join('\n');
  }

  private async call(run: CrewRun, step: Step, prompt: string, tier: Tier, opts: { images?: Blob[] } = {}) {
    const engine = await this.engine();
    const t0 = performance.now();
    step.status = 'run';
    this.hooks.stepStart(run, step);
    this.hooks.changed(run);
    try {
      const r = await engine.ask(prompt, {
        system: this.persona(step.agentId),
        tier,
        images: opts.images,
        onText: (text) => {
          step.live = clip(text.replace(/\s+/g, ' ').trim(), 160);
          this.hooks.changed(run);
        },
      });
      step.seconds = Math.round((performance.now() - t0) / 100) / 10;
      step.output = r.text;
      step.status = 'done';
      return r;
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
  private async callHtml(run: CrewRun, step: Step, prompt: string, tier: Tier) {
    const first = await this.call(run, step, prompt, tier);
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
      steps: [], status: 'running', startedAt: Date.now(), engine: engine.kind, result: null,
    };
    this.runs.unshift(run);
    try {
      if (kind === 'website') await this.runWebsite(run);
      else if (kind === 'content') await this.runContent(run);
      else await this.runTask(run, pinnedAgent);
      run.status = 'done';
    } catch (e) {
      run.status = 'error';
      run.error = e instanceof EngineError ? `${e.code}: ${e.message}` : String((e as Error)?.message || e);
      this.say('system', `⚠️ ${run.error}`, { runId: run.id });
    }
    run.finishedAt = Date.now();
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
      LANGUAGE_RULE,
      'Reply with ONLY a JSON array: [{"agent": "<id>", "text": "<reply>"}], one object per agent above.',
    ].join('\n');
    const seats: Step[] = responders.map((id) => ({ key: 'chat', agentId: id, label: { uz: 'Suhbat', en: 'Chat' }, status: 'run' }));
    const pseudo: CrewRun = { id: newId(), kind: 'chat', title: text, prompt: text, images: [], imageUrls: [], teamId: 'office', steps: seats, status: 'running', startedAt: Date.now(), engine: engine.kind, result: null };
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

  // ------------------------------------------------------------- website --
  private async runWebsite(run: CrewRun) {
    run.teamId = 'coder';
    const uz = lang() === 'uz';
    const S = {
      plan: this.step('plan', 'agent:ecc:planner', { uz: 'Mukammal reja', en: 'Complete plan' }),
      db: this.step('db', 'agent:ecc:database-reviewer', { uz: 'Maʼlumotlar bazasi', en: 'Database' }),
      backend: this.step('backend', 'agent:claude-skills:cs-backend-engineer', { uz: 'Backend (API)', en: 'Backend (API)' }),
      frontend: this.step('frontend', 'agent:claude-skills:cs-frontend-engineer', { uz: 'Frontend (sayt)', en: 'Frontend (site)' }),
      qa: this.step('qa', 'agent:ecc:tdd-guide', { uz: 'Test va sifat nazorati', en: 'Testing & QA' }),
      fix: this.step('fix', 'agent:claude-skills:cs-frontend-engineer', { uz: 'Xatolarni tuzatish', en: 'Fixes' }),
      recheck: this.step('recheck', 'agent:ecc:code-reviewer', { uz: 'Qayta tekshiruv', en: 'Re-check' }),
      summary: this.step('summary', 'agent:claude-office:office-manager', { uz: 'Hisobot', en: 'Report' }),
    };
    run.steps = Object.values(S);
    this.say('agent:claude-office:office-manager', uz ? '👌 Vazifa Coder jamoasiga topshirildi: avval reja, keyin baza, backend va frontend, oxirida test.' : '👌 Handed to the Coder team: plan first, then database, backend and frontend, then tests.', { runId: run.id });

    // 1. Plan
    const planR = await this.call(run, S.plan, [
      'The user asked the office to build a website:',
      `"""${run.prompt}"""`,
      '',
      'You are the planner of the Coder team. Produce a complete, buildable plan for a small but polished web app that fully satisfies the request.',
      'Reply with ONLY a JSON object:',
      '{"title": "", "summary": "", "audience": [""], "features": [{"name": "", "detail": ""}], "pages": [{"name": "", "purpose": ""}], "entities": [{"name": "", "fields": [{"name": "", "type": "", "note": ""}]}], "api": [{"method": "GET", "path": "/api/...", "purpose": ""}], "roles": [""], "stack": {"frontend": "HTML/CSS/JS", "backend": "Node.js + Express", "database": "SQLite"}, "milestones": [""]}',
      'Realistic scope for one polished release: 3-6 pages or views, 3-6 entities, 6-12 API endpoints.',
      LANGUAGE_RULE,
    ].join('\n'), 'default');
    const plan = parseJson<Record<string, unknown>>(planR.text);
    run.title = String(plan.title || run.title);
    const planJson = JSON.stringify(plan, null, 1);
    this.say(S.plan.agentId, uz ? `🧭 Reja tayyor: “${run.title}” — ${(plan.features as unknown[])?.length || 0} ta funksiya, ${(plan.pages as unknown[])?.length || 0} ta sahifa.` : `🧭 Plan ready: “${run.title}” — ${(plan.features as unknown[])?.length || 0} features, ${(plan.pages as unknown[])?.length || 0} pages.`, { runId: run.id });
    this.end(run, S.plan, S.db);

    // 2. Database -> backend, in parallel with the frontend.
    const backendChain = (async () => {
      const dbR = await this.call(run, S.db, [
        `Plan:\n${planJson}`,
        '',
        'You are the database engineer. Write the SQLite schema for this plan and realistic seed data.',
        'Reply with exactly two code blocks, each preceded by its FILE line:',
        'FILE: schema.sql',
        '```sql\n...\n```',
        'FILE: seed.sql',
        '```sql\n... INSERT statements, 4-12 rows per main table, realistic content ...\n```',
        'Then one short paragraph on key decisions (keys, indexes, relations).',
        LANGUAGE_RULE,
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
        'It serves the frontend from ./public, creates the database from schema.sql and seed.sql on first run, validates input, returns JSON errors, and protects admin actions with a password from the ADMIN_PASSWORD environment variable when the plan has admin roles.',
        'Reply with exactly two code blocks, each preceded by its FILE line:',
        'FILE: package.json',
        '```json\n...\n```',
        'FILE: server.js',
        '```js\n...\n```',
        'Keep server.js under about 250 lines.',
      ].join('\n'), 'default');
      this.end(run, S.backend, S.qa);
      return { dbFiles, beFiles: extractFiles(beR.text), dbNote: dbR.text.replace(/```[\s\S]*?```/g, '').replace(/FILE:.*\n/g, '').trim() };
    })();

    const frontendChain = (async () => {
      const r = await this.callHtml(run, S.frontend, this.frontendPrompt(run.prompt, planJson), 'default');
      const got = extractHtml(r.text);
      if (!got) throw new EngineError('no_html', uz ? 'Frontend agent HTML qaytarmadi' : 'The frontend agent returned no HTML');
      this.end(run, S.frontend, S.qa);
      return { html: got.html, repaired: got.repaired || r.truncated };
    })();

    const [be, fe] = await Promise.all([backendChain, frontendChain]);
    let html = fe.html;
    const notes: string[] = [];
    if (fe.repaired) notes.push(uz ? 'Frontend javobi uzilib qolgan edi, oxiri avtomatik yopildi.' : 'The frontend reply was cut off; its end was closed automatically.');

    // 3. QA -> fix -> re-check. The offline demo database is a requirement of the
    // preview, so QA must not report it and the fix must never remove it.
    const OFFLINE_NOTE =
      'Intentional and required: when ./api is unreachable the app switches to a built-in demo database in localStorage (or memory) so the preview works without a server. Real security (answers, auth) is enforced by server.js in production. Do not report this, and never remove it.';
    const review = async (step: Step, code: string) => {
      const r = await this.call(run, step, [
        `Plan:\n${planJson}`,
        '',
        'index.html (the whole app):',
        clip(code, 60000),
        '',
        'You are QA. Review the app against the plan like a careful tester reading the code: missing pages or features, broken handlers, JavaScript errors you can see, data that is never saved, layout that breaks on phones, text not in the user’s language.',
        OFFLINE_NOTE,
        'Reply with ONLY a JSON object: {"score": 0-100, "checks": [{"name": "", "ok": true, "note": ""}], "issues": [{"severity": "high|medium|low", "note": ""}], "summary": ""}',
        'Use "high" only for a broken core feature or a missing required page.',
        LANGUAGE_RULE,
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
    if (toFix.length && html.length < 70000) {
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
    for (const f of [...be.dbFiles, ...be.beFiles]) {
      const name = f.name || (f.lang === 'sql' ? 'schema.sql' : f.lang === 'json' ? 'package.json' : f.lang === 'js' || f.lang === 'javascript' ? 'server.js' : '');
      if (name) files[name.replace(/^\/+/, '')] = f.content;
    }
    files['README.md'] = this.websiteReadme(plan, qa, be.dbNote);

    // 4. Summary
    let summary = '';
    try {
      const sR = await this.call(run, S.summary, [
        `The Coder team finished this request: """${run.prompt}"""`,
        `Plan title: ${run.title}. Features: ${JSON.stringify(plan.features).slice(0, 1500)}`,
        `QA score: ${qa?.score ?? 'n/a'}. Issues left: ${JSON.stringify((qa?.issues || []).slice(0, 6))}`,
        `Files: ${Object.keys(files).join(', ')}`,
        '',
        'Write the report for the user in 4-7 short lines: what was built, the main features, the QA result, and how to use it (the preview is open in the office; to run the real backend: npm install && npm start in the project folder). Plain text, no headings.',
        LANGUAGE_RULE,
      ].join('\n'), 'quick');
      summary = sR.text.trim();
    } catch {
      summary = '';
    }
    this.end(run, S.summary);

    const result: WebsiteResult = { kind: 'website', plan, files, html, qa, summary, notes };
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
    this.say(S.summary.agentId, summary || (uz ? '✅ Sayt tayyor.' : '✅ The site is ready.'), { runId: run.id, action: { label: uz ? '🌐 Saytni ko‘rish' : '🌐 Open the site', runId: run.id } });
  }

  private frontendPrompt(request: string, planJson: string) {
    return [
      `User request: """${request}"""`,
      '',
      `Plan:\n${planJson}`,
      '',
      'You are the frontend engineer. Build the complete web app as ONE self-contained HTML file.',
      'Hard requirements:',
      '- Everything inline: CSS in <style>, JavaScript in <script>. No external URLs at all: no CDNs, web fonts, remote images or requests to other sites. Use emoji, CSS and inline SVG for visuals.',
      '- Implement every page and feature in the plan with real, working interactions (forms, validation, lists, search, scoring, admin tools), never placeholders or "coming soon".',
      '- Data layer: one `api` object whose methods match the plan’s API. On first use it probes fetch("./api/health"); if that throws, times out after 3 seconds, returns a non-2xx status or a non-JSON body, it switches for the rest of the session to a built-in demo database in localStorage (in-memory if localStorage throws) seeded with realistic demo data, and the app keeps working normally. Show a small "Demo rejim" badge in that case. The preview runs inside a sandboxed iframe with no server, so this path must work end to end.',
      '- Demo data must make every flow usable immediately: include at least one ready example (for a quiz app: a published test with a short code such as DEMO1 and 5+ questions, plus sample results) and show that code or entry point on the home page.',
      '- Hash-based navigation between views; responsive from 360px phones to desktop; labelled form fields; visible focus; a clean, modern, distinctive look with one consistent palette.',
      '- Show real feedback: empty states, success and error messages, results screens.',
      '- Keep the file compact so it can be written quickly: roughly 500-900 lines, concise CSS, no code comments, no repeated markup (render lists from data).',
      LANGUAGE_RULE,
      'Reply with ONLY the file:',
      'FILE: public/index.html',
      '```html\n<!doctype html>\n...\n```',
    ].join('\n');
  }

  private websiteReadme(plan: Record<string, unknown>, qa: WebsiteResult['qa'], dbNote: string) {
    const list = (x: unknown) => (Array.isArray(x) ? x : []);
    return [
      `# ${plan.title || 'Website'}`,
      '',
      String(plan.summary || ''),
      '',
      '## Features',
      ...list(plan.features).map((f: { name?: string; detail?: string }) => `- **${f.name}** — ${f.detail || ''}`),
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
      '',
      dbNote ? `## Database notes\n\n${dbNote}\n` : '',
      qa ? `## QA\n\nScore: ${qa.score ?? '—'}\n\n${(qa.issues || []).map((i) => `- [${i.severity}] ${i.note}`).join('\n')}\n` : '',
      '_Built by the AI Agent Office Coder team._',
      '',
    ].join('\n');
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
      LANGUAGE_RULE,
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
      LANGUAGE_RULE,
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
      LANGUAGE_RULE,
    ].join('\n'), 'default');
    const posts = parseJson<Record<string, unknown>[]>(pR.text);
    this.end(run, S.posts, S.summary);

    let summary = '';
    try {
      const r = await this.call(run, S.summary, [
        `Content team results for: """${run.prompt}"""`,
        `Niche: ${analysis.niche}. Strengths: ${JSON.stringify(analysis.strengths)}. Pillars: ${JSON.stringify(strategy.pillars)}.`,
        'Write the report for the user in 4-6 short lines: what the reference account does well, the style to copy, the plan, and the first 3 actions for this week. Plain text.',
        LANGUAGE_RULE,
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
      LANGUAGE_RULE,
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
      LANGUAGE_RULE,
    ].join('\n'), 'default', { images: run.images.length ? run.images : undefined });
    this.end(run, S.work, S.review);

    let review: TaskResult['review'];
    try {
      const rR = await this.call(run, S.review, [
        `Task: """${run.prompt}"""`,
        `Result from ${this.item(specialist).name}:\n${clip(wR.text, 20000)}`,
        'Review it. Reply with ONLY a JSON object: {"score": 0-100, "strengths": [""], "improvements": [""]}',
        LANGUAGE_RULE,
      ].join('\n'), 'quick');
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
