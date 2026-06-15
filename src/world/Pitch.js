import * as THREE from 'three';

// Regulation pitch (metres). Long axis along Z so a player facing +Z faces a goal.
export const FIELD = { L: 105, W: 68, lineW: 0.12 };
const PLANE = { W: 150, H: 118 }; // grass plane incl. run-off / surrounds

/**
 * Builds the whole playing environment: striped grass with baked FIFA line
 * markings, two goals with nets, surrounding running track and tiered stands.
 */
export function createPitch(scene) {
  const group = new THREE.Group();
  group.name = 'pitch';

  // ---- grass + markings (baked canvas texture) ----
  const tex = makePitchTexture();
  const grassMat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.92, metalness: 0.0,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(PLANE.W, PLANE.H), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- running track / surround ----
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE.W + 36, PLANE.H + 36),
    new THREE.MeshStandardMaterial({ color: 0x8a3b2e, roughness: 1.0 })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  surround.receiveShadow = true;
  group.add(surround);

  // ---- goals ----
  group.add(makeGoal(+FIELD.L / 2));
  const g2 = makeGoal(-FIELD.L / 2);
  g2.rotation.y = Math.PI;
  group.add(g2);

  // ---- stands ----
  group.add(makeStands());

  scene.add(group);
  return group;
}

/* ------------------------------------------------------------------ */
/* Pitch texture: mow stripes + white line markings                    */
/* ------------------------------------------------------------------ */
function makePitchTexture() {
  const ppm = 12;                          // pixels per metre
  const cw = Math.round(PLANE.W * ppm);
  const ch = Math.round(PLANE.H * ppm);
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');

  // world(x,z) -> canvas px
  const X = (x) => (x + PLANE.W / 2) * ppm;
  const Z = (z) => (z + PLANE.H / 2) * ppm;

  // base surround
  ctx.fillStyle = '#2f6b2a';
  ctx.fillRect(0, 0, cw, ch);

  // mow stripes across the pitch width (bands alternate along X, run along Z)
  const bands = 18;
  const bandW = FIELD.W / bands;
  for (let i = 0; i < bands; i++) {
    const x0 = -FIELD.W / 2 + i * bandW;
    ctx.fillStyle = i % 2 ? '#368a2f' : '#2e7a28';
    ctx.fillRect(X(x0), Z(-FIELD.L / 2), bandW * ppm + 1, FIELD.L * ppm);
  }
  // subtle vignette of trampled grass near centre
  const grd = ctx.createRadialGradient(X(0), Z(0), 20, X(0), Z(0), cw * 0.6);
  grd.addColorStop(0, 'rgba(255,255,255,0.04)');
  grd.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, cw, ch);

  // ---- white markings ----
  ctx.strokeStyle = 'rgba(245,250,245,0.92)';
  ctx.fillStyle = 'rgba(245,250,245,0.92)';
  ctx.lineWidth = FIELD.lineW * ppm;
  ctx.lineJoin = 'round';

  const rect = (x0, z0, x1, z1) => {
    ctx.strokeRect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm);
  };
  const circle = (cx, cz, r, fill = false) => {
    ctx.beginPath();
    ctx.arc(X(cx), Z(cz), r * ppm, 0, Math.PI * 2);
    fill ? ctx.fill() : ctx.stroke();
  };

  const halfL = FIELD.L / 2, halfW = FIELD.W / 2;
  rect(-halfW, -halfL, halfW, halfL);          // touch + goal lines
  // halfway line
  ctx.beginPath(); ctx.moveTo(X(-halfW), Z(0)); ctx.lineTo(X(halfW), Z(0)); ctx.stroke();
  circle(0, 0, 9.15);                          // centre circle
  circle(0, 0, 0.3, true);                     // centre spot

  for (const end of [+1, -1]) {
    const gl = end * halfL;                    // goal line z
    const inwards = -end;                      // direction toward centre
    // penalty area 16.5 deep x 40.32 wide
    rect(-20.16, gl, 20.16, gl + inwards * 16.5);
    // goal area 5.5 deep x 18.32 wide
    rect(-9.16, gl, 9.16, gl + inwards * 5.5);
    // penalty spot 11 m from goal line
    const spotZ = gl + inwards * 11;
    circle(0, spotZ, 0.3, true);
    // penalty arc (only the part outside the penalty area)
    arcPolyline(ctx, X(0), Z(spotZ), 9.15 * ppm, (z) => {
      const wz = spotZ + (z - Z(spotZ)) / ppm;
      return inwards > 0 ? wz > gl + inwards * 16.5 : wz < gl + inwards * 16.5;
    });
    // simple goal-net footprint hint
  }

  // corner arcs r=1
  const corners = [[-halfW, -halfL], [halfW, -halfL], [-halfW, halfL], [halfW, halfL]];
  for (const [cx, cz] of corners) {
    ctx.beginPath();
    ctx.arc(X(cx), Z(cz), 1 * ppm, 0, Math.PI * 2);
    ctx.stroke();
  }

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Stroke the subset of a circle whose canvas-Y points satisfy `keep(y)`.
function arcPolyline(ctx, cx, cy, r, keepWorldZ) {
  const N = 96;
  let started = false;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (keepWorldZ(py)) {
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    } else {
      started = false;
    }
  }
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* Goal with posts, crossbar and net                                   */
/* ------------------------------------------------------------------ */
function makeGoal(zLine) {
  const g = new THREE.Group();
  g.position.set(0, 0, zLine);

  const W = 7.32, H = 2.44, D = 2.0, r = 0.06;
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.45, metalness: 0.1 });
  const dirIn = zLine > 0 ? -1 : 1; // net extends toward centre

  const post = (x) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H, 16), postMat);
    m.position.set(x, H / 2, 0);
    m.castShadow = true;
    g.add(m);
  };
  post(-W / 2); post(W / 2);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, W + r * 2, 16), postMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, H, 0);
  bar.castShadow = true;
  g.add(bar);

  // back frame
  const backTop = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, W, 12), postMat);
  backTop.rotation.z = Math.PI / 2;
  backTop.position.set(0, H * 0.62, dirIn * D);
  g.add(backTop);

  // net
  const netTex = makeNetTexture();
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide,
    roughness: 1.0, metalness: 0, opacity: 0.92, color: 0xffffff,
  });
  // back (sloped from crossbar down to ground at depth D)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, Math.hypot(H, D)), netMat);
  back.position.set(0, H / 2, dirIn * D / 2);
  back.rotation.x = -dirIn * Math.atan2(H, D); // slope from crossbar to back-bottom
  g.add(back);
  // top
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, H, dirIn * D / 2);
  g.add(top);
  // sides
  for (const sx of [-W / 2, W / 2]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), netMat);
    side.rotation.y = Math.PI / 2;
    side.position.set(sx, H / 2, dirIn * D / 2);
    g.add(side);
  }
  return g;
}

function makeNetTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  const cells = 10;
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * s;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 6);
  return t;
}

/* ------------------------------------------------------------------ */
/* Tiered stands with a procedural crowd texture                       */
/* ------------------------------------------------------------------ */
function makeStands() {
  const g = new THREE.Group();
  const crowd = makeCrowdTexture();
  const mat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 1.0, metalness: 0 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1d2433, roughness: 0.9 });

  const standLen = (along) => (along ? FIELD.L + 30 : FIELD.W + 30);
  const offsets = [
    { x: 0, z: (FIELD.L / 2 + 16), ry: Math.PI, w: FIELD.W + 30 },
    { x: 0, z: -(FIELD.L / 2 + 16), ry: 0, w: FIELD.W + 30 },
    { x: (FIELD.W / 2 + 16), z: 0, ry: -Math.PI / 2, w: FIELD.L + 30 },
    { x: -(FIELD.W / 2 + 16), z: 0, ry: Math.PI / 2, w: FIELD.L + 30 },
  ];

  for (const o of offsets) {
    const stand = new THREE.Group();
    // sloped seating (ramped box) facing the pitch
    const depth = 16, height = 10;
    const geo = new THREE.BoxGeometry(o.w, height, depth, 1, 1, 1);
    // shear top toward back to make a rake
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) pos.setZ(i, pos.getZ(i) - depth * 0.28); // top leans back
    }
    geo.computeVertexNormals();
    const seat = new THREE.Mesh(geo, mat);
    seat.position.set(0, height / 2, depth / 2 + 1);
    seat.receiveShadow = true;
    stand.add(seat);

    // front wall / advert board
    const wall = new THREE.Mesh(new THREE.BoxGeometry(o.w, 1.4, 0.4), baseMat);
    wall.position.set(0, 0.7, 0.2);
    stand.add(wall);

    stand.position.set(o.x, 0, o.z);
    stand.rotation.y = o.ry;
    g.add(stand);
  }
  return g;
}

function makeCrowdTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#11161f';
  ctx.fillRect(0, 0, s, s);
  // scattered colored dots = distant crowd
  const palette = ['#e8e8e8', '#c94f4f', '#4f7fc9', '#d8c24a', '#5fb56a', '#b06fc9', '#e0a14a'];
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = palette[(Math.random() * palette.length) | 0];
    const x = Math.random() * s, y = Math.random() * s;
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    ctx.fillRect(x, y, 2.2, 2.2);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(24, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

