import * as THREE from 'three';
import { lerpAngle, clamp, damp } from '../util/math.js';

/**
 * Third-person camera that trails the player and can be orbited by dragging
 * and zoomed with the wheel. `lookYaw` (the horizontal direction the camera
 * faces) is exported so movement input stays camera-relative.
 */
export class FollowCamera {
  constructor(camera, dom, target) {
    this.cam = camera;
    this.dom = dom;
    this.target = target;              // THREE.Object3D to follow

    this.dist = 5.4;
    this.az = Math.PI;                 // azimuth of camera relative to target
    this.el = 0.34;                    // elevation (rad)
    this.follow = true;
    this.lookYaw = 0;

    this._tPos = new THREE.Vector3();
    this._cPos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._dragging = false;
    this._lastX = 0; this._lastY = 0;

    this._bind();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#hud .panel')) return; // don't grab over UI
      this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY;
      d.setPointerCapture(e.pointerId);
    });
    d.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX, dy = e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
      this.az -= dx * 0.006;
      this.el = clamp(this.el + dy * 0.005, 0.06, 1.25);
      this._userControlled = performance.now();
    });
    const stop = () => { this._dragging = false; };
    d.addEventListener('pointerup', stop);
    d.addEventListener('pointercancel', stop);
    d.addEventListener('wheel', (e) => {
      this.dist = clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.08), 2.6, 14);
      e.preventDefault();
    }, { passive: false });
  }

  setFollow(v) { this.follow = v; }

  update(dt, playerYaw) {
    // auto-trail behind the player when moving and not actively dragging
    const recentlyDragged = performance.now() - (this._userControlled || -1e9) < 2200;
    if (this.follow && !this._dragging && !recentlyDragged) {
      this.az = lerpAngle(this.az, playerYaw + Math.PI, clamp(1.6 * dt, 0, 1));
    }

    // target point ~chest height
    this._tPos.copy(this.target.position);
    this._tPos.y += 1.15;

    const ce = Math.cos(this.el), se = Math.sin(this.el);
    const ox = Math.sin(this.az) * ce, oz = Math.cos(this.az) * ce;
    this._cPos.set(
      this._tPos.x + ox * this.dist,
      this._tPos.y + se * this.dist + 0.2,
      this._tPos.z + oz * this.dist
    );
    if (this._cPos.y < 0.4) this._cPos.y = 0.4; // never dip below pitch

    // smooth follow
    const k = 9;
    this.cam.position.x = damp(this.cam.position.x, this._cPos.x, k, dt);
    this.cam.position.y = damp(this.cam.position.y, this._cPos.y, k, dt);
    this.cam.position.z = damp(this.cam.position.z, this._cPos.z, k, dt);

    this._look.copy(this._tPos);
    this.cam.lookAt(this._look);

    const fx = this._look.x - this.cam.position.x;
    const fz = this._look.z - this.cam.position.z;
    this.lookYaw = Math.atan2(fx, fz);
  }
}
