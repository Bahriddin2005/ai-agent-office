// Realistic low-poly people, shared by the office crowd (hundreds of instanced
// people) and the inspector portrait (one person in high detail). Bodies are
// built from elliptical rings (torso, head, limbs) plus surface patches that
// follow the body (lapels, ties, aprons, lanyards). Every vertex carries a
// colour *slot* — skin, hair, top, ... — so one mesh can be dressed per person.
// Heights are in metres: an average adult is ~1.74 m tall and faces +z; their
// left hand side is +x.
import * as THREE from 'three';

export const SLOTS = ['skin', 'hair', 'top', 'under', 'accent', 'pants', 'shoe', 'badge', 'legs'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_INDEX = Object.fromEntries(SLOTS.map((s, i) => [s, i])) as Record<Slot, number>;
/** A colour slot of the person's look, or a fixed '#rrggbb' colour. */
export type Paint = Slot | `#${string}`;

export type Anim = 'idle' | 'walk' | 'type' | 'talk' | 'read' | 'drink' | 'wave' | 'think' | 'mop';
export const OUTFITS = ['suit', 'blazer', 'shirt', 'shirtTie', 'polo', 'sweater', 'hoodie', 'turtleneck', 'apron', 'uniform'] as const;
export type Outfit = (typeof OUTFITS)[number];
export const HAIR_STYLES = ['short', 'side', 'long', 'bun', 'ponytail', 'curly', 'bald', 'hijab', 'doppi', 'cap'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const FACIALS = ['none', 'beard', 'mustache'] as const;
export type Facial = (typeof FACIALS)[number];
export const EYEWEAR = ['none', 'glasses', 'sunglasses', 'headphones'] as const;
export type Eyewear = (typeof EYEWEAR)[number];
export const PROPS = ['none', 'tablet', 'folder', 'phone', 'mop'] as const;
export type Prop = (typeof PROPS)[number];
export const LOWERS = ['trousers', 'skirt', 'long'] as const;
export type Lower = (typeof LOWERS)[number];

export const ROLES = ['director', 'assistant', 'operations', 'strategist', 'sales', 'marketer', 'creator', 'designer', 'analyst', 'developer', 'accountant', 'cleaner', 'guard', 'coordinator'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_TITLE: Record<Role, { uz: string; en: string; emoji: string }> = {
  director: { uz: 'Direktor', en: 'Director', emoji: '👔' },
  assistant: { uz: 'Yordamchi', en: 'Assistant', emoji: '🗂️' },
  operations: { uz: 'Operatsion menejer', en: 'Operations manager', emoji: '📋' },
  strategist: { uz: 'AI strateg', en: 'AI strategist', emoji: '🧭' },
  sales: { uz: 'Savdo menejeri', en: 'Sales manager', emoji: '🤝' },
  marketer: { uz: 'Marketing mutaxassisi', en: 'Marketing specialist', emoji: '📣' },
  creator: { uz: 'Kontent yaratuvchi', en: 'Content creator', emoji: '🎬' },
  designer: { uz: 'Dizayner', en: 'Designer', emoji: '🎨' },
  analyst: { uz: 'Data tahlilchi', en: 'Data analyst', emoji: '📊' },
  developer: { uz: 'Dasturchi', en: 'Developer', emoji: '💻' },
  accountant: { uz: 'Hisobchi', en: 'Accountant', emoji: '🧮' },
  cleaner: { uz: 'Farrosh', en: 'Cleaner', emoji: '🧹' },
  guard: { uz: 'Qo‘riqchi', en: 'Security guard', emoji: '🛡️' },
  coordinator: { uz: 'Bosh koordinator', en: 'Lead coordinator', emoji: '✳️' },
};

export interface Look {
  role: Role;
  skin: string;
  hair: string;
  /** main garment: jacket, shirt, hoodie, uniform… (also the sleeves) */
  top: string;
  /** what shows underneath: shirt front, collar, cuffs */
  under: string;
  /** tie, lanyard, apron, scarf, headphone band, epaulettes */
  accent: string;
  /** trousers or skirt */
  pants: string;
  shoe: string;
  /** ID card (the agent's source repo colour) */
  badge: string;
  /** tights / bare legs under a skirt */
  legs: string;
  outfit: Outfit;
  hairStyle: HairStyle;
  facial: Facial;
  eyewear: Eyewear;
  prop: Prop;
  lower: Lower;
  scale: number;
}

/** Skeleton, in metres, relative to the parent joint. */
export const DIM = {
  hip: 0.93,
  sitHip: 0.52,
  hipX: 0.088,
  thigh: 0.44,
  shin: 0.41,
  shoulderX: 0.19,
  shoulderY: 0.485,
  neckY: 0.53,
  upperArm: 0.29,
  foreArm: 0.25,
};

// ------------------------------------------------------------------ mesher --

interface Ring {
  y: number;
  w: number;
  d: number;
  z?: number;
  x?: number;
}
const R = (y: number, w: number, d: number, z = 0, x = 0): Ring => ({ y, w, d, z, x });
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function ringAt(rs: Ring[], y: number): Required<Ring> {
  const full = (r: Ring) => ({ y, w: r.w, d: r.d, z: r.z ?? 0, x: r.x ?? 0 });
  if (y <= rs[0].y) return full(rs[0]);
  for (let i = 1; i < rs.length; i++) {
    if (y <= rs[i].y) {
      const a = rs[i - 1];
      const b = rs[i];
      const k = (y - a.y) / (b.y - a.y || 1);
      return { y, w: lerp(a.w, b.w, k), d: lerp(a.d, b.d, k), z: lerp(a.z ?? 0, b.z ?? 0, k), x: lerp(a.x ?? 0, b.x ?? 0, k) };
    }
  }
  return full(rs[rs.length - 1]);
}

/** z of a ring-built surface at (x, y) on the front (side 1) or back (-1). */
function surfZ(rs: Ring[], y: number, x = 0, side: 1 | -1 = 1, p = 2) {
  const r = ringAt(rs, y);
  const u = Math.min(0.995, Math.abs((x - r.x) / r.w));
  return r.z + side * r.d * (1 - u ** p) ** (1 / p);
}

const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();

interface RingOpts {
  seg?: number;
  /** superellipse exponent: 2 = ellipse, higher = boxier */
  p?: number;
  caps?: [boolean, boolean];
  /** y of the cap centres (defaults to the end rings' y) */
  tips?: [number | null, number | null];
  /** partial tube from angle a0 to a1 (radians, 0 = +x, π/2 = +z) */
  arc?: [number, number];
  phase?: number;
  exact?: boolean;
  double?: boolean;
}

export class Mesher {
  pos: number[] = [];
  col: number[] = [];
  slot: number[] = [];
  idx: number[] = [];
  private m: THREE.Matrix4 | null = null;

  constructor(readonly q = 1) {}

  seg(n: number) {
    return Math.max(3, Math.round(n * this.q));
  }

  private v(x: number, y: number, z: number, p: Paint) {
    tmpV.set(x, y, z);
    if (this.m) tmpV.applyMatrix4(this.m);
    this.pos.push(tmpV.x, tmpV.y, tmpV.z);
    if (p.startsWith('#')) {
      tmpC.set(p);
      this.col.push(tmpC.r, tmpC.g, tmpC.b);
      this.slot.push(-1);
    } else {
      this.col.push(1, 1, 1);
      this.slot.push(SLOT_INDEX[p as Slot]);
    }
    return this.pos.length / 3 - 1;
  }

  /** Run `fn` with every vertex transformed by `m`. */
  with(m: THREE.Matrix4, fn: () => void) {
    const prev = this.m;
    this.m = prev ? prev.clone().multiply(m) : m;
    fn();
    this.m = prev;
  }

  /** Tube through elliptical cross-sections. */
  rings(rs: Ring[], paint: Paint, o: RingOpts = {}) {
    if (o.double) {
      this.rings(rs, paint, { ...o, double: false });
      this.rings([...rs].reverse(), paint, { ...o, double: false, caps: o.caps ? [o.caps[1], o.caps[0]] : undefined, tips: o.tips ? [o.tips[1], o.tips[0]] : undefined });
      return;
    }
    const n = o.exact ? o.seg ?? 8 : this.seg(o.seg ?? 10);
    const p = o.p ?? 2;
    const e = 2 / p;
    const closed = !o.arc;
    const [a0, a1] = o.arc ?? [0, Math.PI * 2];
    const ph = o.phase ?? 0;
    const cols = closed ? n : n + 1;
    const rows = rs.map((r) => {
      const row: number[] = [];
      for (let j = 0; j < cols; j++) {
        const th = ph + a0 + ((a1 - a0) * j) / n;
        const c = Math.cos(th);
        const s = Math.sin(th);
        row.push(this.v((r.x ?? 0) + r.w * Math.sign(c) * Math.abs(c) ** e, r.y, (r.z ?? 0) + r.d * Math.sign(s) * Math.abs(s) ** e, paint));
      }
      return row;
    });
    const up = rs[rs.length - 1].y >= rs[0].y;
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < n; j++) {
        const a = rows[i][j];
        const b = rows[i][(j + 1) % cols];
        const d = rows[i + 1][j];
        const c = rows[i + 1][(j + 1) % cols];
        if (up) this.idx.push(a, d, b, b, d, c);
        else this.idx.push(a, b, d, b, c, d);
      }
    }
    if (!closed) return;
    const [c0, c1] = o.caps ?? [true, true];
    const cap = (row: number[], r: Ring, tip: number | null | undefined, start: boolean) => {
      const c = this.v(r.x ?? 0, tip ?? r.y, r.z ?? 0, paint);
      for (let j = 0; j < n; j++) {
        const a = row[j];
        const b = row[(j + 1) % cols];
        if (start === up) this.idx.push(c, a, b);
        else this.idx.push(c, b, a);
      }
    };
    if (c0) cap(rows[0], rs[0], o.tips?.[0], true);
    if (c1) cap(rows[rows.length - 1], rs[rs.length - 1], o.tips?.[1], false);
  }

  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, paint: Paint, seg = 8) {
    const m = Math.max(3, Math.round(this.seg(seg) / 2));
    const rs: Ring[] = [];
    for (let k = 1; k < m; k++) {
      const a = (Math.PI * k) / m;
      rs.push({ y: cy - ry * Math.cos(a), w: rx * Math.sin(a), d: rz * Math.sin(a), z: cz, x: cx });
    }
    this.rings(rs, paint, { seg, tips: [cy - ry, cy + ry] });
  }

  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, paint: Paint) {
    const faces: [number[], number[], number[]][] = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
    ];
    const hs = [w / 2, h / 2, d / 2];
    for (const [n, u, v] of faces) {
      const pt = (su: number, sv: number) =>
        this.v(
          cx + (n[0] + su * u[0] + sv * v[0]) * hs[0],
          cy + (n[1] + su * u[1] + sv * v[1]) * hs[1],
          cz + (n[2] + su * u[2] + sv * v[2]) * hs[2],
          paint,
        );
      const a = pt(-1, -1);
      const b = pt(1, -1);
      const c = pt(1, 1);
      const d = pt(-1, 1);
      this.idx.push(a, b, c, a, c, d);
    }
  }

  /** A patch lying on a ring-built surface (front or back), `lift` metres above it. */
  surf(rs: Ring[], side: 1 | -1, y0: number, y1: number, xr: (y: number) => [number, number], lift: number, paint: Paint, nx = 2, ny = 3, p = 2) {
    const NX = Math.max(1, Math.round(nx * this.q));
    const NY = Math.max(1, Math.round(ny * this.q));
    const grid: number[][] = [];
    for (let i = 0; i <= NY; i++) {
      const y = y0 + ((y1 - y0) * i) / NY;
      const r = ringAt(rs, y);
      const [xa, xb] = xr(y);
      const row: number[] = [];
      for (let j = 0; j <= NX; j++) {
        const x = xa + ((xb - xa) * j) / NX;
        const u = clamp((x - r.x) / r.w, -0.995, 0.995);
        const zz = r.d * (1 - Math.abs(u) ** p) ** (1 / p);
        const gx = (Math.sign(u) * Math.abs(u) ** (p - 1)) / r.w;
        const gz = (zz / r.d) ** (p - 1) / r.d;
        const gl = Math.hypot(gx, gz) || 1;
        row.push(this.v(x + (lift * gx) / gl, y, r.z + side * (zz + (lift * gz) / gl), paint));
      }
      grid.push(row);
    }
    for (let i = 0; i < NY; i++) {
      for (let j = 0; j < NX; j++) {
        const a = grid[i][j];
        const b = grid[i][j + 1];
        const d = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        if (side === 1) this.idx.push(a, b, d, b, c, d);
        else this.idx.push(a, d, b, b, d, c);
      }
    }
  }

  /** Round tube along a polyline. */
  path(pts: [number, number, number][], radii: number | number[], paint: Paint, seg = 6, caps = true) {
    const n = this.seg(seg);
    const P = pts.map((p) => new THREE.Vector3(...p));
    const N = new THREE.Vector3();
    const T = new THREE.Vector3();
    const B = new THREE.Vector3();
    const rows: number[][] = [];
    for (let i = 0; i < P.length; i++) {
      T.subVectors(P[Math.min(i + 1, P.length - 1)], P[Math.max(i - 1, 0)]).normalize();
      if (i === 0) N.crossVectors(T, Math.abs(T.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      else N.sub(T.clone().multiplyScalar(N.dot(T))).normalize();
      B.crossVectors(T, N);
      const r = Array.isArray(radii) ? radii[i] : radii;
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        const th = (j / n) * Math.PI * 2;
        const c = Math.cos(th) * r;
        const s = Math.sin(th) * r;
        row.push(this.v(P[i].x + c * N.x + s * B.x, P[i].y + c * N.y + s * B.y, P[i].z + c * N.z + s * B.z, paint));
      }
      rows.push(row);
    }
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < n; j++) {
        const a = rows[i][j];
        const b = rows[i][(j + 1) % n];
        const d = rows[i + 1][j];
        const c = rows[i + 1][(j + 1) % n];
        this.idx.push(a, b, d, b, c, d);
      }
    }
    if (!caps) return;
    const first = this.v(P[0].x, P[0].y, P[0].z, paint);
    const last = this.v(P[P.length - 1].x, P[P.length - 1].y, P[P.length - 1].z, paint);
    for (let j = 0; j < n; j++) {
      this.idx.push(first, rows[0][(j + 1) % n], rows[0][j]);
      this.idx.push(last, rows[rows.length - 1][j], rows[rows.length - 1][(j + 1) % n]);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('slot', new THREE.Float32BufferAttribute(this.slot, 1));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

// ------------------------------------------------------------------- body --

export function hipsGeo(me: Mesher) {
  const rs = [R(-0.125, 0.1, 0.075, -0.005), R(-0.085, 0.145, 0.103, -0.004), R(0, 0.158, 0.108), R(0.06, 0.152, 0.104), R(0.1, 0.146, 0.1)];
  me.rings(rs, 'pants', { seg: 12, p: 2.3 });
  me.rings([R(0.062, 0.156, 0.107), R(0.092, 0.152, 0.104)], '#2b2320', { seg: 12, p: 2.3, caps: [false, false] });
  me.box(0, 0.077, 0.108, 0.034, 0.024, 0.008, '#b8a26a');
}

const TORSO: Ring[] = [
  R(0.04, 0.15, 0.1, 0),
  R(0.14, 0.143, 0.097, 0.003),
  R(0.26, 0.157, 0.105, 0.01),
  R(0.36, 0.17, 0.109, 0.012),
  R(0.44, 0.184, 0.103, 0.005),
  R(0.495, 0.17, 0.093, 0),
  R(0.53, 0.115, 0.074, -0.004),
  R(0.552, 0.062, 0.055, 0),
];

export function torsoGeo(me: Mesher, outfit: Outfit) {
  const jacket = outfit === 'suit' || outfit === 'blazer';
  const k = outfit === 'hoodie' ? 1.07 : jacket ? 1.045 : outfit === 'sweater' ? 1.02 : 1;
  const rs = TORSO.map((r, i) => (i < TORSO.length - 2 ? { ...r, w: r.w * k, d: r.d * k } : r));
  if (jacket) rs.unshift(R(-0.075, 0.168, 0.12, 0.004));
  else if (outfit === 'hoodie') rs.unshift(R(-0.02, 0.162, 0.113, 0.002));
  const P = 2.4;
  me.rings(rs, 'top', { seg: 12, p: P });
  const F = (y0: number, y1: number, xr: (y: number) => [number, number], lift: number, paint: Paint, nx = 2, ny = 3) => me.surf(rs, 1, y0, y1, xr, lift, paint, nx, ny, P);
  const fz = (y: number, x = 0) => surfZ(rs, y, x, 1, P);
  const collar = (paint: Paint, h = 0.585) => me.rings([R(0.522, 0.074, 0.07, 0.006), R(h, 0.064, 0.061, 0.009)], paint, { seg: 10, caps: [false, false], double: true });
  const buttons = (ys: number[], paint: Paint = '#1b1d22', r = 0.008) => ys.forEach((y) => me.ellipsoid(0, y, fz(y) + 0.004, r, r, 0.004, paint, 6));
  const lanyard = () => {
    for (const s of [1, -1]) F(0.33, 0.54, (y) => { const c = s * (0.012 + ((y - 0.33) / 0.21) * 0.05); return [c - 0.006, c + 0.006]; }, 0.006, 'accent', 1, 4);
    F(0.25, 0.33, () => [-0.028, 0.028], 0.01, 'badge', 1, 1);
    me.box(0, 0.335, fz(0.335) + 0.012, 0.014, 0.012, 0.006, '#d8d8d8');
  };
  const vee = (bottom: number, slope: number) => (y: number) => 0.008 + (y - bottom) * slope;
  const lapels = (bottom: number, slope: number) => {
    const v = vee(bottom, slope);
    F(bottom - 0.03, 0.54, (y) => [v(y), v(y) + 0.036], 0.008, 'top', 1, 4);
    F(bottom - 0.03, 0.54, (y) => [-v(y) - 0.036, -v(y)], 0.008, 'top', 1, 4);
  };
  const tie = () => {
    F(0.3, 0.515, (y) => { const w = y > 0.49 ? 0.013 : y > 0.335 ? 0.013 + (0.49 - y) * 0.11 : Math.max(0.003, 0.03 * ((y - 0.3) / 0.035)); return [-w, w]; }, 0.007, 'accent', 1, 5);
    me.ellipsoid(0, 0.515, fz(0.515) + 0.012, 0.019, 0.016, 0.011, 'accent', 6);
  };

  switch (outfit) {
    case 'suit': {
      const v = vee(0.3, 0.3);
      F(0.3, 0.54, (y) => [-v(y), v(y)], 0.004, 'under', 2, 4);
      collar('under', 0.58);
      tie();
      lapels(0.3, 0.3);
      buttons([0.24, 0.16]);
      me.box(0.105, 0.405, fz(0.405, 0.105) + 0.006, 0.03, 0.012, 0.006, 'under');
      me.ellipsoid(0.1, 0.46, fz(0.46, 0.1) + 0.012, 0.008, 0.008, 0.004, 'badge', 6);
      break;
    }
    case 'blazer': {
      const v = vee(0.25, 0.32);
      F(0.25, 0.54, (y) => [-v(y), v(y)], 0.004, 'under', 2, 4);
      collar('under', 0.575);
      lapels(0.25, 0.32);
      buttons([0.2]);
      me.ellipsoid(0.1, 0.44, fz(0.44, 0.1) + 0.012, 0.009, 0.009, 0.004, 'badge', 6);
      break;
    }
    case 'shirt':
    case 'shirtTie': {
      collar('top');
      buttons([0.45, 0.37, 0.29, 0.21, 0.13], '#eeeeea', 0.005);
      F(0.33, 0.41, () => [0.05, 0.12], 0.004, 'top', 1, 1);
      if (outfit === 'shirtTie') {
        tie();
        F(0.36, 0.415, () => [0.06, 0.11], 0.01, 'badge', 1, 1);
      } else lanyard();
      break;
    }
    case 'polo':
      collar('top', 0.575);
      F(0.44, 0.535, () => [-0.013, 0.013], 0.003, 'under', 1, 2);
      buttons([0.51, 0.47], '#eeeeea', 0.005);
      lanyard();
      break;
    case 'sweater':
      collar('under', 0.575);
      me.rings([R(0.035, 0.154 * k, 0.104 * k), R(0.075, 0.15 * k, 0.101 * k, 0.002)], 'top', { seg: 12, p: P, caps: [false, false] });
      lanyard();
      break;
    case 'hoodie':
      me.path([[-0.095, 0.52, 0.04], [-0.105, 0.555, -0.035], [0, 0.575, -0.105], [0.105, 0.555, -0.035], [0.095, 0.52, 0.04]], 0.034, 'top', 7, true);
      me.surf(rs, -1, 0.34, 0.52, () => [-0.11, 0.11], 0.012, 'top', 2, 2, P);
      for (const s of [1, -1]) F(0.36, 0.52, () => [s * 0.032 - 0.004, s * 0.032 + 0.004], 0.012, 'under', 1, 2);
      F(0.09, 0.22, (y) => { const w = 0.1 - (y - 0.09) * 0.25; return [-w, w]; }, 0.008, 'top', 2, 2);
      F(0.36, 0.42, () => [0.06, 0.105], 0.012, 'badge', 1, 1);
      break;
    case 'turtleneck':
      me.rings([R(0.52, 0.07, 0.066, 0.004), R(0.6, 0.064, 0.062, 0.008), R(0.615, 0.058, 0.057, 0.008)], 'top', { seg: 12, caps: [false, false], double: true });
      lanyard();
      break;
    case 'apron':
      collar('top');
      F(0.28, 0.44, () => [-0.085, 0.085], 0.009, 'accent', 2, 3);
      F(-0.11, 0.3, () => [-0.14, 0.14], 0.009, 'accent', 3, 4);
      F(0.27, 0.3, () => [-0.155, 0.155], 0.013, 'accent', 3, 1);
      F(0.06, 0.16, () => [-0.085, 0.085], 0.015, 'accent', 2, 1);
      for (const s of [1, -1]) F(0.43, 0.545, (y) => { const c = s * lerp(0.08, 0.06, (y - 0.43) / 0.115); return [c - 0.01, c + 0.01]; }, 0.009, 'accent', 1, 2);
      F(0.35, 0.4, () => [0.025, 0.07], 0.014, 'badge', 1, 1);
      break;
    case 'uniform':
      collar('top', 0.585);
      buttons([0.46, 0.38, 0.3, 0.22, 0.14], '#c9b27a', 0.006);
      for (const s of [1, -1]) {
        F(0.33, 0.41, () => (s > 0 ? [0.04, 0.12] : [-0.12, -0.04]), 0.006, 'top', 1, 1);
        F(0.4, 0.425, () => (s > 0 ? [0.037, 0.123] : [-0.123, -0.037]), 0.011, 'top', 1, 1);
        me.with(M(s * 0.125, 0.505, 0, 0, 0, s * -0.32), () => me.box(0, 0, 0, 0.1, 0.016, 0.07, 'accent'));
      }
      me.ellipsoid(0.08, 0.455, fz(0.455, 0.08) + 0.012, 0.018, 0.02, 0.005, 'badge', 6);
      me.box(-0.12, 0.46, fz(0.46, -0.12) + 0.02, 0.035, 0.07, 0.025, '#15171c');
      break;
  }
}

const HEAD: Ring[] = [
  R(0.045, 0.022, 0.03, 0.055),
  R(0.058, 0.046, 0.058, 0.036),
  R(0.085, 0.063, 0.085, 0.02),
  R(0.12, 0.074, 0.098, 0.01),
  R(0.16, 0.079, 0.104, 0.002),
  R(0.2, 0.08, 0.103, -0.004),
  R(0.235, 0.076, 0.097, -0.008),
  R(0.262, 0.064, 0.082, -0.01),
  R(0.28, 0.042, 0.055, -0.01),
  R(0.29, 0.012, 0.016, -0.01),
];
const hz = (y: number, x = 0) => surfZ(HEAD, y, x, 1);
const LIP = '#a8645c';

export const FACE = { eyeY: 0.162, eyeX: 0.032, mouthY: 0.088 };

export function headGeo(me: Mesher, facial: Facial, o: { eyes?: boolean; lips?: boolean } = {}) {
  me.rings([R(-0.03, 0.056, 0.056), R(0.03, 0.05, 0.052, 0.004), R(0.1, 0.048, 0.05, 0.004)], 'skin', { seg: 10, caps: [false, false] });
  me.rings(HEAD, 'skin', { seg: 14 });
  // Ears, nose, brows.
  for (const s of [1, -1]) {
    me.ellipsoid(s * 0.079, 0.152, -0.004, 0.011, 0.026, 0.018, 'skin', 7);
    me.with(M(s * 0.034, 0.192, hz(0.192, 0.034) + 0.002, 0, 0, s * -0.12), () => me.box(0, 0, 0, 0.032, 0.0065, 0.008, 'hair'));
  }
  me.ellipsoid(0, 0.13, hz(0.13) + 0.004, 0.011, 0.024, 0.014, 'skin', 7);
  me.ellipsoid(0, 0.112, hz(0.112) + 0.012, 0.014, 0.011, 0.012, 'skin', 7);
  if (o.eyes !== false) eyesGeo(me);
  const beard = facial === 'beard';
  if (beard) {
    me.surf(HEAD, 1, 0.042, 0.125, (y) => { const r = ringAt(HEAD, y); return [-r.w * 0.97, r.w * 0.97]; }, 0.005, 'hair', 5, 3);
    for (const s of [1, -1]) me.surf(HEAD, 1, 0.12, 0.172, (y) => { const w = ringAt(HEAD, y).w; return s > 0 ? [w * 0.78, w * 0.97] : [-w * 0.97, -w * 0.78]; }, 0.004, 'hair', 1, 2);
  }
  if (facial !== 'none') me.surf(HEAD, 1, 0.094, 0.108, () => [-0.027, 0.027], beard ? 0.009 : 0.006, 'hair', 2, 1);
  if (o.lips !== false) lipsGeo(me, beard);
}

export function eyesGeo(me: Mesher) {
  for (const s of [1, -1]) {
    const x = s * FACE.eyeX;
    const z = hz(FACE.eyeY, x);
    me.ellipsoid(x, FACE.eyeY, z - 0.003, 0.0145, 0.0088, 0.006, '#f3f1ec', 8);
    me.ellipsoid(x, FACE.eyeY - 0.0005, z + 0.0015, 0.0068, 0.0068, 0.003, '#3b2a20', 8);
    me.ellipsoid(x, FACE.eyeY - 0.0005, z + 0.0032, 0.0032, 0.0032, 0.0015, '#0d0a09', 6);
    me.ellipsoid(x, FACE.eyeY + 0.0082, z + 0.0008, 0.0155, 0.0022, 0.004, '#2a1d17', 6);
  }
}

export function lipsGeo(me: Mesher, beard = false) {
  me.ellipsoid(0, FACE.mouthY, hz(FACE.mouthY) + (beard ? 0.006 : 0.001), 0.021, 0.0062, 0.006, LIP, 8);
}

// ------------------------------------------------------------------- hair --

/** The head surface pushed outwards: k scales width/depth, the crown rises a little. */
function shell(k: number, y0: number): Ring[] {
  const rs = HEAD.map((r) => ({ ...r, w: r.w * k, d: r.d * k, y: r.y + Math.max(0, r.y - 0.2) * (k - 1) * 1.6 }));
  return [ringAt(rs, y0), ...rs.filter((r) => r.y > y0 + 1e-4)];
}

export function hairGeo(me: Mesher, style: HairStyle) {
  const cap = (k: number, y0: number, paint: Paint = 'hair') => {
    const rs = shell(k, y0);
    const top = rs[rs.length - 1];
    me.rings(rs.slice(0, -1), paint, { seg: 14, caps: [false, true], tips: [null, top.y + 0.012 * k] });
  };
  const back = (k: number, y0: number, y1: number, lift = 0.002, paint: Paint = 'hair') => {
    const rs = HEAD.map((r) => ({ ...r, w: r.w * k, d: r.d * k }));
    me.surf(rs, -1, y0, y1, (y) => { const w = ringAt(rs, y).w; return [-w * 0.985, w * 0.985]; }, lift, paint, 5, 3);
  };
  switch (style) {
    case 'short':
      cap(1.075, 0.2);
      back(1.05, 0.095, 0.215);
      break;
    case 'side':
      cap(1.08, 0.198);
      back(1.05, 0.09, 0.215);
      me.ellipsoid(0.01, 0.272, 0.022, 0.056, 0.018, 0.07, 'hair', 10);
      me.ellipsoid(-0.026, 0.246, 0.07, 0.042, 0.011, 0.028, 'hair', 8);
      break;
    case 'long':
      cap(1.08, 0.2);
      me.rings([R(-0.06, 0.1, 0.07, -0.025), R(0.04, 0.093, 0.083, -0.012), R(0.12, 0.088, 0.108, 0), R(0.2, 0.087, 0.111, -0.004), R(0.232, 0.083, 0.105, -0.008)], 'hair', { seg: 12, arc: [Math.PI * 0.9, Math.PI * 2.1], double: true });
      me.surf(shell(1.08, 0.2), 1, 0.205, 0.245, () => [-0.066, 0.05], 0.004, 'hair', 3, 1);
      break;
    case 'bun':
      cap(1.07, 0.2);
      back(1.05, 0.1, 0.215);
      me.ellipsoid(0, 0.25, -0.1, 0.043, 0.04, 0.038, 'hair', 10);
      break;
    case 'ponytail':
      cap(1.07, 0.2);
      back(1.05, 0.1, 0.215);
      me.path([[0, 0.215, -0.1], [0, 0.18, -0.13], [0, 0.11, -0.138], [0, 0.04, -0.125]], [0.026, 0.028, 0.022, 0.008], 'hair', 8);
      me.rings([R(0.198, 0.022, 0.022, -0.118), R(0.212, 0.024, 0.024, -0.112)], '#2b2b33', { seg: 8 });
      break;
    case 'curly': {
      cap(1.13, 0.19);
      back(1.09, 0.09, 0.2, 0.004);
      const rs = shell(1.12, 0.19);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const y = 0.215 + (i % 3) * 0.022;
        const r = ringAt(rs, y);
        me.ellipsoid(Math.cos(a) * r.w * 0.92, y + 0.012, r.z + Math.sin(a) * r.d * 0.92, 0.03, 0.026, 0.03, 'hair', 6);
      }
      break;
    }
    case 'bald':
      back(1.035, 0.1, 0.19, 0.001);
      break;
    case 'hijab': {
      cap(1.12, 0.19, 'accent');
      me.rings([R(-0.07, 0.125, 0.105, -0.012), R(-0.01, 0.087, 0.088, 0.002), R(0.05, 0.076, 0.1, 0.02), R(0.1, 0.087, 0.117, 0.012), R(0.16, 0.091, 0.118, 0.003), R(0.215, 0.089, 0.113, -0.004)], 'accent', { seg: 14, arc: [Math.PI * 0.7, Math.PI * 2.3], double: true });
      me.ellipsoid(0, 0.025, 0.05, 0.062, 0.042, 0.055, 'accent', 10);
      me.rings([R(-0.13, 0.175, 0.135, 0), R(-0.07, 0.13, 0.105, 0), R(-0.01, 0.085, 0.08, 0.004)], 'accent', { seg: 14, caps: [false, false] });
      break;
    }
    case 'doppi': {
      cap(1.07, 0.2);
      back(1.05, 0.095, 0.215);
      const s = 0.086;
      me.rings([R(0.212, s * 1.414, s * 1.414, -0.01), R(0.262, (s - 0.004) * 1.414, (s - 0.004) * 1.414, -0.01), R(0.282, (s - 0.018) * 1.414, (s - 0.018) * 1.414, -0.01)], '#17171b', { seg: 4, exact: true, phase: Math.PI / 4, tips: [null, 0.29] });
      me.ellipsoid(0, 0.238, s - 0.012, 0.016, 0.02, 0.004, '#f2efe6', 6);
      me.ellipsoid(0, 0.238, -s - 0.008, 0.016, 0.02, 0.004, '#f2efe6', 6);
      for (const x of [1, -1]) me.ellipsoid(x * (s + 0.002), 0.238, -0.01, 0.004, 0.02, 0.016, '#f2efe6', 6);
      break;
    }
    case 'cap':
      back(1.05, 0.1, 0.2);
      me.rings([R(0.19, 0.089, 0.108, -0.006), R(0.255, 0.1, 0.118, -0.004), R(0.275, 0.101, 0.119, -0.004)], 'top', { seg: 14, tips: [null, 0.278] });
      me.rings([R(0.2, 0.09, 0.109, -0.006), R(0.214, 0.09, 0.109, -0.006)], 'accent', { seg: 14, caps: [false, false] });
      me.with(M(0, 0.2, 0.1, -0.15), () => me.ellipsoid(0, 0, 0.012, 0.075, 0.005, 0.045, '#15171c', 10));
      me.ellipsoid(0, 0.24, 0.118, 0.014, 0.016, 0.005, 'badge', 6);
      break;
  }
}

