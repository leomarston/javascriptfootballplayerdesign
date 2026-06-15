import * as THREE from 'three';
import { FIELD } from '../world/Pitch.js';

/**
 * Size-5 match ball. Visual: white sphere with the 12 black pentagons of a
 * truncated icosahedron placed on the dodecahedral face directions.
 * Physics: gravity, restitution bounce, rolling/air friction and a simplified
 * Magnus (curve) term from spin — integrated semi-implicitly.
 */
export class Ball {
  constructor(scene) {
    this.R = 0.11;
    this.mass = 0.43;
    this.pos = new THREE.Vector3(0, this.R, 1.4);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();      // rad/s, world axis
    this.onGround = false;

    this.group = new THREE.Group();
    this._build();
    this.group.position.copy(this.pos);
    scene.add(this.group);

    this._q = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
  }

  _build() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.45, metalness: 0.02 });
    const black = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(this.R, 48, 36), white);
    ball.castShadow = true;
    this.group.add(ball);

    // 12 pentagon panels on icosahedral vertex directions
    const t = (1 + Math.sqrt(5)) / 2;
    const verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map((v) => new THREE.Vector3(...v).normalize());

    const penGeo = new THREE.CircleGeometry(0.052, 5);
    for (const dir of verts) {
      const p = new THREE.Mesh(penGeo, black);
      p.position.copy(dir.clone().multiplyScalar(this.R * 1.001));
      p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      p.castShadow = false;
      this.group.add(p);
    }
  }

  /** Apply a kick: direction (unit), speed (m/s), lift (0..1), curve spin. */
  kick(dir, speed, lift = 0.18, curve = 0) {
    const v = dir.clone().normalize();
    this.vel.set(v.x * speed, lift * speed * 0.9 + 1.5, v.z * speed);
    // spin about vertical for curve + about lateral for lift/dip
    this.spin.set(v.z * -speed * 0.4, curve * 8, v.x * speed * 0.4);
    this.onGround = false;
  }

  /** Gentle nudge to keep the ball ahead while dribbling. */
  nudge(dir, speed) {
    this.vel.x = dir.x * speed;
    this.vel.z = dir.z * speed;
  }

  update(dt) {
    const g = 9.81;
    // air drag + Magnus
    const speed = this.vel.length();
    if (speed > 0.001) {
      const drag = 0.06 * speed;
      const dragF = this.vel.clone().multiplyScalar(-drag);
      // Magnus: F ~ spin x vel
      const magnus = new THREE.Vector3().crossVectors(this.spin, this.vel).multiplyScalar(0.012);
      this.vel.addScaledVector(dragF, dt);
      this.vel.addScaledVector(magnus, dt);
    }
    this.vel.y -= g * dt;
    this.pos.addScaledVector(this.vel, dt);

    // ground collision
    if (this.pos.y <= this.R) {
      this.pos.y = this.R;
      if (this.vel.y < 0) {
        this.vel.y = -this.vel.y * 0.55;             // restitution
        if (Math.abs(this.vel.y) < 0.6) this.vel.y = 0;
      }
      // rolling friction on horizontal velocity
      const fr = this.onGround ? 0.985 : 0.8;
      this.vel.x *= fr;
      this.vel.z *= fr;
      this.spin.multiplyScalar(0.96);
      this.onGround = this.vel.y === 0;
    } else {
      this.onGround = false;
    }

    // keep within the pitch surroundings (soft walls)
    const bx = FIELD.W / 2 + 6, bz = FIELD.L / 2 + 6;
    if (Math.abs(this.pos.x) > bx) { this.pos.x = Math.sign(this.pos.x) * bx; this.vel.x *= -0.4; }
    if (Math.abs(this.pos.z) > bz) { this.pos.z = Math.sign(this.pos.z) * bz; this.vel.z *= -0.4; }

    // visual rolling: rotate by angular velocity derived from ground speed
    const horiz = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const hs = horiz.length();
    if (hs > 0.01) {
      this._axis.set(this.vel.z, 0, -this.vel.x).normalize(); // roll axis ⟂ travel
      const ang = (hs / this.R) * dt;
      this._q.setFromAxisAngle(this._axis, ang);
      this.group.quaternion.premultiply(this._q);
    }

    this.group.position.copy(this.pos);
  }

  reset() {
    this.pos.set(0, this.R, 1.4);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.group.position.copy(this.pos);
  }
}
