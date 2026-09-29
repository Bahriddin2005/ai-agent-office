// People in the office: registry agents at their desks, Claude (the lead) at
// reception, you (the boss), and visiting agents spawned by live events that
// have no desk of their own. Each actor runs a small queue of steps
// ("walk there", "do this for N seconds").
import * as THREE from 'three';
import type { Item, OfficeData } from '../data';
import { route, type Layout, type Spot } from '../world/layout';
import type { Office } from '../world/office';
import { Crowd, randomLook, type Anim, type BodyState } from '../world/people';

export type ActorKind = 'agent' | 'lead' | 'boss' | 'visitor';
export type Activity = 'idle' | 'walk' | 'work' | 'talk' | 'read' | 'coffee' | 'query' | 'wave' | 'think';

export interface Step {
  go?: Spot;
  act?: Activity;
  dur?: number;
  bubble?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

export const MARKERS: Partial<Record<Activity, THREE.Color>> = {
  work: new THREE.Color('#3ddc84').multiplyScalar(1.6),
  talk: new THREE.Color('#ffd166').multiplyScalar(1.6),
  read: new THREE.Color('#4cc9f0').multiplyScalar(1.6),
  query: new THREE.Color('#2ec4b6').multiplyScalar(1.8),
  coffee: new THREE.Color('#c08457').multiplyScalar(1.4),
  think: new THREE.Color('#b79cff').multiplyScalar(1.6),
};
const LIVE_MARKER = new THREE.Color('#ff4d6d').multiplyScalar(2);

const ANIM: Record<Activity, Anim> = {
  idle: 'idle', walk: 'walk', work: 'type', talk: 'talk', read: 'read', coffee: 'drink', query: 'think', wave: 'wave', think: 'think',
};

const WALK_SPEED = 2.8;

export class Actor {
  body: BodyState;
  path: [number, number][] = [];
  steps: Step[] = [];
  current: Step | null = null;
  timer = 0;
  activity: Activity = 'idle';
  at: Spot;
  bubble: string | null = null;
  bubbleUntil = 0;
  /** Pinned by a live/dispatched task: ambient life leaves it alone. */
  busyUntil = 0;
  live = false;
  liveTask: string | null = null;
  targetHeading: number;
  onArrive: (() => void) | null = null;

  constructor(
    readonly idx: number,
    readonly kind: ActorKind,
    readonly name: string,
    public home: Spot,
    readonly item?: Item,
    readonly color = '#888',
  ) {
    this.at = home;
    this.targetHeading = home.heading;
    this.body = { x: home.x, z: home.z, heading: home.heading, pose: home.pose, anim: 'idle', phase: 0, visible: true, marker: null, seed: (idx * 0.618) % 1 };
  }

  get idle() {
    return !this.current && !this.steps.length && this.activity === 'idle';
  }

  get atHome() {
    return this.at === this.home && !this.path.length;
  }

  worldPos(y = 1.9) {
    return new THREE.Vector3(this.body.x, y, this.body.z);
  }

  /** Simulation clock shared by every actor (set by Cast). */
  static now: () => number = () => performance.now() / 1000;

  say(text: string | null, seconds = 4, now = Actor.now()) {
    this.bubble = text;
    this.bubbleUntil = text ? now + seconds : 0;
  }

  plan(steps: Step[], replace = false) {
    if (replace) {
      this.current?.onEnd?.();
      this.current = null;
      this.steps = [];
      this.path = [];
    }
    this.steps.push(...steps);
  }
}

export class Cast {
  readonly actors: Actor[] = [];
  readonly byItem = new Map<string, Actor>();
  readonly byName = new Map<string, Actor[]>();
  readonly crowd: Crowd;
  lead!: Actor;
  boss!: Actor;
  private visitorsFree: number[] = [];
  private hotDeskUsed = new Set<number>();