export function eyewearGeo(me: Mesher, kind: Eyewear) {
  if (kind === 'none') return;
  if (kind === 'headphones') {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      pts.push([Math.cos(a) * 0.092, 0.16 + Math.sin(a) * 0.145, -0.008]);
    }
    me.path(pts, 0.009, 'accent', 6);
    for (const s of [1, -1]) me.with(M(s * 0.09, 0.155, -0.004, 0, 0, Math.PI / 2), () => me.rings([R(-0.016, 0.034, 0.034), R(0.016, 0.032, 0.032)], '#1d1f27', { seg: 12 }));
    return;
  }
  const frame: Paint = kind === 'sunglasses' ? '#111216' : '#23232a';
  for (const s of [1, -1]) {
    const x = s * FACE.eyeX;
    const z = hz(FACE.eyeY, x) + 0.012;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push([x + Math.cos(a) * 0.021, FACE.eyeY + Math.sin(a) * 0.015, z]);
    }
    me.path(pts, 0.0024, frame, 4, false);
    if (kind === 'sunglasses') me.ellipsoid(x, FACE.eyeY, z - 0.001, 0.02, 0.014, 0.003, '#0b0c10', 10);
    me.path([[s * 0.053, FACE.eyeY + 0.004, z - 0.002], [s * 0.078, FACE.eyeY + 0.006, -0.01], [s * 0.08, FACE.eyeY - 0.01, -0.035]], 0.0025, frame, 4, false);
  }
  me.path([[-0.011, FACE.eyeY + 0.004, hz(FACE.eyeY) + 0.014], [0, FACE.eyeY + 0.007, hz(FACE.eyeY) + 0.016], [0.011, FACE.eyeY + 0.004, hz(FACE.eyeY) + 0.014]], 0.0025, frame, 4, false);
}

