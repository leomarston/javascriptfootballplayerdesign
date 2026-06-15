import * as THREE from 'three';
import { createKit } from './PlayerKit.js';
import { buildHead } from './Head.js';

const TAU = Math.PI * 2;
const N = 24;            // radial segments per body ring
const LIFT = 0.04;      // raise model so boot soles rest on the pitch

/**
 * Procedurally builds a real **skinned** footballer.
 *
 * The body is ONE continuous lofted surface: anatomically-profiled horizontal
 * cross-section rings (deltoid/biceps/calf bulges, slim waist, broad chest) are
 * stitched into a tube and bound to a THREE.Skeleton, so elbows, knees, hips,
 * shoulders and the waist deform SMOOTHLY — no segmented "primitive" look.
 * Each vertex blends weights between adjacent bones across the joint regions.
 * Soft ambient occlusion is baked into vertex colours (armpits, groin, joints).
 *
 * Terminal extremities that don't bend internally — head/face, hands+fingers,
 * boots — are detailed rigid meshes attached to the head/wrist/ankle bones.
 *
 * Convention: Y up, faces +Z, all bind-pose bones are vertical so every ring is
 * a horizontal ellipse — clean to author and to weight.
 */
export function createPlayerModel(cfg = {}) {
  const kit = createKit(cfg);
  const root = new THREE.Group();
  root.name = 'player';
  root.position.y = LIFT;

  /* ---------------- skeleton ---------------- */
  const boneMap = {};
  const boneList = [];
  const B = (name, parent, x, y) => {
    const b = new THREE.Bone();
    b.name = name;
    const px = parent ? boneMap[parent].userData.mx : 0;
    const py = parent ? boneMap[parent].userData.my : 0;
    b.position.set(x - px, y - py, 0);     // local offset from parent
    b.userData.mx = x; b.userData.my = y;  // remember model-space position
    if (parent) boneMap[parent].add(b);
    boneMap[name] = b; boneList.push(b);
    return b;
  };
  // spine
  B('pelvis', null, 0, 1.02);
  B('spine', 'pelvis', 0, 1.14);
  B('chest', 'spine', 0, 1.34);
  B('neck', 'chest', 0, 1.56);
  B('head', 'neck', 0, 1.66);
  // arms
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    B(`shoulder.${side}`, 'chest', 0.185 * s, 1.475);
    B(`elbow.${side}`, `shoulder.${side}`, 0.185 * s, 1.175);
    B(`wrist.${side}`, `elbow.${side}`, 0.185 * s, 0.905);
  }
  // legs
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    B(`hip.${side}`, 'pelvis', 0.105 * s, 0.95);
    B(`knee.${side}`, `hip.${side}`, 0.105 * s, 0.50);
    B(`ankle.${side}`, `knee.${side}`, 0.105 * s, 0.05);
  }
  const nameToIndex = {};
  boneList.forEach((b, i) => (nameToIndex[b.name] = i));

  /* ---------------- skinned geometry ---------------- */
  const positions = [], uvs = [], colors = [], skinIndices = [], skinWeights = [];
  const groups = { skin: [], jersey: [], shorts: [], socks: [], accent: [] };
  let vcount = 0;

  const pushWeights = (w) => {
    const items = (w || [['pelvis', 1]])
      .map(([n, wt]) => [nameToIndex[n] ?? 0, wt])
      .sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = items.reduce((s, it) => s + it[1], 0) || 1;
    const idx = [0, 0, 0, 0], wts = [0, 0, 0, 0];
    items.forEach((it, k) => { idx[k] = it[0]; wts[k] = it[1] / sum; });
    skinIndices.push(...idx); skinWeights.push(...wts);
  };

  // stitch a vertical stack of horizontal elliptical rings into a tube
  const addStack = (rings) => {
    const ringStart = [];
    let v = 0;
    rings.forEach((r) => {
      ringStart.push(vcount);
      const z0 = r.z || 0, ao = r.ao == null ? 1 : r.ao;
      for (let j = 0; j < N; j++) {
        const a = (j / N) * TAU;
        positions.push(r.x + Math.cos(a) * r.rx, r.y, z0 + Math.sin(a) * r.rz);
        uvs.push(j / N, v);
        colors.push(ao, ao, ao);
        pushWeights(r.w);
        vcount++;
      }
      v += 0.12;
    });
    for (let i = 0; i < rings.length - 1; i++) {
      const b0 = ringStart[i], b1 = ringStart[i + 1];
      const arr = groups[rings[i].mat];
      for (let j = 0; j < N; j++) {
        const j1 = (j + 1) % N;
        arr.push(b0 + j, b0 + j1, b1 + j1, b0 + j, b1 + j1, b1 + j);
      }
    }
  };

  // ---- torso (jersey) ----
  addStack([
    { y: 0.98, x: 0, rx: 0.135, rz: 0.105, w: [['pelvis', 0.6], ['spine', 0.4]], ao: 0.9, mat: 'jersey' },
    { y: 1.06, x: 0, rx: 0.128, rz: 0.098, w: [['spine', 1]], mat: 'jersey' },
    { y: 1.16, x: 0, rx: 0.150, rz: 0.112, w: [['spine', 0.6], ['chest', 0.4]], mat: 'jersey' },
    { y: 1.26, x: 0, rx: 0.176, rz: 0.122, w: [['chest', 1]], mat: 'jersey' },
    { y: 1.35, x: 0, rx: 0.182, rz: 0.118, w: [['chest', 1]], mat: 'jersey' },
    { y: 1.43, x: 0, rx: 0.168, rz: 0.102, w: [['chest', 1]], ao: 0.92, mat: 'jersey' },
    { y: 1.49, x: 0, rx: 0.120, rz: 0.085, w: [['chest', 0.7], ['neck', 0.3]], ao: 0.85, mat: 'jersey' },
  ]);
  // ---- neck (skin) ----
  addStack([
    { y: 1.47, x: 0, rx: 0.058, rz: 0.055, w: [['chest', 0.5], ['neck', 0.5]], ao: 0.85, mat: 'skin' },
    { y: 1.55, x: 0, rx: 0.052, rz: 0.05, w: [['neck', 1]], mat: 'skin' },
    { y: 1.62, x: 0, rx: 0.05, rz: 0.048, w: [['neck', 0.55], ['head', 0.45]], mat: 'skin' },
  ]);
  // ---- shorts: central pelvis ----
  addStack([
    { y: 0.80, x: 0, rx: 0.150, rz: 0.120, w: [['pelvis', 1]], ao: 0.9, mat: 'shorts' },
    { y: 0.90, x: 0, rx: 0.162, rz: 0.128, w: [['pelvis', 1]], mat: 'shorts' },
    { y: 1.00, x: 0, rx: 0.150, rz: 0.118, w: [['pelvis', 0.7], ['spine', 0.3]], mat: 'shorts' },
  ]);

  // ---- arms + shorts-leg + legs, per side ----
  for (const [s, side] of [[1, 'L'], [-1, 'R']]) {
    const x = 0.185 * s;
    addStack([
      { y: 1.475, x, rx: 0.064, rz: 0.064, w: [[`shoulder.${side}`, 0.7], ['chest', 0.3]], ao: 0.8, mat: 'jersey' },
      { y: 1.40, x, rx: 0.060, rz: 0.060, w: [[`shoulder.${side}`, 1]], ao: 0.92, mat: 'jersey' },
      { y: 1.30, x, rx: 0.052, rz: 0.052, w: [[`shoulder.${side}`, 1]], mat: 'jersey' },
      { y: 1.24, x, rx: 0.049, rz: 0.049, w: [[`shoulder.${side}`, 0.9], [`elbow.${side}`, 0.1]], mat: 'skin' },
      { y: 1.175, x, rx: 0.040, rz: 0.040, w: [[`shoulder.${side}`, 0.5], [`elbow.${side}`, 0.5]], mat: 'skin' },
      { y: 1.10, x, rx: 0.044, rz: 0.044, w: [[`elbow.${side}`, 0.9], [`shoulder.${side}`, 0.1]], mat: 'skin' },
      { y: 1.00, x, rx: 0.038, rz: 0.038, w: [[`elbow.${side}`, 1]], mat: 'skin' },
      { y: 0.94, x, rx: 0.030, rz: 0.030, w: [[`elbow.${side}`, 0.55], [`wrist.${side}`, 0.45]], mat: 'skin' },
      { y: 0.905, x, rx: 0.028, rz: 0.028, w: [[`wrist.${side}`, 1]], mat: 'skin' },
    ]);
    const lx = 0.105 * s;
    // shorts leg over upper thigh
    addStack([
      { y: 0.78, x: lx, rx: 0.118, rz: 0.108, w: [[`hip.${side}`, 1]], mat: 'shorts' },
      { y: 0.88, x: lx, rx: 0.122, rz: 0.112, w: [[`hip.${side}`, 0.85], ['pelvis', 0.15]], mat: 'shorts' },
    ]);
    // leg: thigh (skin) -> sock band (accent) -> sock (socks)
    addStack([
      { y: 0.95, x: lx, rx: 0.105, rz: 0.100, w: [[`hip.${side}`, 0.8], ['pelvis', 0.2]], ao: 0.82, mat: 'skin' },
      { y: 0.86, x: lx, rx: 0.098, rz: 0.094, w: [[`hip.${side}`, 1]], mat: 'skin' },
      { y: 0.74, x: lx, rx: 0.090, rz: 0.086, w: [[`hip.${side}`, 1]], mat: 'skin' },
      { y: 0.60, x: lx, rx: 0.076, rz: 0.072, w: [[`hip.${side}`, 0.85], [`knee.${side}`, 0.15]], mat: 'skin' },
      { y: 0.50, x: lx, rx: 0.062, rz: 0.060, w: [[`hip.${side}`, 0.5], [`knee.${side}`, 0.5]], mat: 'skin' },
      { y: 0.44, x: lx, rx: 0.060, rz: 0.058, w: [[`knee.${side}`, 0.85], [`hip.${side}`, 0.15]], mat: 'skin' },
      { y: 0.405, x: lx, rx: 0.067, rz: 0.065, w: [[`knee.${side}`, 1]], mat: 'accent' },
      { y: 0.36, x: lx, rx: 0.070, rz: 0.067, w: [[`knee.${side}`, 1]], mat: 'socks' },
      { y: 0.24, x: lx, rx: 0.058, rz: 0.056, w: [[`knee.${side}`, 1]], mat: 'socks' },
      { y: 0.12, x: lx, rx: 0.045, rz: 0.044, w: [[`knee.${side}`, 0.55], [`ankle.${side}`, 0.45]], mat: 'socks' },
      { y: 0.05, x: lx, rx: 0.040, rz: 0.039, w: [[`ankle.${side}`, 1]], mat: 'socks' },
    ]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const order = ['skin', 'jersey', 'shorts', 'socks', 'accent'];
  let index = [], start = 0;
  for (let m = 0; m < order.length; m++) {
    const arr = groups[order[m]];
    if (!arr.length) continue;
    index = index.concat(arr);
    geo.addGroup(start, arr.length, m);
    start += arr.length;
  }
  geo.setIndex(index);
  geo.computeVertexNormals();

  const materials = order.map((k) => kit.body[k]);
  const mesh = new THREE.SkinnedMesh(geo, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const skeleton = new THREE.Skeleton(boneList);
  root.add(mesh);
  mesh.add(boneList[0]);
  root.updateMatrixWorld(true);
  mesh.bind(skeleton);

  /* ---------------- rigid detail on terminal bones ---------------- */
  boneMap.head.add(buildHead(kit));
  boneMap['wrist.L'].add(buildHand(+1, kit));
  boneMap['wrist.R'].add(buildHand(-1, kit));
  boneMap['ankle.L'].add(buildBoot(+1, kit));
  boneMap['ankle.R'].add(buildBoot(-1, kit));
  // kit decals on the chest bone
  buildChestDecals(boneMap.chest, kit);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

  /* ---------------- skeleton overlay ---------------- */
  const skeletonHelper = new THREE.SkeletonHelper(mesh);
  skeletonHelper.material.color = new THREE.Color(0x38e1ff);
  skeletonHelper.material.depthTest = false;
  skeletonHelper.visible = false;
  root.add(skeletonHelper);

  return {
    root, mesh, skeleton, skeletonHelper, joints: boneMap, kit, height: 1.85,
    parts: { head: boneMap.head, handL: boneMap['wrist.L'], handR: boneMap['wrist.R'] },
  };
}

/* head & face are sculpted in Head.js (imported buildHead) */

/* ============================ hand (detailed) ============================ */
function buildHand(s, kit) {
  const hand = new THREE.Group();

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.092, 0.034), kit.skin);
  roundBox(palm.geometry, 0.012);
  palm.position.y = -0.048;
  hand.add(palm);

  const fingerX = [-0.026, -0.0085, 0.0085, 0.026];
  const fingerLen = [0.056, 0.064, 0.06, 0.048];
  fingerX.forEach((fx, i) => {
    const f = makeFinger(fingerLen[i], kit.skin);
    f.position.set(fx, -0.092, 0.004);
    f.rotation.x = 0.34 + i * 0.03;
    hand.add(f);
  });

  const thumb = makeFinger(0.05, kit.skin, 0.014);
  thumb.position.set(-0.03 * s, -0.05, 0.018);
  thumb.rotation.set(0.5, 0, 0.95 * s);
  hand.add(thumb);

  return hand;
}

