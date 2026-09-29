// Transient effects: delegation arcs between desks, glows on used books and
// the selection ring under the picked person.
import * as THREE from 'three';
import { dotTexture } from './office';

interface Arc {
  line: THREE.Line;
  dot: THREE.Sprite;
  curve: THREE.QuadraticBezierCurve3;
  life: number;
  total: number;
}

interface Glow {
  sprite: THREE.Sprite;
  life: number;
  total: number;
  size: number;
}

const SEGMENTS = 40;

export class Fx {
  readonly group = new THREE.Group();
  private arcs: Arc[] = [];
  private glows: Glow[] = [];
  readonly ring: THREE.Mesh;
  readonly hoverRing: THREE.Mesh;
  /** dashed line on the ground showing where someone is walking */
  readonly route: THREE.Line;
  private routeMarker: THREE.Mesh;

  constructor() {
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      line.frustumCulled = false;
      line.visible = false;
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      dot.scale.setScalar(0.9);
      dot.visible = false;
      this.group.add(line, dot);
      this.arcs.push({ line, dot, curve: new THREE.QuadraticBezierCurve3(), life: 0, total: 1 });
    }
    for (let i = 0; i < 16; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.visible = false;
      this.group.add(sprite);
      this.glows.push({ sprite, life: 0, total: 1, size: 1 });
    }
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.56, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd166').multiplyScalar(1.8), transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.ring.visible = false;
    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.48, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.hoverRing.visible = false;
    this.group.add(this.ring, this.hoverRing);
    this.route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: new THREE.Color('#ffd166').multiplyScalar(1.6), dashSize: 0.5, gapSize: 0.35, transparent: true, depthWrite: false }));
    this.route.frustumCulled = false;
    this.route.visible = false;
    this.routeMarker = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 16).rotateX(Math.PI).translate(0, 0.9, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd166').multiplyScalar(1.4) }));
    this.routeMarker.visible = false;
    this.group.add(this.route, this.routeMarker);
  }

  /** Show a walking route: current position followed by the remaining waypoints. */
  setRoute(points: [number, number][] | null, time = 0) {
    if (!points || points.length < 2) {
      this.route.visible = false;
      this.routeMarker.visible = false;
      return;
    }
    const pos = new Float32Array(points.length * 3);
    points.forEach(([x, z], i) => pos.set([x, 0.08, z], i * 3));
    this.route.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.route.geometry = g;
    this.route.computeLineDistances();
    this.route.visible = true;
    const [lx, lz] = points[points.length - 1];
    this.routeMarker.position.set(lx, Math.sin(time * 4) * 0.12, lz);
    this.routeMarker.visible = true;
  }

  arc(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, seconds = 3) {
    const a = this.arcs.reduce((m, x) => (x.life < m.life ? x : m));
    const mid = from.clone().lerp(to, 0.5);
    mid.y += Math.min(14, 2.5 + from.distanceTo(to) * 0.3);
    a.curve.v0.copy(from);
    a.curve.v1.copy(mid);
    a.curve.v2.copy(to);
    const pos = a.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    for (let i = 0; i <= SEGMENTS; i++) {
      a.curve.getPoint(i / SEGMENTS, p);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
    const c = new THREE.Color(color).multiplyScalar(1.6);
    (a.line.material as THREE.LineBasicMaterial).color.copy(c);
    (a.dot.material as THREE.SpriteMaterial).color.copy(c);
    a.life = a.total = seconds;
    a.line.visible = a.dot.visible = true;
  }

  glow(at: THREE.Vector3, color: THREE.ColorRepresentation, seconds = 4, size = 1.6) {
    const g = this.glows.reduce((m, x) => (x.life < m.life ? x : m));
    g.sprite.position.copy(at);
    (g.sprite.material as THREE.SpriteMaterial).color.set(color).multiplyScalar(2);
    g.life = g.total = seconds;
    g.size = size;
    g.sprite.visible = true;
  }

  update(dt: number, time: number) {
    for (const a of this.arcs) {
      if (a.life <= 0) continue;
      a.life -= dt;
      const k = 1 - a.life / a.total;
      const mat = a.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.min(1, a.life * 1.5) * 0.9;
      const tt = Math.min(1, k / 0.65);
      a.curve.getPoint(tt, a.dot.position);
      (a.dot.material as THREE.SpriteMaterial).opacity = tt < 1 ? 1 : Math.max(0, a.life);
      if (a.life <= 0) a.line.visible = a.dot.visible = false;
    }
    for (const g of this.glows) {
      if (g.life <= 0) continue;
      g.life -= dt;
      const pulse = 1 + Math.sin(time * 8) * 0.15;
      g.sprite.scale.setScalar(g.size * pulse);
      (g.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, g.life);
      if (g.life <= 0) g.sprite.visible = false;
    }
    this.ring.rotation.y += dt;
    const s = 1 + Math.sin(time * 4) * 0.06;
    this.ring.scale.set(s, 1, s);
  }
}