  constructor(
    readonly data: OfficeData,
    readonly layout: Layout,
    readonly office: Office,
    private now: () => number,
  ) {
    Actor.now = now;
    const agents = data.registry.items.filter((i) => i.type === 'agent');
    const VISITORS = 12;
    this.crowd = new Crowd(agents.length + 2 + VISITORS);

    const lead = this.add('lead', 'Claude', layout.reception.lead, undefined, '#d97757', { shirt: '#d97757', pants: '#3d3a36', skin: '#f3d2b3', hair: '#6b3f2a', badge: '#ffffff' });
    this.lead = lead;
    this.boss = this.add('boss', 'Boss', layout.reception.boss, undefined, '#2b2d42', { shirt: '#23263a', pants: '#1c1d29', skin: '#eac09a', hair: '#1b1b1f', badge: '#ffd166', scale: 1.06 });

    // Agents: fill each department's desks in registry order; special residents go to the atrium.
    const perDept = new Map<string, Item[]>();
    for (const a of agents) {
      if (!perDept.has(a.dept)) perDept.set(a.dept, []);
      perDept.get(a.dept)!.push(a);
    }
    for (const a of agents) {
      let spot: Spot | undefined;
      if (a.id === 'agent:claude-office:office-manager') spot = layout.reception.manager;
      else if (a.id === 'agent:graphify:graphify-librarian') spot = layout.librarian.seat;
      else {
        const zone = layout.zoneByDept.get(a.dept)!;
        const list = perDept.get(a.dept)!.filter((x) => x.id !== 'agent:claude-office:office-manager' && x.id !== 'agent:graphify:graphify-librarian');
        spot = zone.desks[list.indexOf(a)]?.seat;
      }
      if (!spot) continue;
      const dept = data.dept.get(a.dept)!;
      const src = data.source.get(a.source)!;
      const seed = hash(a.id);
      this.add('agent', a.name, spot, a, dept.color, randomLook(seed, dept.color, src.color));
    }
    for (let i = 0; i < VISITORS; i++) {
      const v = this.add('visitor', 'visitor', layout.entrance, undefined, '#9aa5b1', { shirt: '#9aa5b1', pants: '#374151', skin: '#eac09a', hair: '#4a3223', badge: '#ffd166' });
      v.body.visible = false;
      this.visitorsFree.push(v.idx);
    }
  }

  private add(kind: ActorKind, name: string, home: Spot, item: Item | undefined, color: string, look: Parameters<Crowd['setLook']>[1]) {
    const a = new Actor(this.actors.length, kind, name, home, item, color);
    this.actors.push(a);
    this.crowd.setLook(a.idx, look);
    if (item) {
      this.byItem.set(item.id, a);
      const key = item.name.toLowerCase();
      if (!this.byName.has(key)) this.byName.set(key, []);
      this.byName.get(key)!.push(a);
    }
    return a;
  }

  /** Find the office agent for a Claude Code subagent_type such as "ecc:code-reviewer". */
  findAgent(type: string): Actor | undefined {
    const key = type.toLowerCase().trim();
    const last = key.split(':').at(-1)!;
    return this.byName.get(key)?.[0] || this.byName.get(last)?.[0] || this.byName.get(last.replace(/^cs-/, ''))?.[0] || this.byName.get(`cs-${last}`)?.[0];
  }

  spawnVisitor(name: string): Actor | undefined {
    const idx = this.visitorsFree.shift();
    if (idx === undefined) return undefined;
    const v = this.actors[idx];
    (v as { name: string }).name = name;
    const deskIdx = this.layout.hotDesks.findIndex((_, i) => !this.hotDeskUsed.has(i));
    const desk = this.layout.hotDesks[deskIdx >= 0 ? deskIdx : 0];
    if (deskIdx >= 0) this.hotDeskUsed.add(deskIdx);
    v.home = desk.seat;
    const e = this.layout.entrance;
    v.at = e;
    v.body.x = e.x;
    v.body.z = e.z;
    v.body.visible = true;
    v.plan([{ go: desk.seat }], true);
    v.onArrive = null;
    (v as Actor & { hotDesk?: number }).hotDesk = deskIdx;
    return v;
  }