export function upperArmGeo(me: Mesher) {
  me.ellipsoid(0, -0.005, 0, 0.058, 0.055, 0.06, 'top', 10);
  me.rings([R(0.01, 0.052, 0.054), R(-0.06, 0.054, 0.055), R(-0.18, 0.047, 0.048), R(-0.3, 0.043, 0.044)], 'top', { seg: 10 });
}

export function foreArmGeo(me: Mesher) {
  me.rings([R(0.025, 0.043, 0.045), R(-0.05, 0.043, 0.045), R(-0.2, 0.034, 0.031), R(-0.225, 0.034, 0.03)], 'top', { seg: 10 });
  me.rings([R(-0.212, 0.037, 0.034), R(-0.242, 0.035, 0.032)], 'under', { seg: 10 });
  // Hand: palm faces the thigh (±x), thumb forward.
  me.ellipsoid(0, -0.3, 0.004, 0.019, 0.052, 0.038, 'skin', 9);
  me.ellipsoid(0, -0.276, 0.034, 0.012, 0.026, 0.012, 'skin', 7);
}

export function thighGeo(me: Mesher, lower: Lower) {
  if (lower === 'trousers') {
    me.rings([R(0.03, 0.082, 0.085), R(-0.05, 0.08, 0.083), R(-0.25, 0.066, 0.07, 0.004), R(-0.42, 0.055, 0.058, 0.006), R(-0.46, 0.052, 0.055, 0.004)], 'pants', { seg: 10 });
    return;
  }
  me.rings([R(0.03, 0.09, 0.09), R(-0.12, 0.093, 0.096), R(-0.31, 0.092, 0.094, 0.004)], 'pants', { seg: 10 });
  me.rings([R(-0.28, 0.058, 0.06, 0.004), R(-0.42, 0.05, 0.052, 0.006), R(-0.46, 0.048, 0.05, 0.004)], lower === 'long' ? 'pants' : 'legs', { seg: 10 });
}

