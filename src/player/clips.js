/**
 * Animation clip library. Each clip is per-joint Euler keyframes in DEGREES,
 * authored against the rig convention (Y up, faces +Z, limbs hang -Y):
 *   hip/shoulder  +x = limb swings BACK (-Z),  -x = swings FORWARD (+Z)
 *   knee          +x = flexion (heel back/up)
 *   elbow         -x = flexion (hand toward face)
 *   ankle         +x = plantarflex (toe down)
 *   spine/chest   +x = forward lean,  y = twist,  z = side-bend
 * Cyclic clips author the LEFT limb and derive the RIGHT by a half-cycle
 * phase-shift + lateral mirror, which is exactly how a symmetric gait works.
 */

const lerp = (a, b, t) => a + (b - a) * t;

function sampleEuler(track, dur, t) {
  t = ((t % dur) + dur) % dur;
  let i0 = 0;
  for (let i = 0; i < track.length; i++) { if (track[i].t <= t) i0 = i; else break; }
  let i1 = i0 + 1, t0 = track[i0].t, t1;
  if (i1 >= track.length) { i1 = 0; t1 = dur; } else t1 = track[i1].t;
  const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  const a = track[i0].rot, b = track[i1].rot;
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

// shift a periodic track in time (used to put the opposite leg/arm out of phase)
function shiftTrack(track, dur, shift) {
  const times = track.map((k) => k.t).filter((t) => t < dur - 1e-6);
  if (times[0] !== 0) times.unshift(0);
  const res = times.map((t) => ({ t, rot: sampleEuler(track, dur, t - shift) }));
  res.push({ t: dur, rot: res[0].rot.slice() });
  return res;
}
// mirror lateral (y twist, z side) for the opposite body side
const mirror = (track) => track.map((k) => ({ t: k.t, rot: [k.rot[0], -k.rot[1], -k.rot[2]] }));
const opp = (track, dur) => mirror(shiftTrack(track, dur, dur / 2));

/* ============================================================= IDLE */
function idle() {
  const dur = 4.0;
  return {
    name: 'idle', duration: dur, loop: true, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [0, 0, 0] }, { t: 2.0, rot: [1, 2, 1.5] }, { t: 4.0, rot: [0, 0, 0] }],
      spine: [{ t: 0, rot: [3, 0, 0] }, { t: 2.0, rot: [5.5, -1, -1] }, { t: 4.0, rot: [3, 0, 0] }],
      chest: [{ t: 0, rot: [2, 0, 0] }, { t: 2.0, rot: [3.5, 1, 0] }, { t: 4.0, rot: [2, 0, 0] }],
      neck: [{ t: 0, rot: [-2, 0, 0] }, { t: 2.0, rot: [-1, 3, 0] }, { t: 4.0, rot: [-2, 0, 0] }],
      head: [{ t: 0, rot: [3, 0, 0] }, { t: 1.5, rot: [2, 5, 0] }, { t: 3.0, rot: [4, -4, 0] }, { t: 4.0, rot: [3, 0, 0] }],
      'shoulder.L': [{ t: 0, rot: [6, 0, 9] }, { t: 2.0, rot: [8, 0, 10.5] }, { t: 4.0, rot: [6, 0, 9] }],
      'shoulder.R': [{ t: 0, rot: [6, 0, -9] }, { t: 2.0, rot: [8, 0, -10.5] }, { t: 4.0, rot: [6, 0, -9] }],
      'elbow.L': [{ t: 0, rot: [-12, 0, 0] }, { t: 2.0, rot: [-15, 0, 0] }, { t: 4.0, rot: [-12, 0, 0] }],
      'elbow.R': [{ t: 0, rot: [-12, 0, 0] }, { t: 2.0, rot: [-15, 0, 0] }, { t: 4.0, rot: [-12, 0, 0] }],
      'hip.L': [{ t: 0, rot: [-1, 0, 1] }, { t: 4.0, rot: [-1, 0, 1] }],
      'hip.R': [{ t: 0, rot: [-1, 0, -1] }, { t: 4.0, rot: [-1, 0, -1] }],
      'knee.L': [{ t: 0, rot: [4, 0, 0] }, { t: 2.0, rot: [6, 0, 0] }, { t: 4.0, rot: [4, 0, 0] }],
      'knee.R': [{ t: 0, rot: [4, 0, 0] }, { t: 2.0, rot: [6, 0, 0] }, { t: 4.0, rot: [4, 0, 0] }],
    },
  };
}

