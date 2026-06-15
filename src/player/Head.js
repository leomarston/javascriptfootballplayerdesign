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
  g.position.y = 0.085;

  g.add(sculptedSkull(kit.skin));

  // ---- eyes ----
  for (const sx of [-1, 1]) g.add(buildEye(sx, kit));

  // ---- eyebrows ----
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.007, 0.01), kit.brow);
    roundEnds(brow.geometry, 0.003);
    brow.position.set(0.04 * sx, 0.043, 0.094);
    brow.rotation.z = -0.16 * sx;
    brow.rotation.x = -0.18;
    g.add(brow);
  }

  // ---- lips (subtle colour over the sculpted mouth) ----
  const upperLip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 10), kit.lips);
  upperLip.scale.set(1.7, 0.5, 0.5);
  upperLip.position.set(0, -0.05, 0.097);
  g.add(upperLip);
  const lowerLip = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 10), kit.lips);
  lowerLip.scale.set(1.5, 0.62, 0.55);
  lowerLip.position.set(0, -0.066, 0.097);
  g.add(lowerLip);
  const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0016, 0.006), kit.mouth);
  mouthLine.position.set(0, -0.058, 0.1);
  g.add(mouthLine);

  // ---- ears ----
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), kit.skin);
    ear.scale.set(0.36, 1.0, 0.72);
    ear.position.set(0.104 * sx, -0.006, -0.004);
    ear.rotation.y = -0.3 * sx;
    g.add(ear);
    const concha = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), kit.innerEar);
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
  const geo = new THREE.SphereGeometry(R, 72, 56);
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

  // brow ridge
  const brow = gauss(y - 0.045, 0.02) * gauss(x, 0.07) * front;
  dz += 0.008 * brow;

  // nose: bridge -> tip (forward), nostril flare
  const noseCol = gauss(x, 0.018) * gauss(y + 0.004, 0.05) * clamp((z - 0.03) / 0.07, 0, 1);
  dz += 0.030 * noseCol;
  const nostril = gauss(Math.abs(x) - 0.012, 0.012) * gauss(y + 0.03, 0.014) * front;
  dx += Math.sign(x || 1) * 0.004 * nostril; dz += 0.004 * nostril;

  // philtrum groove (nose -> upper lip)
  const phil = gauss(x, 0.006) * gauss(y + 0.04, 0.012) * front;
  dz -= 0.003 * phil;

  // cheekbones
  const cheek = gauss(Math.abs(x) - 0.05, 0.028) * gauss(y + 0.012, 0.03) * clamp((z - 0.03) / 0.06, 0, 1);
  dz += 0.008 * cheek; dx += Math.sign(x || 1) * 0.006 * cheek;

  // eye sockets (recess)
  const eye = gauss(Math.abs(x) - 0.038, 0.022) * gauss(y - 0.012, 0.02) * clamp((z - 0.04) / 0.05, 0, 1);
  dz -= 0.011 * eye;

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
  const eye = new THREE.Group();
  eye.position.set(0.038 * sx, 0.012, 0.073);

  const white = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 18, 14), kit.eyeWhite);
  white.scale.set(1.15, 0.92, 0.8);
  eye.add(white);

  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 16, 12), kit.eyeIris);
  iris.position.z = 0.011;
  eye.add(iris);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 10), kit.pupil);
  pupil.position.z = 0.016;
  eye.add(pupil);
  const hi = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 8), kit.eyeHi);
  hi.position.set(0.004 * sx, 0.004, 0.017);
  eye.add(hi);

  // upper eyelid (skin) covers the top third
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.019, 18, 12, 0, TAU, 0, Math.PI * 0.55), kit.skin);
  lid.scale.set(1.2, 1.0, 0.85);
  lid.rotation.x = -0.5;
  lid.position.set(0, 0.004, 0.004);
  eye.add(lid);
  // lower lid hint
  const llid = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 10, 0, TAU, 0, Math.PI * 0.3), kit.skin);
  llid.scale.set(1.15, 1.0, 0.8);
  llid.rotation.x = Math.PI + 0.4;
  llid.position.set(0, -0.006, 0.004);
  eye.add(llid);

  return eye;
}

/* ----------------------------------------------------------------- hair */
function buildHair(kit) {
  const geo = new THREE.SphereGeometry(R * 1.05, 56, 44, 0, TAU, 0, Math.PI * 0.7);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    // receding hairline: cut higher at the front (forehead), lower at back/sides
    const fr = v.z / R;                              // -1 back .. +1 front
    const cut = -0.16 + 0.26 * clamp(fr, 0, 1) - 0.02 * (1 - Math.abs(v.x) / R);
    if (v.y < cut) {
      // collapse below-hairline verts onto a clean edge at y=cut, hugging skull
      const r = R * 1.02;
      const yy = clamp(cut, -0.2, R);
      const rad = Math.sqrt(Math.max(0, r * r - yy * yy));
      const ang = Math.atan2(v.z, v.x);
      v.set(Math.cos(ang) * rad, yy, Math.sin(ang) * rad);
    } else {
      // volume: push outward with a little noise
      const n = 0.004 * (Math.sin(dir.x * 40) * Math.sin(dir.z * 38) * 0.5 + 0.5);
      v.addScaledVector(dir, 0.006 + n);
    }
  }
  geo.computeVertexNormals();
  const hair = new THREE.Mesh(geo, kit.hair);
  hair.scale.set(0.98, 1.06, 1.02);
  hair.position.set(0, 0.008, -0.004);

  const group = new THREE.Group();
  group.add(hair);

  // sideburns
  for (const sx of [-1, 1]) {
    const sb = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.02), kit.hair);
    roundEnds(sb.geometry, 0.005);
    sb.position.set(0.096 * sx, 0.0, 0.0);
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
