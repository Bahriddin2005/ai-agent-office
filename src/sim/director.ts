// Decides what everyone does. In ambient mode agents pick up skills from their
// department's shelves, work at their desks, visit colleagues they are linked
// to in the knowledge graph, grab coffee and query the Graphify core. Live
// Claude Code hook events and dispatched tasks take priority over all of it.
import * as THREE from 'three';
import type { Item, OfficeData } from '../data';
import { currentLang, t } from '../i18n';
import type { Layout, Spot } from '../world/layout';
import type { Fx } from '../world/fx';
import type { Office } from '../world/office';
import type { Actor, Cast } from './actors';

export interface FeedEntry {
  time: number;
  icon: string;
  text: string;
  kind: 'ambient' | 'live' | 'task' | 'system';
  actor?: Actor;
  itemId?: string;
}

export interface LiveEvent {
  type: 'hook';
  event: string;
  tool?: string;
  agent?: string;
  skill?: string;
  summary?: string;
  toolUseId?: string;
  session?: string;
  project?: string;
}

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const short = (s: string, n = 42) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const TASKS = {
  uz: ['{s} bilan ishlamoqda', '{s}: tahlil', '{s}: hisobot yozmoqda', '{s} orqali tekshirmoqda', '{s}: reja tuzmoqda'],
  en: ['Working with {s}', '{s}: analysing', '{s}: drafting report', 'Reviewing via {s}', '{s}: planning'],
};

export class Director {
  ambient = true;
  private spawnTimer = 1;
  private feedListeners: ((e: FeedEntry) => void)[] = [];
  private skillsOf = new Map<string, Item[]>();
  private peersOf = new Map<string, Actor[]>();
  private deptItems = new Map<string, Item[]>();
  private liveAgents = new Map<string, Actor>();
  private lastLive = 0;

  constructor(
    readonly data: OfficeData,
    readonly layout: Layout,
    readonly cast: Cast,
    readonly office: Office,
    readonly fx: Fx,
    private now: () => number,
  ) {
    for (const it of data.registry.items) {
      if (it.type === 'agent') continue;
      if (!this.deptItems.has(it.dept)) this.deptItems.set(it.dept, []);
      if (office.bookOf.has(it.id)) this.deptItems.get(it.dept)!.push(it);
    }
    for (const a of cast.actors) {
      if (!a.item) continue;
      const links = data.neighbors.get(a.item.id) || [];
      this.skillsOf.set(
        a.item.id,
        links.map((l) => data.byId.get(l.id)!).filter((i) => i && i.type !== 'agent' && office.bookOf.has(i.id)),
      );
      this.peersOf.set(
        a.item.id,
        links.map((l) => cast.byItem.get(l.id)).filter((x): x is Actor => !!x && x !== a),
      );
    }
  }

  onFeed(fn: (e: FeedEntry) => void) {
    this.feedListeners.push(fn);
  }

  log(e: Omit<FeedEntry, 'time'>) {
    const entry = { ...e, time: Date.now() };
    for (const fn of this.feedListeners) fn(entry);
  }

  get liveRecently() {
    return this.now() - this.lastLive < 20;
  }

  // ----------------------------------------------------------- ambient ----
  /** Start the day with some agents already busy so the office looks alive. */
  warmStart(n: number) {
    const agents = this.cast.actors.filter((a) => a.kind === 'agent');
    for (let i = 0; i < n && agents.length; i++) {
      const a = agents.splice(Math.floor(Math.random() * agents.length), 1)[0];
      if (Math.random() < 0.6) this.deskWork(a, undefined, 4 + Math.random() * 18);
      else this.fetchSkill(a);
    }
  }

