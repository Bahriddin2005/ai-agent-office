// Close-up 3D portrait of one person, shown in the inspector: full face and
// full body, drag to turn around, "Face" / "Full body" framing.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildAvatar, type Avatar } from '../world/avatar';
import type { Look } from '../world/human';

type Framing = 'face' | 'body';
const FRAMES: Record<Framing, { target: [number, number, number]; pos: [number, number, number] }> = {
  body: { target: [0, 0.9, 0], pos: [1.0, 1.25, 3.55] },
  face: { target: [0, 1.6, 0], pos: [0.2, 1.64, 0.72] },
};

export class Portrait {
  readonly el: HTMLDivElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  private controls: OrbitControls | null = null;
  private avatar: Avatar | null = null;
  private raf = 0;
  private clock = new THREE.Timer();
  private mode: 'idle' | 'wave' | 'work' | 'talk' = 'idle';
  private waveUntil = 0;
  private framing: Framing = 'body';
  private canvasWrap: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];

  constructor(private height = 250) {
    this.el = document.createElement('div');
    this.el.className = 'portrait';
    this.canvasWrap = document.createElement('div');
    this.canvasWrap.className = 'portrait-canvas';
    this.canvasWrap.style.height = `${height}px`;
    const bar = document.createElement('div');
    bar.className = 'portrait-bar';
    for (const [f, label] of [['face', '🙂'], ['body', '🧍']] as [Framing, string][]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.framing = f;
      b.onclick = () => this.frame(f);
      bar.append(b);
      this.buttons.push(b);
    }
    this.el.append(this.canvasWrap, bar);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6b6f80', 1.5));
    const key = new THREE.DirectionalLight('#fff4e6', 2.2);
    key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight('#9fc6ff', 1.2);
    rim.position.set(-3, 2, -2);
    this.scene.add(key, rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }));
    this.scene.add(floor);
  }

  setLabels(face: string, body: string) {
    this.buttons[0].title = face;
    this.buttons[1].title = body;
  }

  private ensureRenderer() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.canvasWrap.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 5;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.75;
  }

  frame(f: Framing) {
    this.framing = f;
    const fr = FRAMES[f];
    this.camera.position.set(...fr.pos);
    this.controls?.target.set(...fr.target);
    this.controls?.update();
    this.buttons.forEach((b) => b.classList.toggle('on', b.dataset.framing === f));
  }

  /** Show a person; `mood` picks the animation. */
  show(look: Look, background: string, mood: 'idle' | 'work' | 'talk' = 'idle') {
    this.ensureRenderer();
    if (this.avatar) {
      this.scene.remove(this.avatar.group);
      this.avatar.dispose();
    }
    this.avatar = buildAvatar(look);
    this.scene.add(this.avatar.group);
    this.canvasWrap.style.setProperty('--bg', background);
    this.mode = mood;
    this.waveUntil = performance.now() / 1000 + 2.2;
    this.frame(this.framing);
    this.start();
  }

  setMood(mood: 'idle' | 'work' | 'talk') {
    this.mode = mood;
  }

  private start() {
    if (this.raf) return;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.el.isConnected || !this.renderer || !this.avatar) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        return;
      }
      const w = this.canvasWrap.clientWidth || 300;
      const h = this.height;
      const size = this.renderer.getSize(new THREE.Vector2());
      if (size.x !== w || size.y !== h) {
        this.renderer.setSize(w, h, true);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      this.clock.update();
      const t = this.clock.getElapsed();
      const now = performance.now() / 1000;
      this.avatar.update(t, now < this.waveUntil ? 'wave' : this.mode);
      this.controls?.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Resume after the element is re-attached to the page. */
  resume() {
    if (this.avatar) this.start();
  }
}