/* ============================================================= WALK */
function walk() {
  const dur = 1.06;
  const hipL = [
    { t: 0, rot: [-18, 0, 1] }, { t: 0.26, rot: [4, 0, 1] },
    { t: 0.53, rot: [16, 0, 1] }, { t: 0.78, rot: [2, 0, 1] }, { t: 1.06, rot: [-18, 0, 1] },
  ];
  const kneeL = [
    { t: 0, rot: [10, 0, 0] }, { t: 0.26, rot: [16, 0, 0] }, { t: 0.53, rot: [8, 0, 0] },
    { t: 0.70, rot: [52, 0, 0] }, { t: 0.85, rot: [30, 0, 0] }, { t: 1.06, rot: [10, 0, 0] },
  ];
  const ankL = [
    { t: 0, rot: [4, 0, 0] }, { t: 0.5, rot: [16, 0, 0] }, { t: 0.72, rot: [-8, 0, 0] }, { t: 1.06, rot: [4, 0, 0] },
  ];
  const armL = [
    { t: 0, rot: [16, 0, 9] }, { t: 0.53, rot: [-14, 0, 9] }, { t: 1.06, rot: [16, 0, 9] },
  ];
  const elbowL = [
    { t: 0, rot: [-20, 0, 0] }, { t: 0.53, rot: [-30, 0, 0] }, { t: 1.06, rot: [-20, 0, 0] },
  ];
  return {
    name: 'walk', duration: dur, loop: true, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [0, 4, 0] }, { t: 0.53, rot: [0, -4, 0] }, { t: 1.06, rot: [0, 4, 0] }],
      spine: [{ t: 0, rot: [4, -2, 0] }, { t: 0.53, rot: [4, 2, 0] }, { t: 1.06, rot: [4, -2, 0] }],
      chest: [{ t: 0, rot: [3, 3, 0] }, { t: 0.53, rot: [3, -3, 0] }, { t: 1.06, rot: [3, 3, 0] }],
      head: [{ t: 0, rot: [2, 0, 0] }, { t: 1.06, rot: [2, 0, 0] }],
      'hip.L': hipL, 'hip.R': opp(hipL, dur),
      'knee.L': kneeL, 'knee.R': opp(kneeL, dur),
      'ankle.L': ankL, 'ankle.R': opp(ankL, dur),
      'shoulder.L': armL, 'shoulder.R': opp(armL, dur),
      'elbow.L': elbowL, 'elbow.R': opp(elbowL, dur),
    },
    root: [
      { t: 0, pos: [0, -0.012, 0] }, { t: 0.26, pos: [0, 0.012, 0] },
      { t: 0.53, pos: [0, -0.012, 0] }, { t: 0.78, pos: [0, 0.012, 0] }, { t: 1.06, pos: [0, -0.012, 0] },
    ],
  };
}

/* ============================================================= RUN */
function run() {
  const dur = 0.62;
  const hipL = [
    { t: 0, rot: [-26, 0, 2] }, { t: 0.14, rot: [4, 0, 2] }, { t: 0.28, rot: [26, 0, 2] },
    { t: 0.40, rot: [10, 0, 2] }, { t: 0.50, rot: [-18, 0, 2] }, { t: 0.62, rot: [-26, 0, 2] },
  ];
  const kneeL = [
    { t: 0, rot: [22, 0, 0] }, { t: 0.14, rot: [30, 0, 0] }, { t: 0.28, rot: [16, 0, 0] },
    { t: 0.40, rot: [108, 0, 0] }, { t: 0.50, rot: [74, 0, 0] }, { t: 0.62, rot: [22, 0, 0] },
  ];
  const ankL = [
    { t: 0, rot: [6, 0, 0] }, { t: 0.28, rot: [26, 0, 0] }, { t: 0.42, rot: [-12, 0, 0] }, { t: 0.62, rot: [6, 0, 0] },
  ];
  const armL = [
    { t: 0, rot: [34, 0, 10] }, { t: 0.31, rot: [-30, 0, 12] }, { t: 0.62, rot: [34, 0, 10] },
  ];
  const elbowL = [
    { t: 0, rot: [-52, 0, 0] }, { t: 0.31, rot: [-78, 0, 0] }, { t: 0.62, rot: [-52, 0, 0] },
  ];
  return {
    name: 'run', duration: dur, loop: true, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [0, 6, 0] }, { t: 0.31, rot: [0, -6, 0] }, { t: 0.62, rot: [0, 6, 0] }],
      spine: [{ t: 0, rot: [12, -3, 0] }, { t: 0.31, rot: [12, 3, 0] }, { t: 0.62, rot: [12, -3, 0] }],
      chest: [{ t: 0, rot: [8, 5, 0] }, { t: 0.31, rot: [8, -5, 0] }, { t: 0.62, rot: [8, 5, 0] }],
      neck: [{ t: 0, rot: [-8, 0, 0] }, { t: 0.62, rot: [-8, 0, 0] }],
      head: [{ t: 0, rot: [-4, 0, 0] }, { t: 0.62, rot: [-4, 0, 0] }],
      'hip.L': hipL, 'hip.R': opp(hipL, dur),
      'knee.L': kneeL, 'knee.R': opp(kneeL, dur),
      'ankle.L': ankL, 'ankle.R': opp(ankL, dur),
      'shoulder.L': armL, 'shoulder.R': opp(armL, dur),
      'elbow.L': elbowL, 'elbow.R': opp(elbowL, dur),
    },
    root: [
      { t: 0, pos: [0, -0.02, 0] }, { t: 0.155, pos: [0, 0.035, 0] },
      { t: 0.31, pos: [0, -0.02, 0] }, { t: 0.465, pos: [0, 0.035, 0] }, { t: 0.62, pos: [0, -0.02, 0] },
    ],
  };
}

