import * as THREE from 'three';
import { createKit } from './PlayerKit.js';

/**
 * Procedurally builds a rigged, anatomically-proportioned footballer.
 *
 * Convention: Y up, player faces +Z. Limbs hang along -Y from their joint
 * pivot; the body stacks along +Y. Every joint is a THREE.Group so rotating it
 * drives all descendants (forward kinematics). Tapered cylinders + sphere caps
 * give a smooth, seam-free silhouette without skinned-mesh weight artifacts.
 *
 * Proportions are tuned for a ~1.80 m athlete (≈7.8 head-units).
 */
export function createPlayerModel(cfg = {}) {
  const kit = createKit(cfg);
  const root = new THREE.Group();
  root.name = 'player';

  const joints = {};
  const boneViz = [];

  // create a joint group at local `pos` under `parent`, register by name,
  // and (optionally) add a debug bone + node for the skeleton overlay.
  function joint(parent, name, pos, drawBone = true) {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    g.name = name;
    parent.add(g);
    joints[name] = g;
    if (drawBone && (pos[0] || pos[1] || pos[2])) {
      addBoneViz(parent, pos);
    }
    addNodeViz(g);
    return g;
  }

  function addBoneViz(parent, pos) {
    const len = Math.hypot(pos[0], pos[1], pos[2]);
    if (len < 1e-4) return;
    const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 6);
    geo.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, VIZ_BONE_MAT);
    // orient -Y toward the child position
    const dir = new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    m.visible = false;
    parent.add(m);
    boneViz.push(m);
  }
  function addNodeViz(g) {
    const n = new THREE.Mesh(VIZ_NODE_GEO, VIZ_NODE_MAT);
    n.visible = false;
    g.add(n);
    boneViz.push(n);
  }

  // ---- spine chain ----
  const pelvis = joint(root, 'pelvis', [0, 1.02, 0], false);
  const spine = joint(pelvis, 'spine', [0, 0.12, 0]);
  const chest = joint(spine, 'chest', [0, 0.20, 0]);
  const neck = joint(chest, 'neck', [0, 0.22, 0]);
  const head = joint(neck, 'head', [0, 0.10, 0]);

  // ---- arms ----
  buildArm('L', +1);
  buildArm('R', -1);
  // ---- legs ----
  buildLeg('L', +1);
  buildLeg('R', -1);

  function buildArm(side, s) {
    const sh = joint(chest, `shoulder.${side}`, [0.185 * s, 0.135, 0]);
    const el = joint(sh, `elbow.${side}`, [0, -0.30, 0]);
    const wr = joint(el, `wrist.${side}`, [0, -0.27, 0]);

    // deltoid cap (sleeve colour)
    sh.add(capSphere(0.072, kit.jersey, [0, 0.01, 0], [1.1, 1.0, 1.0]));
    // upper arm: short sleeve covers ~45%, then skin
    sh.add(tube(0.30, 0.052, 0.045, kit.skin));
    sh.add(sleeveRing(0.058, 0.10, kit.jersey, -0.02));
    // forearm
    el.add(capSphere(0.05, kit.skin));
    el.add(tube(0.27, 0.046, 0.036, kit.skin));
    // hand
    wr.add(capSphere(0.04, kit.skin));
    wr.add(buildHand(s, kit));
  }

  function buildLeg(side, s) {
    const hip = joint(pelvis, `hip.${side}`, [0.105 * s, -0.07, 0]);
    const knee = joint(hip, `knee.${side}`, [0, -0.45, 0]);
    const ankle = joint(knee, `ankle.${side}`, [0, -0.45, 0]);

    // thigh: shorts cover top, skin below
    hip.add(capSphere(0.10, kit.shorts, [0, 0.02, 0], [1.0, 0.9, 0.9]));
    hip.add(tube(0.45, 0.088, 0.062, kit.skin));
    hip.add(sleeveRing(0.095, 0.17, kit.shorts, -0.01)); // shorts leg
    // knee + shin (sock over lower shin)
    knee.add(capSphere(0.062, kit.skin));
    knee.add(tube(0.45, 0.062, 0.04, kit.skin));
    const sock = tube(0.32, 0.066, 0.05, kit.socks);
    sock.position.y = -0.11;
    knee.add(sock);
    knee.add(sleeveRing(0.067, 0.05, kit.socksBand, -0.12)); // sock band
    // boot
    ankle.add(buildBoot(s, kit));
  }

  // ---- torso shell (attached to chest so arms stay anchored) ----
  chest.add(buildTorso(kit));
  // shorts pelvis block
  pelvis.add(buildShorts(kit));
  // neck
  neck.add(neckMesh(kit));
  // head + face
  head.add(buildHead(kit));

  // expose useful refs for procedural motion
  const parts = {
    chest, head, pelvis, spine,
    handL: joints['wrist.L'], handR: joints['wrist.R'],
    footL: joints['ankle.L'], footR: joints['ankle.R'],
  };

  // shadows on every mesh
  root.traverse((o) => {
    if (o.isMesh && o.material !== VIZ_BONE_MAT && o.material !== VIZ_NODE_MAT) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, joints, parts, kit, boneViz, height: 1.8 };
}

