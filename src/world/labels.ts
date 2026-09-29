// Speech bubbles and name tags drawn as DOM overlays (CSS2DRenderer). Only a
// capped number are shown at once, closest-to-camera first.
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export interface LabelRequest {
  key: number;
  x: number;
  y: number;
  z: number;
  text: string;
  kind: 'bubble' | 'name' | 'live' | 'selected';
  color?: string;
  sub?: string;
}

interface Slot {
  obj: CSS2DObject;
  el: HTMLDivElement;
  text: HTMLSpanElement;
  sub: HTMLSpanElement;
  key: string;
}

export class Labels {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];
  private cam = new THREE.Vector3();

  constructor(max = 22) {
    for (let i = 0; i < max; i++) {
      const el = document.createElement('div');
      el.className = 'label';
      const text = document.createElement('span');
      text.className = 'label-text';
      const sub = document.createElement('span');
      sub.className = 'label-sub';
      el.append(text, sub);
      const obj = new CSS2DObject(el);
      obj.center.set(0.5, 1);
      obj.visible = false;
      this.group.add(obj);
      this.slots.push({ obj, el, text, sub, key: '' });
    }
  }

  update(requests: LabelRequest[], camera: THREE.Camera) {
    camera.getWorldPosition(this.cam);
    const rank = (r: LabelRequest) => (r.kind === 'selected' ? -1e9 : r.kind === 'live' ? -1e6 : 0) + (r.x - this.cam.x) ** 2 + (r.y - this.cam.y) ** 2 + (r.z - this.cam.z) ** 2;
    const shown = requests
      .map((r) => ({ r, d: rank(r) }))
      .filter(({ r, d }) => r.kind === 'selected' || r.kind === 'live' || d < 75 ** 2)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.slots.length);
    this.slots.forEach((s, i) => {
      const item = shown[i];
      if (!item) {
        s.obj.visible = false;
        return;
      }
      const { r } = item;
      s.obj.visible = true;
      s.obj.position.set(r.x, r.y, r.z);
      const key = `${r.kind}|${r.text}|${r.sub || ''}|${r.color || ''}`;
      if (s.key !== key) {
        s.key = key;
        s.el.className = `label label-${r.kind}`;
        s.text.textContent = r.text;
        s.sub.textContent = r.sub || '';
        s.sub.style.display = r.sub ? '' : 'none';
        s.el.style.setProperty('--accent', r.color || '#d97757');
      }
    });
  }
}