/* ============================================================= SPRINT */
function sprint() {
  const dur = 0.5;
  const hipL = [
    { t: 0, rot: [-34, 0, 2] }, { t: 0.12, rot: [6, 0, 2] }, { t: 0.24, rot: [32, 0, 2] },
    { t: 0.34, rot: [12, 0, 2] }, { t: 0.42, rot: [-24, 0, 2] }, { t: 0.5, rot: [-34, 0, 2] },
  ];
  const kneeL = [
    { t: 0, rot: [28, 0, 0] }, { t: 0.12, rot: [34, 0, 0] }, { t: 0.24, rot: [18, 0, 0] },
    { t: 0.33, rot: [124, 0, 0] }, { t: 0.42, rot: [86, 0, 0] }, { t: 0.5, rot: [28, 0, 0] },
  ];
  const ankL = [
    { t: 0, rot: [10, 0, 0] }, { t: 0.24, rot: [32, 0, 0] }, { t: 0.36, rot: [-16, 0, 0] }, { t: 0.5, rot: [10, 0, 0] },
  ];
  const armL = [
    { t: 0, rot: [46, 0, 9] }, { t: 0.25, rot: [-44, 0, 11] }, { t: 0.5, rot: [46, 0, 9] },
  ];
  const elbowL = [
    { t: 0, rot: [-66, 0, 0] }, { t: 0.25, rot: [-92, 0, 0] }, { t: 0.5, rot: [-66, 0, 0] },
  ];
  return {
    name: 'sprint', duration: dur, loop: true, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [4, 8, 0] }, { t: 0.25, rot: [4, -8, 0] }, { t: 0.5, rot: [4, 8, 0] }],
      spine: [{ t: 0, rot: [20, -4, 0] }, { t: 0.25, rot: [20, 4, 0] }, { t: 0.5, rot: [20, -4, 0] }],
      chest: [{ t: 0, rot: [12, 7, 0] }, { t: 0.25, rot: [12, -7, 0] }, { t: 0.5, rot: [12, 7, 0] }],
      neck: [{ t: 0, rot: [-14, 0, 0] }, { t: 0.5, rot: [-14, 0, 0] }],
      head: [{ t: 0, rot: [-6, 0, 0] }, { t: 0.5, rot: [-6, 0, 0] }],
      'hip.L': hipL, 'hip.R': opp(hipL, dur),
      'knee.L': kneeL, 'knee.R': opp(kneeL, dur),
      'ankle.L': ankL, 'ankle.R': opp(ankL, dur),
      'shoulder.L': armL, 'shoulder.R': opp(armL, dur),
      'elbow.L': elbowL, 'elbow.R': opp(elbowL, dur),
    },
    root: [
      { t: 0, pos: [0, -0.025, 0] }, { t: 0.125, pos: [0, 0.05, 0] },
      { t: 0.25, pos: [0, -0.025, 0] }, { t: 0.375, pos: [0, 0.05, 0] }, { t: 0.5, pos: [0, -0.025, 0] },
    ],
  };
}