export function shinGeo(me: Mesher, lower: Lower) {
  const flat = lower !== 'trousers';
  if (lower === 'trousers') me.rings([R(0.03, 0.056, 0.058), R(-0.15, 0.052, 0.055), R(-0.33, 0.05, 0.052), R(-0.4, 0.052, 0.054)], 'pants', { seg: 10 });
  else if (lower === 'skirt') me.rings([R(0.03, 0.05, 0.052), R(-0.12, 0.048, 0.053, -0.004), R(-0.33, 0.034, 0.036), R(-0.41, 0.032, 0.034)], 'legs', { seg: 10 });
  else me.rings([R(0.05, 0.088, 0.092), R(-0.2, 0.097, 0.1), R(-0.37, 0.105, 0.108)], 'pants', { seg: 12 });
  if (lower === 'long') me.rings([R(-0.33, 0.032, 0.034), R(-0.41, 0.03, 0.032)], 'legs', { seg: 8 });
  const w = flat ? 0.04 : 0.048;
  me.rings([R(-0.402, w * 0.9, 0.085, 0.04), R(-0.44, w, flat ? 0.112 : 0.128, flat ? 0.048 : 0.055), R(-0.47, w, flat ? 0.114 : 0.132, flat ? 0.048 : 0.055), R(-0.49, w * 0.94, flat ? 0.108 : 0.125, flat ? 0.048 : 0.055)], 'shoe', { seg: 10, p: 2.8 });
}