/* ============================ geometry helpers ============================ */

// tapered limb spanning from y=0 (top) down to y=-len.
function tube(len, rTop, rBot, mat, radial = 16) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, radial, 1, false);
  geo.translate(0, -len / 2, 0);
  return new THREE.Mesh(geo, mat);
}

function capSphere(r, mat, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  return m;
}

// a short ring (cuff) used for short-sleeve / shorts hems.
function sleeveRing(r, h, mat, yTop) {
  const geo = new THREE.CylinderGeometry(r * 1.05, r, h, 16, 1, true);
  geo.translate(0, yTop - h / 2, 0);
  return new THREE.Mesh(geo, mat);
}

function neckMesh(kit) {
  const m = tube(0.13, 0.052, 0.06, kit.skin, 14);
  m.position.y = 0.0;
  return m;
}

/* ============================ torso ============================ */
function buildTorso(kit) {
  const g = new THREE.Group();
  // lathe profile from waist (-0.30) up to shoulders (+0.13), elliptical (flattened Z)
  const profile = [
    [0.085, -0.32],
    [0.135, -0.22],
    [0.150, -0.10],
    [0.165, 0.00],
    [0.180, 0.06],
    [0.165, 0.12],
    [0.120, 0.155],
    [0.055, 0.175],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 24);
  geo.scale(1.18, 1.0, 0.66); // broad chest, slim front-to-back
  const torso = new THREE.Mesh(geo, kit.jersey);
  g.add(torso);

  // collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 10, 24), kit.jerseyTrim);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.175;
  g.add(collar);

  // back number decal
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.20), kit.numberMat);
  num.position.set(0, 0.02, -0.135);
  num.rotation.y = Math.PI;
  g.add(num);

  // chest crest
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), kit.crestMat);
  crest.position.set(0.07, 0.06, 0.118);
  g.add(crest);

  // front side trim stripes
  const stripeGeo = new THREE.PlaneGeometry(0.03, 0.34);
  for (const sx of [-0.13, 0.13]) {
    const st = new THREE.Mesh(stripeGeo, kit.jerseyTrim);
    st.position.set(sx, -0.05, 0.115);
    st.rotation.x = -0.05;
    g.add(st);
  }
  return g;
}

function buildShorts(kit) {
  const g = new THREE.Group();
  const profile = [
    [0.10, -0.18],
    [0.155, -0.10],
    [0.165, -0.02],
    [0.155, 0.05],
    [0.12, 0.10],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 22);
  geo.scale(1.12, 1.0, 0.78);
  const shorts = new THREE.Mesh(geo, kit.shorts);
  shorts.position.y = -0.02;
  g.add(shorts);
  // waistband
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 10, 24), kit.shortsTrim);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.08;
  band.scale.set(1.12, 0.78, 1);
  g.add(band);
  return g;
}

/* ============================ head & face ============================ */
function buildHead(kit) {
  const g = new THREE.Group();
  g.position.y = 0.085;

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 28, 24), kit.skin);
  skull.scale.set(0.92, 1.06, 1.0);
  g.add(skull);

  // jaw / chin
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.072, 20, 16), kit.skin);
  jaw.scale.set(1.0, 0.8, 1.05);
  jaw.position.set(0, -0.07, 0.012);
  g.add(jaw);

  // nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 8), kit.skin);
  nose.rotation.x = Math.PI / 2.1;
  nose.position.set(0, -0.012, 0.10);
  g.add(nose);

  // eyes
  for (const sx of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.set(0.038 * sx, 0.012, 0.082);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 12), kit.eyeWhite);
    white.scale.set(1.2, 0.85, 0.7);
    socket.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 10), kit.eyeIris);
    iris.position.set(0, 0, 0.012);
    socket.add(iris);
    g.add(socket);
    // brow
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.008, 0.012), kit.brow);
    brow.position.set(0.038 * sx, 0.04, 0.088);
    brow.rotation.z = -0.12 * sx;
    g.add(brow);
  }

  // mouth
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), kit.mouth);
  mouth.position.set(0, -0.058, 0.092);
  g.add(mouth);

  // ears
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), kit.skin);
    ear.scale.set(0.4, 1.0, 0.7);
    ear.position.set(0.10 * sx, -0.01, 0.0);
    g.add(ear);
  }

  // hair cap (covers top + back)
  const hairGeo = new THREE.SphereGeometry(0.112, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const hair = new THREE.Mesh(hairGeo, kit.hair);
  hair.scale.set(0.95, 1.1, 1.03);
  hair.position.set(0, 0.012, -0.006);
  g.add(hair);
  // back hair patch
  const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 14), kit.hair);
  backHair.scale.set(0.95, 0.7, 0.8);
  backHair.position.set(0, 0.0, -0.05);
  g.add(backHair);

  return g;
}