  dismissVisitor(v: Actor) {
    const desk = (v as Actor & { hotDesk?: number }).hotDesk;
    v.plan([{ act: 'wave', dur: 1.2 }, { go: this.layout.entrance, onEnd: () => undefined }], true);
    v.plan([
      {
        act: 'idle',
        dur: 0.01,
        onStart: () => {
          v.body.visible = false;
          if (desk !== undefined && desk >= 0) this.hotDeskUsed.delete(desk);
          this.visitorsFree.push(v.idx);
          v.live = false;
        },
      },
    ]);
  }

  update(dt: number, time: number) {
    const now = this.now();
    for (const a of this.actors) {
      if (!a.body.visible && a.kind === 'visitor' && !a.steps.length && !a.current) continue;
      this.step(a, dt, now);
      const b = a.body;
      const moving = a.path.length > 0;
      b.anim = moving ? 'walk' : ANIM[a.activity];
      if (moving) b.phase += dt * 9.5;
      // Smooth turning.
      let dh = a.targetHeading - b.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      b.heading += dh * Math.min(1, dt * (moving ? 12 : 6));
      b.marker = a.live && a.activity !== 'idle' ? LIVE_MARKER : MARKERS[a.activity] || null;
      if (a.bubble && now > a.bubbleUntil) a.bubble = null;
      this.crowd.update(a.idx, b, time);
    }
    this.crowd.commit();
  }

  private step(a: Actor, dt: number, now: number) {
    if (a.path.length) {
      const [tx, tz] = a.path[0];
      const dx = tx - a.body.x;
      const dz = tz - a.body.z;
      const d = Math.hypot(dx, dz);
      const move = WALK_SPEED * dt;
      if (d <= move) {
        a.body.x = tx;
        a.body.z = tz;
        a.path.shift();
      } else {
        a.body.x += (dx / d) * move;
        a.body.z += (dz / d) * move;
        a.targetHeading = Math.atan2(dx, dz);
      }
      if (!a.path.length) {
        const s = a.current?.go;
        if (s) {
          a.at = s;
          a.body.pose = s.pose;
          a.targetHeading = s.heading;
        }
        this.finish(a);
      }
      return;
    }
    if (a.current) {
      a.timer -= dt;
      if (a.timer <= 0) this.finish(a);
      return;
    }
    const next = a.steps.shift();
    if (!next) {
      if (a.activity !== 'idle') this.setActivity(a, 'idle');
      if (a.at !== a.home && a.kind !== 'visitor' && a.kind !== 'boss' && now > a.busyUntil) a.plan([{ go: a.home }]);
      return;
    }
    a.current = next;
    next.onStart?.();
    if (next.bubble) a.say(next.bubble, Math.min(6, next.dur ?? 4), now);
    if (next.go) {
      if (next.go === a.at && Math.hypot(next.go.x - a.body.x, next.go.z - a.body.z) < 0.05) {
        this.finish(a);
        return;
      }
      this.setActivity(a, 'walk');
      a.body.pose = 'stand';
      a.path = route(a.at, next.go);
      a.at = next.go; // committed; used as origin for the next route
    } else {
      this.setActivity(a, next.act ?? 'idle');
      a.timer = next.dur ?? 3;
    }
  }

  private finish(a: Actor) {
    const s = a.current;
    a.current = null;
    s?.onEnd?.();
    if (s?.go && a.onArrive) {
      const cb = a.onArrive;
      a.onArrive = null;
      cb();
    }
  }

  setActivity(a: Actor, act: Activity) {
    const was = a.activity;
    a.activity = act;
    const atDesk = a.at === a.home && !a.path.length;
    if (act === 'work' && atDesk) this.office.setScreen(a.home.screen, true, a.color);
    else if (was === 'work' || act === 'walk') this.office.setScreen(a.home.screen, false);
  }
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