/** Hand-held props in the right hand's frame (the wrist, arm hanging down). */
export function propGeo(me: Mesher, prop: Prop) {
  switch (prop) {
    case 'tablet':
      me.box(-0.012, -0.31, 0.05, 0.012, 0.235, 0.17, '#1b1c21');
      me.box(-0.019, -0.31, 0.05, 0.002, 0.21, 0.15, '#2e4a6b');
      break;
    case 'folder':
      me.box(-0.014, -0.31, 0.05, 0.02, 0.3, 0.23, 'accent');
      me.box(-0.002, -0.31, 0.05, 0.004, 0.29, 0.22, '#f4f1ea');
      break;
    case 'phone':
      me.box(-0.012, -0.315, 0.035, 0.01, 0.145, 0.072, '#15161a');
      break;
  }
}

/** The mop sweeps around a vertical axis through the right hand (root frame x, z). */
export const MOP_PIVOT: [number, number] = [-0.19, 0.5];

/** Mop in the right hand, reaching the floor ahead, in the person's root frame. */
export function mopGeo(me: Mesher) {
  me.path([[-0.196, 1.235, 0.46], [-0.12, 0.05, 1.04]], 0.014, '#b58a58', 6);
  me.box(-0.12, 0.035, 1.05, 0.34, 0.03, 0.08, '#7d8794');
  for (let i = 0; i < 9; i++) me.box(-0.28 + i * 0.04, 0.014, 1.05 + ((i % 2) - 0.5) * 0.02, 0.03, 0.028, 0.1, '#e7e3d8');
}

