// Small helpers to build merged, vertex-coloured low-poly geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PartOpts {
  at?: [number, number, number];
  rot?: [number, number, number];
  color?: THREE.ColorRepresentation;
}

export function part(geo: THREE.BufferGeometry, { at = [0, 0, 0], rot = [0, 0, 0], color = '#ffffff' }: PartOpts = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]).translate(...at);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export const box = (w: number, h: number, d: number, opts?: PartOpts) => part(new THREE.BoxGeometry(w, h, d), opts);
export const cyl = (rt: number, rb: number, h: number, seg: number, opts?: PartOpts) =>
  part(new THREE.CylinderGeometry(rt, rb, h, seg), opts);

export function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

/** Instanced mesh with a big static bounding sphere so moving instances never get culled or missed by raycasts. */
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, radius = 400) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  m.count = count;
  m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  m.frustumCulled = false;
  return m;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, heading = 0, scale: number | [number, number, number] = 1) {
  _p.set(x, y, z);
  _q.setFromEuler(_e.set(0, heading, 0));
  if (Array.isArray(scale)) _s.set(...scale);
  else _s.setScalar(scale);
  mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}

export function textSprite(lines: { text: string; font: string; color: string }[], opts: { bg?: string; border?: string; width?: number; padding?: number } = {}) {
  const scale = 2;
  const width = (opts.width ?? 512) * scale;
  const pad = (opts.padding ?? 22) * scale;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const heights = lines.map((l) => parseInt(/(\d+)px/.exec(l.font)?.[1] || '24', 10) * scale * 1.3);
  const height = Math.ceil(heights.reduce((a, b) => a + b, 0) + pad * 2);
  canvas.width = width;
  canvas.height = height;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    roundRect(ctx, 0, 0, width, height, 28 * scale);
    ctx.fill();
    if (opts.border) {
      ctx.lineWidth = 6 * scale;
      ctx.strokeStyle = opts.border;
      roundRect(ctx, 3 * scale, 3 * scale, width - 6 * scale, height - 6 * scale, 26 * scale);
      ctx.stroke();
    }
  }
  let y = pad;
  lines.forEach((l, i) => {
    ctx.font = l.font.replace(/(\d+)px/, (_, n) => `${parseInt(n, 10) * scale}px`);
    ctx.fillStyle = l.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(l.text, width / 2, y, width - pad * 2);
    y += heights[i];
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.9, 0.9, 0.9), transparent: true, depthWrite: false }));
  sprite.userData.aspect = width / height;
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const FONT = '"Inter", "Segoe UI", system-ui, sans-serif';
