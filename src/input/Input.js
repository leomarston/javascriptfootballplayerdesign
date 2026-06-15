import * as THREE from 'three';

/**
 * Keyboard input → movement axis + edge-triggered action events.
 * Space is charge-to-shoot (hold longer = more power).
 */
const ACTION_KEYS = {
  KeyE: 'pass', KeyQ: 'slide', KeyF: 'throwin',
  KeyC: 'header', KeyR: 'celebrate', KeyT: 'turn', KeyG: 'fall',
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.actionQueue = [];
    this.shootCharge = 0;
    this._shootDown = 0;
    this._move = new THREE.Vector3();

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this._shootDown = performance.now(); e.preventDefault(); }
      else if (e.code === 'KeyR' && this.keys.has('ShiftLeft')) { /* allow */ }
      if (ACTION_KEYS[e.code]) this.actionQueue.push({ name: ACTION_KEYS[e.code] });
      if (e.code === 'KeyR') this.actionQueue.push({ name: 'celebrate' });
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') {
        const held = (performance.now() - this._shootDown) / 1000;
        const power = Math.min(1, 0.45 + held * 1.1);
        this.actionQueue.push({ name: 'shoot', power });
      }
    });
    addEventListener('blur', () => this.keys.clear());
  }

  // camera-relative move vector (unit-ish) given the camera yaw
  moveVector(cameraYaw) {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x -= 1;
    this._move.set(0, 0, 0);
    if (x === 0 && z === 0) return this._move;
    // rotate the (x,z) intent by the camera yaw so "up" is always away from cam
    const s = Math.sin(cameraYaw), c = Math.cos(cameraYaw);
    this._move.set(x * c + z * s, 0, -x * s + z * c).normalize();
    return this._move;
  }

  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  consumeActions() {
    const q = this.actionQueue;
    this.actionQueue = [];
    return q;
  }
}