export function cupGeo(me: Mesher) {
  me.rings([R(-0.34, 0.032, 0.032, 0.045, -0.02), R(-0.25, 0.037, 0.037, 0.045, -0.02)], '#f7f5f0', { seg: 10 });
  me.rings([R(-0.25, 0.039, 0.039, 0.045, -0.02), R(-0.24, 0.037, 0.037, 0.045, -0.02)], '#6d4c41', { seg: 10 });
}

// ------------------------------------------------------------------- pose --

export interface Joints {
  hipY: number;
  lean: number;
  twist: number;
  nod: number;
  turn: number;
  /** [left (+x), right (-x)] */
  armX: [number, number];
  armZ: [number, number];
  elbow: [number, number];
  thigh: [number, number];
  knee: [number, number];
  /** show the hand-held prop */
  prop: boolean;
  /** side-to-side swing of a mop (radians) */
  sway: number;
}

export const newJoints = (): Joints => ({ hipY: DIM.hip, lean: 0, twist: 0, nod: 0, turn: 0, armX: [0, 0], armZ: [0, 0], elbow: [0, 0], thigh: [0, 0], knee: [0, 0], prop: true, sway: 0 });

/** Joint angles for an animation. Negative x rotations swing a limb forwards. */
export function solvePose(j: Joints, anim: Anim, sit: boolean, t: number, phase: number, prop: Prop): Joints {
  j.hipY = sit ? DIM.sitHip : DIM.hip;
  j.lean = 0;
  j.twist = 0;
  j.nod = 0.03;
  j.turn = 0;
  j.sway = 0;
  j.armX[0] = j.armX[1] = Math.sin(t * 0.8) * 0.03;
  j.armZ[0] = 0.07;
  j.armZ[1] = -0.07;
  j.elbow[0] = j.elbow[1] = -0.14;
  j.thigh[0] = j.thigh[1] = 0;
  j.knee[0] = j.knee[1] = 0.03;
  j.prop = !sit;
  if (sit) {
    j.thigh[0] = j.thigh[1] = -1.5;
    j.knee[0] = j.knee[1] = 1.4;
    j.armX[0] = j.armX[1] = -0.5;
    j.armZ[0] = -0.04;
    j.armZ[1] = 0.04;
    j.elbow[0] = j.elbow[1] = -0.95;
    j.lean = 0.03;
  }
  switch (anim) {
    case 'walk': {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      j.thigh[0] = -0.45 * s;
      j.thigh[1] = 0.45 * s;
      j.knee[0] = 0.1 + 0.95 * Math.max(0, c) ** 1.4;
      j.knee[1] = 0.1 + 0.95 * Math.max(0, -c) ** 1.4;
      j.armX[0] = 0.38 * s;
      j.armX[1] = -0.38 * s;
      j.elbow[0] = -0.25 - 0.3 * Math.max(0, -s);
      j.elbow[1] = -0.25 - 0.3 * Math.max(0, s);
      j.hipY = DIM.hip - 0.02 + 0.022 * Math.abs(c);
      j.lean = 0.05;
      j.twist = s * 0.06;
      break;
    }
    case 'type':
      j.lean = 0.12;
      j.nod = 0.08 + Math.sin(t * 0.7) * 0.04;
      j.armX[0] = j.armX[1] = -0.42;
      j.armZ[0] = -0.13;
      j.armZ[1] = 0.13;
      j.elbow[0] = -1.28 + Math.sin(t * 15) * 0.05;
      j.elbow[1] = -1.28 + Math.sin(t * 15 + 1.7) * 0.05;
      j.prop = false;
      break;
    case 'talk':
      j.armX[1] = -0.35 - Math.max(0, Math.sin(t * 3.1)) * 0.35;
      j.armZ[1] = -0.1;
      j.elbow[1] = -1.1;
      j.armX[0] = -0.15 - Math.max(0, Math.sin(t * 2.3 + 1)) * 0.25;
      j.elbow[0] = -0.7;
      j.nod = Math.sin(t * 3) * 0.07;
      j.turn = Math.sin(t * 0.9) * 0.2;
      break;
    case 'read':
      j.armX[0] = j.armX[1] = -0.32;
      j.armZ[0] = -0.16;
      j.armZ[1] = 0.16;
      j.elbow[0] = j.elbow[1] = -1.45;
      j.nod = 0.4;
      j.prop = true;
      break;
    case 'drink':
      j.armX[1] = -0.35;
      j.armZ[1] = 0.12;
      j.elbow[1] = -0.7 - Math.max(0, Math.sin(t * 1.1)) * 1.55;
      j.turn = Math.sin(t * 0.5) * 0.3;
      j.prop = false;
      break;
    case 'wave':
      j.armX[1] = -0.15;
      j.armZ[1] = -2.5 + Math.sin(t * 9) * 0.25;
      j.elbow[1] = -0.35;
      break;
    case 'think':
      j.armX[1] = -0.5;
      j.armZ[1] = 0.28;
      j.elbow[1] = -2.3;
      j.armX[0] = -0.35;
      j.armZ[0] = -0.38;
      j.elbow[0] = -1.4;
      j.nod = -0.12;
      j.turn = Math.sin(t * 0.6) * 0.3;
      break;
    case 'mop':
      j.sway = Math.sin(t * 2.2) * 0.22;
      j.twist = j.sway * 0.6;
      j.lean = 0.14;
      j.nod = 0.25;
      j.thigh[0] = j.thigh[1] = -0.12;
      j.knee[0] = j.knee[1] = 0.16;
      j.hipY = DIM.hip - 0.015;
      break;
    default:
      if (!sit) j.turn = Math.sin(t * 0.25) * 0.35;
  }
  if (prop === 'mop' && !sit) {
    // Right hand on the handle, left hand steadying it.
    j.armX[1] = -0.35;
    j.armZ[1] = 0.05;
    j.elbow[1] = -1.1;
    j.armX[0] = -0.55;
    j.armZ[0] = -0.3;
    j.elbow[0] = -0.9;
    j.prop = true;
  }
  return j;
}