/* ============================ hand (detailed) ============================ */
function buildHand(s, kit) {
  // s: +1 left (+X side), -1 right. Fingers hang along -Y with a relaxed curl.
  const hand = new THREE.Group();

  // palm
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.095, 0.035), kit.skin);
  roundBox(palm.geometry, 0.012);
  palm.position.y = -0.05;
  hand.add(palm);

  // 4 fingers
  const fingerX = [-0.027, -0.009, 0.009, 0.027];
  const fingerLen = [0.058, 0.066, 0.062, 0.05];
  fingerX.forEach((fx, i) => {
    const f = makeFinger(fingerLen[i], kit.skin);
    f.position.set(fx, -0.095, 0.004);
    f.rotation.x = 0.35 + i * 0.03;   // relaxed curl forward
    hand.add(f);
  });

  // thumb (on the inner side)
  const thumb = makeFinger(0.05, kit.skin, 0.014);
  thumb.position.set(-0.032 * s, -0.05, 0.018);
  thumb.rotation.set(0.5, 0, 0.9 * s);
  hand.add(thumb);

  return hand;
}

function makeFinger(len, mat, r = 0.011) {
  const f = new THREE.Group();
  const seg1Len = len * 0.55, seg2Len = len * 0.45;
  const s1 = tube(seg1Len, r, r * 0.92, mat, 10);
  f.add(s1);
  const joint2 = new THREE.Group();
  joint2.position.y = -seg1Len;
  joint2.rotation.x = 0.55; // second knuckle curl
  const s2 = tube(seg2Len, r * 0.92, r * 0.8, mat, 10);
  joint2.add(s2);
  // fingertip
  const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 8), mat);
  tip.position.y = -seg2Len;
  joint2.add(tip);
  f.add(joint2);
  // knuckle
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
  f.add(knuckle);
  return f;
}

/* ============================ boot ============================ */
function buildBoot(s, kit) {
  const g = new THREE.Group();
  // foot extends forward (+Z) from the ankle
  const len = 0.27, w = 0.085, h = 0.07;

  const foot = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), kit.boots);
  roundBox(foot.geometry, 0.022);
  foot.position.set(0, -0.045, 0.075);
  g.add(foot);

  // toe taper
  const toe = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), kit.boots);
  toe.scale.set(0.95, 0.7, 1.2);
  toe.position.set(0, -0.05, 0.20);
  g.add(toe);

  // heel
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 12), kit.boots);
  heel.scale.set(0.95, 0.9, 0.9);
  heel.position.set(0, -0.025, -0.03);
  g.add(heel);

  // sole
  const sole = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.02, len * 1.04),
    new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.5 }));
  sole.position.set(0, -0.082, 0.08);
  g.add(sole);

  // accent swoosh stripe
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.02), kit.bootAccent);
  stripe.position.set((w / 2 + 0.001) * s, -0.04, 0.085);
  stripe.rotation.y = (Math.PI / 2) * s;
  stripe.rotation.z = 0.15;
  g.add(stripe);

  // studs
  for (let i = 0; i < 4; i++) {
    for (const sx of [-1, 1]) {
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.014, 6), kit.boots);
      stud.position.set(0.025 * sx, -0.092, -0.02 + i * 0.06);
      g.add(stud);
    }
  }
  return g;
}

/* round the corners of a box geometry by pushing verts toward a shrunk core */
function roundBox(geo, r) {
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.max.x + bb.min.x) / 2;
  const cy = (bb.max.y + bb.min.y) / 2;
  const cz = (bb.max.z + bb.min.z) / 2;
  const ex = (bb.max.x - bb.min.x) / 2 - r;
  const ey = (bb.max.y - bb.min.y) / 2 - r;
  const ez = (bb.max.z - bb.min.z) / 2 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz);
    const clamped = new THREE.Vector3(
      THREE.MathUtils.clamp(v.x, -ex, ex),
      THREE.MathUtils.clamp(v.y, -ey, ey),
      THREE.MathUtils.clamp(v.z, -ez, ez)
    );
    const dir = v.clone().sub(clamped);
    if (dir.length() > 0) dir.setLength(r);
    const out = clamped.add(dir);
    pos.setXYZ(i, out.x + cx, out.y + cy, out.z + cz);
  }
  geo.computeVertexNormals();
}

/* ============================ debug viz materials ============================ */
const VIZ_BONE_MAT = new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.9, depthTest: false });
const VIZ_NODE_GEO = new THREE.SphereGeometry(0.02, 8, 8);
const VIZ_NODE_MAT = new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false });
