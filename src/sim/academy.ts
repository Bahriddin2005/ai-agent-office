// Claude Academy: every agent comes to class. Claude (the teacher) runs one
// lesson after another, a department at a time; agents the Boss sent come
// first, then whoever has learned least, so over time everyone studies.
// In class the agents learn skills of their field; what they learned (and the
// teacher's lesson notes, written for real by Claude when an AI is connected)
// is added to their instructions for every future task.
import type { Item, OfficeData } from '../data';
import { currentLang } from '../i18n';
import type { Layout, DeskSlot } from '../world/layout';
import type { Office } from '../world/office';
import type { Fx } from '../world/fx';
import type { Actor, Cast } from './actors';
import type { Director } from './director';

export interface Progress {
  level: number;
  xp: number;
  /** skill ids learned in class */
  learned: string[];
  lessons: number;
  last?: number;
}

export interface Enrolment {
  id: string;
  reason: string;
  by: 'boss' | 'user';
}

type Phase = 'gather' | 'lecture' | 'exam' | 'graduate';

interface Session {
  dept: string;
  topics: Item[];
  students: Actor[];
  seats: Map<Actor, DeskSlot>;
  phase: Phase;
  t: number;
  topic: number;
  notes: string[];
}

const KEY = 'office.academy.v1';
export const XP_PER_LEVEL = 30;
const uz = () => currentLang() === 'uz';
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export class Academy {
  progress: Record<string, Progress> = {};
  /** teacher's lesson notes per department (written by Claude) */
  notes: Record<string, { text: string; at: number }> = {};
  queue: Enrolment[] = [];
  session: Session | null = null;
  sessions = 0;
  /** ask the connected AI to write real lesson notes */
  realLessons = true;
  private cooldown = 10;
  private listeners: (() => void)[] = [];
  private skillsByDept = new Map<string, Item[]>();

  constructor(
    readonly data: OfficeData,
    readonly layout: Layout,
    readonly cast: Cast,
    readonly office: Office,
    readonly director: Director,
    readonly fx: Fx,
    private now: () => number,
    /** writes lesson notes with the connected AI; resolves '' when none is connected */
    private teach: (dept: string, topics: Item[]) => Promise<string>,
  ) {
    for (const it of data.registry.items) {
      if (it.type !== 'skill' || !office.bookOf.has(it.id)) continue;
      if (!this.skillsByDept.has(it.dept)) this.skillsByDept.set(it.dept, []);
      this.skillsByDept.get(it.dept)!.push(it);
    }
    this.load();
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private changed() {
    this.save();
    for (const fn of this.listeners) fn();
  }

  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { progress?: Academy['progress']; notes?: Academy['notes']; queue?: Enrolment[]; sessions?: number };
      this.progress = s.progress || {};
      this.notes = s.notes || {};
      this.queue = (s.queue || []).filter((q) => this.cast.byItem.has(q.id));
      this.sessions = s.sessions || 0;
    } catch {
      /* storage unavailable: start fresh */
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ progress: this.progress, notes: this.notes, queue: this.queue, sessions: this.sessions }));
    } catch {
      /* storage unavailable */
    }
  }

  get teacher() {
    return this.cast.teacher;
  }

  of(id: string): Progress {
    return this.progress[id] || { level: 0, xp: 0, learned: [], lessons: 0 };
  }

  /** How many agents have been to at least one class. */
  get trained() {
    return Object.values(this.progress).filter((p) => p.lessons > 0).length;
  }

  enroll(id: string, reason: string, by: Enrolment['by'] = 'user') {
    if (this.queue.some((q) => q.id === id) || this.session?.students.some((s) => s.item?.id === id)) return false;
    this.queue.push({ id, reason, by });
    const a = this.cast.byItem.get(id);
    this.director.log({ kind: 'task', icon: '🎓', text: `${a?.name || id} → ${uz() ? 'Claude Akademiyasi navbatida' : 'queued for Claude Academy'}${reason ? `: ${reason}` : ''}`, actor: a, itemId: id });
    this.changed();
    return true;
  }

  /** What an agent brings to every task after class (added to its instructions). */
  knowledge(id: string) {
    const p = this.progress[id];
    if (!p || !p.learned.length) return '';
    const it = this.data.byId.get(id);
    const skills = p.learned
      .slice(-14)
      .map((sid) => this.data.byId.get(sid))
      .filter((s): s is Item => !!s)
      .map((s) => `- ${s.name}: ${clip(s.description, 170)}`);
    const note = it ? this.notes[it.dept]?.text : '';
    return [
      `What you learned at Claude Academy (level ${p.level}, ${p.lessons} lesson${p.lessons === 1 ? '' : 's'}) — apply it in your work:`,
      ...skills,
      note ? `Lesson notes from Claude, your teacher:\n${clip(note, 1500)}` : '',
    ].filter(Boolean).join('\n');
  }

  // ------------------------------------------------------------ lessons --
  update(dt: number) {
    const s = this.session;
    if (!s) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.start();
      return;
    }
    s.t += dt;
    switch (s.phase) {
      case 'gather': {
        const seated = s.students.filter((a) => this.seated(a, s));
        // Latecomers join when they arrive; only those in their seat at the end graduate.
        if (seated.length === s.students.length || (s.t > 70 && seated.length)) {
          s.phase = 'lecture';
          s.t = 0;
          s.topic = -1;
        } else if (s.t > 90) this.finish(false);
        break;
      }
      case 'lecture': {
        const idx = Math.floor(s.t / 11);
        if (idx !== s.topic) {
          if (idx >= s.topics.length) {
            s.phase = 'exam';
            s.t = 0;
            this.office.lecture?.set(uz() ? '📝 Imtihon' : '📝 Exam', s.topics.map((x) => x.name), this.deptName(s.dept));
            this.teacher?.say(uz() ? '📝 Endi qisqa imtihon!' : '📝 Short exam now!', 5);
            for (const a of s.students) if (this.seated(a, s)) a.plan([{ act: 'work', dur: 7 }], true);
            break;
          }
          s.topic = idx;
          const topic = s.topics[idx];
          const lines = s.notes.length ? s.notes.slice(idx * 3, idx * 3 + 3) : [clip(topic.description, 160), ...this.relatedOf(topic)];
          this.office.lecture?.set(`${idx + 1}/${s.topics.length} · ${topic.name}`, lines, this.deptName(s.dept));
          this.teacher?.say(`📚 ${clip(topic.name, 34)}`, 9);
          this.teacher?.plan([{ act: 'talk', dur: 11 }], true);
          for (const a of s.students) if (this.seated(a, s)) a.plan([{ act: Math.random() < 0.6 ? 'read' : 'think', dur: 11 }], true);
          const bi = this.office.bookOf.get(topic.id);
          if (bi !== undefined) this.office.lightBook(bi, 6);
        }
        break;
      }
      case 'exam':
        if (s.t > 7) {
          s.phase = 'graduate';
          s.t = 0;
          this.graduate(s);
        }
        break;
      case 'graduate':
        if (s.t > 4) this.finish(true);
        break;
    }
  }

  private seated(a: Actor, s: Session) {
    const seat = s.seats.get(a);
    return !!seat && a.at === seat.seat && !a.path.length && !a.live;
  }

  private deptName(id: string) {
    const d = this.data.dept.get(id);
    return d ? `${d.emoji} ${uz() ? d.uz : d.name}` : id;
  }

  private relatedOf(skill: Item) {
    return (this.data.neighbors.get(skill.id) || [])
      .map((l) => this.data.byId.get(l.id))
      .filter((x): x is Item => !!x && x.type !== 'agent')
      .slice(0, 2)
      .map((x) => `${uz() ? 'bog‘liq' : 'related'}: ${x.name}`);
  }

  /** Pick the class: the Boss's picks first, then whoever has learned least. */
  private start() {
    const a = this.layout.academy;
    if (!a || !this.teacher) return;
    const now = this.now();
    const free = (x: Actor) => x.kind === 'agent' && !x.live && now > x.busyUntil && x.body.visible;
    const first = this.queue.map((q) => this.cast.byItem.get(q.id)).find((x) => x && free(x));
    const agents = this.cast.actors.filter(free);
    if (!agents.length) {
      this.cooldown = 15;
      return;
    }
    const least = (xs: Actor[]) => xs.sort((p, q) => this.of(p.item!.id).lessons - this.of(q.item!.id).lessons || this.of(p.item!.id).level - this.of(q.item!.id).level || Math.random() - 0.5);
    let dept = first?.item?.dept;
    if (!dept) {
      // The department with the lowest average training goes next.
      const avg = new Map<string, number[]>();
      for (const x of agents) {
        const d = x.item!.dept;
        if (!avg.has(d)) avg.set(d, []);
        avg.get(d)!.push(this.of(x.item!.id).lessons);
      }
      dept = [...avg.entries()].sort((p, q) => p[1].reduce((s, v) => s + v, 0) / p[1].length - q[1].reduce((s, v) => s + v, 0) / q[1].length)[0][0];
    }
    // Front rows (next to the lectern and the screen) fill first.
    const seatsFree = [...a.seats].reverse();
    const size = Math.min(12, seatsFree.length);
    const queued = this.queue.map((q) => this.cast.byItem.get(q.id)).filter((x): x is Actor => !!x && free(x));
    const students: Actor[] = [...queued.slice(0, size)];
    for (const x of least(agents.filter((y) => y.item!.dept === dept && !students.includes(y)))) {
      if (students.length >= size) break;
      students.push(x);
    }
    if (!students.length) {
      this.cooldown = 15;
      return;
    }
    this.queue = this.queue.filter((q) => !students.some((s) => s.item?.id === q.id));
    const topics = this.topicsFor(dept, students);
    const seats = new Map<Actor, DeskSlot>();
    students.forEach((x, i) => seats.set(x, seatsFree[i]));
    this.session = { dept, topics, students, seats, phase: 'gather', t: 0, topic: -1, notes: [] };
    const long = now + 400;
    for (const x of students) {
      x.busyUntil = long;
      x.say(uz() ? '🎓 Akademiyaga!' : '🎓 Off to class!', 4);
      x.plan([{ go: seats.get(x)!.seat }, { act: 'read', dur: 400 }], true);
    }
    this.teacher.plan([{ go: a.podium }, { act: 'wave', dur: 2 }, { act: 'idle', dur: 400 }], true);
    this.office.lecture?.set(uz() ? `Bugungi dars: ${this.deptName(dept)}` : `Today: ${this.deptName(dept)}`, topics.map((t) => t.name), uz() ? `${students.length} o‘quvchi` : `${students.length} students`);
    this.director.log({ kind: 'task', icon: '🎓', text: uz() ? `Claude Akademiyasi: ${this.deptName(dept)} darsi boshlandi (${students.length} o‘quvchi)` : `Claude Academy: ${this.deptName(dept)} class started (${students.length} students)`, actor: this.teacher });
    this.changed();
    if (this.realLessons) {
      const s = this.session;
      this.teach(dept, topics)
        .then((text) => {
          if (!text) return;
          this.notes[dept] = { text, at: Date.now() };
          if (this.session === s) s.notes = text.split('\n').map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter((l) => l.length > 3);
          this.changed();
        })
        .catch(() => undefined);
    }
  }

  /** Three skills of the field that the class has not learned yet. */
  private topicsFor(dept: string, students: Actor[]) {
    const pool = this.skillsByDept.get(dept) || [];
    const learned = new Set(students.flatMap((s) => this.of(s.item!.id).learned));
    const linked = new Set(students.flatMap((s) => (this.data.neighbors.get(s.item!.id) || []).map((l) => l.id)));
    // New to the class first, then skills the students' own work links to, then substantial skills
    // (well connected, well described) over small demos, with some variety.
    const weight = (x: Item) => (linked.has(x.id) ? 12 : 0) + Math.min(10, (this.data.neighbors.get(x.id) || []).length) + Math.min(6, x.description.length / 40) + Math.random() * 4;
    const w = new Map(pool.map((x) => [x.id, weight(x)]));
    const ranked = [...pool].sort((a, b) => Number(learned.has(a.id)) - Number(learned.has(b.id)) || w.get(b.id)! - w.get(a.id)!);
    const out = ranked.slice(0, 3);
    return out.length ? out : [pick([...this.skillsByDept.values()].flat())].filter(Boolean);
  }

  private graduate(s: Session) {
    this.sessions++;
    const names: string[] = [];
    s.students = s.students.filter((a) => this.seated(a, s));
    for (const a of s.students) {
      const id = a.item!.id;
      const p = this.of(id);
      const before = p.level;
      for (const t of s.topics) if (!p.learned.includes(t.id)) p.learned.push(t.id);
      p.xp += 10 * s.topics.length;
      p.lessons += 1;
      p.level = Math.floor(p.xp / XP_PER_LEVEL);
      p.last = Date.now();
      this.progress[id] = p;
      a.say(`🎓 +${s.topics.length} skill${p.level > before ? ` · ${uz() ? 'daraja' : 'level'} ${p.level}!` : ''}`, 6);
      a.plan([{ act: 'wave', dur: 1.2 }], true);
      this.fx.glow(a.worldPos(2.4), '#ffd166', 3, 1.2);
      names.push(a.name);
    }
    this.office.lecture?.set(uz() ? '🎓 Tabriklaymiz!' : '🎓 Congratulations!', [uz() ? `${s.students.length} ta agent ${s.topics.length} ta yangi skill o‘rgandi` : `${s.students.length} agents learned ${s.topics.length} new skills`, ...s.topics.map((t) => t.name)], this.deptName(s.dept));
    this.teacher?.say(uz() ? '👏 Barakalla! Bilimlaringizni ishda qo‘llang.' : '👏 Well done! Use it in your work.', 5);
    this.director.log({ kind: 'task', icon: '🎓', text: uz() ? `Dars tugadi: ${clip(names.join(', '), 90)} — ${s.topics.map((t) => t.name).join(', ')}` : `Class finished: ${clip(names.join(', '), 90)} — ${s.topics.map((t) => t.name).join(', ')}`, actor: this.teacher || undefined });
    this.changed();
  }

  private finish(ok: boolean) {
    const s = this.session;
    if (!s) return;
    for (const a of s.students) {
      a.busyUntil = 0;
      a.plan([{ go: a.home }], true);
    }
    const a = this.layout.academy;
    if (this.teacher && a) this.teacher.plan([{ act: 'idle', dur: 1 }], true);
    this.session = null;
    this.cooldown = ok ? 18 + Math.random() * 14 : 25;
    if (!ok) this.office.lecture?.set(uz() ? 'Dars qoldirildi' : 'Class skipped', [uz() ? 'O‘quvchilar kela olmadi — keyingi dars tez orada' : 'Students could not come — next class soon']);
    this.changed();
  }
}
