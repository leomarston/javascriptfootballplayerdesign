// Headless validation of the data-driven parts of the project.
// Run: npm test   (requires `npm install` so the local `three` is available)
import * as THREE from 'three';
import { Animator } from '../src/player/Animator.js';
import { buildClips, CLIP_MENU } from '../src/player/clips.js';

const RIG = new Set([
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'shoulder.L', 'shoulder.R', 'elbow.L', 'elbow.R', 'wrist.L', 'wrist.R',
  'hip.L', 'hip.R', 'knee.L', 'knee.R', 'ankle.L', 'ankle.R',
]);

let errors = 0;
const fail = (msg) => { console.log('  ✗ ' + msg); errors++; };

/* ---- 1. clip data integrity ---- */
const clips = buildClips();
for (const [name, clip] of Object.entries(clips)) {
  if (!(clip.duration > 0)) fail(`${name}: bad duration`);
  for (const [j, track] of Object.entries(clip.tracks)) {
    if (!RIG.has(j)) fail(`${name}: unknown joint "${j}"`);
    let prev = -Infinity;
    for (const k of track) {
      if (!Array.isArray(k.rot) || k.rot.length !== 3 || k.rot.some((n) => !Number.isFinite(n)))
        fail(`${name}.${j}: bad rot ${JSON.stringify(k.rot)}`);
      if (k.t < prev - 1e-9) fail(`${name}.${j}: non-monotonic t=${k.t}`);
      if (k.t < -1e-9 || k.t > clip.duration + 1e-6) fail(`${name}.${j}: t out of range`);
      prev = k.t;
    }
  }
}
for (const m of CLIP_MENU) if (!clips[m.id]) fail(`menu id "${m.id}" has no clip`);
console.log(`• ${Object.keys(clips).length} clips, ${CLIP_MENU.length} menu entries checked`);

/* ---- 2. animator stability ---- */
const joints = {};
for (const n of RIG) joints[n] = { quaternion: new THREE.Quaternion() };
const modelRoot = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
const anim = new Animator(joints, modelRoot);
anim.register(buildClips());

const finite = () => {
  for (const n of RIG) {
    const q = joints[n].quaternion;
    if (![q.x, q.y, q.z, q.w].every(Number.isFinite)) return fail(`NaN quat on ${n}`), false;
    if (Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 2e-3) return fail(`non-unit quat on ${n}`), false;
  }
  if (![modelRoot.position.x, modelRoot.position.y, modelRoot.position.z].every(Number.isFinite))
    return fail('NaN root position'), false;
  return true;
};

const names = Object.keys(clips);
for (const c of names) { anim.play(c, { fade: 0.18 }); for (let i = 0; i < 200; i++) { anim.update(1 / 60); if (!finite()) break; } }
for (let i = 0; i < 400; i++) { anim.play(names[(Math.random() * names.length) | 0], { fade: Math.random() * 0.3 }); for (let f = 0; f < 6; f++) { anim.update(1 / 60); if (!finite()) break; } }
console.log('• animator stable across all clips + 400 random transitions');

console.log(errors === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${errors} ERROR(S)`);
process.exit(errors ? 1 : 0);
