import * as THREE from 'three';

/**
 * Materials + baked decals for the player.
 *
 * Two material sets:
 *  • `body*`   — used by the SkinnedMesh; vertexColors ON so we can bake soft
 *                ambient-occlusion into the mesh (armpits, groin, joints).
 *  • detail    — for rigid attached parts (head, hands, boots); vertexColors OFF.
 *
 * Cloth uses MeshPhysicalMaterial sheen (the fuzzy retro-reflection of fabric);
 * boots use clearcoat (synthetic leather sheen). Subtle noise roughness/bump
 * maps break up the flatness so surfaces don't look CG-clean.
 */
export function createKit(cfg = {}) {
  const c = {
    primary: 0x12379e, secondary: 0xffffff, accent: 0xffd23f,
    socks: 0x0e2a78, skin: 0xc88e62, hair: 0x161312,
    boots: 0x111418, bootAccent: 0x38e1ff, number: 10, ...cfg,
  };

  const noise = makeNoiseTexture(256, 0.5);
  const weave = makeWeaveTexture(128);
  const skinBump = makeNoiseTexture(256, 0.85);

  // ---------- body (skinned) materials ----------
  const bodySkin = new THREE.MeshStandardMaterial({
    color: c.skin, roughness: 0.64, metalness: 0.0, vertexColors: true,
    roughnessMap: noise, bumpMap: skinBump, bumpScale: 0.004, side: THREE.DoubleSide,
    emissive: new THREE.Color(c.skin).multiplyScalar(0.06),
  });
  const bodyJersey = new THREE.MeshPhysicalMaterial({
    color: c.primary, roughness: 0.66, metalness: 0.0, vertexColors: true,
    sheen: 0.7, sheenRoughness: 0.85, sheenColor: new THREE.Color(0xffffff),
    bumpMap: weave, bumpScale: 0.003, side: THREE.DoubleSide,
  });
  const bodyShorts = makeCloth(c.secondary, weave);
  const bodySocks = makeCloth(c.socks, weave);
  const bodyAccent = new THREE.MeshStandardMaterial({
    color: c.accent, roughness: 0.6, vertexColors: true, side: THREE.DoubleSide,
  });

  // ---------- detail (rigid) materials ----------
  const skin = new THREE.MeshStandardMaterial({
    color: c.skin, roughness: 0.6, metalness: 0.0,
    roughnessMap: noise, bumpMap: skinBump, bumpScale: 0.004,
    emissive: new THREE.Color(c.skin).multiplyScalar(0.06),
  });
  const boots = new THREE.MeshPhysicalMaterial({
    color: c.boots, roughness: 0.34, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.28,
  });
  const bootAccent = new THREE.MeshStandardMaterial({
    color: c.bootAccent, roughness: 0.4, metalness: 0.2,
    emissive: new THREE.Color(c.bootAccent).multiplyScalar(0.25),
  });
  const sole = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.5 });
  const hair = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.74, metalness: 0.02 });
  const mouth = new THREE.MeshStandardMaterial({ color: 0x6a3a33, roughness: 0.6 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xeeeee6, roughness: 0.22 });
  const eyeIris = new THREE.MeshStandardMaterial({ color: 0x35211a, roughness: 0.18, metalness: 0.0 });
  const brow = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.8 });
  const collarMat = new THREE.MeshPhysicalMaterial({ color: c.secondary, roughness: 0.62, sheen: 0.5 });

  // ---------- decals ----------
  const numberMat = new THREE.MeshBasicMaterial({
    map: makeNumberTexture(c.number, c.secondary, c.primary),
    transparent: true, alphaTest: 0.4, depthWrite: false,
  });
  const crestMat = new THREE.MeshBasicMaterial({
    map: makeCrestTexture(c.primary, c.accent, c.secondary),
    transparent: true, alphaTest: 0.3, depthWrite: false,
  });

  return {
    cfg: c,
    body: { skin: bodySkin, jersey: bodyJersey, shorts: bodyShorts, socks: bodySocks, accent: bodyAccent },
    skin, boots, bootAccent, sole, hair, mouth, eyeWhite, eyeIris, brow, collarMat,
    numberMat, crestMat,
  };
}

function makeCloth(color, bump) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.72, metalness: 0.0, vertexColors: true,
    sheen: 0.6, sheenRoughness: 0.9, sheenColor: new THREE.Color(0xffffff),
    bumpMap: bump, bumpScale: 0.003, side: THREE.DoubleSide,
  });
}

/* grayscale value noise, used as roughness/bump */
function makeNoiseTexture(s, contrast) {
  const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = 128 + (Math.random() - 0.5) * 255 * contrast;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

/* woven fabric pattern for cloth bump */
function makeWeaveTexture(s) {
  const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#a0a0a0'; ctx.lineWidth = 1;
  const step = 5;
  for (let i = 0; i < s; i += step) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 8);
  return t;
}

function makeNumberTexture(num, fg, edge) {
  const s = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.font = 'bold 170px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const str = String(num);
  ctx.lineWidth = 16; ctx.strokeStyle = '#' + new THREE.Color(edge).getHexString();
  ctx.strokeText(str, s / 2, s / 2 + 6);
  ctx.fillStyle = '#' + new THREE.Color(fg).getHexString();
  ctx.fillText(str, s / 2, s / 2 + 6);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeCrestTexture(primary, accent, secondary) {
  const s = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.beginPath();
  ctx.moveTo(24, 18); ctx.lineTo(104, 18); ctx.lineTo(104, 70);
  ctx.quadraticCurveTo(104, 104, 64, 116);
  ctx.quadraticCurveTo(24, 104, 24, 70); ctx.closePath();
  ctx.fillStyle = '#' + new THREE.Color(accent).getHexString(); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#' + new THREE.Color(secondary).getHexString(); ctx.stroke();
  ctx.fillStyle = '#' + new THREE.Color(primary).getHexString();
  let rot = (Math.PI / 2) * 3; const step = Math.PI / 5;
  ctx.beginPath(); ctx.moveTo(64, 34);
  for (let i = 0; i < 5; i++) {
    ctx.lineTo(64 + Math.cos(rot) * 26, 60 + Math.sin(rot) * 26); rot += step;
    ctx.lineTo(64 + Math.cos(rot) * 12, 60 + Math.sin(rot) * 12); rot += step;
  }
  ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
