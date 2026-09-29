// Floor plan: a central atrium (reception + Graphify core) on a boulevard that
// runs east–west, with one department zone per department packed into the
// four quadrants. Everything is in metres; +z points towards the default
// camera ("south"). A character with heading h faces (sin h, cos h).
import type { Department, Item } from '../data';

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
  /** z of the boulevard lane used to reach an atrium spot */
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
}

export interface Shelf {
  x: number;
  z: number;
  heading: number;
  spot: Spot;
}

export interface Zone {
  dept: Department;
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
  zoneByDept: Map<string, Zone>;
  atriumRadius: number;
  core: { x: number; z: number; spots: Spot[] };
  reception: { desk: { x: number; z: number; heading: number }; lead: Spot; manager: Spot; boss: Spot };
  librarian: { desk: { x: number; z: number; heading: number }; seat: Spot };
  hotDesks: DeskSlot[];
  entrance: Spot;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const SIDE_U = 1.0;
export const FRONT_V = 0.9;
const ROW0 = 4.4;
const ROW_PITCH = 3.4;
const COL0 = 2.6;
const COL_PITCH = 2.3;
const Z0 = 6;
const X0 = 17;
const LANE = 4;
const GAP = 1.2;

export const headingOf = (dx: number, dz: number) => Math.atan2(dx, dz);

function makeZone(dept: Department, n: number, sx: 1 | -1, sz: 1 | -1, x0: number): Zone {
  const cols = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(n * 1.6))));
  const rows = Math.max(2, Math.ceil(n / cols));
  const W = cols * COL_PITCH + 2.3;
  const vBack = ROW0 + (rows - 1) * ROW_PITCH + 1.6;
  const D = vBack + 1.4;
  const toWorld = (u: number, v: number): [number, number] => [sx * (x0 + u), sz * (Z0 + v)];
  const face = (du: number, dv: number) => headingOf(sx * du, sz * dv);
  const lane = sz * LANE;
  const zone: Zone = {
    dept, sx, sz, x0, W, D, cols, rows, desks: [], shelves: [], lane, toWorld, face,
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
      });
    }
  }
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

export function buildLayout(departments: Department[], agentsByDept: Map<string, Item[]>): Layout {
  const quads: { sx: 1 | -1; sz: 1 | -1; width: number; depts: Department[] }[] = [
    { sx: 1, sz: -1, width: 0, depts: [] },
    { sx: -1, sz: -1, width: 0, depts: [] },
    { sx: 1, sz: 1, width: 0, depts: [] },
    { sx: -1, sz: 1, width: 0, depts: [] },
  ];
  const widthOf = (d: Department) => {
    const n = agentsByDept.get(d.id)?.length || 0;
    return Math.min(8, Math.max(3, Math.ceil(Math.sqrt(n * 1.6)))) * COL_PITCH + 2.3 + GAP;
  };
  // Greedy balance by width; keep the original department order inside a quadrant.
  const order = [...departments].sort((a, b) => widthOf(b) - widthOf(a));
  for (const d of order) {
    const q = quads.reduce((m, q) => (q.width < m.width ? q : m));
    q.depts.push(d);
    q.width += widthOf(d);
  }
  const zones: Zone[] = [];
  for (const q of quads) {
    q.depts.sort((a, b) => departments.indexOf(a) - departments.indexOf(b));
    let x0 = X0;
    for (const d of q.depts) {
      const z = makeZone(d, agentsByDept.get(d.id)?.length || 0, q.sx, q.sz, x0);
      zones.push(z);
      x0 += z.W + GAP;
    }
  }

  const atriumSpot = (x: number, z: number, heading: number, pose: Pose, lane = z >= 0 ? LANE : -LANE): Spot => ({
    x, z, heading, pose, zone: null, u: 0, v: 0, lineV: 0, lane,
  });

  const coreSpots: Spot[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = Math.cos(a) * 3.7;
    const z = Math.sin(a) * 3.7;
    coreSpots.push(atriumSpot(x, z, headingOf(-x, -z), 'stand'));
  }

  const hotDesks: DeskSlot[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -5.75 + i * 2.3;
    hotDesks.push({
      x, z: -11.2, heading: 0,
      seat: atriumSpot(x, -11.98, 0, 'sit'),
      guest: atriumSpot(x + 1.15, -12.1, headingOf(-1, 0.25), 'stand'),
    });
  }

  let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
  for (const z of zones) {
    const [ax, az] = z.toWorld(-0.3, -0.5);
    const [bx, bz] = z.toWorld(z.W + 0.3, z.D + 0.3);
    minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx);
    minZ = Math.min(minZ, az, bz); maxZ = Math.max(maxZ, az, bz);
  }
  minZ = Math.min(minZ, -16); maxZ = Math.max(maxZ, 16);
  const entranceZ = maxZ + 0.5;

  return {
    zones,
    zoneByDept: new Map(zones.map((z) => [z.dept.id, z])),
    atriumRadius: 15,
    core: { x: 0, z: 0, spots: coreSpots },
    reception: {
      desk: { x: 0, z: 9.5, heading: 0 },
      lead: atriumSpot(0, 8.72, 0, 'sit'),
      manager: atriumSpot(-2.3, 8.72, 0, 'sit'),
      boss: atriumSpot(1.6, 11.2, Math.PI, 'stand'),
    },
    librarian: { desk: { x: 0, z: -7.4, heading: 0 }, seat: atriumSpot(0, -8.18, 0, 'sit') },
    hotDesks,
    entrance: atriumSpot(4.6, entranceZ, Math.PI, 'stand', LANE),
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
    // Cross the boulevard away from the core pedestal.
    const xc = Math.abs(xB) < 5 ? (xB >= 0 ? 5.5 : -5.5) : xB;
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