// ------------------------------------------------------------------ looks --

const SKIN = ['#f3d6bd', '#ebc6a3', '#e2b894', '#d6a782', '#c99673', '#b98464', '#f6dcc7'];
const HAIR = ['#15110f', '#1c1512', '#241a14', '#2d2019', '#3a2a1f', '#4a3526'];
const SCARF = ['#6b4f6e', '#2f3e57', '#8c2f4b', '#c9b8a6', '#3f5e5a', '#a0522d', '#d8c3a5', '#5b6770', '#e8dcc8'];
const GREY = ['#6e6b69', '#8a8783', '#5b5856'];
const JEANS = ['#2f3e57', '#3b4a63', '#27313f', '#34405a'];
const DARK = ['#23262d', '#2b2f38', '#1f232b', '#33363f'];

const FEMALE: Record<Role, number> = {
  director: 0.3, assistant: 0.7, operations: 0.45, strategist: 0.4, sales: 0.35, marketer: 0.6, creator: 0.5,
  designer: 0.5, analyst: 0.45, developer: 0.3, accountant: 0.55, cleaner: 0.5, guard: 0.05, coordinator: 0.5,
};

function rng(seed: number) {
  let a = Math.floor(seed * 2 ** 31) ^ 0x9e3779b9;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dress a person for their job. `seed` (0..1) keeps a person looking the same
 * on every load; `tint` is their building colour (lanyards, sales ties).
 */
export function lookFor(role: Role, seed: number, badge: string, tint = '#3d7bf2'): Look {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const chance = (p: number) => r() < p;
  const female = chance(FEMALE[role]);
  const L: Look = {
    role, skin: pick(SKIN), hair: pick(HAIR), top: '#555a66', under: '#f4f4f1', accent: tint, pants: pick(DARK), shoe: '#18181b', badge, legs: '#2e2627',
    outfit: 'shirt', hairStyle: 'short', facial: 'none', eyewear: 'none', prop: 'none', lower: 'trousers', scale: 1,
  };
  if (female) {
    L.scale = 0.95 + r() * 0.03;
    L.hairStyle = pick(['long', 'long', 'bun', 'bun', 'ponytail', 'hijab'] as const);
    L.legs = pick([L.skin, '#2e2627', '#3a3030']);
    if (chance(0.45)) L.lower = L.hairStyle === 'hijab' ? 'long' : pick(['skirt', 'skirt', 'long'] as const);
  } else {
    L.scale = 0.99 + r() * 0.05;
    L.hairStyle = pick(['short', 'short', 'short', 'side', 'side', 'curly'] as const);
    L.facial = chance(0.2) ? 'beard' : chance(0.2) ? 'mustache' : 'none';
  }
  const jacket = () => (female ? 'blazer' : 'suit');
  switch (role) {
    case 'director':
      L.outfit = jacket();
      L.top = pick(['#1f2a44', '#262a31', '#2c3440']);
      L.pants = L.top;
      L.under = '#f5f6f8';
      L.accent = pick(['#7a1f2b', '#8a6d1e', '#23395d']);
      if (!female && chance(0.4)) L.hair = pick(GREY);
      if (!female) L.hairStyle = pick(['side', 'side', 'short', 'bald'] as const);
      break;
    case 'operations':
      L.outfit = female ? 'blazer' : pick(['suit', 'shirtTie'] as const);
      L.top = L.outfit === 'shirtTie' ? pick(['#dbe7f5', '#f2f2ef']) : pick(['#4a5160', '#3c4a63', '#5a5f6b']);
      L.under = L.outfit === 'shirtTie' ? L.top : '#f5f6f8';
      L.accent = pick(['#1d3b6f', '#6b2d3a', '#2f5d50']);
      if (chance(0.4)) L.prop = 'tablet';
      break;
    case 'strategist':
      L.outfit = pick(['turtleneck', 'blazer'] as const);
      L.top = L.outfit === 'turtleneck' ? pick(['#1e1f24', '#2b2d38']) : pick(['#2d3142', '#3a3f4f']);
      L.under = '#1e1f24';
      L.pants = pick(['#26272d', '#33363f']);
      if (chance(0.45)) L.eyewear = 'glasses';
      if (chance(0.5)) L.prop = 'tablet';
      break;
    case 'sales':
      L.outfit = jacket();
      L.top = female ? pick(['#8c2f4b', '#3a4a66', '#b5523b']) : pick(['#3a4a66', '#4b5563', '#2f3e57']);
      L.pants = female ? pick(DARK) : L.top;
      L.under = pick(['#e3edf8', '#f7f3ee']);
      L.accent = chance(0.6) ? tint : '#1d3b6f';
      if (chance(0.5)) L.prop = 'phone';
      break;
    case 'marketer':
      L.outfit = pick(['blazer', 'blazer', 'polo', 'sweater'] as const);
      L.top = pick(['#8c2f4b', '#c8962b', '#2a7f7a', '#5b3f8c', '#b24f9a']);
      L.under = '#f7f3ee';
      L.pants = chance(0.5) ? pick(JEANS) : pick(DARK);
      L.prop = pick(['folder', 'phone', 'none'] as const);
      break;
    case 'creator':
      L.outfit = pick(['hoodie', 'sweater', 'polo'] as const);
      L.top = pick(['#e76f51', '#6c4ab6', '#2a9d8f', '#f4a261', '#264653', '#d1495b']);
      L.under = '#f0ede6';
      L.pants = pick(JEANS);
      L.shoe = pick(['#e8e8e4', '#f2f2ee', '#1c1c20']);
      if (chance(0.35)) L.eyewear = 'headphones';
      if (chance(0.5)) L.prop = 'phone';
      break;
    case 'designer':
      L.outfit = pick(['turtleneck', 'hoodie', 'blazer'] as const);
      L.top = pick(['#1e1f24', '#d8c3a5', '#6b705c', '#7d8597', '#a44a3f']);
      L.under = '#efe9e0';
      L.pants = chance(0.5) ? pick(JEANS) : '#2b2b30';
      L.shoe = pick(['#e8e8e4', '#1c1c20']);
      if (chance(0.4)) L.eyewear = 'glasses';
      if (chance(0.55)) L.prop = 'tablet';
      break;
    case 'analyst':
      L.outfit = pick(['sweater', 'sweater', 'shirt', 'shirtTie'] as const);
      L.top = L.outfit === 'sweater' ? pick(['#6b7280', '#27324d', '#556b2f', '#7b5e57']) : pick(['#dbe7f5', '#f2f2ef', '#e6eef2']);
      L.under = L.outfit === 'sweater' ? '#dbe7f5' : L.top;
      L.accent = L.outfit === 'shirtTie' ? '#2f4b7c' : tint;
      if (chance(0.55)) L.eyewear = 'glasses';
      if (chance(0.35)) L.prop = 'tablet';
      break;
    case 'developer':
      L.outfit = pick(['hoodie', 'hoodie', 'polo', 'sweater', 'shirt'] as const);
      L.top = pick(['#4b5563', '#1e3a5f', '#1f2937', '#2f5d50', '#7c2d12', '#3d405b', '#5c6b7a']);
      L.under = L.outfit === 'shirt' ? L.top : '#e9e7e1';
      L.pants = pick(JEANS);
      if (chance(0.6)) L.shoe = pick(['#e8e8e4', '#d8d8d2', '#2a2d33']);
      L.eyewear = chance(0.3) ? 'headphones' : chance(0.4) ? 'glasses' : 'none';
      break;
    case 'accountant':
      L.outfit = pick(['sweater', 'shirtTie', 'suit'] as const);
      if (female && L.outfit === 'suit') L.outfit = 'blazer';
      L.top = L.outfit === 'sweater' ? pick(['#b59f7b', '#8d6e63', '#6b7280']) : L.outfit === 'shirtTie' ? '#f2f2ef' : pick(['#4a5160', '#3f4652']);
      L.under = L.outfit === 'shirtTie' ? L.top : '#f5f6f8';
      L.accent = chance(0.5) ? tint : '#2f4b7c';
      if (chance(0.55)) L.eyewear = 'glasses';
      if (chance(0.5)) L.prop = 'folder';
      break;
    case 'assistant':
      L.outfit = female ? 'blazer' : pick(['shirtTie', 'sweater'] as const);
      L.top = female ? pick(['#d8c3a5', '#e8d5c4', '#b8c5d6', '#c9a9a6']) : pick(['#f2f2ef', '#dbe7f5']);
      L.under = female ? '#fbfaf7' : '#f2f2ef';
      if (female && L.lower === 'trousers' && chance(0.5)) L.lower = 'skirt';
      if (chance(0.6)) L.prop = 'tablet';
      break;
    case 'cleaner':
      L.outfit = 'apron';
      L.top = pick(['#2f6f8f', '#3f7f6f', '#4b6584']);
      L.accent = pick(['#1f4e5a', '#5b6770', '#244a63']);
      L.pants = '#2b2f38';
      L.shoe = '#2a2a2a';
      L.hairStyle = female ? (chance(0.6) ? 'hijab' : 'bun') : chance(0.6) ? 'doppi' : 'short';
      if (L.hairStyle === 'hijab') L.lower = 'long';
      if (!female && chance(0.5)) L.facial = 'mustache';
      L.prop = 'mop';
      break;
    case 'guard':
      L.outfit = 'uniform';
      L.top = '#1c2533';
      L.pants = '#1c2533';
      L.accent = '#c9a227';
      L.badge = '#c9a227';
      L.hairStyle = 'cap';
      L.lower = 'trousers';
      L.shoe = '#101114';
      break;
    case 'coordinator':
      L.outfit = 'blazer';
      L.top = '#d97757';
      L.under = '#fbf1ea';
      L.pants = '#3d3a36';
      L.accent = '#bf5f3f';
      L.eyewear = 'headphones';
      L.prop = 'tablet';
      break;
  }
  if (L.eyewear === 'headphones' && (L.hairStyle === 'hijab' || L.hairStyle === 'cap' || L.hairStyle === 'doppi')) L.eyewear = 'none';
  // The headscarf uses the accent colour: give it a real scarf colour, never the building tint.
  if (L.hairStyle === 'hijab') L.accent = pick(SCARF);
  return L;
}

/** Replace slot colours with the person's actual colours (for the portrait). */
export function paintGeometry(g: THREE.BufferGeometry, look: Look) {
  const slot = g.getAttribute('slot') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  const cache = SLOTS.map((s) => new THREE.Color(look[s]));
  for (let i = 0; i < slot.count; i++) {
    const s = slot.getX(i);
    if (s < 0) continue;
    const c = cache[s];
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return g;
}
