import * as THREE from 'three';

const TAU = Math.PI * 2;
const R = 0.108;                 // skull radius (m)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/**
 * Clean **low-poly** head. A faceted skull with a gentle jaw taper and a
 * slightly flattened face plane, dressed with deliberately simple stylised
 * features: small almond eyes, a 4-facet nose wedge, brow facets, a subtle
 * mouth, small ears and a faceted hair cap. No realistic sculpting — the
 * crisp flat-shaded facets ARE the style.
 */
export function buildHead(kit) {
  const g = new THREE.Group();
  g.position.y = 0.07;
  g.scale.setScalar(0.92);        // athletic head-to-body ratio

  g.add(lowPolySkull(kit.skin));

  // ---- eyes ----
  for (const sx of [-1, 1]) g.add(buildEye(sx, kit));

  // ---- brows (small dark facets above each eye) ----
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.01), kit.brow);
    roundEnds(brow.geometry, 0.0028);
    brow.position.set(0.034 * sx, 0.03, 0.093);
    brow.rotation.z = -0.12 * sx;
    brow.rotation.x = -0.12;
    g.add(brow);
  }

  // ---- nose (low-poly wedge) ----
  g.add(buildNose(kit.skin));

  // ---- mouth: a subtle line + one soft lower-lip facet ----
  const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0034, 0.004), kit.mouth);
  mouthLine.position.set(0, -0.05, 0.097);
  g.add(mouthLine);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.007), kit.lips);
  roundEnds(lip.geometry, 0.0035);
  lip.position.set(0, -0.058, 0.095);
  g.add(lip);

  // ---- ears ----
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), kit.skin);
    ear.scale.set(0.4, 1.0, 0.72);
    ear.position.set(0.1 * sx, -0.008, -0.002);
    ear.rotation.y = -0.3 * sx;
    g.add(ear);
  }

  // ---- hair ----
  g.add(buildHair(kit));

  return g;
}

/* ----------------------------------------------------------------- skull */
function lowPolySkull(mat) {
  const geo = new THREE.SphereGeometry(R, 12, 10);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let x = v.x, y = v.y * 1.06, z = v.z;     // a touch taller than wide
    const low = clamp(-y / R, 0, 1.2);
    x *= 1 - 0.22 * smooth(low);               // jaw + chin narrow
    if (z < 0) z *= 1.04;                       // fuller occiput
    if (z > 0.45 * R) z = 0.45 * R + (z - 0.45 * R) * 0.78; // flatten the face plane
    if (y < -0.62 * R && z > 0) z *= 0.9;       // tuck the chin
    v.set(x, y, z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.name = 'skull';
  return m;
}

/* ----------------------------------------------------------------- nose */
function buildNose(mat) {
  // a slim 4-faceted pyramid lying against the face, apex pointing forward
  const geo = new THREE.ConeGeometry(0.016, 0.042, 4);
  geo.rotateX(Math.PI * 0.5);     // apex now points +Z (forward)
  geo.rotateY(Math.PI * 0.25);    // square the facets to the face
  const nose = new THREE.Mesh(geo, mat);
  nose.scale.set(0.82, 0.7, 0.9);
  nose.position.set(0, -0.014, 0.094);
  nose.rotation.x = -0.6;         // tip dips down toward the lip
  return nose;
}

/* ----------------------------------------------------------------- eye */
function buildEye(sx, kit) {
  // small, clean almond eye that sits flush on the flattened face plane
  const eye = new THREE.Group();
  eye.position.set(0.0335 * sx, 0.002, 0.0975);
  eye.rotation.y = 0.3 * sx;
  eye.rotation.z = -0.05 * sx;

  const liner = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), kit.brow);
  liner.scale.set(1.55, 0.95, 0.16);
  liner.position.z = -0.001;
  eye.add(liner);

  const white = new THREE.Mesh(new THREE.SphereGeometry(0.0104, 8, 6), kit.eyeWhite);
  white.scale.set(1.45, 0.82, 0.4);
  white.position.z = 0.0024;
  eye.add(white);

  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 10), kit.eyeIris);
  iris.position.set(0, 0, 0.0076);
  eye.add(iris);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0028, 8), kit.pupil);
  pupil.position.set(0, 0, 0.0083);
  eye.add(pupil);

  return eye;
}

/* ----------------------------------------------------------------- hair */
function buildHair(kit) {
  // faceted low-poly cap with a clean hairline above the brow, lower at the
  // sides and back (forehead exposed)
  const geo = new THREE.SphereGeometry(R * 1.05, 13, 9, 0, TAU, 0, Math.PI * 0.5);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    const fr = clamp(v.z / R, -1, 1);          // -1 back .. +1 front
    const side = Math.abs(v.x) / R;
    // hairline: above the brow at the front, kept up off the ears at the sides
    const cut = 0.052 * Math.max(fr, 0) - 0.028 * Math.max(-fr, 0) - 0.02 * side + 0.014;
    if (v.y < cut) {
      const yy = clamp(cut, -0.12, R);
      const rad = Math.sqrt(Math.max(0, (R * 1.02) ** 2 - yy * yy));
      const ang = Math.atan2(v.z, v.x);
      v.set(Math.cos(ang) * rad, yy, Math.sin(ang) * rad);
    } else {
      v.addScaledVector(dir, 0.004);            // slight volume on top
    }
  }
  geo.computeVertexNormals();
  const hair = new THREE.Mesh(geo, kit.hair);
  hair.scale.set(1.02, 1.05, 1.04);
  hair.position.set(0, 0.006, -0.006);
  return hair;
}

/* round the short ends of a small box (brows, lip) */
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
