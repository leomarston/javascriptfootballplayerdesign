import * as THREE from 'three';
import { createPlayerModel } from './PlayerModel.js';
import { Animator } from './Animator.js';
import { buildClips } from './clips.js';
import { FIELD } from '../world/Pitch.js';
import { clamp, damp, lerpAngle } from '../util/math.js';

const ONE_SHOTS = new Set(['shoot', 'pass', 'throwin', 'slide', 'fall', 'header', 'turn']);
// kick contact timing (s) + parameters per action
const KICKS = {
  shoot: { at: 0.50, speed: 23, lift: 0.16, curve: 0.6, reach: 1.5 },
  pass: { at: 0.42, speed: 11, lift: 0.04, curve: 0.2, reach: 1.4 },
  throwin: { at: 1.0, speed: 12, lift: 0.7, curve: 0, reach: 1.6 },
  header: { at: 0.50, speed: 14, lift: 0.5, curve: 0, reach: 1.5 },
};

export class Player {
  constructor(scene, ball, cfg = {}) {
    this.ball = ball;
    this.model = createPlayerModel(cfg);

    this.object = new THREE.Group();
    this.object.add(this.model.root);
    this.object.position.set(0, 0, -2.0);
    scene.add(this.object);

    this.animator = new Animator(this.model.joints, this.model.root);
    this.animator.register(buildClips());
    this.animator.play('idle', { fade: 0 });

    this.vel = new THREE.Vector3();
    this.yaw = 0;                 // facing angle
    this.speed = 0;
    this.stateLabel = 'Idle';

    this.actionName = null;
    this.actionTime = 0;
    this._kicked = false;
    this.forcedClip = null;

    // tuning
    this.walkMax = 2.0; this.runMax = 5.0; this.sprintMax = 8.2;
    this.accel = 20; this.decel = 16; this.turnRate = 10;

    this._fwd = new THREE.Vector3();
    this._qy = new THREE.Quaternion();
    this._eUp = new THREE.Vector3(0, 1, 0);
  }

  get position() { return this.object.position; }

  forward(out = this._fwd) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  /** External selection (HUD button or key). */
  select(name, power = 1) {
    if (ONE_SHOTS.has(name)) this.triggerAction(name, power);
    else { this.forcedClip = name; this.actionName = null; this.animator.play(name, { fade: 0.25 }); }
  }

  triggerAction(name, power = 1) {
    if (this.actionName && !this.animator.clips[name]) return;
    this.actionName = name;
    this.actionPower = power;
    this.actionTime = 0;
    this._kicked = false;
    this.forcedClip = null;
    this.animator.play(name, {
      fade: 0.14, loop: false,
      onDone: () => { if (this.actionName === name) this.actionName = null; },
    });
  }

  update(dt, move, sprint) {
    // ---- movement intent ----
    const hasInput = move.lengthSq() > 0.0001;
    if (hasInput) this.forcedClip = null;

    const locked = this.actionName && this.actionName !== 'slide';
    if (locked) {
      // bleed off momentum during stationary actions
      this.vel.multiplyScalar(1 - Math.min(1, this.decel * dt));
    } else if (hasInput) {
      const maxV = sprint ? this.sprintMax : this.runMax;
      const desired = move.clone().setLength(maxV);
      this.vel.x = damp(this.vel.x, desired.x, this.accel / maxV, dt);
      this.vel.z = damp(this.vel.z, desired.z, this.accel / maxV, dt);
      // face travel direction
      const targetYaw = Math.atan2(move.x, move.z);
      this.yaw = lerpAngle(this.yaw, targetYaw, clamp(this.turnRate * dt, 0, 1));
    } else {
      this.vel.multiplyScalar(1 - Math.min(1, this.decel * dt));
      if (this.vel.lengthSq() < 0.0004) this.vel.set(0, 0, 0);
    }

    // integrate position
    this.object.position.addScaledVector(this.vel, dt);
    this._clampToField();
    this.object.rotation.y = this.yaw;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // ---- clip selection ----
    if (this.actionName) {
      this.actionTime += dt;
      this._maybeKick();
      this.stateLabel = cap(this.actionName);
    } else if (this.forcedClip) {
      this.stateLabel = cap(this.forcedClip);
    } else {
      this._locomotion();
    }

    // ---- auto-dribble: keep the ball ahead while moving with it ----
    if (!this.actionName && this.speed > 0.4) this._dribble();

    this.animator.update(dt);
    if (!this.actionName) this._lookAtBall();
  }

  _locomotion() {
    const s = this.speed;
    let clip, label, tref;
    if (s < 0.25) { clip = 'idle'; label = 'Idle'; tref = 1; }
    else if (s < 2.4) { clip = 'walk'; label = 'Walk'; tref = 1.4; }
    else if (s < 5.4) { clip = 'run'; label = 'Run'; tref = 4.4; }
    else { clip = 'sprint'; label = 'Sprint'; tref = 7.6; }
    this.stateLabel = label;
    if (this.animator.current !== clip) this.animator.play(clip, { fade: 0.2 });
    // match stride to ground speed to limit foot sliding
    if (clip !== 'idle' && this.animator.active) {
      this.animator.active.timeScale = clamp(s / tref, 0.6, 1.6);
    }
  }

  _maybeKick() {
    const k = KICKS[this.actionName];
    if (!k || this._kicked) return;
    if (this.actionTime >= k.at) {
      this._kicked = true;
      const fwd = this.forward().clone();
      const foot = this.object.position.clone().addScaledVector(fwd, 0.55);
      foot.y = this.ball.pos.y;
      if (this.ball.pos.distanceTo(foot) <= k.reach) {
        const dir = this.ball.pos.clone().sub(this.object.position);
        dir.y = 0;
        if (dir.lengthSq() < 0.01) dir.copy(fwd);
        const p = this.actionPower || 1;
        this.ball.kick(dir, k.speed * p, k.lift, k.curve * p);
      }
    }
  }

  _dribble() {
    const fwd = this.forward();
    const toBall = this.ball.pos.clone().sub(this.object.position);
    toBall.y = 0;
    const dist = toBall.length();
    if (dist < 1.0 && toBall.dot(fwd) > -0.2) {
      const aheadSpeed = this.speed * 0.95 + 0.4;
      this.ball.nudge(fwd, aheadSpeed);
    }
  }

  _lookAtBall() {
    const head = this.model.joints.head;
    if (!head) return;
    const toBall = this.ball.pos.clone().sub(this.object.position);
    let a = Math.atan2(toBall.x, toBall.z) - this.yaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    a = clamp(a, -0.6, 0.6);
    this._qy.setFromAxisAngle(this._eUp, a * 0.5);
    head.quaternion.multiply(this._qy);
  }

  _clampToField() {
    const bx = FIELD.W / 2 + 4, bz = FIELD.L / 2 + 4;
    this.object.position.x = clamp(this.object.position.x, -bx, bx);
    this.object.position.z = clamp(this.object.position.z, -bz, bz);
  }

  get speedKmh() { return this.speed * 3.6; }
  setBonesVisible(v) { for (const m of this.model.boneViz) m.visible = v; }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