  update(dt: number) {
    if (!this.ambient) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.25 + Math.random() * 0.45;
    const busy = this.cast.actors.filter((a) => a.path.length).length;
    if (busy > 34) return;
    const now = this.now();
    const candidates = this.cast.actors.filter((a) => a.kind === 'agent' && a.idle && a.atHome && now > a.busyUntil);
    if (!candidates.length) return;
    const a = pick(candidates);
    const r = Math.random();
    if (r < 0.34) this.deskWork(a);
    else if (r < 0.62) this.fetchSkill(a);
    else if (r < 0.8) this.collaborate(a);
    else if (r < 0.95) this.coffee(a);
    else this.visitCore(a);
  }

  private taskText(skill: Item) {
    const tpl = pick(TASKS[currentLang()]);
    return tpl.replace('{s}', skill.type === 'command' ? `/${skill.name}` : skill.name);
  }

  private skillFor(a: Actor): Item | undefined {
    const own = this.skillsOf.get(a.item!.id) || [];
    if (own.length && Math.random() < 0.75) return pick(own);
    const dept = this.deptItems.get(a.item!.dept) || [];
    return dept.length ? pick(dept) : undefined;
  }

  deskWork(a: Actor, text?: string, dur = 8 + Math.random() * 14) {
    const skill = text ? undefined : this.skillFor(a);
    const bubble = text || (skill ? `⌨️ ${short(this.taskText(skill))}` : '⌨️ …');
    a.plan([{ act: 'work', dur, bubble }]);
  }

  fetchSkill(a: Actor, skill = this.skillFor(a), then?: () => void) {
    if (!skill) return this.deskWork(a);
    const bi = this.office.bookOf.get(skill.id);
    if (bi === undefined) return this.deskWork(a);
    const book = this.office.bookList[bi];
    const shelfSpot: Spot = book.shelf.spot;
    a.plan([
      { go: shelfSpot },
      {
        act: 'read',
        dur: 3.2,
        bubble: `📘 ${short(skill.name, 30)}`,
        onStart: () => {
          this.office.lightBook(bi, 5);
          this.fx.glow(book.out.clone().setY(book.out.y + 0.1), this.data.source.get(skill.source)?.color || '#fff', 4, 1.2);
          this.office.core.pulse(this.data.nodeIndex.get(skill.id));
          this.log({ kind: 'ambient', icon: '📘', text: `${a.name} → ${skill.name}`, actor: a, itemId: skill.id });
        },
      },
      { go: a.home },
      { act: 'work', dur: 7 + Math.random() * 10, bubble: `⌨️ ${short(this.taskText(skill))}`, onEnd: then },
    ]);
  }

  collaborate(a: Actor) {
    const peers = (this.peersOf.get(a.item!.id) || []).filter((p) => p.kind === 'agent');
    const sameDept = this.cast.actors.filter((p) => p.kind === 'agent' && p !== a && p.item?.dept === a.item?.dept);
    const b = peers.length && Math.random() < 0.7 ? pick(peers) : sameDept.length ? pick(sameDept) : undefined;
    if (!b || !b.atHome || b.live) return this.coffee(a);
    const desk = b.home.zone?.desks.find((d) => d.seat === b.home);
    if (!desk) return this.coffee(a);
    a.plan([
      { go: desk.guest },
      {
        act: 'talk',
        dur: 5,
        bubble: `💬 ${short(b.name, 26)}`,
        onStart: () => {
          if (b.idle) b.plan([{ act: 'talk', dur: 5 }]);
          this.fx.arc(a.home.zone ? new THREE.Vector3(a.home.x, 1.2, a.home.z) : a.worldPos(1.2), b.worldPos(1.2), a.color, 3);
          this.log({ kind: 'ambient', icon: '💬', text: `${a.name} ↔ ${b.name}`, actor: a, itemId: b.item?.id });
        },
      },
      { go: a.home },
    ]);
  }

  coffee(a: Actor) {
    const zone = a.home.zone;
    if (!zone) return;
    a.plan([{ go: zone.coffee }, { act: 'coffee', dur: 4 + Math.random() * 3, bubble: '☕' }, { go: a.home }]);
  }

