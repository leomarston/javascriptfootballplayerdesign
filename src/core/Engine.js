import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Core renderer: WebGL context, camera, scene, post-processing and the main loop.
 * Configured for a "Unity-like" physically based look — ACES filmic tone mapping,
 * sRGB output, soft shadows and a subtle bloom for stadium-light bleed.
 */
export class Engine {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );
    this.camera.position.set(4.5, 2.4, 6.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this._setupPost();

    this.clock = new THREE.Clock();
    this._updaters = [];
    this._fpsSmooth = 60;
    this.timeScale = 1;

    window.addEventListener('resize', () => this._onResize());
  }

  _setupPost() {
    try {
      const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(size, 0.42, 0.62, 0.85);
      bloom.threshold = 0.82;
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
      this.bloom = bloom;
    } catch (e) {
      console.warn('Post-processing unavailable, falling back to direct render.', e);
      this.composer = null;
    }
  }

  onUpdate(fn) { this._updaters.push(fn); }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }

  start() {
    const tick = () => {
      requestAnimationFrame(tick);
      let dt = this.clock.getDelta();
      dt = Math.min(dt, 0.05) * this.timeScale; // clamp to avoid huge steps on tab refocus
      const elapsed = this.clock.elapsedTime;

      for (const fn of this._updaters) fn(dt, elapsed);

      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);

      // smoothed FPS estimate
      const inst = dt > 0 ? 1 / (dt / this.timeScale) : 60;
      this._fpsSmooth += (inst - this._fpsSmooth) * 0.08;
    };
    tick();
  }

  get fps() { return Math.round(this._fpsSmooth); }
}
