// Campus plan: a central plaza (reception + Graphify core) on a boulevard that
// runs east–west, Claude Academy behind the plaza, and thirteen department
// buildings along the boulevard (management, product, finance, engineering,
// languages, DevOps, AI lab, data, security, sales, media, design, office
// services), each holding the desks of the departments that work there. Everything is in
// metres; +z points towards the default camera ("south"). A character with
// heading h faces (sin h, cos h).
import type { Item } from '../data';

export type Pose = 'sit' | 'stand';

export interface Spot {
  x: number;
  z: number;
  heading: number;
  pose: Pose;
  zone: Zone | null;
  /** zone-local coordinates of the spot and of the aisle line it is reached from */
  u: number;
  v: number;
  lineV: number;
  /** z of the boulevard lane used to reach a plaza spot */
  lane: number;
  /** index of the monitor on this seat's desk, if any */
  screen?: number;
}

export interface DeskSlot {
  x: number;
  z: number;
  heading: number;
  seat: Spot;
  guest: Spot;
  /** department of the agent who sits here (colours the chair) */
  dept?: string;
}

export interface Shelf {
  x: number;
  z: number;
  heading: number;
  spot: Spot;
}

export type BuildingStyle = 'executive' | 'tech' | 'sales' | 'media' | 'finance' | 'services' | 'academy';

export interface BuildingDef {
  id: string;
  name: { uz: string; en: string };
  emoji: string;
  color: string;
  accent: string;
  style: BuildingStyle;
  /** storeys drawn on the outside (the office itself is the ground floor) */
  floors: number;
  quad: [1 | -1, 1 | -1];
  /** centred north of the plaza, facing it (the academy) */
  center?: boolean;
  /** free classroom seats for visiting students */
  studentSeats?: number;
  /** the AI hologram on the roof (tech style) */
  hologram?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  // North-east: running the company.
  { id: 'boshqaruv', name: { uz: 'Boshqaruv', en: 'Management' }, emoji: '🏛️', color: '#c9a227', accent: '#1f2a44', style: 'executive', floors: 7, quad: [1, -1] },
  { id: 'mahsulot', name: { uz: 'Mahsulot va loyihalar', en: 'Product & Projects' }, emoji: '🗺️', color: '#2bb3a3', accent: '#173a3a', style: 'executive', floors: 5, quad: [1, -1] },
  { id: 'moliya', name: { uz: 'Moliya', en: 'Finance' }, emoji: '💰', color: '#3f9b5a', accent: '#e9dcc0', style: 'finance', floors: 4, quad: [1, -1] },
  // North-west: building software.
  { id: 'muhandislik', name: { uz: 'Muhandislik markazi', en: 'Engineering Core' }, emoji: '🛠️', color: '#3d7bf2', accent: '#1b2436', style: 'tech', floors: 7, quad: [-1, -1] },
  { id: 'tillar', name: { uz: 'Dasturlash tillari', en: 'Languages & Build' }, emoji: '🧩', color: '#6c5ce7', accent: '#1d1838', style: 'tech', floors: 5, quad: [-1, -1] },
  { id: 'devops', name: { uz: 'DevOps va bulut', en: 'DevOps & Cloud' }, emoji: '☁️', color: '#0ea5e9', accent: '#0f2230', style: 'tech', floors: 4, quad: [-1, -1] },
  // South-west: AI, data and security.
  { id: 'ai', name: { uz: 'AI laboratoriyasi', en: 'AI & ML Lab' }, emoji: '🧠', color: '#a855f7', accent: '#1e1530', style: 'tech', floors: 6, quad: [-1, 1], hologram: true },
  { id: 'data', name: { uz: 'Maʼlumot va tadqiqot', en: 'Data & Research' }, emoji: '🔬', color: '#2f80ed', accent: '#e8eef8', style: 'finance', floors: 5, quad: [-1, 1] },
  { id: 'xavfsizlik', name: { uz: 'Xavfsizlik', en: 'Security' }, emoji: '🛡️', color: '#d64545', accent: '#25181b', style: 'executive', floors: 5, quad: [-1, 1] },
  // South-east: customers, media, design and the office's own services.
  { id: 'savdo', name: { uz: 'Savdo', en: 'Sales' }, emoji: '🤝', color: '#f08c2e', accent: '#2a2f38', style: 'sales', floors: 4, quad: [1, 1] },
  { id: 'media', name: { uz: 'Marketing va media', en: 'Marketing & Media' }, emoji: '📣', color: '#d45ad4', accent: '#231a2e', style: 'media', floors: 5, quad: [1, 1] },
  { id: 'frontend', name: { uz: 'Frontend va dizayn', en: 'Frontend & Design' }, emoji: '🎨', color: '#ff6b9a', accent: '#2a1822', style: 'media', floors: 4, quad: [1, 1] },
  { id: 'xizmat', name: { uz: 'Ofis xizmatlari', en: 'Office Services' }, emoji: '☕', color: '#1fa7a0', accent: '#f1e6d2', style: 'services', floors: 3, quad: [1, 1] },
  { id: 'akademiya', name: { uz: 'Claude Akademiyasi', en: 'Claude Academy' }, emoji: '🎓', color: '#d97757', accent: '#2b1d18', style: 'academy', floors: 4, quad: [1, -1], center: true, studentSeats: 24 },
];