  visitCore(a: Actor) {
    const spot = pick(this.layout.core.spots);
    a.plan([
      { go: spot },
      {
        act: 'query',
        dur: 4,
        bubble: '🕸️ graphify query',
        onStart: () => {
          this.office.core.pulse(this.data.nodeIndex.get(a.item!.id), 5);
          this.log({ kind: 'ambient', icon: '🕸️', text: `${a.name} → Graphify Core`, actor: a });
        },
      },
      { go: a.home },
    ]);
  }

  // ---------------------------------------------------------------- live --
  handleLive(e: LiveEvent) {
    this.lastLive = this.now();
    const lead = this.cast.lead;
    const boss = this.cast.boss;
    const where = e.project ? ` · ${e.project}` : '';
    switch (e.event) {
      case 'SessionStart':
        lead.say('👋 Salom! / Hi!', 4);
        lead.plan([{ act: 'wave', dur: 1.5 }], true);
        this.log({ kind: 'live', icon: '🟢', text: `Claude Code session${where}`, actor: lead });
        break;
      case 'SessionEnd':
        lead.say('👋', 3);
        this.log({ kind: 'live', icon: '⚪', text: `Session ended${where}`, actor: lead });
        break;
      case 'UserPromptSubmit':
        boss.say(`🗣️ ${short(e.summary || '…', 60)}`, 7);
        boss.plan([{ act: 'talk', dur: 3 }], true);
        lead.say('👍', 3);
        this.log({ kind: 'live', icon: '🗣️', text: short(e.summary || 'prompt', 90), actor: boss });
        break;
      case 'PreToolUse':
        if (e.tool === 'Agent' || e.tool === 'Task') this.subagentStart(e);
        else if (e.tool === 'Skill') this.skillUsed(e);
        else {
          lead.live = true;
          lead.plan([{ act: 'work', dur: 2.5, bubble: `🔧 ${e.tool}${e.summary ? ': ' + short(e.summary, 40) : ''}` }], true);
          this.log({ kind: 'live', icon: '🔧', text: `${e.tool}${e.summary ? ' — ' + short(e.summary, 70) : ''}`, actor: lead });
        }
        break;
      case 'PostToolUse':
        if (e.tool === 'Agent' || e.tool === 'Task') this.subagentStop(e);
        break;
      case 'SubagentStop':
        // Without an agent type this cannot be matched safely when subagents run in
        // parallel; the PostToolUse for the Agent call (keyed by tool_use_id) ends it instead.
        if (e.agent) this.subagentStop({ ...e, toolUseId: undefined });
        break;
      case 'Notification':
        lead.say(`🔔 ${short(e.summary || '', 50)}`, 6);
        this.log({ kind: 'live', icon: '🔔', text: short(e.summary || 'notification', 90), actor: lead });
        break;
      case 'Stop':
        lead.live = false;
        lead.plan([{ act: 'idle', dur: 0.1 }], true);
        lead.say('✅ Tayyor / Done', 5);
        this.log({ kind: 'live', icon: '✅', text: `Claude finished${where}`, actor: lead });
        break;
    }
  }

  private subagentStart(e: LiveEvent) {
    const type = e.agent || 'general-purpose';
    const task = e.summary || type;
    let a = this.cast.findAgent(type);
    let visitor = false;
    if (!a || a.live) {
      a = this.cast.spawnVisitor(type);
      visitor = true;
    }
    if (!a) return;
    a.live = true;
    a.liveTask = task;
    a.busyUntil = this.now() + 3600;
    const key = e.toolUseId || type;
    this.liveAgents.set(key, a);
    this.fx.arc(this.cast.lead.worldPos(1.4), new THREE.Vector3(a.home.x, 1.4, a.home.z), '#ff4d6d', 3.5);
    if (a.item) this.office.core.pulse(this.data.nodeIndex.get(a.item.id), 6);
    const steps = [{ act: 'work' as const, dur: 3600, bubble: `⚡ ${short(task, 44)}` }];
    if (visitor) a.plan(steps);
    else a.plan([{ go: a.home }, ...steps], true);
    this.log({ kind: 'live', icon: '🚀', text: `${visitor ? t().visitor + ': ' : ''}${type} — ${short(task, 70)}`, actor: a, itemId: a.item?.id });
  }

