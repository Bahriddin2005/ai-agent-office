// Full-screen Graphify-style knowledge graph of the whole library: every
// agent, skill, command, guide, department and source, with EXTRACTED and
// INFERRED edges. Shares the office renderer; main.ts swaps scenes.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { OfficeData, GraphNode } from '../data';
import { t } from '../i18n';
import { dotTexture } from '../world/office';

const TYPE_SIZE: Record<string, number> = { source: 9, dept: 8, agent: 3.2, skill: 2.1, command: 2.1, guide: 2.6 };

export class GraphView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private nodes: THREE.InstancedMesh;
  private lines: THREE.LineSegments;
  private baseColors: Float32Array;
  private lineBase: Float32Array;
  private selected = -1;
  private hovered = -1;
  private raycaster = new THREE.Raycaster();
  private tooltip: HTMLDivElement;
  private tween: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; k: number } | null = null;
  showInferred = true;
  hiddenTypes = new Set<string>();
  onSelect: (id: string) => void = () => {};

  constructor(
    readonly data: OfficeData,
    readonly dom: HTMLElement,
  ) {
    this.scene.background = new THREE.Color('#070b16');
    this.scene.fog = new THREE.FogExp2('#070b16', 0.0011);
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 4000);
    this.camera.position.set(0, 140, 980);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.enabled = false;

    const { nodes, edges } = data.graph;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.nodes = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), nodes.length);
    this.baseColors = new Float32Array(nodes.length * 3);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    nodes.forEach((n, i) => {
      const s = (TYPE_SIZE[n.t] || 2) * (1 + Math.min(1.5, Math.log10(1 + n.deg) * 0.45));
      m.makeScale(s, s, s).setPosition(...n.p);
      this.nodes.setMatrixAt(i, m);
      c.set(this.colorOf(n));
      c.toArray(this.baseColors, i * 3);
      this.nodes.setColorAt(i, c);
    });
    this.nodes.computeBoundingSphere();
    this.scene.add(this.nodes);

    const pos = new Float32Array(edges.length * 6);
    this.lineBase = new Float32Array(edges.length * 6);
    edges.forEach(([a, b, rel, ex], i) => {
      pos.set([...nodes[a].p, ...nodes[b].p], i * 6);
      const k = rel === 'works_in' || rel === 'from_source' ? 0.12 : ex ? 0.55 : 0.3;
      this.lineBase.set([...this.baseColors.subarray(a * 3, a * 3 + 3).map((v) => v * k), ...this.baseColors.subarray(b * 3, b * 3 + 3).map((v) => v * k)], i * 6);
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(this.lineBase.slice(), 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.lines);

    // Big soft halos for departments and sources.
    for (const n of nodes) {
      if (n.t !== 'dept' && n.t !== 'source') continue;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: this.colorOf(n), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(...n.p);
      s.scale.setScalar(70);
      this.scene.add(s);
    }

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'graph-tip';
    this.tooltip.hidden = true;
    document.body.append(this.tooltip);
  }

  colorOf(n: GraphNode) {
    if (n.t === 'source') return this.data.source.get(n.s!)?.color || '#ffffff';
    return this.data.dept.get(n.d!)?.color || '#ffffff';
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setActive(on: boolean) {
    this.controls.enabled = on;
    if (!on) this.tooltip.hidden = true;
  }

  update(dt: number) {
    if (this.tween) {
      const tw = this.tween;
      tw.k = Math.min(1, tw.k + dt / 1.1);
      const e = tw.k < 0.5 ? 4 * tw.k ** 3 : 1 - (-2 * tw.k + 2) ** 3 / 2;
      this.camera.position.lerpVectors(tw.from, tw.to, e);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, e);
      if (tw.k >= 1) this.tween = null;
    }
    this.controls.update(dt);
  }

  private visible(i: number) {
    return !this.hiddenTypes.has(this.data.graph.nodes[i].t);
  }

  /** Re-colour nodes/edges for the current selection, filters and search. */
  refresh(search = '') {
    const { nodes, edges } = this.data.graph;
    const q = search.trim().toLowerCase();
    const focus = new Set<number>();
    if (this.selected >= 0) {
      focus.add(this.selected);
      for (const [a, b] of edges) {
        if (a === this.selected) focus.add(b);
        if (b === this.selected) focus.add(a);
      }
    }
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    nodes.forEach((n, i) => {
      let k = 1;
      if (!this.visible(i)) k = 0;
      else if (focus.size) k = focus.has(i) ? (i === this.selected ? 2.2 : 1.4) : 0.08;
      else if (q) k = n.n.toLowerCase().includes(q) ? 2 : 0.1;
      c.fromArray(this.baseColors, i * 3).multiplyScalar(k);
      this.nodes.setColorAt(i, c);
      const s = k === 0 ? 0 : (TYPE_SIZE[n.t] || 2) * (1 + Math.min(1.5, Math.log10(1 + n.deg) * 0.45)) * (i === this.selected ? 1.8 : 1);
      m.makeScale(s, s, s).setPosition(...n.p);
      this.nodes.setMatrixAt(i, m);
    });
    this.nodes.instanceColor!.needsUpdate = true;
    this.nodes.instanceMatrix.needsUpdate = true;
    const col = this.lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    edges.forEach(([a, b, , ex], i) => {
      let k = 1;
      if (!this.visible(a) || !this.visible(b) || (!ex && !this.showInferred)) k = 0;
      else if (focus.size) k = a === this.selected || b === this.selected ? 3 : 0.05;
      else if (q) k = 0.25;
      for (let j = 0; j < 6; j++) arr[i * 6 + j] = this.lineBase[i * 6 + j] * k;
    });
    col.needsUpdate = true;
  }

  select(id: string | null, fly = true, search = '') {
    this.selected = id ? (this.data.nodeIndex.get(id) ?? -1) : -1;
    this.refresh(search);
    if (fly && this.selected >= 0) {
      const p = new THREE.Vector3(...this.data.graph.nodes[this.selected].p);
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.tween = { from: this.camera.position.clone(), to: p.clone().add(dir.multiplyScalar(170)), fromT: this.controls.target.clone(), toT: p, k: 0 };
      this.controls.autoRotate = false;
    }
  }

  overview() {
    this.tween = { from: this.camera.position.clone(), to: new THREE.Vector3(0, 140, 980), fromT: this.controls.target.clone(), toT: new THREE.Vector3(), k: 0 };
    this.controls.autoRotate = true;
  }

  private hit(ev: PointerEvent): number {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.nodes);
    for (const h of hits) if (h.instanceId !== undefined && this.visible(h.instanceId)) return h.instanceId;
    return -1;
  }

  pointerMove(ev: PointerEvent) {
    const i = this.hit(ev);
    this.hovered = i;
    this.dom.style.cursor = i >= 0 ? 'pointer' : '';
    if (i < 0) {
      this.tooltip.hidden = true;
      return;
    }
    const n = this.data.graph.nodes[i];
    const label = n.t === 'dept' ? t().dept : n.t === 'source' ? t().source : n.t;
    this.tooltip.hidden = false;
    this.tooltip.textContent = '';
    const b = document.createElement('b');
    b.textContent = n.n;
    const s = document.createElement('span');
    s.textContent = ` · ${label} · ${n.deg} ${t().linked.toLowerCase()}`;
    this.tooltip.append(b, s);
    this.tooltip.style.left = `${ev.clientX + 14}px`;
    this.tooltip.style.top = `${ev.clientY + 12}px`;
  }

  click(ev: PointerEvent) {
    const i = this.hit(ev);
    if (i < 0) return;
    const id = this.data.graph.nodes[i].id;
    this.select(id);
    this.onSelect(id);
  }

  godNodes(limit = 12) {
    return this.data.graph.nodes
      .filter((n) => n.t !== 'dept' && n.t !== 'source')
      .sort((a, b) => b.deg - a.deg)
      .slice(0, limit);
  }

  get hoveredIndex() {
    return this.hovered;
  }
}
