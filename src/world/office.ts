// Static office: floor, department zones, desks, monitors, chairs, bookshelves
// (one book per skill / command / guide), coffee corners, reception, the
// Graphify core and signage. Dynamic bits (screens, books, core) expose small
// setters used by the simulation.
import * as THREE from 'three';
import type { Item, OfficeData } from '../data';
import { buildingOf, type DeskSlot, type Layout, type Shelf, type Zone } from './layout';
import { Campus } from './campus';
import { FONT, box, cyl, instanced, merge, part, place, textSprite } from './geo';

const SCREEN_IDLE = new THREE.Color('#263246');
const tmpColor = new THREE.Color();

export interface Book {
  item: Item;
  shelf: Shelf;
  zone: Zone;
  pos: THREE.Vector3;
  out: THREE.Vector3;
  heading: number;
  scale: [number, number, number];
  color: THREE.Color;
}

export class Office {
  readonly group = new THREE.Group();
  readonly screens: THREE.InstancedMesh;
  readonly books: THREE.InstancedMesh;
  readonly bookList: Book[] = [];
  readonly bookOf = new Map<string, number>();
  readonly core: Core;
  private litBooks = new Map<number, number>();
  private screenDept: THREE.Color[] = [];
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly campus: Campus;
  /** Claude Academy's lecture screen */
  readonly lecture: { set(title: string, lines: string[], sub?: string): void } | null;
  private coreLight: THREE.PointLight;

  constructor(
    readonly scene: THREE.Scene,
    readonly layout: Layout,
    readonly data: OfficeData,
  ) {
    scene.add(this.group);
    this.hemi = new THREE.HemisphereLight('#f4f7ff', '#b7a78e', 1.25);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.9);
    this.sun.position.set(60, 110, 45);
    this.coreLight = new THREE.PointLight('#2ec4b6', 0, 40, 1.6);
    this.coreLight.position.set(0, 6, 0);
    this.group.add(this.hemi, this.sun, this.coreLight);