/* ============================================================= SHOOT (right foot) */
function shoot() {
  return {
    name: 'shoot', duration: 0.92, loop: false, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [0, -6, 0] }, { t: 0.45, rot: [0, 10, 0] }, { t: 0.6, rot: [4, -14, 0] }, { t: 0.92, rot: [0, -4, 0] }],
      spine: [{ t: 0, rot: [6, -8, 0] }, { t: 0.4, rot: [-6, 14, 0] }, { t: 0.56, rot: [22, -10, 0] }, { t: 0.92, rot: [8, -4, 0] }],
      chest: [{ t: 0, rot: [4, -6, 0] }, { t: 0.4, rot: [-8, 12, 0] }, { t: 0.56, rot: [20, -16, 0] }, { t: 0.92, rot: [6, -6, 0] }],
      head: [{ t: 0, rot: [8, -6, 0] }, { t: 0.56, rot: [14, -8, 0] }, { t: 0.92, rot: [6, 0, 0] }],
      // plant leg (left): steps forward, braces
      'hip.L': [{ t: 0, rot: [-14, 0, 2] }, { t: 0.35, rot: [-24, 0, 4] }, { t: 0.92, rot: [-16, 0, 2] }],
      'knee.L': [{ t: 0, rot: [14, 0, 0] }, { t: 0.4, rot: [30, 0, 0] }, { t: 0.6, rot: [22, 0, 0] }, { t: 0.92, rot: [14, 0, 0] }],
      'ankle.L': [{ t: 0, rot: [4, 0, 0] }, { t: 0.92, rot: [4, 0, 0] }],
      // kicking leg (right): windup back, snap through, follow high
      'hip.R': [{ t: 0, rot: [-6, 0, -2] }, { t: 0.38, rot: [40, 0, -4] }, { t: 0.52, rot: [-44, 0, -2] }, { t: 0.68, rot: [-58, 0, 0] }, { t: 0.92, rot: [-20, 0, -2] }],
      'knee.R': [{ t: 0, rot: [16, 0, 0] }, { t: 0.38, rot: [96, 0, 0] }, { t: 0.52, rot: [18, 0, 0] }, { t: 0.66, rot: [10, 0, 0] }, { t: 0.92, rot: [26, 0, 0] }],
      'ankle.R': [{ t: 0, rot: [6, 0, 0] }, { t: 0.5, rot: [34, 0, 0] }, { t: 0.92, rot: [12, 0, 0] }],
      // arms: left flung out for balance, right swings back
      'shoulder.L': [{ t: 0, rot: [10, 0, 14] }, { t: 0.5, rot: [-22, -10, 56] }, { t: 0.92, rot: [8, 0, 16] }],
      'elbow.L': [{ t: 0, rot: [-18, 0, 0] }, { t: 0.5, rot: [-40, 0, 0] }, { t: 0.92, rot: [-16, 0, 0] }],
      'shoulder.R': [{ t: 0, rot: [10, 0, -12] }, { t: 0.5, rot: [42, 0, -28] }, { t: 0.92, rot: [8, 0, -14] }],
      'elbow.R': [{ t: 0, rot: [-18, 0, 0] }, { t: 0.5, rot: [-30, 0, 0] }, { t: 0.92, rot: [-16, 0, 0] }],
    },
    root: [
      { t: 0, pos: [0, 0, 0] }, { t: 0.35, pos: [0, -0.04, 0.12] },
      { t: 0.56, pos: [0, 0.02, 0.16] }, { t: 0.92, pos: [0, 0, 0.18] },
    ],
  };
}

/* ============================================================= PASS (side-foot, right) */
function pass() {
  return {
    name: 'pass', duration: 0.66, loop: false, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [0, -4, 0] }, { t: 0.35, rot: [0, 8, 0] }, { t: 0.66, rot: [0, -2, 0] }],
      spine: [{ t: 0, rot: [4, -4, 0] }, { t: 0.35, rot: [8, 10, 0] }, { t: 0.66, rot: [5, -2, 0] }],
      chest: [{ t: 0, rot: [3, -3, 0] }, { t: 0.35, rot: [6, 12, 0] }, { t: 0.66, rot: [4, -2, 0] }],
      head: [{ t: 0, rot: [8, -4, 0] }, { t: 0.66, rot: [6, 0, 0] }],
      'hip.L': [{ t: 0, rot: [-12, 0, 2] }, { t: 0.3, rot: [-18, 0, 4] }, { t: 0.66, rot: [-12, 0, 2] }],
      'knee.L': [{ t: 0, rot: [12, 0, 0] }, { t: 0.66, rot: [12, 0, 0] }],
      // right foot opens out (hip external rotation via y) and swings across
      'hip.R': [{ t: 0, rot: [0, 30, -4] }, { t: 0.3, rot: [24, 38, -6] }, { t: 0.44, rot: [-26, 34, -4] }, { t: 0.66, rot: [-6, 20, -2] }],
      'knee.R': [{ t: 0, rot: [18, 0, 0] }, { t: 0.3, rot: [48, 0, 0] }, { t: 0.44, rot: [14, 0, 0] }, { t: 0.66, rot: [20, 0, 0] }],
      'ankle.R': [{ t: 0, rot: [0, 30, 0] }, { t: 0.44, rot: [10, 34, 0] }, { t: 0.66, rot: [4, 24, 0] }],
      'shoulder.L': [{ t: 0, rot: [8, 0, 14] }, { t: 0.4, rot: [-10, 0, 40] }, { t: 0.66, rot: [6, 0, 16] }],
      'shoulder.R': [{ t: 0, rot: [8, 0, -12] }, { t: 0.4, rot: [22, 0, -20] }, { t: 0.66, rot: [6, 0, -14] }],
      'elbow.L': [{ t: 0, rot: [-16, 0, 0] }, { t: 0.66, rot: [-16, 0, 0] }],
      'elbow.R': [{ t: 0, rot: [-16, 0, 0] }, { t: 0.66, rot: [-16, 0, 0] }],
    },
  };
}