function makeFinger(len, mat, r = 0.011) {
  const f = new THREE.Group();
  const a = len * 0.55, b = len * 0.45;
  f.add(taper(a, r, r * 0.92, mat));
  const j2 = new THREE.Group();
  j2.position.y = -a; j2.rotation.x = 0.55;
  j2.add(taper(b, r * 0.92, r * 0.8, mat));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 8), mat);
  tip.position.y = -b; j2.add(tip);
  f.add(j2);
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
  f.add(knuckle);
  return f;
}

function taper(len, rTop, rBot, mat) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, 10);
  geo.translate(0, -len / 2, 0);
  return new THREE.Mesh(geo, mat);
}

/* ============================ boot ============================ */
function buildBoot(s, kit) {
  const g = new THREE.Group();
  const len = 0.27, w = 0.086, h = 0.072;

  const foot = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), kit.boots);
  roundBox(foot.geometry, 0.024);
  foot.position.set(0, -0.045, 0.075);
  g.add(foot);

  const toe = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), kit.boots);
  toe.scale.set(0.95, 0.7, 1.2);
  toe.position.set(0, -0.05, 0.20);
  g.add(toe);

  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), kit.boots);
  heel.scale.set(0.95, 0.92, 0.9);
  heel.position.set(0, -0.024, -0.03);
  g.add(heel);

  // ankle collar (covers sock end)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.06, 16), kit.boots);
  collar.position.set(0, 0.015, 0.01);
  g.add(collar);

  const sole = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.02, len * 1.04), kit.sole);
  sole.position.set(0, -0.083, 0.08);
  g.add(sole);

  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.022), kit.bootAccent);
  stripe.position.set((w / 2 + 0.002) * s, -0.04, 0.085);
  stripe.rotation.y = (Math.PI / 2) * s;
  stripe.rotation.z = 0.16;
  g.add(stripe);

  for (let i = 0; i < 4; i++) {
    for (const sx of [-1, 1]) {
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.014, 6), kit.boots);
      stud.position.set(0.026 * sx, -0.093, -0.02 + i * 0.06);
      g.add(stud);
    }
  }
  return g;
}