/** Buildings where software is written (developers sit there). */
export const TECH_BUILDINGS = new Set(['muhandislik', 'tillar', 'devops', 'xavfsizlik']);

const BY_DEPT: Record<string, string> = {
  executive: 'boshqaruv', product: 'mahsulot',
  engineering: 'muhandislik', languages: 'tillar', frontend: 'frontend', devops: 'devops', security: 'xavfsizlik', ai: 'ai', data: 'data',
  marketing: 'media', creative: 'media',
  business: 'savdo',
  productivity: 'xizmat', academy: 'akademiya',
};
const FINANCE = /(cfo|financ|account|invoice|billing|tax|budget|cash|unit-econ|saas-metric|payment|bank|trading|ledger|payroll|finance)/i;
const SALES = /(sales|revenue|commercial|crm|prospect|outreach|lead-?gen|pipeline|deal|signal-scor|enrichment|mutual|demand-gen|cro-advisor|customer-success|pricing)/i;

/** Which building an agent, skill or command works in. */
export function buildingOf(it: Pick<Item, 'name' | 'dept'>): string {
  if (['business', 'executive', 'marketing', 'product'].includes(it.dept) && FINANCE.test(it.name)) return 'moliya';
  if (['business', 'executive', 'marketing'].includes(it.dept) && SALES.test(it.name)) return 'savdo';
  return BY_DEPT[it.dept] || 'xizmat';
}

export interface Zone {
  building: BuildingDef;
  /** desks without an agent: classroom seats for visiting students */
  studentSeats: DeskSlot[];
  /** departments working in this building, in desk order */
  depts: string[];
  agents: Item[];
  sx: 1 | -1;
  sz: 1 | -1;
  x0: number;
  W: number;
  D: number;
  cols: number;
  rows: number;
  desks: DeskSlot[];
  shelves: Shelf[];
  coffee: Spot;
  coffeeMachine: { x: number; z: number; heading: number };
  door: { x: number; z: number };
  lane: number;
  toWorld(u: number, v: number): [number, number];
  /** heading (radians) for facing a zone-local direction */
  face(du: number, dv: number): number;
}