/* ============================================================= THROW-IN (two hands overhead) */
function throwin() {
  return {
    name: 'throwin', duration: 1.5, loop: false, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [0, 0, 0] }, { t: 0.6, rot: [-6, 0, 0] }, { t: 0.95, rot: [10, 0, 0] }, { t: 1.5, rot: [2, 0, 0] }],
      spine: [{ t: 0, rot: [4, 0, 0] }, { t: 0.6, rot: [-18, 0, 0] }, { t: 0.95, rot: [26, 0, 0] }, { t: 1.5, rot: [6, 0, 0] }],
      chest: [{ t: 0, rot: [2, 0, 0] }, { t: 0.6, rot: [-14, 0, 0] }, { t: 0.95, rot: [20, 0, 0] }, { t: 1.5, rot: [4, 0, 0] }],
      neck: [{ t: 0, rot: [0, 0, 0] }, { t: 0.6, rot: [-14, 0, 0] }, { t: 1.5, rot: [0, 0, 0] }],
      head: [{ t: 0, rot: [4, 0, 0] }, { t: 0.6, rot: [-10, 0, 0] }, { t: 1.0, rot: [10, 0, 0] }, { t: 1.5, rot: [4, 0, 0] }],
      // both arms cock behind head, then snap forward overhead and release
      'shoulder.L': [{ t: 0, rot: [10, 0, 12] }, { t: 0.6, rot: [-150, -10, 18] }, { t: 0.95, rot: [-120, -6, 14] }, { t: 1.2, rot: [-30, 0, 14] }, { t: 1.5, rot: [8, 0, 12] }],
      'shoulder.R': [{ t: 0, rot: [10, 0, -12] }, { t: 0.6, rot: [-150, 10, -18] }, { t: 0.95, rot: [-120, 6, -14] }, { t: 1.2, rot: [-30, 0, -14] }, { t: 1.5, rot: [8, 0, -12] }],
      'elbow.L': [{ t: 0, rot: [-20, 0, 0] }, { t: 0.6, rot: [-110, 0, 0] }, { t: 0.95, rot: [-60, 0, 0] }, { t: 1.2, rot: [-10, 0, 0] }, { t: 1.5, rot: [-18, 0, 0] }],
      'elbow.R': [{ t: 0, rot: [-20, 0, 0] }, { t: 0.6, rot: [-110, 0, 0] }, { t: 0.95, rot: [-60, 0, 0] }, { t: 1.2, rot: [-10, 0, 0] }, { t: 1.5, rot: [-18, 0, 0] }],
      // slight stagger of the feet, knees soft
      'hip.L': [{ t: 0, rot: [-14, 0, 2] }, { t: 1.5, rot: [-14, 0, 2] }],
      'hip.R': [{ t: 0, rot: [10, 0, -2] }, { t: 1.5, rot: [10, 0, -2] }],
      'knee.L': [{ t: 0, rot: [12, 0, 0] }, { t: 0.6, rot: [22, 0, 0] }, { t: 0.95, rot: [10, 0, 0] }, { t: 1.5, rot: [12, 0, 0] }],
      'knee.R': [{ t: 0, rot: [14, 0, 0] }, { t: 0.6, rot: [26, 0, 0] }, { t: 0.95, rot: [12, 0, 0] }, { t: 1.5, rot: [14, 0, 0] }],
    },
    root: [
      { t: 0, pos: [0, 0, 0] }, { t: 0.6, pos: [0, -0.06, -0.04] },
      { t: 0.95, pos: [0, 0.02, 0.06] }, { t: 1.5, pos: [0, 0, 0] },
    ],
  };
}

/* ============================================================= SLIDE TACKLE */
function slide() {
  return {
    name: 'slide', duration: 1.25, loop: false, ease: true,
    tracks: {
      spine: [{ t: 0, rot: [6, 0, 0] }, { t: 0.5, rot: [-10, 6, 0] }, { t: 1.25, rot: [-6, 4, 0] }],
      chest: [{ t: 0, rot: [4, 0, 0] }, { t: 0.5, rot: [-14, 8, 0] }, { t: 1.25, rot: [-10, 6, 0] }],
      head: [{ t: 0, rot: [6, 0, 0] }, { t: 0.5, rot: [18, -8, 0] }, { t: 1.25, rot: [14, -6, 0] }],
      // right leg extends toward the ball, left tucks under
      'hip.R': [{ t: 0, rot: [-10, 0, -2] }, { t: 0.45, rot: [-56, 0, -6] }, { t: 1.25, rot: [-50, 0, -6] }],
      'knee.R': [{ t: 0, rot: [16, 0, 0] }, { t: 0.45, rot: [6, 0, 0] }, { t: 1.25, rot: [8, 0, 0] }],
      'ankle.R': [{ t: 0, rot: [4, 0, 0] }, { t: 0.45, rot: [-14, 0, 0] }, { t: 1.25, rot: [-10, 0, 0] }],
      'hip.L': [{ t: 0, rot: [-8, 0, 2] }, { t: 0.45, rot: [22, 0, 8] }, { t: 1.25, rot: [20, 0, 8] }],
      'knee.L': [{ t: 0, rot: [16, 0, 0] }, { t: 0.45, rot: [96, 0, 0] }, { t: 1.25, rot: [92, 0, 0] }],
      // arms: trailing arm braces the ground, lead arm out
      'shoulder.L': [{ t: 0, rot: [10, 0, 14] }, { t: 0.5, rot: [70, 10, 30] }, { t: 1.25, rot: [66, 8, 26] }],
      'shoulder.R': [{ t: 0, rot: [10, 0, -12] }, { t: 0.5, rot: [-30, 0, -40] }, { t: 1.25, rot: [-26, 0, -36] }],
      'elbow.L': [{ t: 0, rot: [-16, 0, 0] }, { t: 0.5, rot: [-40, 0, 0] }, { t: 1.25, rot: [-36, 0, 0] }],
      'elbow.R': [{ t: 0, rot: [-16, 0, 0] }, { t: 0.5, rot: [-50, 0, 0] }, { t: 1.25, rot: [-46, 0, 0] }],
    },
    root: [
      { t: 0, pos: [0, 0, 0], rot: [0, 0, 0] },
      { t: 0.3, pos: [0, -0.22, 0.25], rot: [-18, 0, 6] },
      { t: 0.6, pos: [0, -0.5, 0.72], rot: [-40, 0, 10] },
      { t: 0.95, pos: [0, -0.52, 1.0], rot: [-42, 0, 10] },
      { t: 1.25, pos: [0, -0.48, 1.12], rot: [-38, 0, 8] },
    ],
  };
}

