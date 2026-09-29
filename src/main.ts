import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './styles.css';
import { loadData, type Item } from './data';
import { t } from './i18n';
import { Connection } from './live/connection';
import { Router } from './router';
import { Cast, type Actor } from './sim/actors';
import { Director } from './sim/director';
import { TaskManager } from './tasks';
import { GraphView } from './ui/graphView';
import { Hud } from './ui/hud';
import { Fx } from './world/fx';
import { Labels, type LabelRequest } from './world/labels';
import { buildLayout } from './world/layout';
import { Office } from './world/office';

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const speed = Math.max(0.1, Math.min(20, Number(params.get('speed')) || 1));

async function main() {
  const loading = document.getElementById('loading')!;
  loading.querySelector('p')!.textContent = t().loading;
  const data = await loadData();

  // ---------------------------------------------------------------- scene --
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.25 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#cfe8f6', 220, 700);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 1200);
  camera.position.set(0, 120, 170);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 4;
  controls.maxDistance = 260;
  controls.target.set(0, 0, 0);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels-layer';
  document.getElementById('app')!.insertBefore(labelRenderer.domElement, document.getElementById('hud'));

  const agentsByDept = new Map<string, Item[]>();
  for (const it of data.registry.items) {
    if (it.type !== 'agent') continue;
    if (!agentsByDept.has(it.dept)) agentsByDept.set(it.dept, []);
    agentsByDept.get(it.dept)!.push(it);
  }
  const layout = buildLayout(data.registry.departments, agentsByDept);
  const office = new Office(scene, layout, data);
  // Simulation time: real time scaled by ?speed=, paused when the tab is hidden.
  const timer = new THREE.Timer();
  timer.connect(document);
  let simTime = 0;
  const now = () => simTime;
  const cast = new Cast(data, layout, office, now);
  scene.add(cast.crowd.group);
  const fx = new Fx();
  scene.add(fx.group);
  const labels = new Labels(coarse ? 12 : 22);
  scene.add(labels.group);
  const director = new Director(data, layout, cast, office, fx, now);
  const router = new Router(data);
  const conn = new Connection();
  const tasks = new TaskManager(data, cast, director, conn);
  const graph = new GraphView(data, canvas);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Threshold 1.0: only HDR-bright things (screens, core, arcs) glow; signs and walls never do.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const useBloom = !coarse && !params.has('nobloom');

  // ---------------------------------------------------------- day/night ---
  let night = 0;
  let nightTarget = 0;
  try {
    nightTarget = night = localStorage.getItem('office.night') === '1' ? 1 : 0;
  } catch {
    /* storage unavailable */
  }
  if (params.has('night')) nightTarget = night = 1;
  office.setNight(night);

  // ------------------------------------------------------------- camera ---
  let tween: { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; k: number; dur: number } | null = null;
  const flyTo = (target: THREE.Vector3, distance: number, dur = 1.3, elevation = 0.62) => {
    const dir = camera.position.clone().sub(controls.target).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(Math.cos(elevation) * distance).setY(Math.sin(elevation) * distance);
    tween = { p0: camera.position.clone(), p1: target.clone().add(dir), t0: controls.target.clone(), t1: target.clone(), k: 0, dur };
  };
  const overview = () => {
    following = null;
    tween = { p0: camera.position.clone(), p1: new THREE.Vector3(0, 88, 112), t0: controls.target.clone(), t1: new THREE.Vector3(0, 0, 4), k: 0, dur: 1.4 };
  };
  let following: Actor | null = null;

  // ---------------------------------------------------------- selection ---
  let selectedActor: Actor | null = null;
  let hoveredActor: Actor | null = null;
  let graphMode = false;

  const focusActor = (a: Actor) => {
    flyTo(new THREE.Vector3(a.body.x, 1, a.body.z), 13);
  };
  const selectActor = (a: Actor | null) => {
    selectedActor = a;
    hud.inspect(a?.item || null, a);
    if (!a) following = null;
  };
  const selectItem = (id: string, fly = true) => {
    if (!id) {
      selectedActor = null;
      following = null;
      hud.inspect(null);
      if (graphMode) graph.select(null, false);
      return;
    }
    const item = data.byId.get(id);
    if (!item) return;
    const a = cast.byItem.get(id) || null;
    selectedActor = a;
    hud.inspect(item, a);
    if (graphMode) {
      graph.select(id, fly);
      return;
    }
    if (!fly) return;
    if (a) focusActor(a);
    else {
      const bi = office.bookOf.get(id);
      if (bi !== undefined) {
        const b = office.bookList[bi];
        office.lightBook(bi, 8);
        fx.glow(b.out, data.source.get(item.source)?.color || '#fff', 6, 1.4);
        office.core.pulse(data.nodeIndex.get(id), 6);
        flyTo(b.out.clone(), 7, 1.3, 0.35);
      }
    }
  };
  const focusDept = (id: string) => {
    const z = layout.zoneByDept.get(id);
    if (!z) return;
    const [x, zz] = z.toWorld(z.W / 2, z.D / 2);
    if (graphMode) setGraph(false);
    flyTo(new THREE.Vector3(x, 0, zz), Math.max(z.W, z.D) * 1.35);
  };
  const setGraph = (on: boolean) => {
    graphMode = on;
    controls.enabled = !on;
    graph.setActive(on);
    labelRenderer.domElement.style.display = on ? 'none' : '';
    if (on) graph.select(selectedActor?.item?.id || null, !!selectedActor);
    hud.setGraphMode(on);
  };

  const hud = new Hud(data, cast, director, router, conn, tasks, graph, {
    selectItem,
    selectActor,
    focusDept,
    focusActor,
    toggleGraph: () => setGraph(!graphMode),
    isGraph: () => graphMode,
    toggleNight: () => {
      nightTarget = nightTarget ? 0 : 1;
      try {
        localStorage.setItem('office.night', nightTarget ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return !!nightTarget;
    },
    isNight: () => nightTarget === 1,
    overview,
    setFollow: (on) => (following = on ? selectedActor : null),
  });
  graph.onSelect = (id) => selectItem(id, false);

  conn.onEvent((e) => director.handleLive(e));
  if (!params.has('offline')) conn.start();
  director.warmStart(coarse ? 14 : 28);
  director.log({ kind: 'system', icon: '🏢', text: `${data.registry.counts.agent} agents · ${data.registry.counts.skill} skills · ${data.registry.counts.command} commands` });

  // ------------------------------------------------------------ picking ---
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const setRay = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY };
    tween = null;
  });
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) return;
    down = null;
    if (graphMode) return graph.click(ev);
    setRay(ev);
    const i = cast.crowd.pick(ray);
    if (i >= 0) {
      const a = cast.actors[i];
      if (a.item) selectItem(a.item.id, false);
      else selectActor(a);
      return;
    }
    const hits = ray.intersectObjects([office.books, office.core.pedestal, office.core.points, ...office.group.children.filter((o) => o instanceof THREE.Sprite && o.userData.dept)], false);
    const hit = hits[0];
    if (!hit) return;
    if (hit.object === office.books && hit.instanceId !== undefined) {
      const b = office.bookList[hit.instanceId];
      selectItem(b.item.id, false);
      office.lightBook(hit.instanceId, 5);
    } else if (hit.object.userData.dept) {
      focusDept(hit.object.userData.dept);
    } else {
      setGraph(true);
    }
  });
  let lastMove = 0;
  canvas.addEventListener('pointermove', (ev) => {
    const tnow = performance.now();
    if (tnow - lastMove < 50) return;
    lastMove = tnow;
    if (graphMode) return graph.pointerMove(ev);
    setRay(ev);
    const i = cast.crowd.pick(ray);
    hoveredActor = i >= 0 ? cast.actors[i] : null;
    canvas.style.cursor = hoveredActor ? 'pointer' : '';
  });

  // ------------------------------------------------------------- resize ---
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    graph.resize(w, h);
  };
  addEventListener('resize', resize);
  resize();

  // --------------------------------------------------------------- loop ---
  const reqs: LabelRequest[] = [];
  let inspectorTimer = 0;
  // Intro fly-in.
  tween = { p0: camera.position.clone(), p1: new THREE.Vector3(18, 34, 58), t0: new THREE.Vector3(), t1: new THREE.Vector3(0, 1, 2), k: 0, dur: 3.2 };
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 900);

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(0.1, timer.getDelta()) * speed;
    simTime += dt;
    const time = simTime;

    if (Math.abs(night - nightTarget) > 0.001) {
      night += Math.sign(nightTarget - night) * Math.min(Math.abs(nightTarget - night), dt / 1.5);
      office.setNight(night);
      bloom.strength = 0.55 + night * 0.5;
    }

    if (graphMode) {
      graph.update(dt);
      renderer.render(graph.scene, graph.camera);
      return;
    }

    director.update(dt);
    cast.update(dt, time);
    office.update(dt, time, camera);
    fx.update(dt, time);

    if (tween) {
      tween.k = Math.min(1, tween.k + dt / tween.dur);
      const e = tween.k < 0.5 ? 4 * tween.k ** 3 : 1 - (-2 * tween.k + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (tween.k >= 1) tween = null;
    } else if (following) {
      const p = new THREE.Vector3(following.body.x, 1, following.body.z);
      const d = p.sub(controls.target).multiplyScalar(Math.min(1, dt * 4));
      controls.target.add(d);
      camera.position.add(d);
    }
    controls.update(dt);

    // Selection rings.
    const sel = selectedActor;
    fx.ring.visible = !!sel && sel.body.visible;
    if (sel) fx.ring.position.set(sel.body.x, 0.04, sel.body.z);
    fx.hoverRing.visible = !!hoveredActor && hoveredActor !== sel;
    if (hoveredActor) fx.hoverRing.position.set(hoveredActor.body.x, 0.035, hoveredActor.body.z);

    // Labels.
    reqs.length = 0;
    for (const a of cast.actors) {
      if (!a.body.visible) continue;
      const y = a.body.pose === 'sit' ? 2.05 : 2.4;
      const isSel = a === sel;
      const dept = a.item ? data.dept.get(a.item.dept) : undefined;
      if (isSel) reqs.push({ key: a.idx, x: a.body.x, y, z: a.body.z, text: a.item?.name || (a.kind === 'lead' ? 'Claude' : a.kind === 'boss' ? t().you : a.name), sub: a.bubble || (dept ? `${dept.emoji} ${dept.name}` : undefined), kind: 'selected', color: a.color });
      else if (a.bubble) reqs.push({ key: a.idx, x: a.body.x, y, z: a.body.z, text: a.bubble, sub: a.item?.name || a.name, kind: a.live ? 'live' : 'bubble', color: a.color });
      else if (a === hoveredActor || a.kind === 'lead' || a.kind === 'boss' || a.kind === 'visitor') reqs.push({ key: a.idx, x: a.body.x, y, z: a.body.z, text: a.item?.name || (a.kind === 'lead' ? 'Claude' : a.kind === 'boss' ? t().you : a.name), kind: 'name', color: a.color });
    }
    labels.update(reqs, camera);

    inspectorTimer -= dt;
    if (inspectorTimer <= 0 && sel) {
      inspectorTimer = 1;
      hud.refreshInspector();
    }

    if (useBloom) composer.render(dt);
    else renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  // Handy for debugging from the console.
  Object.assign(window, {
    office: { data, layout, cast, director, tasks, conn, camera, controls, selectItem, focusDept, setGraph, overview, lookAt: (x: number, z: number, d = 30) => flyTo(new THREE.Vector3(x, 0, z), d, 0.05) },
  });
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.querySelector('p')!.textContent = `⚠️ ${err?.message || err}`;
});
