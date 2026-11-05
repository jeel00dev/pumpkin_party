// The living backdrop behind menus: castle, moon, stage and characters, with a camera preset per screen.
import * as THREE from 'three';
import { World } from '../physics/world.js';
import { Level, FLOOR_PALETTES } from '../levels/base.js';
import { THEMES, applyThemeToScene, buildEnvironment, buildLights, buildSky } from '../render/sky.js';
import { CharacterMesh } from '../assets/characters.js';
import { Animator } from '../assets/animator.js';
import { buildCastle } from '../assets/castle.js';
import { T, disc, gradY, rng, TAU, Batch, torus, box } from '../render/geo.js';
import { reflectiveFloor, toy } from '../render/materials.js';
import { Particles } from '../render/particles.js';
import { SHARED } from '../render/pipeline.js';
import { makeCanvas, toTexture } from '../render/textures.js';

const PRESETS = {
  title: { pos: [0, 2.4, 10.5], look: [0, 2.2, 0], fov: 36, hero: [0, 0, 3.4], heroYaw: 0.1, mode: 'run', friends: true },
  menu: { pos: [0, 1.85, 7.7], look: [0, 1.75, 0], fov: 36, hero: [0.5, 0, 0], heroYaw: -0.08, mode: 'pose', friends: false, parallax: 1 },
  complete: { pos: [0, 2.75, 7.4], look: [0, 2.2, 0], fov: 36, hero: [0, 0, 0], heroYaw: 0.04, mode: 'win', friends: false, spots: true },
  lose: { pos: [0, 2.7, 7], look: [0, 2.05, 0], fov: 36, hero: [0, 0, 0], heroYaw: 0, mode: 'lose', friends: false, dim: true },
  champion: { pos: [0, 3.1, 7.6], look: [0, 2.5, 0], fov: 36, hero: [0, 0.75, 0], heroYaw: 0, mode: 'win', friends: false, spots: true, podium: true },
  studio: { pos: [1.42, 1.28, 5.7], look: [1.42, 1.14, 0], fov: 36, hero: [0, 0, 0], heroYaw: 0.14, mode: 'pose', friends: false, studio: true },
};

const FRIENDS = [
  { skin: 'ghost', x: -2.5, z: 0.5, yaw: 0.35 },
  { skin: 'franky', x: -4.2, z: -0.5, yaw: 0.4 },
  { skin: 'skeleton', x: 2.6, z: 0.3, yaw: -0.35 },
  { skin: 'mummy', x: 4.3, z: -0.4, yaw: -0.4 },
  { skin: 'witch', x: 6.1, z: -1.2, yaw: -0.5 },
];

export class MenuScene {
  constructor(app) {
    this.app = app;
    const tier = app.pipe.tier;
    this.scene = new THREE.Scene();
    this.theme = THEMES.violet;
    this.env = buildEnvironment(app.pipe.renderer, this.theme);
    this.sky = buildSky(this.theme, { clouds: tier.detail === 0 ? 8 : 18, seed: 5 });
    applyThemeToScene(this.scene, this.theme, this.env, this.sky);
    this.lights = buildLights(this.theme, tier);
    this.scene.add(this.lights);
    this.lights.follow(new THREE.Vector3(0, 0, 8));
    this.camera = new THREE.PerspectiveCamera(36, app.width / app.height, 0.2, 2400);
    this.particles = new Particles(Math.round(800 * tier.particles));
    this.scene.add(this.particles.group);
    this.accMat = toy({ key: 'acc' });
    this.t = 0;
    this.buildWorld(tier);
    this.buildStudioBackdrop();
    this.mode = 'title';
    this.preset = PRESETS.title;
    this.camPos = new THREE.Vector3(...this.preset.pos);
    this.camLook = new THREE.Vector3(...this.preset.look);
    this.fov = this.preset.fov;
    this.heroYaw = 0;
    this.friends = [];
    this.mouseX = 0; this.mouseY = 0;
    window.addEventListener('mousemove', (e) => {
      this.mouseX = (e.clientX / innerWidth - 0.5) * 2;
      this.mouseY = (e.clientY / innerHeight - 0.5) * 2;
    });
    this.dragYaw = 0;
    this.setHero(app.profile.d.equip);
  }

