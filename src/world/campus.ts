// The campus around the offices: six department buildings in one
// architectural family (white stone, glass and a colour accent each), with a
// style of their own — Boshqaruv's stone piers and flag, the AI tower's LED
// bands, dish and hologram, the Savdo billboard, the Media LED screen, the
// Moliya colonnade and the Ofis xizmatlari roof garden and café. Upper
// storeys and roofs fade away when you zoom in so you can watch the people
// inside. Also: lawns, boulevard, fountain, gardens, lamps and the gate.
import * as THREE from 'three';
import type { OfficeData } from '../data';
import { FONT, box, cyl, instanced, merge, part, place, textSprite } from './geo';
import { buildingOf, type BuildingDef, type BuildingStyle, type Layout, type Zone } from './layout';

/** ground-floor wall height, facade band, upper storey height, wall thickness */
const GF = 3.4;
const BAND = 1.0;
const FH = 3.1;
const T = 0.25;
/** top of the ground-floor block */
const Y1 = GF + BAND - 0.3;

const WALL: Record<BuildingStyle, string> = {
  executive: '#e8e1d2', finance: '#eee6d6', tech: '#e3e8ee', sales: '#f2ede6', media: '#ece7f1', services: '#f0e9dc',
};
const FRAME = '#394150';
const WOOD = '#b58a58';
const STONE = '#d9d3c7';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const isLight = (hex: string) => {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.55;
};

interface Building {
  zone: Zone;
  def: BuildingDef;
  shell: THREE.Group;
  mats: THREE.Material[];
  label: THREE.Sprite;
  deptSigns: THREE.Sprite[];
  top: number;
  fade: number;
}

export class Campus {
  readonly group = new THREE.Group();
  readonly buildings: Building[] = [];
  /** Clickable signs: userData.building or userData.dept. */
  readonly pickables: THREE.Object3D[] = [];
  /** Force the "look inside" view (roofs and upper floors hidden). */
  xray = false;
  private base: THREE.BufferGeometry[] = [];
  private windowMats: THREE.MeshStandardMaterial[] = [];
  private ledMats: THREE.MeshBasicMaterial[] = [];
  private anims: ((dt: number, time: number) => void)[] = [];
  private bulbMat = new THREE.MeshBasicMaterial({ color: '#fff3d6' });
  private lawn!: THREE.MeshLambertMaterial;
  /** spots trees must avoid: [x, z, radius] */
  private keepClear: [number, number, number][] = [];
  private field!: THREE.MeshLambertMaterial;
  private night = 0;

