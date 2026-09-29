// The inspector close-up: the very same person as in the office crowd (same
// body, clothes, hair and colours) built in high detail, with a jointed
// skeleton, blinking eyes and a talking mouth.
import * as THREE from 'three';
import {
  DIM, MOP_PIVOT, Mesher, eyesGeo, eyewearGeo, foreArmGeo, hairGeo, headGeo, hipsGeo, lipsGeo, mopGeo, newJoints, paintGeometry, propGeo, shinGeo, solvePose, thighGeo,
  torsoGeo, upperArmGeo, type Anim, type Look,
} from './human';

export interface Avatar {
  group: THREE.Group;
  update(time: number, mode: 'idle' | 'wave' | 'work' | 'talk'): void;
  dispose(): void;
}

export function buildAvatar(look: Look): Avatar {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.64, metalness: 0.02 });
  const mk = (build: (me: Mesher) => void) => {
    const me = new Mesher(2.4);
    build(me);
    const mesh = new THREE.Mesh(paintGeometry(me.geometry(), look), mat);
    mesh.castShadow = true;
    return mesh;
  };
  const node = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  root.scale.setScalar(look.scale);
  const hips = node(root, 0, DIM.hip, 0);
  hips.add(mk(hipsGeo));
  const torso = node(hips);
  torso.add(mk((me) => torsoGeo(me, look.outfit)));
  const head = node(torso, 0, DIM.neckY, 0);
  head.add(mk((me) => headGeo(me, look.facial, { eyes: false, lips: false })));
  head.add(mk((me) => hairGeo(me, look.hairStyle)));
  if (look.eyewear !== 'none') head.add(mk((me) => eyewearGeo(me, look.eyewear)));
  const eyes = mk(eyesGeo);
  const lips = mk((me) => lipsGeo(me, look.facial === 'beard'));
  head.add(eyes, lips);
  // Scale eyelids/mouth around their own centres.
  for (const [m, y] of [[eyes, 0.162], [lips, 0.088]] as const) {
    m.geometry.translate(0, -y, 0);
    m.position.y = y;
  }

  const arms: { ua: THREE.Group; fa: THREE.Group; hand: THREE.Group }[] = [];
  const legs: { th: THREE.Group; sh: THREE.Group }[] = [];
  for (const sx of [1, -1]) {
    const ua = node(torso, sx * DIM.shoulderX, DIM.shoulderY, 0);
    ua.rotation.order = 'ZXY';
    ua.add(mk(upperArmGeo));
    const fa = node(ua, 0, -DIM.upperArm, 0);
    fa.add(mk(foreArmGeo));
    const hand = node(fa, 0, -DIM.foreArm, 0);
    arms.push({ ua, fa, hand });
    const th = node(hips, sx * DIM.hipX, 0, 0);
    th.rotation.order = 'ZXY';
    th.add(mk((me) => thighGeo(me, look.lower)));
    const sh = node(th, 0, -DIM.thigh, 0);
    sh.add(mk((me) => shinGeo(me, look.lower)));
    legs.push({ th, sh });
  }
  torso.rotation.order = head.rotation.order = 'YXZ';
  const right = arms[1].hand;
  let prop: THREE.Object3D | null = null;
  if (look.prop === 'mop') {
    const mop = mk(mopGeo);
    mop.position.set(-MOP_PIVOT[0], 0, -MOP_PIVOT[1]);
    prop = node(root, MOP_PIVOT[0], 0, MOP_PIVOT[1]);
    prop.add(mop);
  }
  else if (look.prop !== 'none') right.add((prop = mk((me) => propGeo(me, look.prop))));

  const group = new THREE.Group();
  group.add(root);
  const J = newJoints();
  let nextBlink = 1.5;
  let blinkUntil = 0;
  const work: Anim = look.prop === 'mop' ? 'mop' : look.prop === 'tablet' || look.prop === 'folder' || look.prop === 'phone' ? 'read' : 'think';

  return {
    group,
    update(t, mode) {
      const anim: Anim = mode === 'wave' ? 'wave' : mode === 'talk' ? 'talk' : mode === 'work' ? work : look.prop === 'mop' ? 'mop' : 'idle';
      solvePose(J, anim, false, t, 0, look.prop);
      hips.position.y = J.hipY + Math.sin(t * 2) * 0.003;
      torso.rotation.set(J.lean, J.twist, 0);
      head.rotation.set(J.nod, J.turn * 0.6, 0);
      arms.forEach((a, k) => {
        a.ua.rotation.set(J.armX[k], 0, J.armZ[k]);
        a.fa.rotation.set(J.elbow[k], 0, 0);
      });
      legs.forEach((l, k) => {
        l.th.rotation.set(J.thigh[k], 0, 0);
        l.sh.rotation.set(J.knee[k], 0, 0);
      });
      if (prop) {
        if (look.prop === 'mop') prop.rotation.y = J.sway;
        else prop.visible = J.prop;
      }
      if (t > nextBlink) {
        blinkUntil = t + 0.12;
        nextBlink = t + 2.2 + Math.random() * 2.8;
      }
      eyes.scale.y = t < blinkUntil ? 0.15 : 1;
      lips.scale.y = anim === 'talk' ? 0.7 + Math.abs(Math.sin(t * 12)) * 1.3 : 1;
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      mat.dispose();
    },
  };
}
