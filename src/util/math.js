// Math & easing helpers shared across the engine.
// All angles in the animation system are authored in degrees and converted here.

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const deg = (d) => d * DEG;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const mod = (n, m) => ((n % m) + m) % m;

// Smooth, organic easing curves used for blending and procedural motion.
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Angular interpolation taking the shortest path (radians).
export function lerpAngle(a, b, t) {
  let d = mod(b - a + Math.PI, TAU) - Math.PI;
  return a + d * t;
}

export const rand = (a, b) => a + Math.random() * (b - a);
