import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads an external rigged glTF/GLB humanoid and drives it from the game's
 * locomotion state, using the MODEL'S OWN animation clips via AnimationMixer.
 *
 * This is the realistic route to AAA-looking characters: author/scan the mesh
 * in a DCC tool (or use Mixamo / Ready Player Me / a CC0 model) and drop it in.
 * The model is auto-scaled to ~1.8 m and grounded so it fits the pitch.
 *
 * Clip names are matched fuzzily (idle / walk / run / sprint) so models from
 * different sources work without manual wiring.
 */
export class GLTFCharacter {
  constructor(gltf, opts = {}) {
    this.root = new THREE.Group();
    this.scene = gltf.scene;
    this.root.add(this.scene);

    // auto-fit: scale to target height, drop feet to y=0
    const box = new THREE.Box3().setFromObject(this.scene);
    const size = box.getSize(new THREE.Vector3());
    const h = size.y || 1.8;
    const s = (opts.height || 1.8) / h;
    this.scene.scale.setScalar(s);
    box.setFromObject(this.scene);
    this.scene.position.y -= box.min.y;

    this.scene.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    if (opts.tint) this._tint(opts.tint);

    // animation
    this.mixer = new THREE.AnimationMixer(this.scene);
    this.actions = {};
    for (const clip of gltf.animations) {
      this.actions[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
    }
    this.names = Object.keys(this.actions);
    this.current = null;
    this.currentAction = null;
    this.setState('idle');
  }

  _resolve(state) {
    const s = state.toLowerCase();
    const has = (k) => this.names.find((n) => n.includes(k));
    if (s.includes('sprint')) return has('sprint') || has('run');
    if (s.includes('run')) return has('run') || has('jog');
    if (s.includes('walk')) return has('walk');
    if (s.includes('idle')) return has('idle') || has('stand');
    // actions with no dedicated clip fall back to something reasonable
    return has('idle') || this.names[0];
  }

  setState(state) {
    const name = this._resolve(state);
    if (!name || name === this.current) return;
    const next = this.actions[name];
    if (!next) return;
    next.reset();
    next.setEffectiveWeight(1);
    next.fadeIn(0.25).play();
    if (this.currentAction && this.currentAction !== next) this.currentAction.fadeOut(0.25);
    this.currentAction = next;
    this.current = name;
  }

  setTimeScale(t) { if (this.currentAction) this.currentAction.setEffectiveTimeScale(t); }

  update(dt) { this.mixer.update(dt); }

  _tint(color) {
    const c = new THREE.Color(color);
    this.scene.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.color) m.color.lerp(c, 0.5); }
      }
    });
  }
}

// Demo models (rigged + animated) fetched straight from GitHub raw (CORS-open).
// Swap in your own footballer by passing a full URL instead of a name.
const RAW = 'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/';
const BUILTIN = {
  xbot: RAW + 'Xbot.glb',
  soldier: RAW + 'Soldier.glb',
};

/** Resolve a model spec ("xbot" | "soldier" | full URL) and load it. */
export function loadCharacter(spec, opts = {}) {
  const url = BUILTIN[String(spec).toLowerCase()] || spec;
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      try { resolve(new GLTFCharacter(gltf, opts)); }
      catch (e) { reject(e); }
    }, undefined, reject);
  });
}
