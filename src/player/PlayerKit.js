import * as THREE from 'three';

/**
 * Builds the full set of physically-based materials and small canvas-baked
 * decals (shirt number, club crest) that dress the player model.
 */
export function createKit(cfg = {}) {
  const c = {
    primary: 0x1438a8,      // jersey
    secondary: 0xffffff,    // trim / shorts
    accent: 0xffd23f,       // detail accent
    socks: 0x10286f,
    skin: 0xc78a5e,
    hair: 0x161312,
    boots: 0x111418,
    bootAccent: 0x38e1ff,
    number: 10,
    ...cfg,
  };

  const skin = new THREE.MeshStandardMaterial({
    color: c.skin, roughness: 0.66, metalness: 0.0,
  });
  skin.userData.tint = c.skin;

  const jersey = new THREE.MeshStandardMaterial({
    color: c.primary, roughness: 0.74, metalness: 0.02,
  });
  const jerseyTrim = new THREE.MeshStandardMaterial({
    color: c.secondary, roughness: 0.7, metalness: 0.02,
  });
  const shorts = new THREE.MeshStandardMaterial({
    color: c.secondary, roughness: 0.8, metalness: 0.0,
  });
  const shortsTrim = new THREE.MeshStandardMaterial({
    color: c.primary, roughness: 0.8, metalness: 0.0,
  });
  const socks = new THREE.MeshStandardMaterial({
    color: c.socks, roughness: 0.88, metalness: 0.0,
  });
  const socksBand = new THREE.MeshStandardMaterial({
    color: c.accent, roughness: 0.85,
  });
  const boots = new THREE.MeshStandardMaterial({
    color: c.boots, roughness: 0.32, metalness: 0.18,
  });
  const bootAccent = new THREE.MeshStandardMaterial({
    color: c.bootAccent, roughness: 0.4, metalness: 0.2,
    emissive: new THREE.Color(c.bootAccent).multiplyScalar(0.15),
  });
  const hair = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.78 });
  const mouth = new THREE.MeshStandardMaterial({ color: 0x5a2f2a, roughness: 0.7 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.3 });
  const eyeIris = new THREE.MeshStandardMaterial({ color: 0x3a2417, roughness: 0.25 });
  const brow = new THREE.MeshStandardMaterial({ color: c.hair, roughness: 0.8 });

  // ---- decals ----
  const numberTex = makeNumberTexture(c.number, c.secondary, c.primary);
  const numberMat = new THREE.MeshBasicMaterial({
    map: numberTex, transparent: true, alphaTest: 0.4, depthWrite: false,
    toneMapped: true,
  });
  const crestTex = makeCrestTexture(c.primary, c.accent, c.secondary);
  const crestMat = new THREE.MeshBasicMaterial({
    map: crestTex, transparent: true, alphaTest: 0.3, depthWrite: false,
  });

  return {
    cfg: c,
    skin, jersey, jerseyTrim, shorts, shortsTrim, socks, socksBand,
    boots, bootAccent, hair, mouth, eyeWhite, eyeIris, brow,
    numberMat, crestMat,
  };
}

function makeNumberTexture(num, fg, bgEdge) {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.font = 'bold 168px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const str = String(num);
  // outline
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#' + new THREE.Color(bgEdge).getHexString();
  ctx.strokeText(str, s / 2, s / 2 + 6);
  // fill
  ctx.fillStyle = '#' + new THREE.Color(fg).getHexString();
  ctx.fillText(str, s / 2, s / 2 + 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCrestTexture(primary, accent, secondary) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // shield
  ctx.beginPath();
  ctx.moveTo(24, 18); ctx.lineTo(104, 18);
  ctx.lineTo(104, 70); ctx.quadraticCurveTo(104, 104, 64, 116);
  ctx.quadraticCurveTo(24, 104, 24, 70); ctx.closePath();
  ctx.fillStyle = '#' + new THREE.Color(accent).getHexString();
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#' + new THREE.Color(secondary).getHexString();
  ctx.stroke();
  // inner star
  ctx.fillStyle = '#' + new THREE.Color(primary).getHexString();
  drawStar(ctx, 64, 60, 5, 26, 12);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function drawStar(ctx, cx, cy, spikes, outer, inner) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outer);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer); rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner); rot += step;
  }
  ctx.lineTo(cx, cy - outer);
  ctx.closePath();
  ctx.fill();
}
