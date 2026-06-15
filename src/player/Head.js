import * as THREE from 'three';

const TAU = Math.PI * 2;
const R = 0.108;                 // skull radius (m)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = (d, s) => Math.exp(-(d * d) / (s * s));

/**
 * A procedurally **sculpted** head: we start from a smooth UV sphere and
 * displace its vertices with anatomical Gaussian "brush strokes" — brow ridge,
 * nose bridge & tip, nostrils, cheekbones, recessed eye sockets, lips with a
 * mouth crease, philtrum, chin and jaw taper. The result is one continuous
 * face surface (not assembled primitives). Eyes, lids, brows, lips, ears and
 * hair (with a real receding hairline) are layered on top.
 */
export function buildHead(kit) {
  const g = new THREE.Group();
  g.position.y = 0.072;
  g.scale.setScalar(0.9);   // athletic head-to-body ratio (was bobble-headed)

  g.add(sculptedSkull(kit.skin));

  // ---- eyes ----
  for (const sx of [-1, 1]) g.add(buildEye(sx, kit));

  // ---- eyebrows ----
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.008), kit.brow);
    roundEnds(brow.geometry, 0.0025);
    brow.position.set(0.04 * sx, 0.058, 0.097);
    brow.rotation.z = -0.14 * sx;
    brow.rotation.x = -0.16;
    g.add(brow);
  }

  // ---- lips (subtle colour over the sculpted mouth) ----
  const upperLip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 5), kit.lips);
  upperLip.scale.set(1.7, 0.5, 0.5);
  upperLip.position.set(0, -0.05, 0.097);
  g.add(upperLip);
  const lowerLip = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 5), kit.lips);
  lowerLip.scale.set(1.5, 0.62, 0.55);
  lowerLip.position.set(0, -0.066, 0.097);
  g.add(lowerLip);
  const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0016, 0.006), kit.mouth);
  mouthLine.position.set(0, -0.058, 0.1);
  g.add(mouthLine);

  // ---- ears ----
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 7, 5), kit.skin);
    ear.scale.set(0.36, 1.0, 0.72);
    ear.position.set(0.104 * sx, -0.006, -0.004);
    ear.rotation.y = -0.3 * sx;
    g.add(ear);
    const concha = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), kit.innerEar);
    concha.scale.set(0.3, 0.9, 0.6);
    concha.position.set(0.108 * sx, -0.006, 0.006);
    g.add(concha);
  }

  // ---- hair ----
  g.add(buildHair(kit));

  return g;
}