export interface Layout {
  zones: Zone[];
  /** Claude Academy: the lecturer's place, the screen and the free student seats */
  academy: { zone: Zone; podium: Spot; screen: { x: number; y: number; z: number; heading: number; w: number; h: number }; seats: DeskSlot[] } | null;
  zoneByDept: Map<string, Zone>;
  zoneByBuilding: Map<string, Zone>;
  atriumRadius: number;
  core: { x: number; z: number; spots: Spot[] };
  reception: { desk: { x: number; z: number; heading: number }; lead: Spot; manager: Spot; boss: Spot };
  librarian: { desk: { x: number; z: number; heading: number }; seat: Spot };
  hotDesks: DeskSlot[];
  entrance: Spot;
  /** walkable points outdoors (plaza, boulevard) for staff who wander */
  outdoor: Spot[];
  staff: { guard: Spot; cleaners: Spot[] };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const SIDE_U = 1.0;
export const FRONT_V = 0.9;
const ROW0 = 4.4;
const ROW_PITCH = 3.4;
const COL0 = 2.6;
const COL_PITCH = 2.3;
/** distance from the boulevard centre line to a building's front wall */
export const Z0 = 7;
const X0 = 19;
const LANE = 4;
const GAP = 7;
/** distance from the boulevard to the academy's front (beyond the plaza) */
const ZA = 20;

export const headingOf = (dx: number, dz: number) => Math.atan2(dx, dz);
/** Every building gets at least a 5 x 3 desk floor, so small departments still have a proper office. */
const colsFor = (n: number) => Math.min(14, Math.max(5, Math.ceil(Math.sqrt(n * 1.6))));

function makeZone(building: BuildingDef, agents: Item[], x0: number, z0 = Z0): Zone {
  const [sx, sz]: [1 | -1, 1 | -1] = building.center ? [1, -1] : building.quad;
  const n = agents.length + (building.studentSeats || 0);
  const cols = colsFor(n);
  const rows = Math.max(3, Math.ceil(n / cols));
  const W = cols * COL_PITCH + 2.3;
  const vBack = ROW0 + (rows - 1) * ROW_PITCH + 1.6;
  const D = vBack + 1.4;
  const toWorld = (u: number, v: number): [number, number] => [sx * (x0 + u), sz * (z0 + v)];
  const face = (du: number, dv: number) => headingOf(sx * du, sz * dv);
  const lane = sz * LANE;
  const depts = [...new Set(agents.map((a) => a.dept))];
  const zone: Zone = {
    building, depts, agents, sx, sz, x0, W, D, cols, rows, desks: [], studentSeats: [], shelves: [], lane, toWorld, face,
    coffee: null as unknown as Spot,
    coffeeMachine: null as unknown as Zone['coffeeMachine'],
    door: { x: 0, z: 0 },
  };
  const spot = (u: number, v: number, lineV: number, heading: number, pose: Pose): Spot => {
    const [x, z] = toWorld(u, v);
    return { x, z, heading, pose, zone, u, v, lineV, lane };
  };
  for (let r = 0; r < rows; r++) {
    const vDesk = ROW0 + r * ROW_PITCH;
    const aisle = vDesk - 1.75;
    for (let c = 0; c < cols; c++) {
      const u = COL0 + c * COL_PITCH;
      const [x, z] = toWorld(u, vDesk);
      zone.desks.push({
        x, z, heading: face(0, 1),
        seat: spot(u, vDesk - 0.78, aisle, face(0, 1), 'sit'),
        guest: spot(u + 1.15, vDesk - 0.95, aisle, face(-1, 0.25), 'stand'),
        dept: agents[r * cols + c]?.dept,
      });
    }
  }
  zone.studentSeats = zone.desks.slice(agents.length);
  const units = Math.max(2, Math.floor((W - 2.4) / 1.9));
  for (let k = 0; k < units; k++) {
    const u = 1.9 + k * 1.9 + 0.9;
    const [x, z] = toWorld(u, vBack + 0.95);
    zone.shelves.push({ x, z, heading: face(0, -1), spot: spot(u, vBack, vBack, face(0, 1), 'stand') });
  }
  const [cx, cz] = toWorld(W - 0.55, 1.7);
  // Counter's local +x (machine front) faces back into the zone.
  zone.coffeeMachine = { x: cx, z: cz, heading: sx === 1 ? Math.PI : 0 };
  zone.coffee = spot(W - 1.45, 1.7, FRONT_V, face(1, 0), 'stand');
  const [dx, dz] = toWorld(SIDE_U, -0.8);
  zone.door = { x: dx, z: dz };
  return zone;
}

/** @param agentsByBuilding agents of each building, already in desk order */
export function buildLayout(agentsByBuilding: Map<string, Item[]>, deptOrder: string[]): Layout {
  const zones: Zone[] = [];
  const nextX = new Map<string, number>();
  for (const b of BUILDINGS) {
    const agents = [...(agentsByBuilding.get(b.id) || [])].sort((a, c) => deptOrder.indexOf(a.dept) - deptOrder.indexOf(c.dept));
    if (b.center) {
      // Centred behind the plaza: measure first, then place so it straddles x = 0.
      const probe = makeZone(b, agents, 0, ZA);
      zones.push(makeZone(b, agents, -probe.W / 2, ZA));
      continue;
    }
    const key = b.quad.join(',');
    const x0 = nextX.get(key) ?? X0;
    const z = makeZone(b, agents, x0);
    zones.push(z);
    nextX.set(key, x0 + z.W + GAP);
  }
  const zoneByDept = new Map<string, Zone>();
  for (const z of zones) for (const d of z.depts) if (!zoneByDept.has(d)) zoneByDept.set(d, z);

  const plazaSpot = (x: number, z: number, heading: number, pose: Pose, lane = z >= 0 ? LANE : -LANE): Spot => ({
    x, z, heading, pose, zone: null, u: 0, v: 0, lineV: 0, lane,
  });

  const coreSpots: Spot[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = Math.cos(a) * 4.6;
    const z = Math.sin(a) * 4.6;
    coreSpots.push(plazaSpot(x, z, headingOf(-x, -z), 'stand'));
  }

  const hotDesks: DeskSlot[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -5.75 + i * 2.3;
    hotDesks.push({
      x, z: -11.2, heading: 0,
      seat: plazaSpot(x, -11.98, 0, 'sit'),
      guest: plazaSpot(x + 1.15, -12.1, headingOf(-1, 0.25), 'stand'),
    });
  }

  let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
  for (const z of zones) {
    const [ax, az] = z.toWorld(-0.6, -1.5);
    const [bx, bz] = z.toWorld(z.W + 0.6, z.D + 0.6);
    minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx);
    minZ = Math.min(minZ, az, bz); maxZ = Math.max(maxZ, az, bz);
  }
  minZ = Math.min(minZ, -18); maxZ = Math.max(maxZ, 18);
  const entranceZ = maxZ + 4;

