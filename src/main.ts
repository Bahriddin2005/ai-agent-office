import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './styles.css';
import './ui.css';
import { loadData, type Item } from './data';
import { currentLang, t } from './i18n';
import { Connection } from './live/connection';
import { Router } from './router';
import { Cast, type Actor } from './sim/actors';
import { Director } from './sim/director';
import { Academy } from './sim/academy';
import { BossAI } from './sim/boss';
import { makeExam, makeTeacher } from './ai/exam';
import { Crews, type Bench, type Step, type Team } from './ai/crews';
import { pickEngine, type Engine } from './ai/engine';
import { GraphView } from './ui/graphView';
import { Hud } from './ui/hud';
import { ResultsView } from './ui/results';
import { Fx } from './world/fx';
import { Labels, type LabelRequest } from './world/labels';
import { BUILDINGS, buildLayout, buildingOf } from './world/layout';
import { Office } from './world/office';

const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const speed = Math.max(0.1, Math.min(20, Number(params.get('speed')) || 1));

async function main() {
  const loading = document.getElementById('loading')!;
  loading.querySelector('p')!.textContent = t().loading;
  const [data, teamsFile, benchFile, prompts] = await Promise.all([
    loadData(),
    fetch('data/teams.json').then((r) => r.json() as Promise<{ teams: Team[] }>),
    fetch('data/benchmarks.json').then((r) => (r.ok ? (r.json() as Promise<{ results: Bench[] }>) : { results: [] })).catch(() => ({ results: [] as Bench[] })),
    fetch('data/prompts.json').then((r) => r.json() as Promise<Record<string, string>>),
  ]);

  // ---------------------------------------------------------------- scene --
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.25 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#cfe8f6', 220, 700);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1200);
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

  // Two agents work in the plaza (reception, library); everyone else has a desk in their building.
  const RESIDENTS = new Set(['agent:claude-office:office-manager', 'agent:graphify:graphify-librarian']);
  const agentsByBuilding = new Map<string, Item[]>(BUILDINGS.map((b) => [b.id, []]));
  for (const it of data.registry.items) {
    if (it.type === 'agent' && !RESIDENTS.has(it.id)) agentsByBuilding.get(buildingOf(it))!.push(it);
  }
  const layout = buildLayout(agentsByBuilding, data.registry.departments.map((d) => d.id));
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
  const graph = new GraphView(data, canvas);

  // ------------------------------------------------------------ agents AI --
  // Real answers come from the office server (Claude CLI) or, inside
  // claude.ai, from the viewer's own Claude; re-picked when the server
  // connects or drops.
  let engine: Engine | null = null;
  let picking: Promise<Engine> | null = null;
  const refreshEngine = () =>
    (picking = pickEngine(conn).then((e) => {
      engine = e;
      hud?.renderEngine();
      return e;
    }));
  const getEngine = async () => {
    const wantServer = conn.status === 'live' && !!conn.health?.claude;
    if (engine && (engine.kind === 'server') === wantServer) return engine;
    return picking && !engine ? picking : refreshEngine();
  };
  const stepControls = new Map<Step, ReturnType<Director['beginTask']>>();
  const pendingState = new Map<string, string>();
  let resultsTick = 0;
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const crews: Crews = new Crews(data, teamsFile.teams, benchFile.results, prompts, router, getEngine, {
    stepStart(run, step) {
      const a = cast.byItem.get(step.agentId);
      if (!a) return;
      if (run.kind === 'chat') {
        a.plan([{ act: 'think', dur: 30 }], true);
        return;
      }
      stepControls.set(step, director.beginTask(a, step.label[currentLang()]));
      director.log({ kind: 'task', icon: '⏳', text: `${a.name}: ${step.label[currentLang()]}`, actor: a, itemId: a.item?.id });
    },
    stepEnd(run, step, next) {
      const a = cast.byItem.get(step.agentId);
      if (run.kind === 'chat') {
        a?.plan([{ act: 'talk', dur: 6 }], true);
        return;
      }
      stepControls.get(step)?.finish(step.status !== 'error');
      stepControls.delete(step);
      const b = next && cast.byItem.get(next.agentId);
      if (a && b && a !== b) fx.arc(a.worldPos(1.4), new THREE.Vector3(b.home.x, 1.4, b.home.z), run.kind === 'website' ? '#4f86f7' : '#ff7a45', 3.5);
    },
    message(msg) {
      hud.onMessage();
      if (msg.from === 'user') cast.boss.say(`🗣️ ${clip(msg.text, 60)}`, 7);
      else if (msg.from !== 'system') cast.byItem.get(msg.from)?.say(`💬 ${clip(msg.text, 90)}`, 10);
    },
    changed(run) {
      hud.renderRunsSoon();
      if (!run) return;
      if (!resultsTick) resultsTick = requestAnimationFrame(() => {
        resultsTick = 0;
        results.refresh(run);
      });
      const pendingNow = run.pending?.kind || '';
      if ((pendingState.get(run.id) || '') !== pendingNow) {
        pendingState.set(run.id, pendingNow);
        hud.renderChat();
      }
    },
    preview(run) {
      results.open(run, 'preview');
      hud.toast(currentLang() === 'uz' ? '👀 Birinchi versiya tayyor — ochildi. Test davom etmoqda.' : '👀 First version ready and open. Testing continues.', 6000);
    },
    ask(run) {
      hud.focusChat();
      hud.toast(run.pending?.kind === 'approval' ? (currentLang() === 'uz' ? '📋 Reja tayyor — chatda tasdiqlang' : '📋 Plan ready — approve it in the chat') : currentLang() === 'uz' ? '❓ Agentlar sizga savol berdi — chatda javob bering' : '❓ The agents have questions — answer in the chat', 7000);
    },
    done(run) {
      hud.renderRuns();
      if (run.status === 'done' && run.result) {
        if (results.openRun === run) results.refresh(run);
        else results.open(run);
        hud.toast(`✅ ${currentLang() === 'uz' ? 'Tayyor' : 'Ready'}: ${run.title}`, 8000, { label: currentLang() === 'uz' ? 'Ochish' : 'Open', fn: () => results.open(run) });
      } else if (run.status === 'error') {
        hud.toast(`⚠️ ${run.error || 'error'}`, 9000, { label: currentLang() === 'uz' ? '🔁 Qayta urinish' : '🔁 Retry', fn: () => crews.retry(run.id) });
      }
    },
    async saveWorkspace(id, files) {
      if (engine?.kind !== 'server') return null;
      const r = await conn.saveWorkspace(id, files);
      return { url: r.url, dir: r.dir };
    },
  });

  // Files for the viewer: the claude.ai download prompt when framed there, a plain download otherwise.
  const save = async (filename: string, body: Blob | string) => {
    const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    const dl = c?.use ? ((await c.use('downloads').catch(() => null)) as { save(r: { filename: string; data: Blob | string }): Promise<unknown> } | null) : null;
    if (dl) {
      try {
        await dl.save({ filename, data: body });
        return true;
      } catch (e) {
        hud.toast(`⚠️ ${(e as { code?: string }).code || 'download failed'}`, 5000);
        return false;
      }
    }
    const url = URL.createObjectURL(typeof body === 'string' ? new Blob([body], { type: 'text/plain;charset=utf-8' }) : body);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  };
  const results = new ResultsView(data, crews, save, (id) => selectItem(id, true));

  // Claude Academy and the Boss's inspections.
  const deptName = (id: string) => {
    const d = data.dept.get(id);
    return d ? `${d.name} (${d.uz})` : id;
  };
  const academy = new Academy(data, layout, cast, office, director, fx, now, makeTeacher(crews, getEngine, deptName));
  crews.knowledge = (id) => academy.knowledge(id);
  const boss = new BossAI(data, layout, cast, academy, director, crews, now, makeExam(crews, getEngine));
  const keys = new Set<string>();
  const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
  const typing = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!boss.control || typing() || !MOVE_KEYS.has(k)) return;
    keys.add(k);
    if (k.startsWith('arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  const setBossControl = (on: boolean) => {
    boss.setControl(on);
    following = on ? cast.boss : following === cast.boss ? null : following;
    if (on) flyTo(new THREE.Vector3(cast.boss.body.x, 1, cast.boss.body.z), 16, 1.0, 0.7);
    hud.renderTopButtons();
    hud.refreshBoss();
  };
  document.getElementById('hud')!.after(results.el);

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
  // Whole campus in view: pull back further on narrow (portrait) screens.
  const overviewPose = () => {
    const k = Math.max(1, 1.25 / Math.max(0.5, camera.aspect));
    return { pos: new THREE.Vector3(0, 58 * k, 80 * k), target: new THREE.Vector3(0, 0, -3) };
  };
  const overview = () => {
    following = null;
    const o = overviewPose();
    tween = { p0: camera.position.clone(), p1: o.pos, t0: controls.target.clone(), t1: o.target, k: 0, dur: 1.4 };
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
    const desks = z.desks.filter((d) => d.dept === id);
    if (graphMode) setGraph(false);
    if (!desks.length) return focusBuilding(z.building.id);
    const x = desks.reduce((s, d) => s + d.x, 0) / desks.length;
    const zz = desks.reduce((s, d) => s + d.z, 0) / desks.length;
    flyTo(new THREE.Vector3(x, 0, zz), THREE.MathUtils.clamp(Math.sqrt(desks.length) * 4 + 8, 14, 40));
  };
  const focusBuilding = (id: string) => {
    const z = layout.zoneByBuilding.get(id);
    if (!z) return;
    const [x, zz] = z.toWorld(z.W / 2, z.D / 2);
    if (graphMode) setGraph(false);
    flyTo(new THREE.Vector3(x, 0, zz), Math.min(46, Math.max(z.W, z.D) * 1.3 + 6));
  };
  const setGraph = (on: boolean) => {
    graphMode = on;
    controls.enabled = !on;
    graph.setActive(on);
    labelRenderer.domElement.style.display = on ? 'none' : '';
    if (on) graph.select(selectedActor?.item?.id || null, !!selectedActor);
    hud.setGraphMode(on);
  };

  const hud: Hud = new Hud(data, cast, director, crews, conn, graph, {
    selectItem,
    selectActor,
    focusDept,
    focusBuilding,
    focusActor,
    toggleXray: () => (office.campus.xray = !office.campus.xray),
    isXray: () => office.campus.xray,
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
    openRun: (run) => results.open(run),
    highlight: (ids, color) => {
      for (const id of ids) {
        const a = cast.byItem.get(id);
        if (a) fx.glow(a.worldPos(2.9), color, 6, 1.6);
      }
      overview();
    },
    engine: () => engine,
    boss: () => boss,
    academy: () => academy,
    setBossControl,
    inspect: (id, real) => {
      const a = cast.byItem.get(id);
      if (!a) return;
      boss.inspect(a, real);
      following = cast.boss;
    },
  });
  graph.onSelect = (id) => selectItem(id, false);
  boss.onChange(() => hud.refreshBoss());
  academy.onChange(() => hud.refreshAcademy());
  // Earlier runs and chat from this browser (a reload loses nothing).
  crews.load();
  if (crews.runs.length) {
    hud.renderRuns();
    hud.renderChat();
  }

  conn.onEvent((e) => director.handleLive(e));
  conn.onStatus((s) => {
    if (s !== 'connecting') void refreshEngine();
  });
  // Static builds (GitHub Pages, previews) have no office server: stay in simulation mode.
  if (!params.has('offline') && !import.meta.env.VITE_OFFLINE) conn.start();
  void refreshEngine();
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
    if (boss.control) {
      // You are the Boss: click an agent to check their work, or the ground to walk there.
      if (i >= 0 && cast.actors[i].item) {
        const a = cast.actors[i];
        boss.inspect(a, false);
        selectItem(a.item!.id, false);
        return;
      }
      const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (p) {
        cast.walkTo(cast.boss, p.x, p.z);
        boss.status = currentLang() === 'uz' ? 'Siz ko‘rsatgan joyga ketmoqda' : 'Walking where you clicked';
        fx.glow(new THREE.Vector3(p.x, 0.3, p.z), '#ffd166', 1.2, 0.8);
        hud.refreshBoss();
      }
      return;
    }
    if (i >= 0) {
      const a = cast.actors[i];
      if (a.item) selectItem(a.item.id, false);
      else selectActor(a);
      return;
    }
    const hits = ray.intersectObjects([office.books, office.core.pedestal, office.core.points, ...office.campus.pickables.filter((o) => o.visible)], false);
    const hit = hits[0];
    if (!hit) return;
    if (hit.object === office.books && hit.instanceId !== undefined) {
      const b = office.bookList[hit.instanceId];
      selectItem(b.item.id, false);
      office.lightBook(hit.instanceId, 5);
    } else if (hit.object.userData.dept) {
      focusDept(hit.object.userData.dept);
    } else if (hit.object.userData.building) {
      focusBuilding(hit.object.userData.building);
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
  // Intro fly-in to the whole campus.
  const intro = overviewPose();
  tween = { p0: camera.position.clone(), p1: intro.pos, t0: new THREE.Vector3(), t1: intro.target, k: 0, dur: 3.2 };
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
    academy.update(dt);
    boss.update();
    // Keyboard walking for the Boss (camera-relative, Shift to run).
    const b = cast.boss;
    b.manual = false;
    if (boss.control && keys.size) {
      let fx2 = 0, fz2 = 0;
      if (keys.has('w') || keys.has('arrowup')) fz2 -= 1;
      if (keys.has('s') || keys.has('arrowdown')) fz2 += 1;
      if (keys.has('a') || keys.has('arrowleft')) fx2 -= 1;
      if (keys.has('d') || keys.has('arrowright')) fx2 += 1;
      if (fx2 || fz2) {
        const yaw = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
        const c = Math.cos(yaw), s2 = Math.sin(yaw);
        const wx = fx2 * c + fz2 * s2;
        const wz = -fx2 * s2 + fz2 * c;
        const len = Math.hypot(wx, wz);
        const sp = (keys.has('shift') ? 6 : 3.2) * dt;
        if (b.path.length || b.current) b.plan([], true);
        b.body.x += (wx / len) * sp;
        b.body.z += (wz / len) * sp;
        b.targetHeading = Math.atan2(wx, wz);
        b.body.pose = 'stand';
        b.manual = true;
        b.activity = 'idle';
        b.at = cast.here(b);
      }
    }
    cast.update(dt, time);
    // Where the Boss is heading.
    const showRoute = b.path.length > 0 && (boss.control || boss.patrol || selectedActor === b);
    fx.setRoute(showRoute ? [[b.body.x, b.body.z], ...b.path] : null, time);
    office.update(dt, time, camera, controls.target);
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
      else if (a === hoveredActor || a.kind === 'lead' || a.kind === 'boss' || a.kind === 'visitor' || a.kind === 'teacher') reqs.push({ key: a.idx, x: a.body.x, y, z: a.body.z, text: a.item?.name || (a.kind === 'lead' ? 'Claude' : a.kind === 'boss' ? t().you : a.name), kind: 'name', color: a.color });
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
    office: { data, layout, cast, director, crews, results, conn, camera, controls, renderer, academy, boss, selectItem, focusDept, focusBuilding, setGraph, overview, campus: office.campus, engine: () => engine, lookAt: (x: number, z: number, d = 30) => flyTo(new THREE.Vector3(x, 0, z), d, 0.05),
      view: (p: [number, number, number], at: [number, number, number]) => {
        tween = null;
        following = null;
        camera.position.set(...p);
        controls.target.set(...at);
        controls.update();
      },
    },
  });
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.querySelector('p')!.textContent = `⚠️ ${err?.message || err}`;
});