/* ----------------------------------------------------------------- skull */
function sculptedSkull(mat) {
  const geo = new THREE.SphereGeometry(R, 14, 11);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    sculpt(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.name = 'skull';
  return m;
}

function sculpt(v) {
  let x = v.x, y = v.y * 1.05, z = v.z;       // slightly long skull

  // jaw / chin taper (narrow the lower-front)
  const low = clamp(-y / R, 0, 1.3);
  x *= 1 - 0.20 * smooth(low);
  if (z < 0) z *= 1.05;                         // occiput fullness

  const front = clamp((z - 0.02) / 0.06, 0, 1); // 0 behind, 1 on the face
  let dx = 0, dy = 0, dz = 0;

  // brow ridge (subtle, so it doesn't shadow the eyes)
  const brow = gauss(y - 0.05, 0.018) * gauss(x, 0.07) * front;
  dz += 0.005 * brow;

  // nose: subtle bridge -> tip (forward), gentle nostril
  const noseCol = gauss(x, 0.011) * gauss(y + 0.006, 0.034) * clamp((z - 0.03) / 0.07, 0, 1);
  dz += 0.013 * noseCol;
  const nostril = gauss(Math.abs(x) - 0.012, 0.009) * gauss(y + 0.026, 0.01) * front;
  dx += Math.sign(x || 1) * 0.0025 * nostril; dz += 0.0015 * nostril;

  // philtrum groove (nose -> upper lip)
  const phil = gauss(x, 0.006) * gauss(y + 0.04, 0.012) * front;
  dz -= 0.003 * phil;

  // cheekbones
  const cheek = gauss(Math.abs(x) - 0.05, 0.028) * gauss(y + 0.012, 0.03) * clamp((z - 0.03) / 0.06, 0, 1);
  dz += 0.008 * cheek; dx += Math.sign(x || 1) * 0.006 * cheek;

  // very faint eye-socket hint (kept tiny so eyes stay fully lit)
  const eye = gauss(Math.abs(x) - 0.038, 0.02) * gauss(y - 0.014, 0.016) * clamp((z - 0.04) / 0.05, 0, 1);
  dz -= 0.0015 * eye;

  // lips + mouth crease
  const crease = gauss(y + 0.058, 0.005) * gauss(x, 0.03) * front;
  dz -= 0.006 * crease;
  const upper = gauss(y + 0.05, 0.007) * gauss(x, 0.028) * front;
  dz += 0.004 * upper;
  const lower = gauss(y + 0.068, 0.008) * gauss(x, 0.026) * front;
  dz += 0.005 * lower;

  // chin
  const chin = gauss(x, 0.03) * gauss(y + 0.088, 0.022) * clamp((z + 0.02) / 0.06, 0, 1);
  dz += 0.010 * chin; dy -= 0.004 * chin;

  // temples flatten
  if (Math.abs(x) > 0.07 && y > 0.02) x *= 0.985;

  v.set(x + dx, y + dy, z + dz);
}

/* ----------------------------------------------------------------- eye */
function buildEye(sx, kit) {
  // A clean almond eye that sits flush on the face and stays fully lit.
  const eye = new THREE.Group();
  eye.position.set(0.0335 * sx, 0.008, 0.0995);
  eye.rotation.y = 0.32 * sx;        // follow the face normal (faces out)
  eye.rotation.z = -0.05 * sx;       // slight outer tilt

  // thin dark lash-line behind defines the almond outline
  const liner = new THREE.Mesh(new THREE.SphereGeometry(0.0108, 8, 6), kit.brow);
  liner.scale.set(1.6, 0.95, 0.16);
  liner.position.z = -0.001;
  eye.add(liner);

  // white sclera almond (sits proud of the face so it always catches light)
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.0098, 8, 6), kit.eyeWhite);
  white.scale.set(1.42, 0.8, 0.4);
  white.position.z = 0.0022;
  eye.add(white);

  // iris + pupil on the white — sized like a real iris (≈ half the eye opening)
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 10), kit.eyeIris);
  iris.position.set(0, 0, 0.0078);
  eye.add(iris);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0028, 8), kit.pupil);
  pupil.position.set(0, 0, 0.0085);
  eye.add(pupil);
  const hi = new THREE.Mesh(new THREE.CircleGeometry(0.0015, 6), kit.eyeHi);
  hi.position.set(0.0026 * sx, 0.0026, 0.0091);
  eye.add(hi);

  return eye;
}

/* ----------------------------------------------------------------- hair */
function buildHair(kit) {
  // a short, swept hairstyle that sits ON TOP of the skull with the hairline
  // clearly above the brow (forehead exposed), lower at the sides/back.
  const geo = new THREE.SphereGeometry(R * 1.04, 16, 11, 0, TAU, 0, Math.PI * 0.52);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    const fr = clamp(v.z / R, -1, 1);          // -1 back .. +1 front
    const side = Math.abs(v.x) / R;
    // hairline: high at the forehead, lower at sides, lower at the back
    const cut = 0.078 * Math.max(fr, 0) - 0.085 * Math.max(-fr, 0) - 0.05 * side - 0.005;
    if (v.y < cut) {
      const r = R * 1.02;
      const yy = clamp(cut, -0.12, R);
      const rad = Math.sqrt(Math.max(0, r * r - yy * yy));
      const ang = Math.atan2(v.z, v.x);
      v.set(Math.cos(ang) * rad, yy, Math.sin(ang) * rad);
    } else {
      const n = 0.0028 * (Math.sin(dir.x * 34) * Math.sin(dir.z * 30) * 0.5 + 0.5);
      v.addScaledVector(dir, 0.004 + n);
    }
  }
  geo.computeVertexNormals();
  const hair = new THREE.Mesh(geo, kit.hair);
  hair.scale.set(1.0, 1.04, 1.02);
  hair.position.set(0, 0.004, -0.006);

  const group = new THREE.Group();
  group.add(hair);

  for (const sx of [-1, 1]) {
    const sb = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.038, 0.018), kit.hair);
    roundEnds(sb.geometry, 0.004);
    sb.position.set(0.094 * sx, 0.01, 0.004);
    group.add(sb);
  }
  return group;
}

/* round the short ends of a small box (for brows, sideburns) */
function roundEnds(geo, r) {
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const ey = (bb.max.y - bb.min.y) / 2 - r;
  const ez = (bb.max.z - bb.min.z) / 2 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const cy = clamp(v.y, -ey, ey), cz = clamp(v.z, -ez, ez);
    const dy = v.y - cy, dz = v.z - cz;
    const d = Math.hypot(dy, dz);
    if (d > 0) { const k = r / d; v.y = cy + dy * k; v.z = cz + dz * k; }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
}

const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
