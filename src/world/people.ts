// Everyone in the office is drawn with instanced meshes: one mesh per body
// part *variant* (each outfit, hair style, prop…), each person using only the
// variants they wear. Colours come from a per-person palette texture looked
// up by the vertex's colour slot, so hundreds of differently dressed,
// animated people cost ~40 draw calls.
import * as THREE from 'three';
import { instanced } from './geo';
import {
  DIM, EYEWEAR, FACIALS, HAIR_STYLES, LOWERS, MOP_PIVOT, Mesher, OUTFITS, PROPS, SLOTS, cupGeo, eyewearGeo, foreArmGeo, hairGeo, headGeo, hipsGeo, mopGeo, newJoints, propGeo, shinGeo,
  solvePose, thighGeo, torsoGeo, upperArmGeo, type Anim, type Look,
} from './human';

export type { Anim, Look } from './human';

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

const PALETTE_W = 16;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function paletteMaterial(palette: THREE.Texture) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPalette = { value: palette };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float slot;\nattribute float person;\nuniform sampler2D uPalette;')
      .replace(
        '#include <color_vertex>',
        '#include <color_vertex>\n\tif ( slot > -0.5 ) vColor.rgb = texelFetch( uPalette, ivec2( int( slot + 0.5 ), int( person + 0.5 ) ), 0 ).rgb;',
      );
  };
  mat.customProgramCacheKey = () => 'office-crowd-palette';
  return mat;
}

/** One body part: a mesh per variant; each person gets `per` instances in theirs. */
class Part {
  readonly meshes = new Map<string, THREE.InstancedMesh>();
  private meshOf: (THREE.InstancedMesh | null)[] = [];
  private slotOf: Int32Array;

  constructor(
    readonly capacity: number,
    readonly per: 1 | 2,
    variants: Record<string, (me: Mesher) => void>,
    mat: THREE.Material,
    group: THREE.Group,
    detail: number,
  ) {
    this.slotOf = new Int32Array(capacity * per).fill(-1);
    for (const [name, build] of Object.entries(variants)) {
      const me = new Mesher(detail);
      build(me);
      if (!me.idx.length) continue;
      const geo = me.geometry();
      geo.setAttribute('person', new THREE.InstancedBufferAttribute(new Float32Array(capacity * per), 1));
      const mesh = instanced(geo, mat, capacity * per);
      mesh.count = 0;
      mesh.name = name;
      this.meshes.set(name, mesh);
      group.add(mesh);
    }
  }

  assign(person: number, variant: string) {
    const old = this.meshOf[person];
    if (old) for (let k = 0; k < this.per; k++) old.setMatrixAt(this.slotOf[person * this.per + k], ZERO);
    const mesh = this.meshes.get(variant) || null;
    this.meshOf[person] = mesh;
    if (!mesh) return;
    const attr = mesh.geometry.getAttribute('person') as THREE.InstancedBufferAttribute;
    for (let k = 0; k < this.per; k++) {
      const inst = mesh.count++;
      this.slotOf[person * this.per + k] = inst;
      attr.setX(inst, person);
      mesh.setMatrixAt(inst, ZERO);
    }
    attr.needsUpdate = true;
  }

  set(person: number, k: number, m: THREE.Matrix4) {
    const mesh = this.meshOf[person];
    if (mesh) mesh.setMatrixAt(this.slotOf[person * this.per + k], m);
  }

  hide(person: number) {
    const mesh = this.meshOf[person];
    if (mesh) for (let k = 0; k < this.per; k++) mesh.setMatrixAt(this.slotOf[person * this.per + k], ZERO);
  }

  commit() {
    for (const m of this.meshes.values()) m.instanceMatrix.needsUpdate = true;
  }
}

const variants = <T extends string>(names: readonly T[], fn: (me: Mesher, v: T) => void) => Object.fromEntries(names.map((n) => [n, (me: Mesher) => fn(me, n)]));

// Scratch matrices for posing.
const mRoot = new THREE.Matrix4();
const mHips = new THREE.Matrix4();
const mTorso = new THREE.Matrix4();
const mHead = new THREE.Matrix4();
const mUA = new THREE.Matrix4();
const mFA = new THREE.Matrix4();
const mHand = new THREE.Matrix4();
const mTh = new THREE.Matrix4();
const mSh = new THREE.Matrix4();
const mTmp = new THREE.Matrix4();
const local = new THREE.Matrix4();
const euler = new THREE.Euler();
const scaleM = new THREE.Matrix4();
const J = newJoints();