/* ============================ chest decals ============================ */
function buildChestDecals(chestBone, kit) {
  // positions are local to the chest bone (model y≈1.34)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.015, 12, 28), kit.collarMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.135, 0.0);
  collar.scale.set(1.15, 0.9, 1);
  chestBone.add(collar);

  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), kit.numberMat);
  num.position.set(0, 0.0, -0.13);
  num.rotation.y = Math.PI;
  chestBone.add(num);

  const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), kit.crestMat);
  crest.position.set(0.075, 0.05, 0.12);
  chestBone.add(crest);
}

/* round box corners by projecting verts onto a shrunken core + radius */
function roundBox(geo, r) {
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const c = { x: (bb.max.x + bb.min.x) / 2, y: (bb.max.y + bb.min.y) / 2, z: (bb.max.z + bb.min.z) / 2 };
  const e = { x: (bb.max.x - bb.min.x) / 2 - r, y: (bb.max.y - bb.min.y) / 2 - r, z: (bb.max.z - bb.min.z) / 2 - r };
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - c.x, pos.getY(i) - c.y, pos.getZ(i) - c.z);
    const cl = new THREE.Vector3(
      THREE.MathUtils.clamp(v.x, -e.x, e.x),
      THREE.MathUtils.clamp(v.y, -e.y, e.y),
      THREE.MathUtils.clamp(v.z, -e.z, e.z));
    const d = v.clone().sub(cl);
    if (d.length() > 0) d.setLength(r);
    const o = cl.add(d);
    pos.setXYZ(i, o.x + c.x, o.y + c.y, o.z + c.z);
  }
  geo.computeVertexNormals();
}
