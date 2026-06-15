import * as THREE from 'three';

/**
 * Large inverted sphere with a vertical gradient (zenith -> horizon) plus a soft
 * sun disc. Cheap, no textures, and reads like a clear late-afternoon match sky.
 */
export function createSky(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x2a6cc4) },
    midColor: { value: new THREE.Color(0x8fc1ee) },
    bottomColor: { value: new THREE.Color(0xdfeaf2) },
    sunDir: { value: new THREE.Vector3(-0.55, 0.62, 0.55).normalize() },
    sunColor: { value: new THREE.Color(0xfff3da) },
    offset: { value: 8.0 },
    exponent: { value: 0.7 },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 topColor, midColor, bottomColor, sunColor, sunDir;
      uniform float offset, exponent;
      varying vec3 vWorldPos;
      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = max(dir.y, 0.0);
        // two-stop gradient: horizon -> mid -> zenith
        vec3 col = mix(bottomColor, midColor, pow(smoothstep(0.0, 0.18, h), 0.8));
        col = mix(col, topColor, pow(smoothstep(0.12, 0.92, h), exponent));
        // sun disc + halo
        float d = max(dot(dir, normalize(sunDir)), 0.0);
        col += sunColor * pow(d, 900.0) * 1.4;          // bright core
        col += sunColor * pow(d, 18.0) * 0.18;          // soft halo
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  sky.name = 'sky';
  scene.add(sky);

  scene.fog = new THREE.Fog(0xcfe0ec, 90, 360);
  return { sky, sunDir: uniforms.sunDir.value };
}