/* ============================================================= FALL (forward stumble) */
function fall() {
  return {
    name: 'fall', duration: 1.35, loop: false, ease: true,
    tracks: {
      spine: [{ t: 0, rot: [4, 0, 0] }, { t: 0.4, rot: [30, 6, 0] }, { t: 0.8, rot: [14, 0, 0] }, { t: 1.35, rot: [10, 0, 0] }],
      chest: [{ t: 0, rot: [2, 0, 0] }, { t: 0.4, rot: [24, -6, 0] }, { t: 1.35, rot: [8, 0, 0] }],
      neck: [{ t: 0, rot: [0, 0, 0] }, { t: 0.5, rot: [-22, 0, 0] }, { t: 1.35, rot: [-10, 0, 0] }],
      head: [{ t: 0, rot: [4, 0, 0] }, { t: 0.5, rot: [-18, 8, 0] }, { t: 1.35, rot: [-6, 0, 0] }],
      // arms fly forward to break the fall
      'shoulder.L': [{ t: 0, rot: [10, 0, 14] }, { t: 0.35, rot: [-120, -8, 24] }, { t: 0.8, rot: [-96, -4, 20] }, { t: 1.35, rot: [-70, 0, 18] }],
      'shoulder.R': [{ t: 0, rot: [10, 0, -14] }, { t: 0.35, rot: [-120, 8, -24] }, { t: 0.8, rot: [-96, 4, -20] }, { t: 1.35, rot: [-70, 0, -18] }],
      'elbow.L': [{ t: 0, rot: [-16, 0, 0] }, { t: 0.5, rot: [-30, 0, 0] }, { t: 1.35, rot: [-24, 0, 0] }],
      'elbow.R': [{ t: 0, rot: [-16, 0, 0] }, { t: 0.5, rot: [-30, 0, 0] }, { t: 1.35, rot: [-24, 0, 0] }],
      'hip.L': [{ t: 0, rot: [-10, 0, 2] }, { t: 0.5, rot: [-30, 0, 6] }, { t: 1.35, rot: [-26, 0, 6] }],
      'hip.R': [{ t: 0, rot: [-6, 0, -2] }, { t: 0.5, rot: [-18, 0, -6] }, { t: 1.35, rot: [-22, 0, -6] }],
      'knee.L': [{ t: 0, rot: [12, 0, 0] }, { t: 0.5, rot: [70, 0, 0] }, { t: 1.35, rot: [40, 0, 0] }],
      'knee.R': [{ t: 0, rot: [12, 0, 0] }, { t: 0.5, rot: [50, 0, 0] }, { t: 1.35, rot: [30, 0, 0] }],
    },
    root: [
      { t: 0, pos: [0, 0, 0], rot: [0, 0, 0] },
      { t: 0.4, pos: [0, -0.28, 0.3], rot: [40, 0, 0] },
      { t: 0.8, pos: [0, -0.66, 0.62], rot: [78, 0, 4] },
      { t: 1.35, pos: [0, -0.7, 0.66], rot: [82, 0, 4] },
    ],
  };
}

