// A detailed, single character for close-ups (the inspector portrait): the
// same colours, hair style and accessory as the person in the office crowd,
// with a full face (eyes, brows, nose, mouth, ears) and a jointed body.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Look } from './people';

const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02, ...extra });
const rbox = (w: number, h: number, d: number, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function emojiTexture(emoji: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Avatar {
  group: THREE.Group;
  update(time: number, mode: 'idle' | 'wave' | 'work' | 'talk'): void;
  dispose(): void;
}

export function buildAvatar(look: Look, emoji = ''): Avatar {
  const g = new THREE.Group();
  const skin = std(look.skin);
  const skinDark = std(new THREE.Color(look.skin as THREE.ColorRepresentation).multiplyScalar(0.86));
  const shirt = std(look.shirt);
  const pants = std(look.pants);
  const hairMat = std(look.hair, { roughness: 0.8 });
  const accent = std(look.accent || look.shirt);
  const dark = std('#1d1f27', { roughness: 0.4 });
  const white = std('#ffffff', { roughness: 0.3 });

  // Legs and shoes (pivot at the hip).
  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0.12 * sx, 0.72, 0);
    leg.add(mesh(rbox(0.19, 0.64, 0.21, 0.06), pants, 0, -0.32, 0));
    leg.add(mesh(rbox(0.21, 0.11, 0.31, 0.05), dark, 0, -0.66, 0.05));
    g.add(leg);
    legs.push(leg);
  }

  // Torso with collar, belt, badge and department emblem.
  const torso = new THREE.Group();
  torso.position.y = 0.72;
  torso.add(mesh(rbox(0.54, 0.62, 0.32, 0.09), shirt, 0, 0.31, 0));
  torso.add(mesh(rbox(0.56, 0.07, 0.34, 0.03), std(new THREE.Color(look.pants as THREE.ColorRepresentation).multiplyScalar(0.7)), 0, 0.03, 0));
  const collarL = mesh(new THREE.BoxGeometry(0.13, 0.05, 0.02), white, -0.07, 0.59, 0.165);
  collarL.rotation.z = -0.45;
  const collarR = mesh(new THREE.BoxGeometry(0.13, 0.05, 0.02), white, 0.07, 0.59, 0.165);
  collarR.rotation.z = 0.45;
  torso.add(collarL, collarR);
  torso.add(mesh(rbox(0.1, 0.12, 0.02, 0.01), std(look.badge, { emissive: new THREE.Color(look.badge as THREE.ColorRepresentation), emissiveIntensity: 0.25 }), -0.15, 0.44, 0.165));
  if (emoji) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), new THREE.MeshBasicMaterial({ map: emojiTexture(emoji), transparent: true }));
    plate.position.set(0.13, 0.42, 0.163);
    torso.add(plate);
  }
  if (look.accessory === 'tie' || look.accessory === 'sunglasses') {
    torso.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), accent, 0, 0.57, 0.17));
    const tie = mesh(new THREE.ConeGeometry(0.055, 0.34, 4), accent, 0, 0.37, 0.17);
    tie.rotation.x = Math.PI;
    tie.scale.z = 0.3;
    torso.add(tie);
  }
  g.add(torso);

  // Arms: upper arm, forearm, hand.
  const arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.34 * sx, 1.28, 0);
    shoulder.add(mesh(rbox(0.15, 0.34, 0.17, 0.06), shirt, 0, -0.16, 0));
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    elbow.add(mesh(rbox(0.13, 0.28, 0.15, 0.05), shirt, 0, -0.13, 0));
    elbow.add(mesh(new THREE.SphereGeometry(0.075, 16, 12), skin, 0, -0.3, 0));
    shoulder.add(elbow);
    g.add(shoulder);
    arms.push({ shoulder, elbow });
  }

  // Neck and head.
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.1, 16), skin, 0, 1.38, 0));
  const head = new THREE.Group();
  head.position.y = 1.42;
  g.add(head);
  head.add(mesh(rbox(0.44, 0.44, 0.42, 0.11), skin, 0, 0.22, 0));
  for (const sx of [-1, 1]) head.add(mesh(rbox(0.05, 0.1, 0.08, 0.02), skinDark, 0.225 * sx, 0.2, 0));

  // Face (front of the head is +z = 0.21).
  const face = new THREE.Group();
  face.position.set(0, 0.22, 0.21);
  head.add(face);
  const eyes: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0.095 * sx, 0.03, 0);
    eye.add(mesh(rbox(0.09, 0.08, 0.02, 0.02), white, 0, 0, 0.002));
    eye.add(mesh(new THREE.SphereGeometry(0.028, 16, 12), std('#2b2320', { roughness: 0.2 }), 0.004 * sx, -0.004, 0.014));
    eye.add(mesh(new THREE.SphereGeometry(0.009, 8, 6), white, 0.012 * sx + 0.004, 0.008, 0.035));
    face.add(eye);
    eyes.push(eye);
    const brow = mesh(rbox(0.1, 0.022, 0.02, 0.008), hairMat, 0.095 * sx, 0.1, 0.004);
    brow.rotation.z = -0.08 * sx;
    face.add(brow);
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), new THREE.MeshBasicMaterial({ color: '#ff8a8a', transparent: true, opacity: 0.32, depthWrite: false }));
    cheek.position.set(0.14 * sx, -0.06, 0.003);
    face.add(cheek);
  }
  face.add(mesh(rbox(0.055, 0.075, 0.045, 0.02), skinDark, 0, -0.035, 0.012));
  const mouth = mesh(new THREE.TorusGeometry(0.048, 0.011, 8, 20, Math.PI), std('#8c2f39'), 0, -0.095, 0.004);
  mouth.rotation.z = Math.PI;
  face.add(mouth);

  // Hair.
  const H = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => head.add(mesh(geo, hairMat, x, y, z));
  switch (look.hairStyle || 'short') {
    case 'short':
      H(rbox(0.47, 0.13, 0.45, 0.06), 0, 0.46, -0.01);
      H(rbox(0.47, 0.26, 0.08, 0.04), 0, 0.33, -0.2);
      H(rbox(0.46, 0.07, 0.08, 0.03), 0, 0.41, 0.19);
      break;
    case 'long':
      H(rbox(0.48, 0.14, 0.46, 0.06), 0, 0.46, -0.01);
      H(rbox(0.48, 0.62, 0.09, 0.04), 0, 0.17, -0.21);
      for (const sx of [-1, 1]) H(rbox(0.06, 0.44, 0.3, 0.03), 0.235 * sx, 0.24, -0.05);
      H(rbox(0.46, 0.08, 0.08, 0.03), 0, 0.41, 0.19);
      break;
    case 'bun':
      H(rbox(0.47, 0.13, 0.45, 0.06), 0, 0.46, -0.01);
      H(rbox(0.47, 0.26, 0.08, 0.04), 0, 0.33, -0.2);
      H(new THREE.SphereGeometry(0.11, 18, 14), 0, 0.57, -0.13);
      break;
    case 'curly':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        H(new THREE.SphereGeometry(0.085, 12, 10), Math.cos(a) * 0.19, 0.44 + (i % 3) * 0.025, Math.sin(a) * 0.18 - 0.02);
      }
      H(new THREE.SphereGeometry(0.16, 16, 12), 0, 0.5, -0.02);
      break;
    case 'bald':
      break;
  }

  // Accessories.
  switch (look.accessory) {
    case 'headphones': {
      const band = mesh(new THREE.TorusGeometry(0.25, 0.022, 10, 32, Math.PI), accent, 0, 0.24, 0);
      head.add(band);
      for (const sx of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 20), dark, 0.25 * sx, 0.2, 0);
        cup.rotation.z = Math.PI / 2;
        head.add(cup);
      }
      break;
    }
    case 'glasses':
    case 'sunglasses': {
      const frame = std(look.accessory === 'sunglasses' ? '#111' : '#2d2d33', { roughness: 0.3 });
      for (const sx of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.052, 0.009, 8, 24), frame, 0.095 * sx, 0.03, 0.03);
        face.add(ring);
        if (look.accessory === 'sunglasses') face.add(mesh(new THREE.CircleGeometry(0.05, 20), std('#0b0b10', { roughness: 0.1, metalness: 0.4 }), 0.095 * sx, 0.03, 0.031));
      }
      face.add(mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), frame, 0, 0.035, 0.03));
      break;
    }
    case 'beret': {
      const b = mesh(new THREE.SphereGeometry(0.25, 20, 12), accent, 0.04, 0.5, 0);
      b.scale.set(1, 0.32, 1);
      b.rotation.z = -0.18;
      head.add(b);
      break;
    }
    case 'cap': {
      head.add(mesh(new THREE.SphereGeometry(0.235, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), accent, 0, 0.42, 0));
      head.add(mesh(rbox(0.3, 0.025, 0.18, 0.01), accent, 0, 0.43, 0.26));
      break;
    }
    case 'visor': {
      const v = mesh(rbox(0.47, 0.08, 0.05, 0.02), std('#43e8ff', { emissive: new THREE.Color('#1ad1ff'), emissiveIntensity: 0.9, transparent: true, opacity: 0.75 }), 0, 0.03, 0.03);
      face.add(v);
      break;
    }
    case 'mortarboard': {
      head.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 20), dark, 0, 0.47, 0));
      const board = mesh(new THREE.BoxGeometry(0.52, 0.03, 0.52), dark, 0, 0.53, 0);
      board.rotation.y = Math.PI / 4;
      head.add(board);
      head.add(mesh(new THREE.BoxGeometry(0.015, 0.2, 0.015), std('#ffd166'), 0.2, 0.44, 0.1));
      break;
    }
  }

  // Blink/animation state.
  let nextBlink = 1.5;
  let blinkUntil = 0;

  return {
    group: g,
    update(t: number, mode) {
      const breathe = Math.sin(t * 2) * 0.01;
      torso.scale.y = 1 + breathe;
      head.position.y = 1.42 + breathe * 0.6;
      head.rotation.y = Math.sin(t * 0.6) * 0.18;
      head.rotation.x = Math.sin(t * 0.43) * 0.04;
      if (t > nextBlink) {
        blinkUntil = t + 0.12;
        nextBlink = t + 2.2 + Math.random() * 2.8;
      }
      const lid = t < blinkUntil ? 0.12 : 1;
      for (const e of eyes) e.scale.y = lid;
      mouth.scale.y = mode === 'talk' ? 0.6 + Math.abs(Math.sin(t * 12)) * 0.9 : 1;
      const [L, R] = arms;
      for (const leg of legs) leg.rotation.x = 0;
      if (mode === 'wave') {
        R.shoulder.rotation.z = 2.5 + Math.sin(t * 9) * 0.25;
        R.elbow.rotation.z = 0.3;
        L.shoulder.rotation.set(0, 0, -0.12);
        L.elbow.rotation.set(0, 0, 0);
      } else if (mode === 'work') {
        for (const a of arms) {
          a.shoulder.rotation.set(-0.9 + Math.sin(t * 14 + a.shoulder.position.x * 10) * 0.05, 0, 0);
          a.elbow.rotation.set(-0.6, 0, 0);
        }
      } else if (mode === 'talk') {
        R.shoulder.rotation.set(-0.5 - Math.max(0, Math.sin(t * 3)) * 0.5, 0, 0.1);
        R.elbow.rotation.set(-0.8, 0, 0);
        L.shoulder.rotation.set(0, 0, -0.1);
        L.elbow.rotation.set(0, 0, 0);
      } else {
        L.shoulder.rotation.set(Math.sin(t * 1.1) * 0.05, 0, -0.1);
        R.shoulder.rotation.set(-Math.sin(t * 1.1) * 0.05, 0, 0.1);
        L.elbow.rotation.set(-0.15, 0, 0);
        R.elbow.rotation.set(-0.15, 0, 0);
      }
    },
    dispose() {
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.Material & { map?: THREE.Texture };
          m.map?.dispose();
          m.dispose();
        }
      });
    },
  };
}