  // Where the cleaners and guards walk: along both lanes and around the plaza.
  const outdoor: Spot[] = [];
  for (let x = minX + 4; x <= maxX - 4; x += 9) for (const lane of [-LANE, LANE]) outdoor.push(plazaSpot(x, lane, x > 0 ? -Math.PI / 2 : Math.PI / 2, 'stand', lane));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 10;
    const z = Math.sin(a) * 10;
    if (Math.abs(z) > 5.5) outdoor.push(plazaSpot(x, z, headingOf(-x, -z), 'stand'));
  }

  const az = zones.find((z) => z.building.center) || null;
  let academy: Layout['academy'] = null;
  if (az) {
    const vBack = ROW0 + (az.rows - 1) * ROW_PITCH + 1.6;
    const [px, pz] = az.toWorld(az.W / 2, vBack);
    const [sx2, sz2] = az.toWorld(az.W / 2, az.D - 0.16);
    academy = {
      zone: az,
      podium: { x: px, z: pz, heading: az.face(0, -1), pose: 'stand', zone: az, u: az.W / 2, v: vBack, lineV: vBack, lane: az.lane },
      screen: { x: sx2, y: 3.35, z: sz2, heading: az.face(0, -1), w: Math.min(9, az.W - 4), h: 2.1 },
      seats: az.studentSeats,
    };
  }

  return {
    zones,
    academy,
    zoneByDept,
    zoneByBuilding: new Map(zones.map((z) => [z.building.id, z])),
    atriumRadius: 16,
    core: { x: 0, z: 0, spots: coreSpots },
    reception: {
      desk: { x: 0, z: 9.5, heading: 0 },
      lead: plazaSpot(0, 8.72, 0, 'sit'),
      manager: plazaSpot(-2.3, 8.72, 0, 'sit'),
      boss: plazaSpot(1.6, 11.2, Math.PI, 'stand'),
    },
    librarian: { desk: { x: 0, z: -7.4, heading: 0 }, seat: plazaSpot(0, -8.18, 0, 'sit') },
    hotDesks,
    entrance: plazaSpot(4.6, entranceZ, Math.PI, 'stand', LANE),
    outdoor,
    staff: {
      guard: plazaSpot(0.9, entranceZ - 1.1, 0, 'stand', LANE),
      cleaners: [plazaSpot(-12, LANE, Math.PI / 2, 'stand', LANE), plazaSpot(12, -LANE, -Math.PI / 2, 'stand', -LANE), plazaSpot(-26, -LANE, Math.PI / 2, 'stand', -LANE)],
    },
    bounds: { minX, maxX, minZ, maxZ },
  };
}

type P = [number, number];

/** Waypoints (world x,z) from one spot to another along aisles and lanes. */
export function route(a: Spot, b: Spot): P[] {
  const pts: P[] = [];
  if (a.zone && a.zone === b.zone) {
    const z = a.zone;
    pts.push(z.toWorld(a.u, a.lineV));
    if (Math.abs(a.lineV - b.lineV) > 0.01) {
      pts.push(z.toWorld(SIDE_U, a.lineV), z.toWorld(SIDE_U, b.lineV));
    }
    pts.push(z.toWorld(b.u, b.lineV), [b.x, b.z]);
    return pts;
  }
  let laneA: number, xA: number;
  if (a.zone) {
    const z = a.zone;
    pts.push(z.toWorld(a.u, a.lineV), z.toWorld(SIDE_U, a.lineV), [z.door.x, z.door.z]);
    laneA = z.lane;
    xA = z.door.x;
  } else {
    laneA = a.lane;
    xA = a.x;
  }
  pts.push([xA, laneA]);
  const laneB = b.zone ? b.zone.lane : b.lane;
  const xB = b.zone ? b.zone.door.x : b.x;
  if (laneA !== laneB) {
    // Cross the boulevard away from the core fountain.
    const xc = Math.abs(xB) < 7 ? (xB >= 0 ? 7.5 : -7.5) : xB;
    pts.push([xc, laneA], [xc, laneB]);
  }
  pts.push([xB, laneB]);
  if (b.zone) {
    const z = b.zone;
    pts.push([z.door.x, z.door.z], z.toWorld(SIDE_U, b.lineV), z.toWorld(b.u, b.lineV));
  }
  pts.push([b.x, b.z]);
  // Drop zero-length hops.
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.02);
}
