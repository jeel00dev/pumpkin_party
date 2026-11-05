// Sky, moon, stars, clouds, lighting rig and reflection environment for each level theme.
//
// Colours are sampled from the key art (sky #6143E3 -> #AE76FA, tile violet #844CFB -> #A75CFA).
import * as THREE from 'three';
import { glowTexture, moonTexture, cloudAtlas } from './textures.js';
import { rng, TAU } from './geo.js';

export const THEMES = {
  // Key art: saturated violet night. Pumpkin Dash, main menu.
  violet: {
    top: 0x4a2dd8, mid: 0x7044ec, hor: 0xb478fa, low: 0x5f2bb0,
    fog: 0x9a68ee, fogDensity: 0.00105,
    moon: { dir: [-0.205, 0.3, -0.93], size: 66, color: 0xfff4ec, glow: 0xffc4d4, intensity: 1.08 },
    key: { color: 0xfff0e2, intensity: 3.3, dir: [0.42, 0.9, 0.42] },
    fill: { color: 0x8a7cff, intensity: 0.45, dir: [-0.7, 0.4, 0.6] },
    rim: { color: 0xff6ad5, intensity: 0.55, dir: [0.1, 0.2, -1] },
    hemi: { sky: 0xc4b0ff, ground: 0x8a3ad8, intensity: 0.8 },
    cloud: 0xeed6ff, cloudLow: 0xd493f5, envBoost: 1.0, stars: 0.5,
  },
  // Dusk blue variant from the second key art sheet. Ghost Chase.
  dusk: {
    top: 0x1f6fe8, mid: 0x4aa8ff, hor: 0xb6dcff, low: 0x4c63d8,
    fog: 0x8fbdff, fogDensity: 0.0015,
    moon: { dir: [0.36, 0.42, -0.83], size: 42, color: 0xfff6dc, glow: 0xffffff, intensity: 1.15 },
    key: { color: 0xfff6ea, intensity: 2.7, dir: [-0.3, 0.9, 0.45] },
    fill: { color: 0xa6d0ff, intensity: 0.5, dir: [0.7, 0.4, 0.6] },
    rim: { color: 0xff9ae0, intensity: 0.45, dir: [-0.2, 0.2, -1] },
    hemi: { sky: 0xbfe0ff, ground: 0x6a3fd8, intensity: 0.95 },
    cloud: 0xffffff, cloudLow: 0xc8e0ff, envBoost: 1.1, stars: 0.0,
  },
  // Blue-teal moonlight. Haunted Floor (graveyard).
  moonlit: {
    top: 0x14236e, mid: 0x2a4bb0, hor: 0x62a6e0, low: 0x1a2c7a,
    fog: 0x4f7fd0, fogDensity: 0.0022,
    moon: { dir: [-0.18, 0.4, -0.9], size: 56, color: 0xc8ecff, glow: 0x9fd8ff, intensity: 1.05 },
    key: { color: 0xd8ecff, intensity: 2.2, dir: [0.35, 0.9, 0.3] },
    fill: { color: 0x6affe0, intensity: 0.4, dir: [-0.7, 0.4, 0.6] },
    rim: { color: 0xa07bff, intensity: 0.5, dir: [0.2, 0.25, -1] },
    hemi: { sky: 0x9ec8ff, ground: 0x3a2a90, intensity: 0.85 },
    cloud: 0xb9d8ff, cloudLow: 0x6d8fe0, envBoost: 0.95, stars: 1.0,
  },
  // Deep night with a violet haze. Witch's Platform, Pumpkin Roll.
  slime: {
    top: 0x1e1474, mid: 0x4630b8, hor: 0x8e62e8, low: 0x341a8c,
    fog: 0x6a48d0, fogDensity: 0.0021,
    moon: { dir: [0.4, 0.34, -0.85], size: 40, color: 0xffeccc, glow: 0xffd4a8, intensity: 1.2 },
    key: { color: 0xfff0e0, intensity: 2.5, dir: [-0.4, 0.88, 0.45] },
    fill: { color: 0x8affb0, intensity: 0.4, dir: [0.5, 0.3, 0.7] },
    rim: { color: 0xff7ad0, intensity: 0.5, dir: [0.1, 0.25, -1] },
    hemi: { sky: 0xa390ff, ground: 0x5a8c3a, intensity: 0.85 },
    cloud: 0xc8b0ff, cloudLow: 0x7a58d8, envBoost: 1.0, stars: 1.0,
  },
  // Lantern Fog curse: the moon's gone and the world ends a few strides out.
  fog: {
    top: 0x0a0826, mid: 0x14103c, hor: 0x241c58, low: 0x0e0a30,
    fog: 0x1e1852, fogDensity: 0.05,
    moon: { dir: [-0.2, 0.3, -0.93], size: 30, color: 0x8a86c8, glow: 0x3a3488, intensity: 0.35 },
    key: { color: 0x9a96e0, intensity: 0.9, dir: [0.42, 0.9, 0.42] },
    fill: { color: 0x6a60c0, intensity: 0.3, dir: [-0.7, 0.4, 0.6] },
    rim: { color: 0x8a6ad0, intensity: 0.3, dir: [0.1, 0.2, -1] },
    hemi: { sky: 0x5a54a8, ground: 0x2a1c60, intensity: 0.7 },
    cloud: 0x2a2468, cloudLow: 0x1a1648, envBoost: 0.4, stars: 0.1,
  },
  // Hot purple & magenta for the cauldron final.
  final: {
    top: 0x24107a, mid: 0x6a22c8, hor: 0xe058d8, low: 0x4a1498,
    fog: 0x9040d8, fogDensity: 0.0022,
    moon: { dir: [0.32, 0.5, -0.8], size: 46, color: 0xfff0d8, glow: 0xff9ae0, intensity: 1.25 },
    key: { color: 0xfff0f0, intensity: 2.5, dir: [0.3, 0.9, 0.5] },
    fill: { color: 0x9affa0, intensity: 0.4, dir: [-0.5, 0.3, 0.7] },
    rim: { color: 0xff5ad8, intensity: 0.65, dir: [-0.3, 0.2, -1] },
    hemi: { sky: 0xc090ff, ground: 0x8020a0, intensity: 0.9 },
    cloud: 0xe0b0ff, cloudLow: 0xa050d0, envBoost: 1.05, stars: 1.0,
  },
};

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uTop,uMid,uHor,uLow,uMoonDir,uGlow;
uniform float uGlowAmt;
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c;
  if (y > 0.0) {
    c = mix(uHor, uMid, smoothstep(0.0, 0.26, y));
    c = mix(c, uTop, smoothstep(0.2, 0.8, y));
  } else {
    c = mix(uHor, uLow, smoothstep(0.0, -0.3, y));
  }
  float m = max(dot(d,uMoonDir),0.0);
  c += uGlow*(pow(m,120.0)*0.65 + pow(m,14.0)*0.28)*uGlowAmt;
  gl_FragColor = vec4(c,1.0);
  #include <colorspace_fragment>
}`;

/** Sky dome + moon + stars + clouds, returned as a Group added to the scene. */
export function buildSky(theme, { clouds = 16, seed = 3, scale = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'sky';
  const R = rng(seed);
  const col = (h) => new THREE.Color(h);
  const moonDir = new THREE.Vector3(...theme.moon.dir).normalize();

  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true,
    uniforms: {
      uTop: { value: col(theme.top) }, uMid: { value: col(theme.mid) }, uHor: { value: col(theme.hor) }, uLow: { value: col(theme.low) },
      uMoonDir: { value: moonDir }, uGlow: { value: col(theme.moon.glow) }, uGlowAmt: { value: 1 },
    },
  }));
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  dome.layers.enable(1);
  g.add(dome);
  g.userData.dome = dome;

  // Everything below sits at a fixed distance and is recentred on the camera each frame.
  const far = new THREE.Group();
  g.add(far);
  g.userData.far = far;
  const FAR = 800 * scale;
  const place = (m, dir, dist) => {
    m.position.copy(dir).multiplyScalar(dist);
    m.lookAt(0, 0, 0);
  };

  // Moon: bright disc plus a soft halo so it glows through the bloom.
  const moonSize = (theme.moon.size / 800) * FAR * 2.2;
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(moonSize, moonSize),
    new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false, color: new THREE.Color(theme.moon.color).multiplyScalar(theme.moon.intensity) }),
  );
  place(moon, moonDir, FAR);
  moon.renderOrder = -90;
  moon.layers.enable(1);
  far.add(moon);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(moonSize * 2.6, moonSize * 2.6),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(theme.moon.glow).multiplyScalar(0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
  );
  place(halo, moonDir, FAR * 1.01);
  halo.renderOrder = -91;
  far.add(halo);

  // Stars.
  if (theme.stars > 0) {
    const n = Math.round(220 * theme.stars);
    const pos = new Float32Array(n * 3), col2 = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, y = R.range(0.1, 0.95), r = Math.sqrt(1 - y * y);
      v.set(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(FAR * 1.02);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      const b = R.range(0.5, 2.2);
      col2[i * 3] = b; col2[i * 3 + 1] = b * 0.95; col2[i * 3 + 2] = b * 1.05;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col2, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 3.2 * (window.devicePixelRatio || 1), sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false, map: glowTexture(64), blending: THREE.AdditiveBlending }));
    stars.renderOrder = -95;
    stars.frustumCulled = false;
    far.add(stars);
  }

  // Clouds: tinted billboards low on the horizon, with a bigger band near the castle.
  const atlas = cloudAtlas();
  const cloudMat = (tint) => new THREE.MeshBasicMaterial({ map: atlas, color: col(tint), transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const hi = cloudMat(theme.cloud), lo = cloudMat(theme.cloudLow);
  const cells = [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]];
  const geos = cells.map(([u, v]) => {
    const p = new THREE.PlaneGeometry(1, 1);
    const uv = p.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * 0.5, v + uv.getY(i) * 0.5);
    return p;
  });
  for (let i = 0; i < clouds; i++) {
    const big = i < clouds / 2;
    const az = R.range(-Math.PI, Math.PI);
    const el = big ? R.range(0.015, 0.12) : R.range(0.1, 0.34);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const w = FAR * R.range(0.42, 0.85) * (big ? 1.2 : 0.75);
    const m = new THREE.Mesh(geos[i % 4], big ? lo : hi);
    m.scale.set(w, w * 0.62, 1);
    place(m, dir, FAR * 0.97);
    m.renderOrder = -80;
    m.layers.enable(1);
    far.add(m);
  }

  g.onCameraMove = (camera) => { far.position.copy(camera.position); };
  return g;
}

/** Lighting rig with a soft key shadow that follows the action. */
export function buildLights(theme, tier) {
  const g = new THREE.Group();
  g.name = 'lights';
  const hemi = new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity);
  g.add(hemi);
  const key = new THREE.DirectionalLight(theme.key.color, theme.key.intensity);
  key.position.set(...theme.key.dir).multiplyScalar(60);
  g.add(key); g.add(key.target);
  if (tier.shadow > 0) {
    key.castShadow = true;
    key.shadow.mapSize.set(tier.shadow, tier.shadow);
    const s = tier.shadow >= 2048 ? 42 : 30;
    const c = key.shadow.camera;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 180;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.035;
    key.shadow.radius = 3.5;
    key.shadow.intensity = 0.86;
  }
  const fill = new THREE.DirectionalLight(theme.fill.color, theme.fill.intensity);
  fill.position.set(...theme.fill.dir).multiplyScalar(60);
  g.add(fill);
  g.userData.key = key;
  const baseKeyPos = key.position.clone();
  /** Keep the shadow frustum centred on the player, snapped to texels to stop shimmer. */
  g.follow = (target) => {
    if (!target) return;
    const snap = tier.shadow >= 2048 ? 84 / 2048 : 60 / Math.max(1, tier.shadow);
    const x = Math.round(target.x / snap) * snap, y = Math.round((target.y) / snap) * snap, z = Math.round((target.z - 10) / snap) * snap;
    key.target.position.set(x, y, z);
    key.position.set(x + baseKeyPos.x, y + baseKeyPos.y, z + baseKeyPos.z);
    key.target.updateMatrixWorld();
  };
  return g;
}

/**
 * Reflection environment: a little painted room of soft boxes, baked to PMREM. This is what gives every
 * rounded plastic surface its glossy highlights.
 */
export function buildEnvironment(renderer, theme) {
  const envScene = new THREE.Scene();
  const col = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uTop: { value: col(theme.top, 0.42) }, uMid: { value: col(theme.mid, 0.5) }, uHor: { value: col(theme.hor, 0.75) }, uLow: { value: col(theme.low, 0.3) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop,uMid,uHor,uLow;
      void main(){ float y=normalize(vP).y; vec3 c = y>0.0? mix(mix(uHor,uMid,smoothstep(0.0,0.3,y)),uTop,smoothstep(0.25,0.9,y)) : mix(uHor,uLow,smoothstep(0.0,-0.45,y)); gl_FragColor=vec4(c,1.0); }`,
  }));
  envScene.add(dome);
  const panel = (w, h, x, y, z, c, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col(c, k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  const b = theme.envBoost;
  const md = new THREE.Vector3(...theme.moon.dir).normalize().multiplyScalar(40);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: col(theme.moon.glow, 3 * b) }));
  moon.position.copy(md);
  envScene.add(moon);
  panel(40, 20, 16, 34, 18, 0xfff6ff, 1.25 * b);   // big overhead soft box: the broad highlight on tops
  panel(14, 26, -38, 16, 14, 0xd0b8ff, 0.9 * b);  // left wall light
  panel(12, 20, 38, 12, -8, 0xff9ee0, 1.0 * b);   // pink kicker
  panel(30, 6, 0, 6, -44, 0xffb46a, 1.2 * b);     // warm horizon, from the castle glow
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene, 0.015, 0.1, 200);
  pm.dispose();
  envScene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}

/** Apply theme fog/background to a scene. */
export function applyThemeToScene(scene, theme, envTex, sky) {
  scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
  scene.environment = envTex;
  scene.environmentIntensity = 0.82;
  scene.background = null;
  if (sky) scene.add(sky);
}