function joint(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, order: THREE.EulerOrder) {
  local.makeRotationFromEuler(euler.set(rx, ry, rz, order)).setPosition(x, y, z);
  return out.multiplyMatrices(parent, local);
}

export class Crowd {
  readonly group = new THREE.Group();
  private palette: THREE.DataTexture;
  private parts: Record<'hips' | 'torso' | 'head' | 'hair' | 'eyewear' | 'uArm' | 'fArm' | 'thigh' | 'shin' | 'prop' | 'cup', Part>;
  private looks: Look[] = [];
  private marker: THREE.InstancedMesh;
  private shadow: THREE.InstancedMesh;
  private hit: THREE.InstancedMesh;

  constructor(
    readonly capacity: number,
    /** mesh detail: 1 = full, lower for phones */
    readonly detail = 0.8,
  ) {
    const data = new Float32Array(PALETTE_W * capacity * 4);
    this.palette = new THREE.DataTexture(data, PALETTE_W, capacity, THREE.RGBAFormat, THREE.FloatType);
    this.palette.magFilter = this.palette.minFilter = THREE.NearestFilter;
    this.palette.needsUpdate = true;
    const mat = paletteMaterial(this.palette);
    const g = this.group;
    this.parts = {
      hips: new Part(capacity, 1, { base: hipsGeo }, mat, g, detail),
      torso: new Part(capacity, 1, variants(OUTFITS, torsoGeo), mat, g, detail),
      head: new Part(capacity, 1, variants(FACIALS, (me, f) => headGeo(me, f)), mat, g, detail),
      hair: new Part(capacity, 1, variants(HAIR_STYLES, hairGeo), mat, g, detail),
      eyewear: new Part(capacity, 1, variants(EYEWEAR, eyewearGeo), mat, g, detail),
      uArm: new Part(capacity, 2, { base: upperArmGeo }, mat, g, detail),
      fArm: new Part(capacity, 2, { base: foreArmGeo }, mat, g, detail),
      thigh: new Part(capacity, 2, variants(LOWERS, thighGeo), mat, g, detail),
      shin: new Part(capacity, 2, variants(LOWERS, shinGeo), mat, g, detail),
      prop: new Part(capacity, 1, variants(PROPS, (me, p) => (p === 'mop' ? mopGeo(me) : propGeo(me, p))), mat, g, detail),
      cup: new Part(capacity, 1, { base: cupGeo }, mat, g, detail),
    };
    this.marker = instanced(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial(), capacity);
    this.shadow = instanced(
      new THREE.CircleGeometry(0.34, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false }),
      capacity,
    );
    // Invisible, cheap stand-in used for clicking on people.
    this.hit = instanced(new THREE.BoxGeometry(0.56, 1.8, 0.42).translate(0, 0.9, 0), new THREE.MeshBasicMaterial(), capacity);
    this.hit.visible = false;
    for (const m of [this.marker, this.shadow, this.hit]) {
      for (let i = 0; i < capacity; i++) m.setMatrixAt(i, ZERO);
    }
    g.add(this.marker, this.shadow, this.hit);
  }

  setLook(i: number, look: Look) {
    this.looks[i] = look;
    const data = this.palette.image.data as Float32Array;
    const c = new THREE.Color();
    SLOTS.forEach((s, k) => {
      c.set(look[s]);
      data.set([c.r, c.g, c.b, 1], (i * PALETTE_W + k) * 4);
    });
    this.palette.needsUpdate = true;
    const P = this.parts;
    P.hips.assign(i, 'base');
    P.torso.assign(i, look.outfit);
    P.head.assign(i, look.facial);
    P.hair.assign(i, look.hairStyle);
    P.eyewear.assign(i, look.eyewear);
    P.uArm.assign(i, 'base');
    P.fArm.assign(i, 'base');
    P.thigh.assign(i, look.lower);
    P.shin.assign(i, look.lower);
    P.prop.assign(i, look.prop);
    P.cup.assign(i, 'base');
    this.marker.setColorAt(i, c.set('#ffffff'));
  }

  update(i: number, b: BodyState, time: number) {
    const P = this.parts;
    const look = this.looks[i];
    if (!b.visible || !look) {
      for (const p of Object.values(P)) p.hide(i);
      this.marker.setMatrixAt(i, ZERO);
      this.shadow.setMatrixAt(i, ZERO);
      this.hit.setMatrixAt(i, ZERO);
      return;
    }
    const s = look.scale;
    const sit = b.pose === 'sit';
    mRoot.makeRotationY(b.heading).setPosition(b.x, 0, b.z);
    if (s !== 1) mRoot.multiply(scaleM.makeScale(s, s, s));
    solvePose(J, b.anim, sit, time + b.seed * 10, b.phase, look.prop);

    joint(mHips, mRoot, 0, J.hipY, 0, 0, 0, 0, 'XYZ');
    P.hips.set(i, 0, mHips);
    joint(mTorso, mHips, 0, 0, 0, J.lean, J.twist, 0, 'YXZ');
    P.torso.set(i, 0, mTorso);
    joint(mHead, mTorso, 0, DIM.neckY, 0, J.nod, J.turn, 0, 'YXZ');
    P.head.set(i, 0, mHead);
    P.hair.set(i, 0, mHead);
    P.eyewear.set(i, 0, mHead);
    for (let k = 0; k < 2; k++) {
      const sx = k === 0 ? 1 : -1;
      joint(mUA, mTorso, sx * DIM.shoulderX, DIM.shoulderY, 0, J.armX[k], 0, J.armZ[k], 'ZXY');
      P.uArm.set(i, k, mUA);
      joint(mFA, mUA, 0, -DIM.upperArm, 0, J.elbow[k], 0, 0, 'XYZ');
      P.fArm.set(i, k, mFA);
      if (k === 1) joint(mHand, mFA, 0, -DIM.foreArm, 0, 0, 0, 0, 'XYZ');
      joint(mTh, mHips, sx * DIM.hipX, 0, 0, J.thigh[k], 0, sit ? sx * 0.06 : 0, 'ZXY');
      P.thigh.set(i, k, mTh);
      joint(mSh, mTh, 0, -DIM.thigh, 0, J.knee[k], 0, 0, 'XYZ');
      P.shin.set(i, k, mSh);
    }
    if (look.prop === 'mop') {
      joint(mTmp, mRoot, MOP_PIVOT[0], 0, MOP_PIVOT[1], 0, J.sway, 0, 'XYZ');
      P.prop.set(i, 0, mTmp.multiply(local.makeTranslation(-MOP_PIVOT[0], 0, -MOP_PIVOT[1])));
    }
    else P.prop.set(i, 0, J.prop ? mHand : ZERO);
    P.cup.set(i, 0, b.anim === 'drink' ? mHand : ZERO);

    local.makeScale(1, 1, 1).setPosition(0, 0.025, sit ? 0.12 : 0);
    this.shadow.setMatrixAt(i, mTmp.multiplyMatrices(mRoot, local));
    local.makeScale(1, sit ? 0.78 : 1, 1);
    this.hit.setMatrixAt(i, mTmp.multiplyMatrices(mRoot, local));
    if (b.marker) {
      this.marker.setColorAt(i, b.marker);
      this.marker.instanceColor!.needsUpdate = true;
      const e = mHead.elements;
      local.makeRotationY(time * 2.2 + b.seed).setPosition(e[12], e[13] + 0.52 * s + Math.sin(time * 3 + b.seed) * 0.05, e[14]);
      this.marker.setMatrixAt(i, local);
    } else {
      this.marker.setMatrixAt(i, ZERO);
    }
  }

  commit() {
    for (const p of Object.values(this.parts)) p.commit();
    this.marker.instanceMatrix.needsUpdate = true;
    this.shadow.instanceMatrix.needsUpdate = true;
    this.hit.instanceMatrix.needsUpdate = true;
  }

  /** Person index under the ray, or -1. */
  pick(ray: THREE.Raycaster): number {
    const hits = ray.intersectObject(this.hit, false);
    return hits.length ? (hits[0].instanceId ?? -1) : -1;
  }
}