  buildWorld(tier) {
    const L = new Level({ world: new World(), tier, headless: false, seed: 11 });
    L.theme = 'violet';
    this.level = L;
    const s = L.s;
    L.addLiquid({ y: -5, kind: 'water' });
    this.scene.add(L.group);

    // The road to the castle, then a plaza around the stage.
    L.floor({ z: -105, w: 13, d: 200, tile: 4.33, collide: false });
    L.floor({ z: 2, w: 36, d: 24, tile: 4, collide: false, palette: FLOOR_PALETTES.candy });

    // Round stage with a glossy top and rings of light, as on the menu art.
    L.art((S, group) => {
      const mat = tier.detail === 0
        ? new THREE.MeshStandardMaterial({ color: 0x7c3af0, roughness: 0.28 })
        : reflectiveFloor({ color: 0x6a2cdc, rough: 0.42, reflect: 0.32 });
      const top = new THREE.Mesh(new THREE.CircleGeometry(6.4, 64).rotateX(-Math.PI / 2), mat);
      top.position.y = 0.352;
      top.receiveShadow = tier.shadow > 0;
      group.add(top);
      S.solid.add(disc(6.5, 6.9, 0.36, 0.1, 64), { m: T(0, 0.16, 0), color: gradY(-0.18, 0x331a94, 0.18, 0x5e30d0), rough: 0.3, clear: 1 });
      S.solid.add(disc(8.8, 9.4, 0.3, 0.1, 72), { m: T(0, 0.05, 0), color: gradY(-0.15, 0x2c1688, 0.15, 0x5128c4), rough: 0.32, clear: 1 });
      S.ring(0, 0.36, 0, 5.4, 0.05, 0xc8b0ff, 0.8, 64);
      S.ring(0, 0.2, 0, 8.3, 0.07, 0x58d8ff, 2, 72);
      this.pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.8, 40), new THREE.MeshPhysicalMaterial({ color: 0xffb030, roughness: 0.25, clearcoat: 1, envMapIntensity: 1 }));
      this.pedestal.position.y = 0.72;
      this.pedestal.castShadow = true;
      this.pedestal.visible = false;
      group.add(this.pedestal);
    });

    L.art(() => {
      buildCastle(s, { x: 0, y: 0, z: -205, scale: 1.05 });
      const R = rng(19);
      for (const sd of [1, -1]) {
        s.terrace(sd * 26, 1.6, -30, 16, 26, 9);
        s.terrace(sd * 38, 3.2, -84, 22, 50, 12);
        s.block(sd * 16.8, 0.5, -2, 5, 2.4, 7, 0xa52ce0, { top: 0xc84cfa });
        s.block(sd * 20.5, -0.2, -9, 5.5, 1.5, 7.5, 0xff9022, { r: 0.55, top: 0xffb04a });
        s.jackO(sd * 12.2, 1.35, 2.2, 1.35, sd > 0 ? -0.55 : 0.55);
        s.jackO(sd * 17.2, 2.9, -2, 1.75, sd > 0 ? -0.5 : 0.5);
        s.jackO(sd * 24.5, 3.9, -28, 2.3, sd > 0 ? -0.4 : 0.4);
        s.jackO(sd * 32, 5.5, -72, 3, sd > 0 ? -0.4 : 0.4);
        s.lanternPost(sd * 13.4, 0, -4.4, 1.05);
        s.lanternPost(sd * 8.6, 0, -14.4, 1.05);
        s.lanternPost(sd * 8.2, 0, -44, 1.15);
        s.mushroom(sd * 13.2, 2.4, -32, 2.9, { cap: sd > 0 ? 0xff9022 : 0x7a3ae8, rim: sd > 0 ? 0x7a3ae8 : 0xff9022, height: 6 });
        s.mushroom(sd * 11.5, 1.2, -62, 3.2, { cap: sd > 0 ? 0x7a3ae8 : 0xff9022, rim: sd > 0 ? 0xff9022 : 0x7a3ae8, height: 7 });
        s.deadTree(sd * 30, 1.6, -38, 1.8, sd > 0 ? 3 : 8, 0x62214a);
        s.bannerPole(sd * 7.2, 0, -30, 1, sd > 0 ? Math.PI : 0, 7);
        s.lanternPost(sd * 8.6, -0.8, -78, 1.25);
        for (let i = 0; i < 3; i++) s.candle(sd * R.range(10, 13.5), 0, R.range(4, 10), R.range(0.7, 1.1));
      }
    });
    L.addBalloon(-52, 34, -118, 4.6, { c1: 0x7a2be0, c2: 0xff9022 });
    L.addBalloon(58, 42, -128, 5.2, { c1: 0xff9022, c2: 0x7a2be0 });
    L.addFloatGhost(-30, 20, -80, 1.9);
    L.addFloatGhost(34, 26, -92, 2.3);
    L.addBackdrop({ center: [0, -200], ring: 560 });
    L.finishArt();

    // Spotlights for the celebration screens.
    this.spots = new THREE.Group();
    const cone = new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0);
    const spotMat = (c) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uC: { value: new THREE.Color(c) } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY=-position.y; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uC; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e=pow(abs(dot(vN,vV)),1.6); gl_FragColor=vec4(uC*(1.0-vY)*(1.0-vY)*e*0.85,1.0); }',
    });
    for (const [x, c, rz] of [[-7, 0xffd2f4, -0.46], [7, 0xd4e8ff, 0.46], [-3.2, 0xfff0c8, -0.14], [3.2, 0xffd8a8, 0.14]]) {
      const m = new THREE.Mesh(cone, spotMat(c));
      m.position.set(x, 13, -1.6);
      m.scale.set(3.2, 15, 3.2);
      m.rotation.z = rz;
      m.userData.base = rz;
      m.frustumCulled = false;
      this.spots.add(m);
    }
    this.spots.visible = false;
    this.scene.add(this.spots);
  }

  /** Lavender studio wall for the customise screen, with floating ghost shapes. */
  buildStudioBackdrop() {
    const c = makeCanvas(1024, 576), x = c.getContext('2d');
    const g = x.createRadialGradient(330, 300, 60, 512, 288, 760);
    g.addColorStop(0, '#8a6bf6'); g.addColorStop(0.55, '#5a35dc'); g.addColorStop(1, '#3a1ea8');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 576);
    const R = rng(6);
    const ghost = (px, py, s, a) => {
      x.save(); x.translate(px, py); x.scale(s, s); x.globalAlpha = a;
      x.fillStyle = '#c4b0ff';
      x.beginPath(); x.arc(0, -10, 28, Math.PI, 0); x.lineTo(28, 28);
      for (let i = 0; i < 3; i++) x.quadraticCurveTo(28 - (i + 0.5) * 18.6, 16 + (i % 2) * 16, 28 - (i + 1) * 18.6, 28);
      x.closePath(); x.fill();
      x.fillStyle = '#5a35dc';
      x.beginPath(); x.ellipse(-9, -10, 3.6, 5.4, 0, 0, 7); x.ellipse(9, -10, 3.6, 5.4, 0, 0, 7); x.fill();
      x.restore();
    };
    for (let i = 0; i < 18; i++) ghost(R() * 1024, R() * 576, R.range(0.8, 2), R.range(0.08, 0.2));
    this.studioTex = toTexture(c, { mips: false });
    this.studioTex.colorSpace = THREE.SRGBColorSpace;
    const b = new Batch();
    b.add(disc(2.9, 3.1, 0.3, 0.1, 56), { m: T(0, -0.14, 0), color: gradY(-0.15, 0x4a26c8, 0.15, 0x8b63fa), rough: 0.22, clear: 1 });
    b.add(torus(2.7, 0.03, 6, 56), { m: T(0, 0.012, 0, Math.PI / 2), color: 0xd8c8ff, rough: 0.3, emis: 0.7 });
    this.studioPad = new THREE.Mesh(b.build(), toy({ key: 'world' }));
    this.studioPad.receiveShadow = this.app.pipe.tier.shadow > 0;
    this.studioPad.visible = false;
    this.scene.add(this.studioPad);
  }

  /** Rebuild the hero when the outfit changes. */
  setHero(equip) {
    const key = `${equip.skin}:${equip.hat}:${equip.glasses}`;
    if (this.heroKey === key) return;
    this.heroKey = key;
    const pos = this.hero?.c.root.position.clone();
    if (this.hero) { this.scene.remove(this.hero.c.root); this.hero.c.skeleton.dispose(); }
    const tier = this.app.pipe.tier;
    const c = new CharacterMesh(equip.skin, { detail: 1, tier, hat: equip.hat, glasses: equip.glasses, accMaterial: this.accMat, shadow: tier.shadow > 0 });
    this.scene.add(c.root);
    if (pos) c.root.position.copy(pos);
    this.hero = { c, a: new Animator(c, 0.7), emote: null, emoteT: 0 };
    this.particles.sparkle(c.root.position.x, 0.5, c.root.position.z, 0xffd23a, 10);
  }

  playEmote(name, dur = 2.6) { if (this.hero) { this.hero.emote = name; this.hero.emoteT = dur; } }

  ensureFriends() {
    if (this.friends.length) return;
    const tier = this.app.pipe.tier;
    this.friends = FRIENDS.map((f, i) => {
      const c = new CharacterMesh(f.skin, { detail: 1, tier, accMaterial: this.accMat, shadow: tier.shadow > 0 });
      c.root.position.set(f.x, 0.34, f.z);
      c.root.rotation.y = f.yaw;
      this.scene.add(c.root);
      return { c, a: new Animator(c, i * 3.1), d: f };
    });
  }

  setMode(mode, opts = {}) {
    if (!PRESETS[mode]) return;
    this.mode = mode;
    this.preset = PRESETS[mode];
    this.heroMode = opts.heroMode || this.preset.mode;
    if (this.preset.friends) this.ensureFriends();
    for (const f of this.friends) f.c.root.visible = !!this.preset.friends;
    this.spots.visible = !!this.preset.spots;
    const st = !!this.preset.studio;
    this.level.group.visible = !st;
    this.sky.visible = !st;
    this.scene.background = st ? this.studioTex : null;
    this.scene.fog.density = st ? 0 : this.theme.fogDensity;
    this.studioPad.visible = st;
    if (this.pedestal) this.pedestal.visible = !!this.preset.podium;
    const h = this.preset.hero;
    this.hero.c.root.position.set(h[0], st ? 0 : h[1] + 0.34, h[2]);
    this.dragYaw = 0;
    this.setDim(this.preset.dim ? 0.6 : this.preset.spots ? 0.72 : 1);
    if (opts.instant) { this.camPos.set(...this.preset.pos); this.camLook.set(...this.preset.look); this.fov = this.preset.fov; }
  }

  setDim(v) {
    this.lights.children.forEach((l) => { if (l.isLight) { l.userData.base ??= l.intensity; l.intensity = l.userData.base * v; } });
  }

  celebrate() {
    this.confettiT = 2.4;
    this.particles.confetti(0, 2, -2.5, 90, 5);
  }

  update(dt) {
    this.t += dt;
    SHARED.uTime.value += dt;
    const p = this.preset;
    const k = 1 - Math.exp(-5.5 * dt);
    const px = p.parallax ? this.mouseX * 0.36 : 0, py = p.parallax ? this.mouseY * 0.1 : 0;
    this.camPos.x += (p.pos[0] + px - this.camPos.x) * k;
    this.camPos.y += (p.pos[1] - py - this.camPos.y) * k;
    this.camPos.z += (p.pos[2] - this.camPos.z) * k;
    this.camLook.x += (p.look[0] - this.camLook.x) * k;
    this.camLook.y += (p.look[1] - this.camLook.y) * k;
    this.camLook.z += (p.look[2] - this.camLook.z) * k;
    this.fov += (p.fov - this.fov) * k;
    const c = this.camera;
    c.position.copy(this.camPos);
    c.lookAt(this.camLook);
    if (Math.abs(c.fov - this.fov) > 0.01) { c.fov = this.fov; c.updateProjectionMatrix(); }
    this.sky.onCameraMove(c);

    const H = this.hero;
    if (H) {
      H.c.root.rotation.y = p.heroYaw + this.dragYaw + (p.parallax ? this.mouseX * 0.12 : 0);
      if (H.emoteT > 0) H.emoteT -= dt;
      let mode = this.heroMode;
      if (H.emoteT > 0) mode = 'emote';
      H.a.update(dt, { mode, emote: H.emote, speed: mode === 'run' ? 5 : 0, fwdX: 0, fwdZ: 1, grounded: true });
    }
    if (p.friends) for (const f of this.friends) f.a.update(dt, { mode: 'run', speed: 3.2 + Math.sin(this.t + f.d.x) * 0.8, fwdX: 0, fwdZ: 1, grounded: true });
    if (this.spots.visible) {
      this.spots.children.forEach((m, i) => { m.rotation.z = m.userData.base + Math.sin(this.t * 0.8 + i * 1.4) * 0.16; });
    }
    if (this.confettiT > 0) {
      this.confettiT -= dt;
      if (Math.random() < dt * 6) this.particles.confetti((Math.random() - 0.5) * 10, 7, -3, 14, 2.5);
    }
    this.particles.update(dt);
    this.level.render(dt, c);
  }

  render() {
    this.app.pipe.render(this.scene, this.camera, {
      reflectY: this.preset.studio ? null : 0.352, bloom: 0.3, vignette: this.preset.spots ? 0.85 : 0.5, saturation: 1.08, bloomThreshold: 1.15, exposure: this.preset.spots ? 0.86 : 1,
    });
  }

  resize() { this.camera.aspect = this.app.width / this.app.height; this.camera.updateProjectionMatrix(); }
}
void TAU; void box;