  constructor(
    readonly layout: Layout,
    readonly data: OfficeData,
  ) {
    const counts = new Map<string, { agent: number; skill: number; command: number }>();
    for (const it of data.registry.items) {
      const b = buildingOf(it);
      if (!counts.has(b)) counts.set(b, { agent: 0, skill: 0, command: 0 });
      const c = counts.get(b)!;
      if (it.type === 'agent' || it.type === 'skill' || it.type === 'command') c[it.type]++;
    }
    this.grounds();
    for (const z of layout.zones) this.building(z, counts.get(z.building.id) || { agent: 0, skill: 0, command: 0 });
    this.plaza();
    this.gardens();
    this.gate();
    const baseMesh = new THREE.Mesh(merge(this.base), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.group.add(baseMesh);
  }

  // --------------------------------------------------------------- grounds --
  private grounds() {
    const { bounds, entrance } = this.layout;
    const x0 = bounds.minX - 8;
    const x1 = bounds.maxX + 8;
    const z0 = bounds.minZ - 8;
    const z1 = entrance.z + 1.2;
    const plane = (w: number, d: number, x: number, y: number, z: number, color: string) => part(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), { at: [x, y, z], color });
    this.field = new THREE.MeshLambertMaterial({ color: '#9cc488' });
    const field = new THREE.Mesh(new THREE.CircleGeometry(900, 48).rotateX(-Math.PI / 2), this.field);
    field.position.y = -0.09;
    this.lawn = new THREE.MeshLambertMaterial({ color: '#a9d48f' });
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), this.lawn);
    lawn.position.set((x0 + x1) / 2, -0.045, (z0 + z1) / 2);
    this.group.add(field, lawn);
    // Boulevard with a paler walking line on each lane.
    this.base.push(plane(x1 - x0 - 2, 12.4, (x0 + x1) / 2, 0, 0, '#e4ddd1'));
    for (const lz of [-4, 4]) this.base.push(plane(x1 - x0 - 6, 0.9, (x0 + x1) / 2, 0.006, lz, '#ece6dc'));
    // Entrance avenue from the gate to the boulevard.
    this.base.push(plane(4.4, z1 - 6.2 - 0.6, entrance.x, 0, (6.2 + z1 - 0.6) / 2, '#e4ddd1'));
  }

  // -------------------------------------------------------------- building --
  private building(z: Zone, count: { agent: number; skill: number; command: number }) {
    const def = z.building;
    const { W, D } = z;
    const wall = WALL[def.style];
    const acc = def.color;
    const floors = def.floors;
    const top = Y1 + (floors - 1) * FH;
    const [cx, cz] = z.toWorld(W / 2, D / 2);
    const B = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: string) => {
      const [x, zz] = z.toWorld((u0 + u1) / 2, (v0 + v1) / 2);
      return box(Math.abs(u1 - u0), y1 - y0, Math.abs(v1 - v0), { at: [x, (y0 + y1) / 2, zz], color });
    };
    const C = (u: number, v: number, r: number, y0: number, y1: number, color: string, seg = 12) => {
      const [x, zz] = z.toWorld(u, v);
      return cyl(r, r, y1 - y0, seg, { at: [x, (y0 + y1) / 2, zz], color });
    };
    const at = (u: number, v: number, y: number) => {
      const [x, zz] = z.toWorld(u, v);
      return new THREE.Vector3(x, y, zz);
    };
    /** heading that makes a +z-facing plane look out of the building's front */
    const frontYaw = z.face(0, -1);
    const base = this.base;
    const solid: THREE.BufferGeometry[] = [];
    const win: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    const led: THREE.BufferGeometry[] = [];
    const shell = new THREE.Group();

    // Plot paving, low walls (always shown), doormat and entrance canopy.
    const [plotX, plotZ] = z.toWorld(W / 2, (D - 1.4) / 2);
    base.push(part(new THREE.PlaneGeometry(W + 2.4, D + 3.8).rotateX(-Math.PI / 2), { at: [plotX, 0.003, plotZ], color: '#e9e3d8' }));
    base.push(B(-T, W + T, D, D + T, 0, 1.1, wall), B(-T, 0, -T, D, 0, 1.1, wall), B(W, W + T, -T, D, 0, 1.1, wall), B(2.1, W, -T, 0, 0, 0.35, wall));
    base.push(B(2.0, 2.1, -T, 0, 0, Y1, FRAME));
    base.push(part(new THREE.PlaneGeometry(2.0, 1.4).rotateX(-Math.PI / 2), { at: [z.toWorld(1.05, -0.6)[0], 0.02, z.toWorld(1.05, -0.6)[1]], color: '#4a4f5a' }));
    base.push(B(-0.7, 2.8, -2.5, 0, GF - 0.32, GF - 0.12, acc), B(-0.7, 2.8, -2.52, -2.4, GF - 0.42, GF - 0.12, isLight(def.accent) ? FRAME : def.accent));
    if (def.style !== 'executive') for (const u of [-0.45, 2.55]) base.push(C(u, -2.25, 0.06, 0, GF - 0.3, FRAME, 8));

    // Ground floor above the low walls: side/back walls with windows, glass front, sign band.
    solid.push(B(-T, W + T, D, D + T, 1.1, Y1, wall), B(-T, 0, -T, D, 1.1, Y1, wall), B(W, W + T, -T, D, 1.1, Y1, wall));
    for (let v = 1.6; v < D - 0.8; v += 2.6) win.push(B(-T - 0.03, -T + 0.05, v - 0.8, v + 0.8, 1.3, 2.9, '#ffffff'), B(W + T - 0.05, W + T + 0.03, v - 0.8, v + 0.8, 1.3, 2.9, '#ffffff'));
    for (let u = 1.5; u < W - 0.8; u += 2.6) win.push(B(u - 0.8, u + 0.8, D + T - 0.05, D + T + 0.03, 1.3, 2.9, '#ffffff'));
    solid.push(B(-T, W + T, -T, 0, GF - 0.3, Y1, wall), B(-T, W + T, -T - 0.03, -T + 0.02, GF - 0.3, GF - 0.12, acc));
    glass.push(B(2.1, W, -0.12, -0.06, 0.35, GF - 0.3, '#ffffff'));
    for (let u = 2.1; u <= W + 0.01; u += Math.max(1.4, (W - 2.1) / Math.round((W - 2.1) / 1.6))) solid.push(B(u - 0.04, u + 0.04, -0.17, -0.02, 0.35, GF - 0.3, FRAME));
    solid.push(B(2.1, W, -0.17, -0.02, 2.55, 2.61, FRAME));

    // Upper storeys.
    const slabColor = def.style === 'tech' ? '#d6dce4' : wall;
    for (let f = 0; f < floors - 1; f++) {
      const y0 = Y1 + f * FH;
      solid.push(B(-T - 0.12, W + T + 0.12, -T - 0.12, D + T + 0.12, y0, y0 + 0.32, slabColor));
      win.push(B(-T + 0.06, W + T - 0.06, -T + 0.06, D + T - 0.06, y0 + 0.32, y0 + FH, '#ffffff'));
      if (def.style === 'tech') {
        led.push(B(-T - 0.13, W + T + 0.13, -T - 0.14, -T - 0.1, y0 + 0.1, y0 + 0.2, '#ffffff'));
        led.push(B(-T - 0.14, -T - 0.1, -T - 0.13, D + T + 0.13, y0 + 0.1, y0 + 0.2, '#ffffff'), B(W + T + 0.1, W + T + 0.14, -T - 0.13, D + T + 0.13, y0 + 0.1, y0 + 0.2, '#ffffff'));
      }
      if (def.style === 'sales') solid.push(B(-T - 0.1, W + T + 0.1, -T - 0.1, D + T + 0.1, y0 + 1.15, y0 + 1.32, wall));
      if (def.style === 'services') solid.push(B(-T - 0.1, W + T + 0.1, -T - 0.45, -T - 0.12, y0 + 0.32, y0 + 0.62, WOOD), B(-T - 0.05, W + T + 0.05, -T - 0.43, -T - 0.14, y0 + 0.62, y0 + 0.8, '#5f9e4f'));
    }
    // Facade rhythm: piers, mullions or fins on the upper storeys.
    const yA = Y1;
    const yB = top;
    const verticals = (step: number, width: number, depth: number, color: (k: number) => string, sides = true) => {
      let k = 0;
      for (let u = -T; u <= W + T + 0.01; u += step) solid.push(B(u - width / 2, u + width / 2, -T - depth, -T + 0.05, yA, yB, color(k++)));
      if (!sides) return;
      for (let v = -T + step; v < D + T; v += step) {
        solid.push(B(-T - depth, -T + 0.05, v - width / 2, v + width / 2, yA, yB, color(k)), B(W + T - 0.05, W + T + depth, v - width / 2, v + width / 2, yA, yB, color(k++)));
      }
      for (let u = -T + step; u < W + T; u += step) solid.push(B(u - width / 2, u + width / 2, D + T - 0.05, D + T + depth, yA, yB, color(k++)));
    };
    const FINS = [acc, '#7b4bd6', '#1fa7a0', '#f08c2e'];
    switch (def.style) {
      case 'executive':
        verticals(2.4, 0.45, 0.3, () => wall);
        break;
      case 'finance':
        verticals(2.0, 0.32, 0.22, () => wall);
        break;
      case 'tech':
        verticals(1.4, 0.07, 0.1, () => FRAME);
        break;
      case 'sales':
        verticals(2.0, 0.08, 0.1, () => FRAME);
        break;
      case 'media':
        verticals(1.2, 0.12, 0.55, (k) => FINS[k % FINS.length], false);
        verticals(1.8, 0.07, 0.1, () => FRAME);
        break;
      case 'services':
        verticals(0.9, 0.1, 0.35, () => WOOD, false);
        verticals(1.8, 0.07, 0.1, () => FRAME);
        break;
    }

    // Roof, parapet and a service unit.
    solid.push(B(-T - 0.12, W + T + 0.12, -T - 0.12, D + T + 0.12, top, top + 0.3, '#cfc9bd'));
    const pH = top + 0.3;
    solid.push(
      B(-T - 0.12, W + T + 0.12, -T - 0.12, -T + 0.06, pH, pH + 0.75, wall),
      B(-T - 0.12, W + T + 0.12, D + T - 0.06, D + T + 0.12, pH, pH + 0.75, wall),
      B(-T - 0.12, -T + 0.06, -T - 0.12, D + T + 0.12, pH, pH + 0.75, wall),
      B(W + T - 0.06, W + T + 0.12, -T - 0.12, D + T + 0.12, pH, pH + 0.75, wall),
    );
    solid.push(B(-T - 0.16, W + T + 0.16, -T - 0.16, -T + 0.1, pH + 0.75, pH + 0.9, acc));
    // Colour core: a stair tower in the building's colour above the entrance, carrying its logo.
    const coreTop = pH + 2.4;
    const coreU0 = -T - 0.25;
    const coreU1 = 2.35;
    solid.push(B(coreU0, coreU1, -T - 0.35, 2.6, Y1, coreTop, acc));
    solid.push(B(coreU0 - 0.08, coreU1 + 0.08, -T - 0.43, 2.68, coreTop, coreTop + 0.18, isLight(acc) ? FRAME : '#ffffff'));
    for (let y = Y1 + 0.6; y < coreTop - 0.8; y += FH) win.push(B(0.35, 1.75, -T - 0.39, -T - 0.3, y, y + FH - 1.0, '#ffffff'));
    solid.push(B(W - 3.2, W - 1.0, D - 2.4, D - 0.8, pH, pH + 1.2, '#b8bcc4'), B(W - 3.0, W - 1.2, D - 2.2, D - 1.0, pH + 1.2, pH + 1.3, '#8d939c'));

    const shellMat = (m: THREE.Material) => {
      m.transparent = true;
      m.userData.baseOpacity = m.opacity;
      return m;
    };
    const addMesh = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!geos.length) return;
      const mesh = new THREE.Mesh(merge(geos), shellMat(mat));
      shell.add(mesh);
      return mesh;
    };

    // Style extras.
    switch (def.style) {
      case 'executive': {
        // Portico columns flank the entrance; flag and helipad on the roof.
        for (const u of [-0.45, 2.55]) base.push(C(u, -1.3, 0.24, 0, Y1 - 0.2, '#f4efe4', 16), B(u - 0.32, u + 0.32, -1.62, -0.98, Y1 - 0.3, Y1, wall));
        base.push(B(-0.9, 3.0, -1.7, -T, Y1 - 0.3, Y1, wall), B(-0.9, 3.0, -1.72, -1.66, Y1 - 0.3, Y1 - 0.12, acc));
        solid.push(C(W / 2, 0.9, 0.07, pH, pH + 7.5, '#dcdcdc', 10), C(W / 2, 0.9, 0.12, pH + 7.5, pH + 7.7, '#c9a227', 10));
        shell.add(this.flag(at(W / 2, 0.9, pH + 7.3), frontYaw));
        const pad = new THREE.Mesh(
          new THREE.CircleGeometry(Math.min(W, D) * 0.26, 40).rotateX(-Math.PI / 2),
          shellMat(new THREE.MeshLambertMaterial({ map: canvasTexture(256, 256, (g) => {
            g.fillStyle = '#2f3441';
            g.fillRect(0, 0, 256, 256);
            g.strokeStyle = '#ffffff';
            g.lineWidth = 12;
            g.beginPath();
            g.arc(128, 128, 104, 0, Math.PI * 2);
            g.stroke();
            g.fillStyle = '#ffd166';
            g.font = `900 130px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('H', 128, 136);
          }) })),
        );
        pad.position.copy(at(W * 0.45, D * 0.6, pH + 0.02));
        shell.add(pad);
        break;
      }
      case 'finance': {
        const colTop = Y1 - 0.3;
        for (let u = 2.6; u < W - 0.2; u += 2.0) base.push(C(u, -0.95, 0.2, 0.15, colTop - 0.2, '#f6f1e6', 16), B(u - 0.3, u + 0.3, -1.25, -0.65, 0, 0.15, STONE), B(u - 0.3, u + 0.3, -1.25, -0.65, colTop - 0.2, colTop, STONE));
        base.push(B(2.2, W + T, -1.35, -T, colTop, Y1, wall));
        const shape = new THREE.Shape([new THREE.Vector2(-(W + 0.6) / 2, 0), new THREE.Vector2((W + 0.6) / 2, 0), new THREE.Vector2(0, 1.7)]);
        const [px, pz] = z.toWorld(W / 2, 0.35);
        solid.push(part(new THREE.ExtrudeGeometry(shape, { depth: 1.1, bevelEnabled: false }).translate(0, 0, -0.55), { at: [px, pH + 0.9, pz], color: wall }));
        const coin = part(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 28).rotateX(Math.PI / 2), { at: [0, 0, 0], color: '#d4af37' });
        const [qx, qz] = z.toWorld(W / 2, -0.28);
        solid.push(coin.translate(qx, pH + 1.55, qz));
        break;
      }
      case 'tech': {
        // Solar panels, satellite dish, antenna with a warning light, AI hologram.
        for (let v = D * 0.5; v < D - 1.2; v += 1.5) for (let u = 1.2; u < W - 4; u += 1.9) {
          const [x, zz] = z.toWorld(u, v);
          solid.push(part(new THREE.BoxGeometry(1.7, 0.05, 1.1), { rot: [0.35 * -z.sz, 0, 0], at: [x, pH + 0.55, zz], color: '#1f3b6e' }));
          solid.push(part(new THREE.BoxGeometry(0.08, 0.5, 0.08), { at: [x, pH + 0.25, zz], color: FRAME }));
        }
        const [dx, dz] = z.toWorld(W * 0.78, D * 0.28);
        solid.push(part(new THREE.CylinderGeometry(0.12, 0.18, 1.3, 10), { at: [dx, pH + 0.65, dz], color: '#9aa3ad' }));
        solid.push(part(new THREE.SphereGeometry(1.25, 18, 8, 0, Math.PI * 2, 0, 0.95).rotateX(Math.PI).rotateX(-0.7 * z.sz), { at: [dx, pH + 1.9, dz], color: '#eef1f5' }));
        const [ax, az] = z.toWorld(W * 0.2, D * 0.25);
        solid.push(part(new THREE.CylinderGeometry(0.05, 0.1, 7, 8), { at: [ax, pH + 3.5, az], color: '#c7ccd3' }));
        for (const y of [2, 3.6, 5.2]) solid.push(part(new THREE.BoxGeometry(1.2 - y * 0.12, 0.05, 0.05), { at: [ax, pH + y, az], color: '#c7ccd3' }));
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), shellMat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b3b').multiplyScalar(2.5) })));
        beacon.position.set(ax, pH + 7.1, az);
        shell.add(beacon);
        const holo = new THREE.Group();
        holo.add(
          new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), shellMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(acc).multiplyScalar(1.6), wireframe: true }))),
          new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), shellMat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd3ff').multiplyScalar(1.5) }))),
        );
        holo.position.copy(at(W * 0.5, D * 0.28, pH + 3.2));
        shell.add(holo);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.05, 8, 48).rotateX(Math.PI / 2), shellMat(new THREE.MeshBasicMaterial({ color: new THREE.Color(acc).multiplyScalar(2) })));
        ring.position.copy(at(W * 0.5, D * 0.28, pH + 1.2));
        shell.add(ring);
        this.anims.push((_, time) => {
          holo.rotation.y = time * 0.5;
          holo.rotation.x = Math.sin(time * 0.3) * 0.3;
          holo.position.y = pH + 3.2 + Math.sin(time * 1.2) * 0.2;
          beacon.visible = Math.sin(time * 4) > 0;
        });
        break;
      }
      case 'sales': {
        const bw = Math.min(W - 2, 8);
        for (const du of [-bw / 2 + 0.6, bw / 2 - 0.6]) solid.push(C(W / 2 + du, 1.2, 0.1, pH, pH + 2.2, FRAME, 8));
        solid.push(B(W / 2 - bw / 2 - 0.1, W / 2 + bw / 2 + 0.1, 1.05, 1.35, pH + 2.1, pH + 4.9, FRAME));
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(bw, 2.6),
          shellMat(new THREE.MeshBasicMaterial({ map: canvasTexture(1024, 333, (g, w, h) => {
            const grd = g.createLinearGradient(0, 0, w, 0);
            grd.addColorStop(0, '#f08c2e');
            grd.addColorStop(1, '#e8563a');
            g.fillStyle = grd;
            g.fillRect(0, 0, w, h);
            g.fillStyle = '#ffffff';
            g.font = `900 150px ${FONT}`;
            g.textBaseline = 'middle';
            g.fillText('SAVDO', 50, h / 2 + 8);
            g.font = `800 64px ${FONT}`;
            g.fillText('📈 +24%', 640, h / 2 - 40);
            g.font = `600 44px ${FONT}`;
            g.fillText('CRM · Deals · Revenue', 600, h / 2 + 60);
          }) })),
        );
        board.position.copy(at(W / 2, 1.0, pH + 3.5));
        board.rotation.y = frontYaw;
        shell.add(board);
        // Striped awning over the shop windows.
        const aw = W - 2.3;
        const awn = new THREE.Mesh(
          new THREE.PlaneGeometry(aw, 1.4),
          new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: canvasTexture(512, 64, (g, w, h) => {
            for (let i = 0; i < 16; i++) {
              g.fillStyle = i % 2 ? '#ffffff' : '#f08c2e';
              g.fillRect((i * w) / 16, 0, w / 16, h);
            }
          }) }),
        );
        awn.position.copy(at(2.2 + aw / 2, -0.7, GF - 0.62));
        awn.rotation.set(0, frontYaw, 0);
        awn.rotateX(-Math.PI / 2 + 0.45);
        this.group.add(awn);
        break;
      }
      case 'media': {
        const sw = Math.min(W - 2, 9);
        for (const du of [-sw / 2 + 0.5, sw / 2 - 0.5]) solid.push(C(W / 2 + du, 1.3, 0.1, pH, pH + 1.2, FRAME, 8));
        solid.push(B(W / 2 - sw / 2 - 0.15, W / 2 + sw / 2 + 0.15, 1.15, 1.5, pH + 1.1, pH + 5.0, '#1c1c24'));
        const tex = canvasTexture(1024, 440, (g, w, h) => {
          const grd = g.createLinearGradient(0, 0, w, h);
          grd.addColorStop(0, '#d45ad4');
          grd.addColorStop(0.35, '#7b4bd6');
          grd.addColorStop(0.7, '#1fa7a0');
          grd.addColorStop(1, '#d45ad4');
          g.fillStyle = grd;
          g.fillRect(0, 0, w, h);
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.beginPath();
          g.moveTo(120, 140);
          g.lineTo(120, 300);
          g.lineTo(250, 220);
          g.closePath();
          g.fill();
          g.font = `900 100px ${FONT}`;
          g.textBaseline = 'middle';
          g.fillText('MARKETING', 310, 175);
          g.font = `700 72px ${FONT}`;
          g.fillText('& MEDIA  ✦  LIVE', 314, 290);
        });
        tex.wrapS = THREE.RepeatWrapping;
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, 3.7), shellMat(new THREE.MeshBasicMaterial({ map: tex })));
        screen.position.copy(at(W / 2, 1.1, pH + 3.05));
        screen.rotation.y = frontYaw;
        shell.add(screen);
        const sm = screen.material as THREE.MeshBasicMaterial;
        this.anims.push((_, time) => {
          tex.offset.x = (time * 0.04) % 1;
          sm.color.setScalar(1 + this.night * 0.6 + Math.sin(time * 2) * 0.05);
        });
        break;
      }
      case 'services': {
        // Café tables in front, a roof garden with a pergola and a water tank.
        for (let u = 3.6; u < Math.min(W - 1.2, 11); u += 2.6) {
          base.push(C(u, -2.2, 0.45, 0.72, 0.76, '#f4efe6', 16), C(u, -2.2, 0.05, 0, 0.72, FRAME, 8), C(u, -2.2, 0.03, 0.76, 2.3, '#eeeeee', 6));
          const [x, zz] = z.toWorld(u, -2.2);
          base.push(part(new THREE.ConeGeometry(1.35, 0.55, 10), { at: [x, 2.45, zz], color: acc }));
          for (const du of [-0.62, 0.62]) base.push(B(u + du - 0.2, u + du + 0.2, -2.4, -2.0, 0.42, 0.47, WOOD), B(u + du - 0.2, u + du + 0.2, -2.42, -2.36, 0.47, 0.9, WOOD));
        }
        for (let u = 1.5; u < W - 4; u += 3) {
          solid.push(B(u, u + 2.2, D * 0.45, D * 0.45 + 0.8, pH, pH + 0.55, WOOD));
          for (let k = 0; k < 3; k++) {
            const [x, zz] = z.toWorld(u + 0.4 + k * 0.7, D * 0.45 + 0.4);
            solid.push(part(new THREE.IcosahedronGeometry(0.42, 0), { at: [x, pH + 0.85, zz], color: k % 2 ? '#6cc070' : '#4f9d58' }));
          }
        }
        for (const [u, v] of [[1.4, 1.4], [5.4, 1.4], [1.4, 4.4], [5.4, 4.4]]) solid.push(C(u, v, 0.08, pH, pH + 2.6, WOOD, 8));
        for (let v = 1.2; v <= 4.6; v += 0.5) solid.push(B(1.2, 5.6, v - 0.05, v + 0.05, pH + 2.6, pH + 2.72, WOOD));
        for (const [du, dv] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) solid.push(C(W - 2.2 + du, D - 3.2 + dv, 0.06, pH, pH + 1.6, FRAME, 6));
        solid.push(C(W - 2.2, D - 3.2, 0.95, pH + 1.6, pH + 3.2, '#9aa5b1', 16), C(W - 2.2, D - 3.2, 1.0, pH + 3.2, pH + 3.35, '#7d8794', 16));
        break;
      }
    }

    const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), shellMat(new THREE.MeshBasicMaterial({ map: this.logo(def), transparent: true })));
    logo.position.copy(at((coreU0 + coreU1) / 2, -T - 0.37, coreTop - 1.15));
    logo.rotation.y = frontYaw;
    shell.add(logo);

    // Name on the facade band.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(W - 0.6, 16), 0.86),
      shellMat(new THREE.MeshBasicMaterial({ map: this.facadeSign(def, Math.min(W - 0.6, 16) / 0.86) })),
    );
    sign.position.copy(at(W / 2, -T - 0.05, (GF - 0.12 + Y1) / 2));
    sign.rotation.y = frontYaw;
    shell.add(sign);

    const winMat = new THREE.MeshStandardMaterial({ color: '#86a5bd', roughness: 0.18, metalness: 0.45, emissive: '#ffd89a', emissiveIntensity: 0 });
    this.windowMats.push(winMat);
    addMesh(solid, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    addMesh(win, winMat);
    addMesh(glass, new THREE.MeshStandardMaterial({ color: '#cfe8f4', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false }));
    if (led.length) {
      const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(acc).multiplyScalar(1.2) });
      this.ledMats.push(lm);
      addMesh(led, lm);
    }
    this.group.add(shell);

    // Floating name above the roof (fades out up close) and department signs inside (fade in).
    const label = textSprite(
      [
        { text: `${def.emoji} ${def.name.uz}`, font: `800 46px ${FONT}`, color: '#1d2230' },
        { text: def.name.en, font: `500 28px ${FONT}`, color: '#4a5163' },
        { text: `${count.agent} agent · ${count.skill} skill · ${count.command} cmd`, font: `700 24px ${FONT}`, color: acc },
      ],
      { bg: 'rgba(255,255,255,0.93)', border: acc, width: 640 },
    );
    const lw = 13;
    label.scale.set(lw, lw / label.userData.aspect, 1);
    label.position.set(cx, top + (def.style === 'executive' ? 12 : 8.5), cz);
    label.userData.building = def.id;
    this.group.add(label);
    this.pickables.push(label);

    const deptSigns: THREE.Sprite[] = [];
    for (const id of z.depts) {
      const desks = z.desks.filter((d) => d.dept === id);
      const dept = this.data.dept.get(id);
      if (!desks.length || !dept) continue;
      const x = desks.reduce((s, d) => s + d.x, 0) / desks.length;
      const zz = desks.reduce((s, d) => s + d.z, 0) / desks.length;
      const n = z.agents.filter((a) => a.dept === id).length;
      const s = textSprite(
        [
          { text: `${dept.emoji} ${dept.name}`, font: `700 40px ${FONT}`, color: '#1d2230' },
          { text: `${dept.uz} · ${n} agent`, font: `600 26px ${FONT}`, color: dept.color },
        ],
        { bg: 'rgba(255,255,255,0.9)', border: dept.color, width: 520 },
      );
      s.scale.set(3.6, 3.6 / s.userData.aspect, 1);
      s.position.set(x, 3.2, zz);
      s.userData.dept = id;
      s.visible = false;
      this.group.add(s);
      this.pickables.push(s);
      deptSigns.push(s);
    }

    const mats: THREE.Material[] = [];
    shell.traverse((o) => {
      if (o instanceof THREE.Mesh) mats.push(o.material as THREE.Material);
    });
    this.buildings.push({ zone: z, def, shell, mats, label, deptSigns, top, fade: 1 });
  }

  private logo(def: BuildingDef) {
    return canvasTexture(256, 256, (g) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(128, 128, 118, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 12;
      g.strokeStyle = def.color;
      g.stroke();
      g.font = `150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(def.emoji, 128, 140);
    });
  }

  private facadeSign(def: BuildingDef, aspect: number) {
    const h = 128;
    const w = Math.round(h * aspect);
    const light = isLight(def.accent);
    return canvasTexture(w, h, (g) => {
      g.fillStyle = def.accent;
      g.fillRect(0, 0, w, h);
      g.fillStyle = def.color;
      g.fillRect(0, h - 12, w, 12);
      g.fillStyle = light ? '#1d2230' : '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 64px ${FONT}`;
      g.fillText(`${def.emoji} ${def.name.uz.toUpperCase()}`, w / 2, h / 2 - 4, w - 40);
    });
  }

  /** Waving flag (Uzbekistan) whose hoist edge is at `pos`. */
  private flag(pos: THREE.Vector3, yaw: number) {
    const geo = new THREE.PlaneGeometry(3, 1.5, 16, 4).translate(1.5, -0.75, 0);
    const tex = canvasTexture(300, 150, (g) => {
      g.fillStyle = '#0099b5';
      g.fillRect(0, 0, 300, 50);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 50, 300, 50);
      g.fillStyle = '#1eb53a';
      g.fillRect(0, 100, 300, 50);
      g.fillStyle = '#ce1126';
      g.fillRect(0, 48, 300, 4);
      g.fillRect(0, 98, 300, 4);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(38, 25, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0099b5';
      g.beginPath();
      g.arc(44, 25, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 12; i++) g.fillRect(64 + (i % 5) * 11, 9 + Math.floor(i / 5) * 11, 5, 5);
    });
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
    mesh.material.userData.baseOpacity = 1;
    mesh.position.copy(pos);
    mesh.rotation.y = yaw;
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const x0 = Float32Array.from({ length: p.count }, (_, i) => p.getX(i));
    this.anims.push((_, time) => {
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(x0[i] * 2.2 - time * 4) * 0.12 * (x0[i] / 3));
      p.needsUpdate = true;
    });
    return mesh;
  }

  // ----------------------------------------------------------------- plaza --
  private plaza() {
    const R = this.layout.atriumRadius;
    const disc = part(new THREE.CircleGeometry(R, 72).rotateX(-Math.PI / 2), { at: [0, 0.012, 0], color: '#f3ede2' });
    this.base.push(disc);
    for (const [r, w, c] of [[R, 0.25, '#d97757'], [11.5, 0.12, '#e2b49e'], [6.2, 0.18, '#d97757']] as const) {
      this.base.push(part(new THREE.RingGeometry(r - w, r, 96).rotateX(-Math.PI / 2), { at: [0, 0.018, 0], color: c }));
    }
    // Radial paving pattern.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.base.push(part(new THREE.PlaneGeometry(0.1, R - 6.4).rotateX(-Math.PI / 2).translate(0, 0, -(R + 6.2) / 2).rotateY(a), { at: [0, 0.016, 0], color: '#e8dfd0' }));
    }
    // Fountain basin around the core.
    this.base.push(part(new THREE.CylinderGeometry(3.75, 3.8, 0.42, 64, 1, true), { at: [0, 0.21, 0], color: STONE }));
    this.base.push(part(new THREE.TorusGeometry(3.62, 0.15, 8, 72).rotateX(Math.PI / 2), { at: [0, 0.43, 0], color: '#e7e1d6' }));
    const water = new THREE.Mesh(
      new THREE.RingGeometry(2.9, 3.55, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#58b4dc', roughness: 0.08, metalness: 0.25, emissive: '#0f5f82', emissiveIntensity: 0.25, transparent: true, opacity: 0.9 }),
    );
    water.position.y = 0.34;
    this.group.add(water);
    const jets: THREE.Mesh[] = [];
    const jetMat = new THREE.MeshBasicMaterial({ color: '#e9f7ff', transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1, 6).translate(0, 0.5, 0), jetMat);
      jet.position.set(Math.cos(a) * 3.22, 0.34, Math.sin(a) * 3.22);
      jet.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      jets.push(jet);
      this.group.add(jet);
    }
    this.anims.push((_, time) => jets.forEach((j, i) => (j.scale.y = 0.9 + Math.sin(time * 3 + i * 1.3) * 0.35)));

    // Benches facing the fountain and lamps around the plaza.
    const benchGeo = merge([
      box(1.7, 0.07, 0.46, { at: [0, 0.45, 0], color: WOOD }),
      box(1.7, 0.4, 0.06, { at: [0, 0.72, -0.22], color: WOOD }),
      box(0.08, 0.45, 0.4, { at: [-0.72, 0.22, 0], color: '#3a404b' }),
      box(0.08, 0.45, 0.4, { at: [0.72, 0.22, 0], color: '#3a404b' }),
    ]);
    const benches: [number, number, number][] = [];
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4]) {
      const x = Math.cos(a) * 12.6;
      const z = Math.sin(a) * 12.6;
      benches.push([x, z, Math.atan2(-x, -z)]);
    }
    for (const z of this.layout.zones) {
      // Benches on the lawn strip between neighbouring buildings.
      const [x, zz] = z.toWorld(z.W + 3.5, -1.2);
      if (this.layout.zones.some((o) => o !== z && o.sx === z.sx && o.sz === z.sz && o.x0 > z.x0)) benches.push([x, zz, z.face(0, -1)]);
    }
    for (const [x, z] of [[-11, 22], [11, 22], [-9, -24], [9, -24]]) benches.push([x + 2.4, z, -Math.PI / 2 * Math.sign(x)]);
    for (const [x, z] of benches) this.keepClear.push([x, z, 1.6]);
    const bm = instanced(benchGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), benches.length);
    benches.forEach(([x, z, h], i) => place(bm, i, x, 0, z, h));
    this.group.add(bm);

    const lamps: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      if (Math.abs(Math.sin(a)) < 0.4) continue;
      lamps.push([Math.cos(a) * 15.2, Math.sin(a) * 15.2]);
    }
    for (const z of this.layout.zones) {
      lamps.push(z.toWorld(z.W / 2 + 0.6, -1.7) as [number, number]);
      lamps.push(z.toWorld(z.W + 3.5, -1.7) as [number, number]);
    }
    for (let zz = 9; zz < this.layout.entrance.z - 2; zz += 7) lamps.push([this.layout.entrance.x - 2.6, zz], [this.layout.entrance.x + 2.6, zz]);
    const poleGeo = merge([
      cyl(0.07, 0.1, 4.2, 8, { at: [0, 2.1, 0], color: '#2f3540' }),
      cyl(0.18, 0.18, 0.12, 10, { at: [0, 0.06, 0], color: '#2f3540' }),
      box(0.5, 0.12, 0.5, { at: [0, 4.35, 0], color: '#2f3540' }),
    ]);
    for (const [x, z] of lamps) this.keepClear.push([x, z, 1.2]);
    const poles = instanced(poleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), lamps.length);
    const bulbs = instanced(new THREE.SphereGeometry(0.2, 12, 8).translate(0, 4.15, 0), this.bulbMat, lamps.length);
    lamps.forEach(([x, z], i) => {
      place(poles, i, x, 0, z);
      place(bulbs, i, x, 0, z);
    });
    this.group.add(poles, bulbs);
  }

  // --------------------------------------------------------------- gardens --
  private gardens() {
    const { bounds, entrance, zones } = this.layout;
    const beds: [number, number, number][] = [[-11, 22, 2.2], [11, 22, 2.2], [-9, -24, 2.4], [9, -24, 2.4], [-3, -30, 1.6], [0, 26, 1.4]];
    for (const [x, z, r] of beds) this.keepClear.push([x, z, r + 1.4]);
    const trees: [number, number, number][] = [];
    const free = (x: number, z: number) => {
      if (this.keepClear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) return false;
      if (Math.hypot(x, z) < this.layout.atriumRadius + 1.5) return false;
      if (Math.abs(z) < 7.2) return false;
      if (Math.abs(x - entrance.x) < 3.4 && z > 5) return false;
      for (const zn of zones) {
        const [ax, az] = zn.toWorld(-1.4, -2.8);
        const [bx, bz] = zn.toWorld(zn.W + 1.4, zn.D + 1.4);
        if (x > Math.min(ax, bx) && x < Math.max(ax, bx) && z > Math.min(az, bz) && z < Math.max(az, bz)) return false;
      }
      return true;
    };
    const tree = (x: number, z: number, s = 1) => free(x, z) && trees.push([x, z, s]);
    // Rows between neighbouring buildings and at the far ends.
    for (const z of zones) {
      for (let v = 1; v < z.D + 1; v += 4.2) {
        const [x, zz] = z.toWorld(z.W + 3.5, v);
        tree(x, zz, 0.95);
      }
    }
    // Gardens north and south of the plaza.
    for (let x = -15; x <= 15; x += 4.5) {
      for (let z = 19; z < bounds.maxZ + 2; z += 4.6) tree(x + ((z * 7) % 3) - 1, z, 0.9 + ((x * 13 + z) % 5) / 12);
      for (let z = -19; z > bounds.minZ - 2; z -= 4.6) tree(x + ((z * 7) % 3) - 1, z, 0.9 + ((x * 11 - z) % 5) / 12);
    }
    // Perimeter.
    const x0 = bounds.minX - 5;
    const x1 = bounds.maxX + 5;
    const z0 = bounds.minZ - 5;
    const z1 = entrance.z - 1.5;
    for (let x = x0; x <= x1; x += 5) {
      tree(x, z0, 1.1);
      if (Math.abs(x - entrance.x) > 5) tree(x, z1 + 3, 1.05);
    }
    for (let z = z0 + 5; z < z1; z += 5) {
      tree(x0, z, 1.1);
      tree(x1, z, 1.1);
    }
    const treeGeo = merge([
      cyl(0.16, 0.24, 1.8, 7, { at: [0, 0.9, 0], color: '#7a5236' }),
      part(new THREE.IcosahedronGeometry(1.45, 1), { at: [0, 2.9, 0], color: '#5b9a4c' }),
      part(new THREE.IcosahedronGeometry(1.05, 1), { at: [0.35, 3.85, 0.2], color: '#6fb05a' }),
      part(new THREE.IcosahedronGeometry(0.8, 0), { at: [-0.45, 3.4, -0.35], color: '#4f8a43' }),
    ]);
    const tm = instanced(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), trees.length);
    trees.forEach(([x, z, s], i) => place(tm, i, x, 0, z, i * 1.7, s));
    this.group.add(tm);

    // Flower beds and hedges.
    const flowerColors = ['#e5484d', '#ffd166', '#f78fb3', '#ffffff', '#b784e6', '#ff9f43'];
    const flowers: [number, number, string][] = [];
    for (const [x, z, r] of beds) {
      if (Math.abs(x - entrance.x) < 3 && z > 5) continue;
      this.base.push(part(new THREE.CylinderGeometry(r, r + 0.1, 0.22, 28), { at: [x, 0.11, z], color: '#d6cfc2' }));
      this.base.push(part(new THREE.CircleGeometry(r - 0.15, 28).rotateX(-Math.PI / 2), { at: [x, 0.225, z], color: '#6b4f3a' }));
      for (let k = 0; k < 40; k++) {
        const a = k * 2.399;
        const rr = (r - 0.3) * Math.sqrt((k + 0.5) / 40);
        flowers.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr, flowerColors[(k + Math.round(x)) % flowerColors.length]]);
      }
    }
    const fm = instanced(merge([cyl(0.015, 0.015, 0.26, 4, { at: [0, 0.13, 0], color: '#3f7f3a' }), part(new THREE.IcosahedronGeometry(0.075, 0), { at: [0, 0.28, 0], color: '#ffffff' })]), new THREE.MeshLambertMaterial({ vertexColors: true }), flowers.length);
    flowers.forEach(([x, z, c], i) => {
      place(fm, i, x, 0.22, z, i);
      fm.setColorAt(i, new THREE.Color(c));
    });
    this.group.add(fm);

    const hedge = '#4f8a43';
    this.base.push(box(x1 - x0, 1.0, 0.8, { at: [(x0 + x1) / 2, 0.5, z0 - 2.2], color: hedge }));
    this.base.push(box(0.8, 1.0, z1 - z0 + 4.4, { at: [x0 - 2.2, 0.5, (z0 + z1) / 2], color: hedge }));
    this.base.push(box(0.8, 1.0, z1 - z0 + 4.4, { at: [x1 + 2.2, 0.5, (z0 + z1) / 2], color: hedge }));
    const gateL = entrance.x - 3.6;
    const gateR = entrance.x + 3.6;
    this.base.push(box(gateL - (x0 - 2.2), 1.0, 0.8, { at: [(gateL + x0 - 2.2) / 2, 0.5, z1 + 2.2], color: hedge }));
    this.base.push(box(x1 + 2.2 - gateR, 1.0, 0.8, { at: [(gateR + x1 + 2.2) / 2, 0.5, z1 + 2.2], color: hedge }));
  }

  // ------------------------------------------------------------------ gate --
  private gate() {
    const e = this.layout.entrance;
    const gz = e.z + 0.7;
    for (const dx of [-3.2, 3.2]) {
      this.base.push(box(0.9, 4.8, 0.9, { at: [e.x + dx, 2.4, gz], color: '#e8e1d2' }));
      this.base.push(box(1.1, 0.2, 1.1, { at: [e.x + dx, 4.9, gz], color: '#d97757' }));
    }
    this.base.push(box(7.3, 0.7, 0.7, { at: [e.x, 4.45, gz], color: '#e8e1d2' }), box(7.3, 0.12, 0.74, { at: [e.x, 4.06, gz], color: '#d97757' }));
    const sign = textSprite([{ text: '🏢 AI AGENT OFFICE · KAMPUS', font: `800 36px ${FONT}`, color: '#ffffff' }], { bg: '#bf5f3f', width: 720, padding: 14 });
    sign.scale.set(6.2, 6.2 / sign.userData.aspect, 1);
    sign.position.set(e.x, 5.6, gz);
    this.group.add(sign);
    // Guard booth.
    const bx = this.layout.staff.guard.x - 2.3;
    const bz = gz - 2.2;
    this.base.push(
      box(2.0, 2.5, 1.8, { at: [bx, 1.25, bz], color: '#e8e1d2' }),
      box(2.4, 0.2, 2.2, { at: [bx, 2.6, bz], color: '#394150' }),
      box(1.4, 0.8, 0.04, { at: [bx, 1.55, bz + 0.91], color: '#86a5bd' }),
      box(0.04, 0.8, 1.0, { at: [bx + 1.01, 1.55, bz], color: '#86a5bd' }),
    );
  }

  // --------------------------------------------------------------- runtime --
  setNight(t: number) {
    this.night = t;
    for (const m of this.windowMats) m.emissiveIntensity = t * 0.75;
    for (const m of this.ledMats) m.color.copy(m.userData.base ?? (m.userData.base = m.color.clone())).multiplyScalar(1 + t * 1.8);
    this.bulbMat.color.set('#fff3d6').multiplyScalar(0.9 + t * 2.4);
    this.lawn.color.set('#a9d48f').lerp(new THREE.Color('#1f3326'), t * 0.85);
    this.field.color.set('#9cc488').lerp(new THREE.Color('#18271d'), t * 0.9);
  }

  /** How much of the buildings is shown: 1 = whole building, 0 = only the ground-floor plan. */
  update(dt: number, time: number, camera: THREE.Camera, target: THREE.Vector3) {
    const dist = camera.position.distanceTo(target);
    const auto = THREE.MathUtils.clamp((dist - 50) / 28, 0, 1);
    const want = this.xray ? 0 : auto;
    for (const b of this.buildings) {
      const prev = b.fade;
      b.fade += (want - b.fade) * Math.min(1, dt * 5 + 0.02);
      if (Math.abs(b.fade - want) < 0.003) b.fade = want;
      if (b.fade !== prev || !b.shell.userData.init) {
        b.shell.userData.init = true;
        b.shell.visible = b.fade > 0.01;
        const solid = b.fade > 0.97;
        for (const m of b.mats) {
          m.opacity = (m.userData.baseOpacity ?? 1) * b.fade;
          if (m.userData.baseOpacity === 1 || m.userData.baseOpacity === undefined) m.depthWrite = solid;
        }
      }
      const d = camera.position.distanceTo(b.label.position);
      const lo = THREE.MathUtils.clamp((d - 16) / 18, 0, 1) * (0.35 + 0.65 * b.fade);
      (b.label.material as THREE.SpriteMaterial).opacity = lo;
      b.label.visible = lo > 0.02;
      for (const s of b.deptSigns) {
        const ds = camera.position.distanceTo(s.position);
        const o = (1 - b.fade) * THREE.MathUtils.clamp((95 - ds) / 30, 0, 1) * THREE.MathUtils.clamp((ds - 5) / 6, 0, 1);
        (s.material as THREE.SpriteMaterial).opacity = o;
        s.visible = o > 0.02;
      }
    }
    for (const a of this.anims) a(dt, time);
  }
}
