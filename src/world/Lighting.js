import * as THREE from 'three';

/**
 * Stadium lighting rig: a key "sun" directional light with a tightly fitted
 * shadow camera, a sky/ground hemisphere for ambient bounce, and a cool fill
 * to keep shadowed sides from going black.
 */
export function createLighting(scene, sunDir) {
  const dir = sunDir ? sunDir.clone() : new THREE.Vector3(-0.55, 0.62, 0.55).normalize();

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a5a32, 0.85);
  hemi.position.set(0, 50, 0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.position.copy(dir.clone().multiplyScalar(40));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  const s = 22;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3.5;
  scene.add(sun);
  scene.add(sun.target);

  // cool sky-side fill, no shadows — softens contact-shadow contrast
  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.5);
  fill.position.set(dir.x * -30, 18, dir.z * -30);
  scene.add(fill);

  return { sun, hemi, fill };
}
