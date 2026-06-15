/**
 * Offscreen character renderer (developer tool).
 *
 * Renders the player model to PNGs headlessly so the geometry/proportions can
 * be reviewed without a browser. Requires a virtual display:
 *
 *     xvfb-run -a node tools/render.mjs
 *
 * Notes:
 *  - headless-gl only provides WebGL1, but three r160 skinning needs WebGL2
 *    (bone texture / texelFetch). So we draw a STATIC twin of the body geometry
 *    (bind pose) just for the screenshot; in the browser (WebGL2) the real
 *    SkinnedMesh renders and animates normally.
 *  - canvas-baked textures are skipped here (no 2D canvas in node), so colours
 *    are flat — the browser shows the full PBR textures, number, crest, bloom.
 */
import createGL from 'gl';
import { PNG } from 'pngjs';
import * as fs from 'node:fs';
import * as THREE from 'three';

// minimal canvas-2D stub so texture-baking code doesn't throw
function makeCtx(s) {
  return new Proxy({}, { get: (_, p) => {
    if (p === 'createImageData' || p === 'getImageData')
      return (w = s, h = s) => ({ data: new Uint8ClampedArray((w | 0 || s) * (h | 0 || s) * 4), width: w, height: h });
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (p === 'measureText') return () => ({ width: 10 });
    if (p === 'canvas') return { width: s, height: s };
    return () => {};
  }, set: () => true });
}
globalThis.document = { createElement: () => { const o = { width: 256, height: 256 }; o.getContext = () => makeCtx(o.width || 256); return o; } };

const { Player } = await import('../src/player/Player.js');
const { Ball } = await import('../src/gameplay/Ball.js');

const W = 720, H = 1040;
const gl = createGL(W, H, { preserveDrawingBuffer: true, antialias: true });
if (!gl) { console.error('No GL context — run under xvfb-run.'); process.exit(1); }
const canvas = { width: W, height: H, style: {}, addEventListener() {}, removeEventListener() {}, getContext() { return gl; } };
const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202830);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x404038, 1.0));
const key = new THREE.DirectionalLight(0xfff2d8, 2.6); key.position.set(3, 6, 5); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { near: 1, far: 20, left: -2, right: 2, top: 3, bottom: -1 });
scene.add(key);
const fill = new THREE.DirectionalLight(0x99bbff, 0.7); fill.position.set(-4, 2, 3); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(-2, 3, -4); scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const ball = new Ball(scene); ball.group.visible = false;
const player = new Player(scene, ball, { number: 10 });
player.object.position.set(0, 0, 0);

// strip textures + hide decal planes (flat-colour geometry review)
scene.traverse((o) => {
  if (!o.isMesh) return;
  const ms = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of ms) {
    for (const k of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'bumpMap', 'aoMap', 'emissiveMap', 'sheenColorMap', 'alphaMap', 'clearcoatMap', 'envMap']) if (m[k]) m[k] = null;
    m.needsUpdate = true;
    if (m.isMeshBasicMaterial && m.transparent) o.visible = false;
  }
});
player.model.skeletonHelper.visible = false;
// static twin of the skinned body (WebGL1 can't run r160 skinning)
const sm = player.model.mesh;
const twin = new THREE.Mesh(sm.geometry, sm.material);
twin.castShadow = true; twin.receiveShadow = true; twin.frustumCulled = false;
sm.parent.add(twin);
player.model.root.updateMatrixWorld(true);

const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
function shot(file, pos, look) {
  cam.position.set(...pos); cam.lookAt(...look); cam.updateMatrixWorld(true);
  renderer.render(scene, cam);
  const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
    png.data[d] = px[s]; png.data[d + 1] = px[s + 1]; png.data[d + 2] = px[s + 2]; png.data[d + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log('wrote', file);
}
const out = process.env.OUT || '/tmp';
shot(`${out}/front.png`, [0, 0.96, 3.5], [0, 0.92, 0]);
shot(`${out}/threequarter.png`, [1.7, 1.05, 2.7], [0, 0.92, 0]);
shot(`${out}/head.png`, [0.0, 1.62, 0.7], [0, 1.6, 0]);
console.log('DONE');
