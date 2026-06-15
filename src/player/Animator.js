import * as THREE from 'three';
import { deg, easeInOutSine, clamp } from '../util/math.js';

/**
 * Skeletal animation player with snapshot cross-fading.
 *
 * A clip is authored as per-joint Euler keyframes (degrees). On play we snapshot
 * the currently-applied pose and blend from it to the new clip over `fade`
 * seconds, so every transition is smooth regardless of where the previous clip
 * was. Joints a clip doesn't mention return to their bind pose. Clips may also
 * carry a `root` track that drives whole-body offset (jump height, slide lean).
 */
export class Animator {
  constructor(joints, modelRoot) {
    this.joints = joints;
    this.modelRoot = modelRoot;
    this.clips = {};

    // bind pose (per-joint quaternion) + identity root
    this.bind = {};
    for (const name in joints) this.bind[name] = joints[name].quaternion.clone();
    this.bindRootPos = modelRoot.position.clone();
    this.bindRootQuat = modelRoot.quaternion.clone();

    // currently-applied pose (for snapshotting on transition)
    this.curPose = {};
    for (const name in joints) this.curPose[name] = this.bind[name].clone();
    this.curRootPos = this.bindRootPos.clone();
    this.curRootQuat = this.bindRootQuat.clone();

    this.active = null;
    this.from = null;       // snapshot { pose, rootPos, rootQuat }
    this.blend = 1;
    this.fade = 0.2;

    this._tmpA = new THREE.Quaternion();
    this._tmpB = new THREE.Quaternion();
    this._euler = new THREE.Euler();
  }

  register(clips) {
    for (const name in clips) {
      this.clips[name] = this._compile(clips[name]);
    }
  }

  // Pre-bake Euler keyframes into quaternions.
  _compile(clip) {
    const out = {
      name: clip.name, duration: clip.duration, loop: clip.loop !== false,
      ease: clip.ease !== false, tracks: {}, root: null,
    };
    for (const j in clip.tracks) {
      out.tracks[j] = clip.tracks[j].map((k) => ({
        t: k.t,
        q: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(deg(k.rot[0]), deg(k.rot[1]), deg(k.rot[2]), 'XYZ')
        ),
      }));
    }
    if (clip.root) {
      out.root = clip.root.map((k) => ({
        t: k.t,
        pos: new THREE.Vector3(...(k.pos || [0, 0, 0])),
        q: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(...((k.rot || [0, 0, 0]).map(deg)), 'XYZ')
        ),
      }));
    }
    return out;
  }

  get current() { return this.active ? this.active.clip.name : null; }
  isPlaying(name) { return this.active && this.active.clip.name === name; }

  play(name, opts = {}) {
    const clip = this.clips[name];
    if (!clip) { console.warn('No clip:', name); return; }
    if (this.active && this.active.clip.name === name && clip.loop && !opts.restart) return;

    // snapshot current applied pose
    const pose = {};
    for (const j in this.curPose) pose[j] = this.curPose[j].clone();
    this.from = { pose, rootPos: this.curRootPos.clone(), rootQuat: this.curRootQuat.clone() };

    this.active = {
      clip, time: 0, timeScale: opts.timeScale || 1,
      loop: opts.loop !== undefined ? opts.loop : clip.loop,
      onDone: opts.onDone || null, done: false,
    };
    this.fade = opts.fade !== undefined ? opts.fade : 0.18;
    this.blend = 0;
  }

  update(dt) {
    if (!this.active) return;
    const a = this.active;
    a.time += dt * a.timeScale;

    let phase;
    if (a.loop) {
      phase = ((a.time % a.clip.duration) + a.clip.duration) % a.clip.duration;
    } else {
      phase = clamp(a.time, 0, a.clip.duration);
      if (a.time >= a.clip.duration && !a.done) {
        a.done = true;
        if (a.onDone) a.onDone();
      }
    }

    // advance blend
    this.blend = this.fade > 0 ? clamp(this.blend + dt / this.fade, 0, 1) : 1;
    const bw = easeInOutSine(this.blend);

    // ---- joints ----
    for (const name in this.joints) {
      const to = this._sampleJoint(a.clip, name, phase, this._tmpA);
      const from = this.from.pose[name];
      const result = this.curPose[name];
      if (bw >= 1) result.copy(to);
      else result.copy(from).slerp(to, bw);
      this.joints[name].quaternion.copy(result);
    }

    // ---- root motion ----
    const rp = this._tmpRootPos || (this._tmpRootPos = new THREE.Vector3());
    const rq = this._tmpRootQuat || (this._tmpRootQuat = new THREE.Quaternion());
    this._sampleRoot(a.clip, phase, rp, rq);
    if (bw >= 1) {
      this.curRootPos.copy(rp); this.curRootQuat.copy(rq);
    } else {
      this.curRootPos.lerpVectors(this.from.rootPos, rp, bw);
      this.curRootQuat.copy(this.from.rootQuat).slerp(rq, bw);
    }
    this.modelRoot.position.copy(this.bindRootPos).add(this.curRootPos);
    this.modelRoot.quaternion.copy(this.curRootQuat);
  }

  _sampleJoint(clip, name, t, out) {
    const track = clip.tracks[name];
    if (!track) { out.copy(this.bind[name]); return out; }
    return this._sampleQuatTrack(track, t, clip.duration, clip.loop, clip.ease, out);
  }

  _sampleRoot(clip, t, posOut, quatOut) {
    posOut.set(0, 0, 0);
    quatOut.copy(this.bindRootQuat);
    const track = clip.root;
    if (!track || track.length === 0) return;
    const { i0, i1, f } = this._segment(track, t, clip.duration, clip.loop, clip.ease);
    posOut.lerpVectors(track[i0].pos, track[i1].pos, f);
    quatOut.copy(track[i0].q).slerp(track[i1].q, f);
  }

  _sampleQuatTrack(track, t, dur, loop, ease, out) {
    if (track.length === 1) { out.copy(track[0].q); return out; }
    const { i0, i1, f } = this._segment(track, t, dur, loop, ease);
    out.copy(track[i0].q).slerp(track[i1].q, f);
    return out;
  }

  _segment(track, t, dur, loop, ease) {
    const n = track.length;
    // find surrounding keys
    let i0 = 0;
    for (let i = 0; i < n; i++) {
      if (track[i].t <= t) i0 = i; else break;
    }
    let i1 = i0 + 1;
    let t0 = track[i0].t, t1;
    if (i1 >= n) {
      if (loop) { i1 = 0; t1 = dur + track[0].t; }
      else { i1 = i0; t1 = t0 + 1; }
    } else {
      t1 = track[i1].t;
    }
    let f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    f = clamp(f, 0, 1);
    if (ease) f = easeInOutSine(f);
    return { i0, i1, f };
  }
}