  private subagentStop(e: LiveEvent) {
    const key = e.toolUseId || e.agent || '';
    let a = this.liveAgents.get(key);
    if (!a && e.agent) a = [...this.liveAgents.values()].find((x) => x.name === e.agent || x.item?.name === e.agent?.split(':').at(-1));
    if (!a) return;
    for (const [k, v] of this.liveAgents) if (v === a) this.liveAgents.delete(k);
    a.live = false;
    a.busyUntil = 0;
    a.say('✅ Tayyor / Done', 5);
    this.fx.arc(new THREE.Vector3(a.body.x, 1.4, a.body.z), this.cast.lead.worldPos(1.4), '#3ddc84', 3);
    this.log({ kind: 'live', icon: '✅', text: `${a.name} — done`, actor: a, itemId: a.item?.id });
    if (a.kind === 'visitor') this.cast.dismissVisitor(a);
    else a.plan([{ act: 'idle', dur: 0.1 }], true);
  }

  private skillUsed(e: LiveEvent) {
    const name = (e.skill || '').split(':').at(-1)!.toLowerCase();
    const skill = this.data.registry.items.find((i) => i.type === 'skill' && i.name.toLowerCase() === name);
    const lead = this.cast.lead;
    lead.say(`📘 ${e.skill}`, 5);
    this.log({ kind: 'live', icon: '📘', text: `Skill: ${e.skill}`, actor: lead, itemId: skill?.id });
    if (!skill) return;
    const bi = this.office.bookOf.get(skill.id);
    if (bi === undefined) return;
    const book = this.office.bookList[bi];
    this.office.lightBook(bi, 8);
    this.fx.glow(book.out, this.data.source.get(skill.source)?.color || '#fff', 6, 1.6);
    this.fx.arc(lead.worldPos(1.4), book.out.clone(), '#4cc9f0', 3.5);
    this.office.core.pulse(this.data.nodeIndex.get(skill.id), 6);
  }

  // ------------------------------------------------------------ dispatch --
  /** Visualise a task handed to an agent from the office UI. Returns a controller. */
  beginTask(a: Actor, title: string) {
    a.live = true;
    a.busyUntil = this.now() + 3600;
    a.liveTask = title;
    this.fx.arc(this.cast.lead.worldPos(1.4), new THREE.Vector3(a.home.x, 1.4, a.home.z), '#ffd166', 3.5);
    // Agents in a department fetch a skill book first; atrium residents stay at their desks.
    const skill = a.home.zone ? this.skillFor(a) : undefined;
    const work = { act: 'work' as const, dur: 3600, bubble: `⚡ ${short(title, 44)}` };
    if (skill && a.kind === 'agent') {
      a.plan([], true);
      this.fetchSkill(a, skill);
      // Replace the trailing short work step with an open-ended one.
      a.steps = a.steps.slice(0, -1).concat(work);
    } else {
      a.plan([{ go: a.home }, work], true);
    }
    return {
      progress: (text: string) => a.say(`⏳ ${short(text, 50)}`, 6),
      finish: (ok: boolean) => {
        a.live = false;
        a.busyUntil = 0;
        a.say(ok ? '✅ Tayyor / Done' : '⚠️ Xato / Error', 6);
        this.fx.arc(new THREE.Vector3(a.body.x, 1.4, a.body.z), this.cast.lead.worldPos(1.4), ok ? '#3ddc84' : '#e5484d', 3);
        a.plan([{ act: 'idle', dur: 0.1 }], true);
      },
    };
  }
}
