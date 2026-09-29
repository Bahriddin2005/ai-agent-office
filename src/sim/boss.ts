// The Boss (you, the director) walking the office. On patrol the Boss visits
// agents one by one, looks at their work (real benchmark scores, what they
// learned in Claude Academy, recent errors), says what is good and what is
// missing, and sends whoever needs it to Claude Academy. A "real exam" asks
// the agent a question with the connected AI and has a grader score it.
// You can also take control: walk with WASD / arrows or click where to go.
import type { OfficeData } from '../data';
import type { Crews } from '../ai/crews';
import { currentLang } from '../i18n';
import type { Layout } from '../world/layout';
import type { Academy } from './academy';
import type { Actor, Cast } from './actors';
import type { Director } from './director';

export interface Exam {
  question: string;
  answer: string;
  score: number;
  strengths: string[];
  gaps: string[];
  verdict: string;
}

export interface Finding {
  agentId: string;
  /** 0-100 */
  score: number;
  strengths: string[];
  issues: string[];
  decision: 'academy' | 'ok';
  exam?: Exam;
  at: number;
}

const uz = () => currentLang() === 'uz';
const T = (a: string, b: string) => (uz() ? a : b);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export class BossAI {
  /** walk around and inspect agents on its own */
  patrol = false;
  /** you move the Boss yourself */
  control = false;
  readonly findings: Finding[] = [];
  /** what the Boss is doing right now (shown in the inspector) */
  status = '';
  target: Actor | null = null;
  private order: Actor[] = [];
  private idx = 0;
  private busy = false;
  private listeners: (() => void)[] = [];

  constructor(
    readonly data: OfficeData,
    readonly layout: Layout,
    readonly cast: Cast,
    readonly academy: Academy,
    readonly director: Director,
    readonly crews: Crews,
    private now: () => number,
    /** a real exam with the connected AI, or null when none is connected */
    private exam: (agentId: string) => Promise<Exam | null>,
  ) {
    // Visit the buildings in turn, desk by desk.
    this.order = layout.zones.flatMap((z) => z.agents.map((a) => cast.byItem.get(a.id)).filter((x): x is Actor => !!x));
    this.status = T('Qabulxonada', 'At reception');
  }

  get boss() {
    return this.cast.boss;
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  setPatrol(on: boolean) {
    this.patrol = on;
    if (!on && !this.busy) {
      this.status = T('Qabulxonaga qaytmoqda', 'Going back to reception');
      this.boss.plan([{ go: this.boss.home }], true);
      this.boss.at = this.cast.here(this.boss);
    }
    this.changed();
  }

  setControl(on: boolean) {
    this.control = on;
    if (on) {
      this.patrol = false;
      this.status = T('Siz boshqaryapsiz', 'You are in control');
      this.boss.plan([], true);
      this.boss.at = this.cast.here(this.boss);
    }
    this.changed();
  }

  update() {
    if (this.control || this.busy || !this.patrol) return;
    const b = this.boss;
    if (b.path.length || b.current || b.steps.length) return;
    const now = this.now();
    for (let tries = 0; tries < this.order.length; tries++) {
      const a = this.order[this.idx++ % this.order.length];
      if (!a.live && now > a.busyUntil && a.atHome) {
        this.inspect(a, false);
        return;
      }
    }
  }

  /** Walk to an agent and check their work; `real` runs an AI exam. */
  inspect(a: Actor, real: boolean) {
    const b = this.boss;
    const desk = a.home.zone?.desks.find((d) => d.seat === a.home);
    if (!a.item) return;
    this.busy = true;
    this.target = a;
    this.status = `${T('Tekshiruvga ketmoqda', 'Walking over to check')}: ${a.name}`;
    this.changed();
    // After you walked the Boss by hand, routes start from where it stands.
    if (!b.path.length && Math.hypot(b.at.x - b.body.x, b.at.z - b.body.z) > 0.6) b.at = this.cast.here(b);
    const talk = () => {
      this.status = `${T('Tekshirmoqda', 'Checking')}: ${a.name}`;
      this.changed();
      b.say(T('🧐 Salom! Ishingizni ko‘rsating.', '🧐 Hi! Show me your work.'), 4);
      if (a.idle) a.plan([{ act: 'talk', dur: 4 }]);
      a.say(T('💬 Mana, hozirgi ishim…', '💬 Here is what I am on…'), 4);
    };
    const conclude = (f: Finding) => {
      this.findings.unshift(f);
      if (this.findings.length > 60) this.findings.pop();
      const good = f.decision === 'ok';
      b.say(good ? `👍 ${f.score}/100 — ${T('zo‘r ishlayapsiz!', 'great work!')}` : `🎓 ${f.score}/100 — ${T('Claude Akademiyasiga boring', 'go to Claude Academy')}`, 6);
      a.say(good ? '😊' : T('📚 Xo‘p, o‘qib kelaman!', '📚 OK, off to learn!'), 5);
      if (!good) this.academy.enroll(a.item!.id, f.issues[0] || '', 'boss');
      this.director.log({
        kind: 'task', icon: good ? '👍' : '🧐',
        text: `${T('Boss tekshiruvi', 'Boss check')}: ${a.name} — ${f.score}/100${f.issues.length ? ` · ${clip(f.issues.join('; '), 80)}` : ''}`,
        actor: a, itemId: a.item!.id,
      });
      this.status = `${a.name}: ${f.score}/100 · ${good ? T('yaxshi', 'good') : T('akademiyaga yuborildi', 'sent to the academy')}`;
      this.busy = false;
      this.target = null;
      this.changed();
    };
    const steps = [
      ...(desk ? [{ go: desk.guest }] : []),
      { act: 'talk' as const, dur: 3.5, onStart: talk },
    ];
    if (!real) {
      b.plan([...steps, { act: 'think' as const, dur: 2.5, onEnd: () => conclude(this.evaluate(a)) }], true);
      return;
    }
    b.plan([...steps, { act: 'think' as const, dur: 3600 }], true);
    this.status = `${T('Haqiqiy imtihon', 'Real exam')}: ${a.name}`;
    this.changed();
    this.exam(a.item.id)
      .then((ex) => {
        const base = this.evaluate(a);
        if (ex) {
          base.exam = ex;
          base.score = Math.round(ex.score * 10);
          base.strengths = ex.strengths.length ? ex.strengths : base.strengths;
          base.issues = ex.gaps.length ? ex.gaps : base.issues;
          base.decision = ex.score < 8 ? 'academy' : 'ok';
        }
        b.plan([{ act: 'talk', dur: 1 }], true);
        conclude(base);
      })
      .catch(() => {
        b.plan([{ act: 'idle', dur: 0.5 }], true);
        conclude(this.evaluate(a));
      });
  }

  /** A quick review from what the office knows about the agent. */
  evaluate(a: Actor): Finding {
    const id = a.item!.id;
    const bench = this.crews.bestBench(id);
    const p = this.academy.of(id);
    const links = (this.data.neighbors.get(id) || []).filter((l) => l.out && l.rel === 'uses_skill').length;
    const errors = this.crews.runs.flatMap((r) => r.steps).filter((s) => s.agentId === id && s.status === 'error').length;
    let score = bench?.score != null ? bench.score * 10 : 58 + Math.min(18, links * 2);
    score += Math.min(20, p.level * 6) - errors * 8;
    score = Math.max(20, Math.min(100, Math.round(score)));
    const strengths: string[] = [];
    const issues: string[] = [];
    if (bench?.score != null && bench.score >= 9) strengths.push(T(`Sinovda a’lo natija (${bench.score}/10, ${bench.seconds}s)`, `Excellent test result (${bench.score}/10, ${bench.seconds}s)`));
    else if (bench?.score != null) issues.push(T(`Sinov bali ${bench.score}/10 — sifatni oshirish kerak`, `Test score ${bench.score}/10 — needs better quality`));
    else issues.push(T('Hali haqiqiy sinovdan o‘tmagan', 'Not tested for real yet'));
    if (p.level === 0) issues.push(T('Claude Akademiyasida hali o‘qimagan', 'Has not studied at Claude Academy yet'));
    else strengths.push(T(`Akademiyada ${p.learned.length} ta skill o‘rgangan (daraja ${p.level})`, `Learned ${p.learned.length} skills at the academy (level ${p.level})`));
    if (links >= 6) strengths.push(T(`${links} ta skill bilan bog‘langan`, `Linked to ${links} skills`));
    else issues.push(T(`Skillari kam (${links} ta)`, `Few skills (${links})`));
    if (errors) issues.push(T(`Oxirgi vazifalarda ${errors} ta xato`, `${errors} errors in recent tasks`));
    const decision = score < 78 || p.level === 0 ? 'academy' : 'ok';
    return { agentId: id, score, strengths, issues, decision, at: Date.now() };
  }
}
