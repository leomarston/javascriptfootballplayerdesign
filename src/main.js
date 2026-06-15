import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { FollowCamera } from './core/FollowCamera.js';
import { createSky } from './world/Sky.js';
import { createLighting } from './world/Lighting.js';
import { createPitch } from './world/Pitch.js';
import { Ball } from './gameplay/Ball.js';
import { Player } from './player/Player.js';
import { Input } from './input/Input.js';
import { CLIP_MENU } from './player/clips.js';

boot().catch((err) => {
  console.error(err);
  const m = document.getElementById('loadmsg');
  if (m) m.textContent = 'Error: ' + err.message + ' — serve over http (see README).';
});

async function boot() {
  const bar = document.getElementById('bar');
  const loadmsg = document.getElementById('loadmsg');
  const setProgress = (p, msg) => { bar.style.width = (p * 100) + '%'; if (msg) loadmsg.textContent = msg; };

  setProgress(0.12, 'Booting renderer…');
  const engine = new Engine(document.getElementById('app'));

  // soft studio reflections for nicer PBR speculars (optional)
  try {
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const pmrem = new THREE.PMREMGenerator(engine.renderer);
    engine.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  } catch (e) { /* fine without it */ }

  setProgress(0.3, 'Raising the stadium…');
  const { sunDir } = createSky(engine.scene);
  createLighting(engine.scene, sunDir);
  createPitch(engine.scene);

  setProgress(0.55, 'Stitching the kit…');
  const ball = new Ball(engine.scene);
  const player = new Player(engine.scene, ball, {
    primary: 0x12379e, secondary: 0xffffff, accent: 0xffd23f,
    socks: 0x0e2a78, skin: 0xc88e62, number: 10,
  });

  setProgress(0.8, 'Calibrating motion…');
  const camera = new FollowCamera(engine.camera, engine.renderer.domElement, player.object);
  const input = new Input();

  buildHud(player, camera, engine);

  // ---- main loop ----
  const hud = {
    speed: document.getElementById('statSpeed'),
    state: document.getElementById('statState'),
    fps: document.getElementById('statFps'),
  };
  let hudTick = 0;

  engine.onUpdate((dt) => {
    const move = input.moveVector(camera.lookYaw);
    const sprint = input.sprint;

    for (const a of input.consumeActions()) {
      player.select(a.name, a.power || 1);
    }

    player.update(dt, move, sprint);
    ball.update(dt);
    camera.update(dt, player.yaw);

    if ((hudTick = (hudTick + 1) % 5) === 0) {
      hud.speed.textContent = player.speedKmh.toFixed(1);
      hud.state.textContent = player.stateLabel;
      hud.fps.textContent = engine.fps;
      syncActiveButton(player);
    }
  });

  setProgress(1.0, 'Kick-off!');
  engine.start();

  // reveal
  await waitFrames(3);
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('hud').classList.add('show');
  const hint = document.getElementById('hint');
  hint.classList.add('show');
  setTimeout(() => hint.classList.remove('show'), 6500);
}

let activeBtnId = 'idle';
function buildHud(player, camera, engine) {
  const grid = document.getElementById('animGrid');
  for (const item of CLIP_MENU) {
    const b = document.createElement('button');
    b.className = 'abtn';
    b.textContent = item.label;
    b.dataset.id = item.id;
    if (item.id === 'idle') b.classList.add('active');
    b.addEventListener('click', () => {
      player.select(item.id);
      activeBtnId = item.id;
      highlight(item.id);
    });
    grid.appendChild(b);
  }

  const tCam = document.getElementById('tCam');
  tCam.addEventListener('click', () => {
    const on = tCam.classList.toggle('on');
    camera.setFollow(on);
  });
  const tBones = document.getElementById('tBones');
  tBones.addEventListener('click', () => {
    const on = tBones.classList.toggle('on');
    player.setBonesVisible(on);
  });
  const tSlow = document.getElementById('tSlow');
  tSlow.addEventListener('click', () => {
    const on = tSlow.classList.toggle('on');
    engine.timeScale = on ? 0.32 : 1;
  });
}

function highlight(id) {
  document.querySelectorAll('.abtn').forEach((b) => {
    b.classList.toggle('active', b.dataset.id === id);
  });
}

function syncActiveButton(player) {
  // reflect the live animator state on the buttons
  const cur = player.actionName || player.forcedClip || player.animator.current;
  if (cur && cur !== activeBtnId) { activeBtnId = cur; highlight(cur); }
}

function waitFrames(n) {
  return new Promise((res) => {
    let i = 0;
    const step = () => (++i >= n ? res() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}
