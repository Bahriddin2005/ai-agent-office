// Every person in the office is drawn with a handful of InstancedMeshes (one
// per body part), so hundreds of animated agents cost ~11 draw calls.
import * as THREE from 'three';
import { box, instanced, merge } from './geo';

export type Anim = 'idle' | 'walk' | 'type' | 'talk' | 'read' | 'drink' | 'wave' | 'think';

export interface BodyState {
  x: number;
  z: number;
  heading: number;
  pose: 'sit' | 'stand';
  anim: Anim;
  /** walk cycle phase (radians) */
  phase: number;
  visible: boolean;
  /** state marker colour above the head, null = none */
  marker: THREE.Color | null;
  seed: number;
}

export const HAIR_STYLES = ['short', 'long', 'bun', 'curly', 'bald'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Accessory = 'none' | 'headphones' | 'glasses' | 'tie' | 'beret' | 'cap' | 'visor' | 'mortarboard' | 'sunglasses';

export interface Look {
  shirt: THREE.ColorRepresentation;
  pants: THREE.ColorRepresentation;
  skin: THREE.ColorRepresentation;
  hair: THREE.ColorRepresentation;
  badge: THREE.ColorRepresentation;
  scale?: number;
  hairStyle?: HairStyle;
  accessory?: Accessory;
  accent?: THREE.ColorRepresentation;
}

const SKINS = ['#f6d5b8', '#eac09a', '#d7a27a', '#b97c55', '#8d5a3b', '#fbe3cf', '#c68d63'];
const HAIRS = ['#2b2118', '#4a3223', '#7b4a26', '#b5773d', '#d9b26a', '#1b1b1f', '#8a8f98', '#a33b2b', '#e8e2d6'];
const PANTS = ['#2f3b52', '#3d4250', '#1f2937', '#4b5563', '#50413a', '#2d4a3e', '#334155'];
const STYLE_WEIGHTS: HairStyle[] = ['short', 'short', 'short', 'long', 'long', 'bun', 'curly', 'curly', 'bald'];

/** What people in each department tend to wear. */
export const DEPT_ACCESSORY: Record<string, Accessory> = {
  engineering: 'headphones', languages: 'headphones', devops: 'cap', frontend: 'beret', creative: 'beret',
  data: 'glasses', research: 'glasses', security: 'glasses', executive: 'tie', business: 'tie',
  ai: 'visor', academy: 'mortarboard', product: 'none', marketing: 'none', productivity: 'none',
};

export function randomLook(seed: number, shirt: THREE.ColorRepresentation, badge: THREE.ColorRepresentation, dept?: string): Look {
  const pick = <T,>(arr: readonly T[], k: number) => arr[Math.abs(Math.floor(seed * 7919 + k * 104729)) % arr.length];
  const accessory = dept ? DEPT_ACCESSORY[dept] || 'none' : 'none';
  // Only about half of a department wears its accessory, so faces stay varied.
  const wears = Math.floor(seed * 1000) % 2 === 0;
  return {
    shirt, badge, accent: shirt,
    skin: pick(SKINS, 1), hair: pick(HAIRS, 2), pants: pick(PANTS, 3),
    hairStyle: pick(STYLE_WEIGHTS, 4),
    accessory: wears ? accessory : 'none',
  };
}

const m4 = new THREE.Matrix4();
const root = new THREE.Matrix4();
const local = new THREE.Matrix4();
const euler = new THREE.Euler();
const scaleM = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Crowd {
  readonly group = new THREE.Group();
  readonly torso: THREE.InstancedMesh;
  readonly head: THREE.InstancedMesh;
  private legL: THREE.InstancedMesh;
  private legR: THREE.InstancedMesh;
  private armL: THREE.InstancedMesh;
  private armR: THREE.InstancedMesh;
  /** One mesh per hair style; each person only ever uses theirs. */
  private hairs: Record<HairStyle, THREE.InstancedMesh>;
  private hairOf: HairStyle[] = [];
  private eyes: THREE.InstancedMesh;
  private badge: THREE.InstancedMesh;
  private marker: THREE.InstancedMesh;
  private shadow: THREE.InstancedMesh;
  private scales: number[] = [];

  constructor(readonly capacity: number) {
    const lambert = () => new THREE.MeshLambertMaterial();
    const vc = () => new THREE.MeshLambertMaterial({ vertexColors: true });
    const leg = new THREE.BoxGeometry(0.15, 0.62, 0.17).translate(0, -0.31, 0);
    const arm = new THREE.BoxGeometry(0.11, 0.5, 0.13).translate(0, -0.25, 0);
    this.legL = instanced(leg, lambert(), capacity);
    this.legR = instanced(leg, lambert(), capacity);
    this.armL = instanced(arm, lambert(), capacity);
    this.armR = instanced(arm, lambert(), capacity);
    this.torso = instanced(new THREE.BoxGeometry(0.44, 0.54, 0.26).translate(0, 0.27, 0), lambert(), capacity);
    this.head = instanced(new THREE.BoxGeometry(0.34, 0.32, 0.32).translate(0, 0.16, 0), lambert(), capacity);
    const top = () => box(0.37, 0.1, 0.35, { at: [0, 0.35, -0.01] });
    this.hairs = {
      short: instanced(merge([top(), box(0.37, 0.22, 0.06, { at: [0, 0.22, -0.16] })]), lambert(), capacity),
      long: instanced(
        merge([top(), box(0.38, 0.46, 0.07, { at: [0, 0.12, -0.165] }), box(0.05, 0.3, 0.26, { at: [-0.185, 0.2, -0.03] }), box(0.05, 0.3, 0.26, { at: [0.185, 0.2, -0.03] })]),
        lambert(),
        capacity,
      ),
      bun: instanced(merge([top(), box(0.37, 0.2, 0.06, { at: [0, 0.23, -0.16] }), box(0.16, 0.14, 0.14, { at: [0, 0.44, -0.1] })]), lambert(), capacity),
      curly: instanced(
        merge([
          box(0.41, 0.14, 0.39, { at: [0, 0.36, -0.01] }),
          box(0.12, 0.1, 0.12, { at: [-0.13, 0.44, 0.08] }),
          box(0.12, 0.1, 0.12, { at: [0.12, 0.44, -0.08] }),
          box(0.12, 0.1, 0.12, { at: [0, 0.45, 0.02] }),
          box(0.41, 0.24, 0.08, { at: [0, 0.22, -0.17] }),
        ]),
        lambert(),
        capacity,
      ),
      bald: instanced(box(0.3, 0.02, 0.28, { at: [0, 0.325, -0.02] }), lambert(), capacity),
    };
    this.eyes = instanced(
      merge([box(0.055, 0.07, 0.02, { at: [-0.075, 0.17, 0.165], color: '#1d1d24' }), box(0.055, 0.07, 0.02, { at: [0.075, 0.17, 0.165], color: '#1d1d24' })]),
      vc(),
      capacity,
    );
    this.badge = instanced(new THREE.BoxGeometry(0.11, 0.13, 0.02).translate(0.11, 0.38, 0.135), new THREE.MeshBasicMaterial(), capacity);
    this.marker = instanced(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial(), capacity);
    this.shadow = instanced(
      new THREE.CircleGeometry(0.34, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false }),
      capacity,
    );
    const all = [this.legL, this.legR, this.armL, this.armR, this.torso, this.head, ...Object.values(this.hairs), this.eyes, this.badge, this.marker, this.shadow];
    for (const m of all) {
      for (let i = 0; i < capacity; i++) m.setMatrixAt(i, ZERO);
      this.group.add(m);
    }
    this.torso.userData.pickable = true;
    this.head.userData.pickable = true;
  }

  setLook(i: number, look: Look) {
    const c = new THREE.Color();
    this.legL.setColorAt(i, c.set(look.pants));
    this.legR.setColorAt(i, c);
    this.torso.setColorAt(i, c.set(look.shirt));
    this.armL.setColorAt(i, c.clone().multiplyScalar(0.92));
    this.armR.setColorAt(i, c.clone().multiplyScalar(0.92));
    this.head.setColorAt(i, c.set(look.skin));
    const style = look.hairStyle || 'short';
    this.hairOf[i] = style;
    // Bald heads keep a faint skin-toned crown instead of hair.
    this.hairs[style].setColorAt(i, style === 'bald' ? c.set(look.skin).multiplyScalar(0.94) : c.set(look.hair));
    this.badge.setColorAt(i, c.set(look.badge));
    this.eyes.setColorAt(i, c.set('#ffffff'));
    this.marker.setColorAt(i, c.set('#ffffff'));
    this.scales[i] = look.scale ?? 1;
    for (const m of [this.legL, this.legR, this.torso, this.armL, this.armR, this.head, ...Object.values(this.hairs), this.badge, this.eyes, this.marker]) {
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private set(mesh: THREE.InstancedMesh, i: number, px: number, py: number, pz: number, rx = 0, ry = 0) {
    euler.set(rx, ry, 0, 'YXZ');
    local.makeRotationFromEuler(euler).setPosition(px, py, pz);
    mesh.setMatrixAt(i, m4.multiplyMatrices(root, local));
  }

  update(i: number, b: BodyState, time: number) {
    const hair = this.hairs[this.hairOf[i] || 'short'];
    if (!b.visible) {
      for (const m of [this.legL, this.legR, this.armL, this.armR, this.torso, this.head, hair, this.eyes, this.badge, this.marker, this.shadow]) m.setMatrixAt(i, ZERO);
      return;
    }
    const s = this.scales[i] ?? 1;
    root.makeRotationY(b.heading).setPosition(b.x, 0, b.z);
    if (s !== 1) root.multiply(scaleM.makeScale(s, s, s));

    const sit = b.pose === 'sit';
    const t = time + b.seed * 10;
    let hip = sit ? 0.5 : 0.62;
    let legA = 0, legB = 0, armL = 0, armR = 0, lean = 0, nod = 0, look = 0;

    switch (b.anim) {
      case 'walk': {
        const sw = Math.sin(b.phase);
        legA = sw * 0.62; legB = -sw * 0.62; armL = -sw * 0.55; armR = sw * 0.55;
        hip += Math.abs(Math.cos(b.phase)) * 0.035;
        break;
      }
      case 'type':
        armL = -1.2 + Math.sin(t * 15) * 0.07;
        armR = -1.2 + Math.sin(t * 15 + 1.7) * 0.07;
        lean = 0.1; nod = 0.12 + Math.sin(t * 0.7) * 0.05;
        break;
      case 'talk':
        armR = -0.55 - Math.max(0, Math.sin(t * 3.1)) * 0.6;
        armL = -0.25 - Math.max(0, Math.sin(t * 2.3 + 1)) * 0.3;
        nod = Math.sin(t * 3) * 0.12; look = Math.sin(t * 0.9) * 0.2;
        break;
      case 'read':
        armL = -1.0; armR = -1.0; nod = 0.4; lean = 0.05;
        break;
      case 'drink':
        armR = -0.3 - Math.max(0, Math.sin(t * 1.1)) * 1.9;
        armL = -0.1; look = Math.sin(t * 0.5) * 0.3;
        break;
      case 'wave':
        armR = -2.7 + Math.sin(t * 9) * 0.35;
        break;
      case 'think':
        armR = -1.9; armL = -0.4; nod = -0.15; look = Math.sin(t * 0.6) * 0.35;
        break;
      default:
        if (sit) { armL = -0.85; armR = -0.85; }
        else { armL = Math.sin(t * 0.8) * 0.04; armR = -Math.sin(t * 0.8) * 0.04; }
        look = Math.sin(t * 0.25) * 0.35;
    }
    if (sit) { legA += -Math.PI / 2 + 0.08; legB += -Math.PI / 2 + 0.08; }

    this.set(this.legL, i, -0.1, hip, 0, legA);
    this.set(this.legR, i, 0.1, hip, 0, legB);
    this.set(this.torso, i, 0, hip, 0, lean);
    this.set(this.badge, i, 0, hip, 0, lean);
    const shoulder = hip + 0.5;
    const fwd = Math.sin(lean) * 0.5;
    this.set(this.armL, i, -0.285, shoulder, fwd, armL);
    this.set(this.armR, i, 0.285, shoulder, fwd, armR);
    const headY = hip + 0.57;
    const headZ = Math.sin(lean) * 0.57;
    this.set(this.head, i, 0, headY, headZ, nod, look);
    this.set(hair, i, 0, headY, headZ, nod, look);
    this.set(this.eyes, i, 0, headY, headZ, nod, look);
    this.set(this.shadow, i, 0, 0.025, sit ? 0.12 : 0, 0);

    if (b.marker) {
      this.marker.setColorAt(i, b.marker);
      this.marker.instanceColor!.needsUpdate = true;
      euler.set(0, time * 2.2 + b.seed, 0);
      local.makeRotationFromEuler(euler).setPosition(0, headY + 0.72 + Math.sin(time * 3 + b.seed) * 0.06, headZ);
      this.marker.setMatrixAt(i, m4.multiplyMatrices(root, local));
    } else {
      this.marker.setMatrixAt(i, ZERO);
    }
  }

  commit() {
    for (const m of [this.legL, this.legR, this.armL, this.armR, this.torso, this.head, ...Object.values(this.hairs), this.eyes, this.badge, this.marker, this.shadow]) {
      m.instanceMatrix.needsUpdate = true;
    }
  }

  /** Instance index under the ray, or -1. */
  pick(ray: THREE.Raycaster): number {
    const hits = ray.intersectObjects([this.torso, this.head], false);
    return hits.length ? (hits[0].instanceId ?? -1) : -1;
  }
}