/* ============================================================= HEADER / JUMP */
function header() {
  return {
    name: 'header', duration: 1.1, loop: false, ease: true,
    tracks: {
      spine: [{ t: 0, rot: [6, 0, 0] }, { t: 0.2, rot: [16, 0, 0] }, { t: 0.45, rot: [-14, 0, 0] }, { t: 0.6, rot: [18, 0, 0] }, { t: 1.1, rot: [6, 0, 0] }],
      chest: [{ t: 0, rot: [4, 0, 0] }, { t: 0.2, rot: [10, 0, 0] }, { t: 0.45, rot: [-10, 0, 0] }, { t: 0.6, rot: [14, 0, 0] }, { t: 1.1, rot: [4, 0, 0] }],
      neck: [{ t: 0, rot: [0, 0, 0] }, { t: 0.45, rot: [-16, 0, 0] }, { t: 0.58, rot: [16, 0, 0] }, { t: 1.1, rot: [0, 0, 0] }],
      head: [{ t: 0, rot: [2, 0, 0] }, { t: 0.45, rot: [-14, 0, 0] }, { t: 0.58, rot: [18, 0, 0] }, { t: 1.1, rot: [2, 0, 0] }],
      // crouch -> extend -> tuck -> land
      'hip.L': [{ t: 0, rot: [-6, 0, 2] }, { t: 0.2, rot: [-40, 0, 4] }, { t: 0.45, rot: [-8, 0, 2] }, { t: 0.62, rot: [-26, 0, 4] }, { t: 1.1, rot: [-6, 0, 2] }],
      'knee.L': [{ t: 0, rot: [10, 0, 0] }, { t: 0.2, rot: [78, 0, 0] }, { t: 0.45, rot: [10, 0, 0] }, { t: 0.62, rot: [64, 0, 0] }, { t: 1.1, rot: [10, 0, 0] }],
      'ankle.L': [{ t: 0, rot: [4, 0, 0] }, { t: 0.4, rot: [30, 0, 0] }, { t: 0.55, rot: [-10, 0, 0] }, { t: 1.1, rot: [4, 0, 0] }],
      'hip.R': [{ t: 0, rot: [-6, 0, -2] }, { t: 0.2, rot: [-40, 0, -4] }, { t: 0.45, rot: [-8, 0, -2] }, { t: 0.62, rot: [-26, 0, -4] }, { t: 1.1, rot: [-6, 0, -2] }],
      'knee.R': [{ t: 0, rot: [10, 0, 0] }, { t: 0.2, rot: [78, 0, 0] }, { t: 0.45, rot: [10, 0, 0] }, { t: 0.62, rot: [64, 0, 0] }, { t: 1.1, rot: [10, 0, 0] }],
      'ankle.R': [{ t: 0, rot: [4, 0, 0] }, { t: 0.4, rot: [30, 0, 0] }, { t: 0.55, rot: [-10, 0, 0] }, { t: 1.1, rot: [4, 0, 0] }],
      // arms swing up to drive the jump
      'shoulder.L': [{ t: 0, rot: [20, 0, 12] }, { t: 0.2, rot: [40, 0, 16] }, { t: 0.45, rot: [-70, -8, 30] }, { t: 1.1, rot: [10, 0, 12] }],
      'shoulder.R': [{ t: 0, rot: [20, 0, -12] }, { t: 0.2, rot: [40, 0, -16] }, { t: 0.45, rot: [-70, 8, -30] }, { t: 1.1, rot: [10, 0, -12] }],
      'elbow.L': [{ t: 0, rot: [-20, 0, 0] }, { t: 0.45, rot: [-50, 0, 0] }, { t: 1.1, rot: [-18, 0, 0] }],
      'elbow.R': [{ t: 0, rot: [-20, 0, 0] }, { t: 0.45, rot: [-50, 0, 0] }, { t: 1.1, rot: [-18, 0, 0] }],
    },
    root: [
      { t: 0, pos: [0, 0, 0] }, { t: 0.2, pos: [0, -0.16, 0] },
      { t: 0.45, pos: [0, 0.52, 0.05] }, { t: 0.58, pos: [0, 0.46, 0.06] },
      { t: 0.78, pos: [0, -0.06, 0] }, { t: 1.1, pos: [0, 0, 0] },
    ],
  };
}

/* ============================================================= TURN / PIVOT */
function turn() {
  return {
    name: 'turn', duration: 0.55, loop: false, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [0, 0, 0] }, { t: 0.3, rot: [0, 14, 0] }, { t: 0.55, rot: [0, 0, 0] }],
      spine: [{ t: 0, rot: [4, 0, 6] }, { t: 0.3, rot: [6, -10, -6] }, { t: 0.55, rot: [4, 0, 0] }],
      chest: [{ t: 0, rot: [3, 0, 4] }, { t: 0.3, rot: [4, -12, -4] }, { t: 0.55, rot: [3, 0, 0] }],
      'hip.L': [{ t: 0, rot: [-8, 0, 2] }, { t: 0.3, rot: [-26, 0, 8] }, { t: 0.55, rot: [-8, 0, 2] }],
      'knee.L': [{ t: 0, rot: [12, 0, 0] }, { t: 0.3, rot: [56, 0, 0] }, { t: 0.55, rot: [12, 0, 0] }],
      'hip.R': [{ t: 0, rot: [-6, 0, -2] }, { t: 0.3, rot: [14, 0, -6] }, { t: 0.55, rot: [-6, 0, -2] }],
      'knee.R': [{ t: 0, rot: [12, 0, 0] }, { t: 0.3, rot: [28, 0, 0] }, { t: 0.55, rot: [12, 0, 0] }],
      'shoulder.L': [{ t: 0, rot: [10, 0, 14] }, { t: 0.3, rot: [-16, 0, 34] }, { t: 0.55, rot: [8, 0, 14] }],
      'shoulder.R': [{ t: 0, rot: [10, 0, -14] }, { t: 0.3, rot: [26, 0, -22] }, { t: 0.55, rot: [8, 0, -14] }],
      'elbow.L': [{ t: 0, rot: [-18, 0, 0] }, { t: 0.55, rot: [-18, 0, 0] }],
      'elbow.R': [{ t: 0, rot: [-18, 0, 0] }, { t: 0.55, rot: [-18, 0, 0] }],
    },
  };
}