    this.campus = new Campus(layout, data);
    this.group.add(this.campus.group);
    this.buildZones();
    const { screens } = this.buildWorkstations();
    this.screens = screens;
    this.books = this.buildShelves();
    this.buildAmenities();
    this.buildReception();
    this.lecture = this.buildAcademy();
    this.core = new Core(data);
    this.group.add(this.core.group);
  }

  // ----------------------------------------------------------------- zones --
  private buildZones() {
    const cream = new THREE.Color('#f7f3ec');
    for (const z of this.layout.zones) {
      const bc = new THREE.Color(z.building.color);
      const [cx, cz] = z.toWorld(z.W / 2, z.D / 2);
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(z.W, z.D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: bc.clone().lerp(cream, 0.8) }));
      carpet.position.set(cx, 0.022, cz);
      this.group.add(carpet);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(z.W, 0.35).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: bc }));
      const [sx, sz] = z.toWorld(z.W / 2, 0.18);
      stripe.position.set(sx, 0.03, sz);
      this.group.add(stripe);
      // A soft coloured rug under each department's block of desks.
      for (const id of z.depts) {
        const desks = z.desks.filter((d) => d.dept === id);
        if (!desks.length) continue;
        const us = desks.map((d) => d.x);
        const vs = desks.map((d) => d.z);
        const x0 = Math.min(...us) - 1.0;
        const x1 = Math.max(...us) + 1.0;
        const z0 = Math.min(...vs) - 1.5;
        const z1 = Math.max(...vs) + 1.5;
        const rug = new THREE.Mesh(
          new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(this.data.dept.get(id)?.color || '#999').lerp(cream, 0.72), transparent: true, opacity: 0.75, depthWrite: false }),
        );
        rug.position.set((x0 + x1) / 2, 0.026, (z0 + z1) / 2);
        this.group.add(rug);
      }
    }
  }

  // ---------------------------------------------------------- workstations --
  private buildWorkstations() {
    const slots: { desk: DeskSlot; dept?: string }[] = [];
    for (const z of this.layout.zones) for (const d of z.desks) slots.push({ desk: d, dept: d.dept });
    for (const d of this.layout.hotDesks) slots.push({ desk: d });
    const lib = this.layout.librarian;
    slots.push({ desk: { ...lib.desk, seat: lib.seat, guest: lib.seat }, dept: 'data' });

    const deskGeo = merge([
      box(1.6, 0.05, 0.8, { at: [0, 0.745, 0], color: '#dcc7a6' }),
      box(0.05, 0.72, 0.74, { at: [-0.76, 0.36, 0], color: '#a3adb8' }),
      box(0.05, 0.72, 0.74, { at: [0.76, 0.36, 0], color: '#a3adb8' }),
      box(1.48, 0.36, 0.03, { at: [0, 0.52, 0.34], color: '#b9c2cc' }),
      box(0.5, 0.02, 0.16, { at: [0, 0.78, -0.24], color: '#2d3440' }),
      box(0.07, 0.025, 0.1, { at: [0.36, 0.78, -0.23], color: '#2d3440' }),
      cyl(0.045, 0.04, 0.1, 8, { at: [-0.58, 0.82, -0.05], color: '#f1f1f1' }),
    ]);
    const monitorGeo = merge([
      box(0.26, 0.02, 0.18, { at: [0, 0.78, 0.24], color: '#39414f' }),
      box(0.06, 0.3, 0.05, { at: [0, 0.92, 0.26], color: '#39414f' }),
      box(0.74, 0.46, 0.04, { at: [0, 1.18, 0.27], color: '#1d232d' }),
    ]);
    const screenGeo = new THREE.PlaneGeometry(0.68, 0.4).rotateY(Math.PI).translate(0, 1.18, 0.247);
    const chairGeo = merge([
      box(0.5, 0.08, 0.48, { at: [0, 0.4, -0.04], color: '#ffffff' }),
      box(0.5, 0.56, 0.07, { at: [0, 0.76, -0.3], color: '#ffffff' }),
      box(0.06, 0.34, 0.06, { at: [0, 0.2, -0.04], color: '#3a404b' }),
      box(0.56, 0.04, 0.08, { at: [0, 0.03, -0.04], color: '#3a404b' }),
      box(0.08, 0.04, 0.56, { at: [0, 0.03, -0.04], color: '#3a404b' }),
    ]);

    const extraScreens = 2; // reception: lead + office manager
    const desks = instanced(deskGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), slots.length);
    const monitors = instanced(monitorGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), slots.length + extraScreens);
    const screens = instanced(screenGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: true }), slots.length + extraScreens);
    const chairs = instanced(chairGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), slots.length + extraScreens);

    slots.forEach(({ desk, dept }, i) => {
      place(desks, i, desk.x, 0, desk.z, desk.heading);
      place(monitors, i, desk.x, 0, desk.z, desk.heading);
      place(screens, i, desk.x, 0, desk.z, desk.heading);
      const s = desk.seat;
      place(chairs, i, s.x, 0, s.z, s.heading);
      const dc = new THREE.Color(dept ? this.data.dept.get(dept)!.color : '#8d99ae');
      chairs.setColorAt(i, dc.clone().multiplyScalar(0.8));
      screens.setColorAt(i, SCREEN_IDLE);
      this.screenDept[i] = dc;
      s.screen = i;
    });
    const rec = this.layout.reception;
    [rec.lead, rec.manager].forEach((s, k) => {
      const i = slots.length + k;
      // Monitors sit on the reception counter in front of the seat.
      const dx = s.x, dz = s.z + 0.78;
      place(monitors, i, dx, 0.28, dz, 0);
      place(screens, i, dx, 0.28, dz, 0);
      place(chairs, i, s.x, 0, s.z, s.heading);
      chairs.setColorAt(i, new THREE.Color(k === 0 ? '#d97757' : '#e8736b'));
      screens.setColorAt(i, SCREEN_IDLE);
      this.screenDept[i] = new THREE.Color(k === 0 ? '#d97757' : '#e8736b');
      s.screen = i;
    });
    this.group.add(desks, monitors, screens, chairs);

    const libSign = textSprite([{ text: '🕸️ Graphify Librarian', font: `700 30px ${FONT}`, color: '#0f5f58' }], { bg: 'rgba(255,255,255,0.9)', border: '#2ec4b6', width: 420 });
    libSign.scale.set(2.6, 2.6 / libSign.userData.aspect, 1);
    libSign.position.set(lib.desk.x, 2.1, lib.desk.z + 0.3);
    this.group.add(libSign);
    const hot = textSprite([{ text: '🪑 Mehmon stollari · Visitor desks', font: `600 28px ${FONT}`, color: '#3b4252' }], { bg: 'rgba(255,255,255,0.85)', width: 560 });
    hot.scale.set(4.2, 4.2 / hot.userData.aspect, 1);
    hot.position.set(0, 2.3, -10.4);
    this.group.add(hot);
    return { screens };
  }

  setScreen(i: number | undefined, on: boolean, color?: THREE.ColorRepresentation) {
    if (i === undefined) return;
    if (on) tmpColor.set(color ?? this.screenDept[i]).multiplyScalar(1.7);
    else tmpColor.copy(SCREEN_IDLE);
    this.screens.setColorAt(i, tmpColor);
    this.screens.instanceColor!.needsUpdate = true;
  }

  // --------------------------------------------------------------- shelves --
  private buildShelves() {
    const shelfGeo = merge([
      box(1.8, 2.2, 0.03, { at: [0, 1.1, -0.19], color: '#b08a64' }),
      box(0.04, 2.2, 0.4, { at: [-0.88, 1.1, 0], color: '#9b7653' }),
      box(0.04, 2.2, 0.4, { at: [0.88, 1.1, 0], color: '#9b7653' }),
      ...[0, 1, 2, 3, 4, 5].map((k) => box(1.76, 0.03, 0.4, { at: [0, 0.03 + k * 0.43, 0], color: '#c49a6c' })),
    ]);
    const allShelves = this.layout.zones.flatMap((z) => z.shelves);
    const shelfMesh = instanced(shelfGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), allShelves.length);
    allShelves.forEach((s, i) => place(shelfMesh, i, s.x, 0, s.z, s.heading));
    this.group.add(shelfMesh);

    const typeOrder = { skill: 0, command: 1, guide: 2, agent: 3 } as const;
    for (const z of this.layout.zones) {
      const items = this.data.registry.items
        .filter((i) => i.type !== 'agent' && buildingOf(i) === z.building.id)
        .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
      let n = 0;
      const PER_ROW = 16;
      for (const it of items) {
        const shelfIdx = Math.floor(n / (PER_ROW * 5));
        if (shelfIdx >= z.shelves.length) break;
        const shelf = z.shelves[shelfIdx];
        const row = Math.floor((n % (PER_ROW * 5)) / PER_ROW);
        const slot = n % PER_ROW;
        n++;
        const h = it.type === 'command' ? 0.25 : it.type === 'guide' ? 0.36 : 0.29 + (((slot * 7 + row * 3) % 5) - 2) * 0.012;
        const w = it.type === 'command' ? 0.092 : 0.078;
        const lx = -0.8 + slot * 0.1 + 0.05;
        const ly = 0.045 + row * 0.43 + h / 2;
        const lz = 0.03;
        const c = Math.cos(shelf.heading), s = Math.sin(shelf.heading);
        const pos = new THREE.Vector3(shelf.x + lx * c + lz * s, ly, shelf.z - lx * s + lz * c);
        const out = new THREE.Vector3(s, 0, c).multiplyScalar(0.16).add(pos);
        const base = new THREE.Color(this.data.source.get(it.source)?.color || '#999');
        const hsl = { h: 0, s: 0, l: 0 };
        base.getHSL(hsl);
        const color = new THREE.Color().setHSL(hsl.h + (((slot * 13) % 7) - 3) * 0.008, hsl.s * 0.85, it.type === 'command' ? 0.3 : it.type === 'guide' ? 0.82 : 0.42 + ((slot * 11 + row) % 5) * 0.05);
        this.bookOf.set(it.id, this.bookList.length);
        this.bookList.push({ item: it, shelf, zone: z, pos, out, heading: shelf.heading, scale: [w, h, 0.24], color });
      }
    }
    const books = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), this.bookList.length);
    this.bookList.forEach((b, i) => {
      place(books, i, b.pos.x, b.pos.y, b.pos.z, b.heading, b.scale);
      books.setColorAt(i, b.color);
    });
    this.group.add(books);
    return books;
  }

  /** Pull a book out of its shelf and make it glow for `seconds`. */
  lightBook(i: number, seconds = 6) {
    const b = this.bookList[i];
    if (!b) return;
    this.litBooks.set(i, seconds);
    place(this.books, i, b.out.x, b.out.y + 0.05, b.out.z, b.heading, b.scale);
    this.books.setColorAt(i, tmpColor.set('#fff1a8'));
    this.books.instanceMatrix.needsUpdate = true;
    this.books.instanceColor!.needsUpdate = true;
  }

  // ------------------------------------------------------------- amenities --
  private buildAmenities() {
    const coffeeGeo = merge([
      box(0.6, 0.95, 1.3, { at: [0, 0.475, 0], color: '#f4efe6' }),
      box(0.64, 0.04, 1.34, { at: [0, 0.97, 0], color: '#6d4c41' }),
      box(0.34, 0.46, 0.36, { at: [0, 1.22, -0.3], color: '#2f3640' }),
      box(0.02, 0.08, 0.26, { at: [0.18, 1.35, -0.3], color: '#e5484d' }),
      cyl(0.05, 0.045, 0.1, 8, { at: [0.05, 1.04, 0.15], color: '#ffffff' }),
      cyl(0.05, 0.045, 0.1, 8, { at: [-0.1, 1.04, 0.35], color: '#d97757' }),
      cyl(0.12, 0.1, 0.4, 8, { at: [0, 1.19, 0.42], color: '#c8e6c9' }),
    ]);
    const zones = this.layout.zones;
    const coffee = instanced(coffeeGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), zones.length);
    zones.forEach((z, i) => {
      const m = z.coffeeMachine;
      place(coffee, i, m.x, 0, m.z, m.heading);
    });
    this.group.add(coffee);

    const plantGeo = merge([
      cyl(0.28, 0.22, 0.5, 10, { at: [0, 0.25, 0], color: '#c56b3f' }),
      part(new THREE.IcosahedronGeometry(0.45, 0), { at: [0, 0.85, 0], color: '#4f9d58' }),
      part(new THREE.IcosahedronGeometry(0.32, 0), { at: [0.18, 1.2, 0.05], color: '#6cc070' }),
    ]);
    const spots: [number, number][] = [];
    for (const z of zones) {
      spots.push(z.toWorld(0.55, z.D - 0.7), z.toWorld(z.W - 0.55, z.D - 0.7));
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.35) continue; // keep the lanes clear
      spots.push([Math.cos(a) * 13.4, Math.sin(a) * 13.4]);
    }
    const plants = instanced(plantGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), spots.length);
    spots.forEach(([x, z], i) => place(plants, i, x, 0, z, i, 0.9 + (i % 3) * 0.1));
    this.group.add(plants);
  }

  private buildReception() {
    const { desk } = this.layout.reception;
    const counter = new THREE.Mesh(
      merge([
        box(7.2, 1.05, 0.7, { at: [0, 0.525, 0], color: '#fbfaf7' }),
        box(7.4, 0.06, 0.9, { at: [0, 1.08, -0.05], color: '#c49a6c' }),
        box(7.22, 0.18, 0.02, { at: [0, 0.75, 0.36], color: '#d97757' }),
        box(0.7, 1.05, 2.4, { at: [-3.6, 0.525, -1.0], color: '#fbfaf7' }),
        box(0.7, 1.05, 2.4, { at: [3.6, 0.525, -1.0], color: '#fbfaf7' }),
      ]),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    counter.position.set(desk.x, 0, desk.z);
    this.group.add(counter);
    const sign = textSprite(
      [
        { text: '🏢 AI Agent Office', font: `800 46px ${FONT}`, color: '#1d2230' },
        { text: 'Qabulxona · Reception', font: `500 28px ${FONT}`, color: '#bf5f3f' },
      ],
      { bg: 'rgba(255,255,255,0.94)', border: '#d97757', width: 620 },
    );
    sign.scale.set(6, 6 / sign.userData.aspect, 1);
    sign.position.set(desk.x, 4.3, desk.z + 0.6);
    this.group.add(sign);
  }

  // -------------------------------------------------------------- academy --
  private buildAcademy() {
    const a = this.layout.academy;
    if (!a) return null;
    const W = 1600;
    const H = Math.round((W * a.screen.h) / a.screen.w);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(a.screen.w, a.screen.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.set(a.screen.x, a.screen.y, a.screen.z);
    screen.rotation.y = a.screen.heading;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(a.screen.w + 0.3, a.screen.h + 0.3, 0.12), new THREE.MeshLambertMaterial({ color: '#2a2d36' }));
    frame.position.copy(screen.position);
    frame.rotation.y = a.screen.heading;
    frame.translateZ(-0.08);
    // Lectern in front of the teacher's place.
    const lectern = new THREE.Mesh(
      merge([box(0.8, 1.05, 0.5, { at: [0, 0.525, 0], color: '#8b5e3c' }), box(0.9, 0.06, 0.6, { at: [0, 1.08, -0.02], rot: [-0.25, 0, 0], color: '#6d4c41' }), box(0.5, 0.35, 0.02, { at: [0, 0.6, 0.26], color: '#d97757' })]),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    const p = a.podium;
    lectern.position.set(p.x + Math.sin(p.heading) * 0.75, 0, p.z + Math.cos(p.heading) * 0.75);
    lectern.rotation.y = p.heading + Math.PI;
    this.group.add(frame, screen, lectern);
    // Sizes follow the screen height: the screen is wide and low.
    const wrap = (text: string, max: number) => {
      const rows: string[] = [];
      let row = '';
      for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = row ? `${row} ${word}` : word;
        if (row && g.measureText(next).width > max) {
          rows.push(row);
          row = word;
        } else row = next;
      }
      if (row) rows.push(row);
      return rows;
    };
    const draw = (title: string, lines: string[], sub = '') => {
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#231612');
      grd.addColorStop(1, '#5a2c1e');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#d97757';
      g.fillRect(0, 0, W, Math.round(H * 0.035));
      g.textBaseline = 'top';
      g.fillStyle = '#f4c7ae';
      const small = Math.round(H * 0.085);
      g.font = `700 ${small}px ${FONT}`;
      g.fillText('🎓 Claude Akademiyasi', 40, H * 0.07);
      if (sub) {
        g.textAlign = 'right';
        g.fillText(sub, W - 40, H * 0.07, W * 0.45);
        g.textAlign = 'left';
      }
      g.fillStyle = '#ffffff';
      g.font = `800 ${Math.round(H * 0.15)}px ${FONT}`;
      g.fillText(title, 40, H * 0.2, W - 80);
      g.font = `500 ${small}px ${FONT}`;
      g.fillStyle = '#f7e9e1';
      const lh = H * 0.115;
      const top = H * 0.42;
      const room = Math.max(1, Math.floor((H * 0.97 - top) / lh));
      const rows: { text: string; bullet: boolean }[] = [];
      for (const l of lines) {
        const clean = l.replace(/[`*_#]/g, '').trim();
        if (!clean) continue;
        wrap(clean, W - 120).forEach((text, i) => rows.push({ text, bullet: i === 0 }));
      }
      const shown = rows.slice(0, room);
      if (rows.length > room && shown.length) shown[shown.length - 1].text = shown[shown.length - 1].text.replace(/\s*\S*$/, ' …');
      shown.forEach((r, i) => g.fillText(r.bullet ? `• ${r.text}` : `  ${r.text}`, r.bullet ? 44 : 64, top + i * lh, W - 84));
      tex.needsUpdate = true;
    };
    draw('Dars jadvali', ['Har bir bo‘lim navbat bilan o‘qiydi', 'Boss tanlagan agentlar birinchi keladi', 'O‘rganilgan skillar agentning ishiga qo‘shiladi']);
    return { set: draw };
  }

  // ------------------------------------------------------------ day/night --
  setNight(t: number) {
    const bg = new THREE.Color('#cfe8f6').lerp(new THREE.Color('#0b1224'), t);
    this.scene.background = bg;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(bg);
    this.hemi.intensity = THREE.MathUtils.lerp(1.25, 0.5, t);
    this.hemi.color.set('#f4f7ff').lerp(new THREE.Color('#7d8fcf'), t);
    this.sun.intensity = THREE.MathUtils.lerp(1.9, 0.4, t);
    this.sun.color.set('#fff4e0').lerp(new THREE.Color('#9fb4ff'), t);
    this.campus.setNight(t);
    this.coreLight.intensity = THREE.MathUtils.lerp(0, 60, t);
  }

  update(dt: number, time: number, camera?: THREE.Camera, target?: THREE.Vector3) {
    if (camera && target) this.campus.update(dt, time, camera, target);
    for (const [i, left] of this.litBooks) {
      const next = left - dt;
      if (next > 0) {
        this.litBooks.set(i, next);
        continue;
      }
      this.litBooks.delete(i);
      const b = this.bookList[i];
      place(this.books, i, b.pos.x, b.pos.y, b.pos.z, b.heading, b.scale);
      this.books.setColorAt(i, b.color);
      this.books.instanceMatrix.needsUpdate = true;
      this.books.instanceColor!.needsUpdate = true;
    }
    this.core.update(dt, time);
  }
}

// ------------------------------------------------------------------- core --

/** Graphify core: the whole knowledge graph floating above the atrium. */
export class Core {
  readonly group = new THREE.Group();
  readonly holo = new THREE.Group();
  readonly points: THREE.Points;
  private colors: Float32Array;
  private base: Float32Array;
  private pulses = new Map<number, number>();
  readonly pedestal: THREE.Mesh;
  readonly radius = 5.2;

  constructor(readonly data: OfficeData) {
    const { nodes, edges } = data.graph;
    let max = 1;
    for (const n of nodes) max = Math.max(max, Math.hypot(...n.p));
    const k = this.radius / max;
    const pos = new Float32Array(nodes.length * 3);
    this.colors = new Float32Array(nodes.length * 3);
    const c = new THREE.Color();
    nodes.forEach((n, i) => {
      pos.set([n.p[0] * k, n.p[1] * k, n.p[2] * k], i * 3);
      const col = n.t === 'source' ? data.source.get(n.s!)?.color : data.dept.get(n.d!)?.color;
      c.set(col || '#ffffff');
      if (n.t === 'dept' || n.t === 'source') c.multiplyScalar(2.2);
      else if (n.t === 'agent') c.multiplyScalar(1.5);
      c.toArray(this.colors, i * 3);
    });
    this.base = this.colors.slice();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.16, vertexColors: true, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
    );
    const lp: number[] = [];
    const lc: number[] = [];
    for (const [a, b, rel] of edges) {
      if (rel === 'works_in' || rel === 'from_source') continue;
      lp.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
      lc.push(...this.base.subarray(a * 3, a * 3 + 3), ...this.base.subarray(b * 3, b * 3 + 3));
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lc.map((v) => v * 0.5), 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.holo.add(this.points, lines);
    this.holo.position.y = 7.2;
    this.group.add(this.holo);

    this.pedestal = new THREE.Mesh(
      merge([cyl(2.6, 2.9, 0.5, 40, { at: [0, 0.25, 0], color: '#2b3040' }), cyl(1.2, 1.6, 0.9, 24, { at: [0, 0.9, 0], color: '#3a4152' })]),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    this.pedestal.userData.core = true;
    this.group.add(this.pedestal);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.06, 8, 80).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2ec4b6').multiplyScalar(2.5) }));
    ring.position.y = 0.52;
    this.group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius * 0.35, 1.2, 5.4, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: '#2ec4b6', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 3.7;
    this.group.add(beam);
    const label = textSprite(
      [
        { text: '🕸️ Graphify Core', font: `800 40px ${FONT}`, color: '#0f5f58' },
        { text: `${nodes.length} tugun · ${edges.length} bog‘lanish`, font: `600 24px ${FONT}`, color: '#3b4252' },
      ],
      { bg: 'rgba(255,255,255,0.9)', border: '#2ec4b6', width: 520 },
    );
    label.scale.set(4.4, 4.4 / label.userData.aspect, 1);
    label.position.y = 13.4;
    this.group.add(label);
  }

  pulse(nodeIndex: number | undefined, seconds = 4) {
    if (nodeIndex === undefined) return;
    this.pulses.set(nodeIndex, seconds);
  }

  update(dt: number, time: number) {
    this.holo.rotation.y += dt * 0.06;
    this.holo.position.y = 7.2 + Math.sin(time * 0.6) * 0.15;
    if (!this.pulses.size) return;
    const attr = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (const [i, left] of this.pulses) {
      const next = left - dt;
      if (next <= 0) {
        this.pulses.delete(i);
        this.colors.set(this.base.subarray(i * 3, i * 3 + 3), i * 3);
      } else {
        this.pulses.set(i, next);
        const k = 3 + Math.sin(time * 10) * 1.5;
        this.colors.set([k, k, k * 0.8], i * 3);
      }
    }
    attr.needsUpdate = true;
  }
}

let _dot: THREE.Texture | null = null;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