/* ============================================================= CELEBRATION */
function celebrate() {
  const dur = 1.4;
  return {
    name: 'celebrate', duration: dur, loop: true, ease: true,
    tracks: {
      pelvis: [{ t: 0, rot: [0, 0, 0] }, { t: 0.7, rot: [-4, 0, 0] }, { t: 1.4, rot: [0, 0, 0] }],
      spine: [{ t: 0, rot: [-6, 0, 0] }, { t: 0.7, rot: [-12, 4, 0] }, { t: 1.4, rot: [-6, 0, 0] }],
      chest: [{ t: 0, rot: [-8, 0, 0] }, { t: 0.7, rot: [-12, -4, 0] }, { t: 1.4, rot: [-8, 0, 0] }],
      neck: [{ t: 0, rot: [-6, 0, 0] }, { t: 1.4, rot: [-6, 0, 0] }],
      head: [{ t: 0, rot: [-10, 6, 0] }, { t: 0.7, rot: [-10, -6, 0] }, { t: 1.4, rot: [-10, 6, 0] }],
      'shoulder.L': [{ t: 0, rot: [-150, -10, 30] }, { t: 0.7, rot: [-165, -6, 24] }, { t: 1.4, rot: [-150, -10, 30] }],
      'shoulder.R': [{ t: 0, rot: [-150, 10, -30] }, { t: 0.7, rot: [-165, 6, -24] }, { t: 1.4, rot: [-150, 10, -30] }],
      'elbow.L': [{ t: 0, rot: [-30, 0, 0] }, { t: 0.7, rot: [-12, 0, 0] }, { t: 1.4, rot: [-30, 0, 0] }],
      'elbow.R': [{ t: 0, rot: [-30, 0, 0] }, { t: 0.7, rot: [-12, 0, 0] }, { t: 1.4, rot: [-30, 0, 0] }],
      'hip.L': [{ t: 0, rot: [-6, 0, 2] }, { t: 1.4, rot: [-6, 0, 2] }],
      'hip.R': [{ t: 0, rot: [-6, 0, -2] }, { t: 1.4, rot: [-6, 0, -2] }],
      'knee.L': [{ t: 0, rot: [8, 0, 0] }, { t: 0.35, rot: [22, 0, 0] }, { t: 0.7, rot: [8, 0, 0] }, { t: 1.05, rot: [22, 0, 0] }, { t: 1.4, rot: [8, 0, 0] }],
      'knee.R': [{ t: 0, rot: [8, 0, 0] }, { t: 0.35, rot: [22, 0, 0] }, { t: 0.7, rot: [8, 0, 0] }, { t: 1.05, rot: [22, 0, 0] }, { t: 1.4, rot: [8, 0, 0] }],
    },
    root: [
      { t: 0, pos: [0, 0, 0] }, { t: 0.35, pos: [0, 0.07, 0] },
      { t: 0.7, pos: [0, 0, 0] }, { t: 1.05, pos: [0, 0.07, 0] }, { t: 1.4, pos: [0, 0, 0] },
    ],
  };
}

export function buildClips() {
  return {
    idle: idle(), walk: walk(), run: run(), sprint: sprint(),
    shoot: shoot(), pass: pass(), throwin: throwin(), slide: slide(),
    fall: fall(), header: header(), turn: turn(), celebrate: celebrate(),
  };
}

// metadata for the HUD buttons (label + whether it loops/locomotes)
export const CLIP_MENU = [
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Walk' },
  { id: 'run', label: 'Run' },
  { id: 'sprint', label: 'Sprint' },
  { id: 'shoot', label: 'Shoot' },
  { id: 'pass', label: 'Pass' },
  { id: 'throwin', label: 'Throw-in' },
  { id: 'slide', label: 'Slide' },
  { id: 'header', label: 'Header' },
  { id: 'fall', label: 'Fall' },
  { id: 'turn', label: 'Turn' },
  { id: 'celebrate', label: 'Celebrate' },
];
