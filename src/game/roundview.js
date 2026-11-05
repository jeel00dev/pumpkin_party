// Presents one Simulation: character meshes, particles, camera and the frame step. Holds no game rules.
import * as THREE from 'three';
import { Simulation, STEP } from './simulation.js';
import { BONE, CharacterMesh } from '../assets/characters.js';
import { Animator } from '../assets/animator.js';
import { S } from '../physics/racer.js';
import { THEMES, applyThemeToScene, buildEnvironment, buildLights, buildSky } from '../render/sky.js';
import { Particles, CELL } from '../render/particles.js';
import { ChaseCamera } from './camera.js';
import { SHARED } from '../render/pipeline.js';
import { glowTexture } from '../render/textures.js';
import { toy } from '../render/materials.js';
import { TRAILS } from '../assets/cosmetics.js';

const envCache = new Map();
const _quat = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class RoundView {
  /**
   * @param {object} app  renderer pipeline, input, audio
   * @param {object} def  level definition
   * @param {object} opts { seed, racers, quota, pacing, onEvent, curse }
   */
  constructor(app, def, opts) {
    this.app = app;
    this.def = def;
    this.opts = opts;
    this.onEvent = opts.onEvent || (() => {});
    const tier = app.pipe.tier;
    this.sim = new Simulation(def.build, { tier, headless: false, seed: opts.seed, racers: opts.racers, quota: opts.quota, pacing: opts.pacing, difficulty: opts.difficulty, curse: opts.curse, autoPlayer: app.autoplay });
    this.level = this.sim.level;
    this.scene = new THREE.Scene();
    const themeName = this.level.themeName;
    this.theme = THEMES[themeName] || THEMES.violet;
    let env = envCache.get(themeName);
    if (!env) { env = buildEnvironment(app.pipe.renderer, this.theme); envCache.set(themeName, env); }
    this.sky = buildSky(this.theme, { clouds: tier.detail === 0 ? 8 : 18, seed: (opts.seed % 90) + 2 });
    applyThemeToScene(this.scene, this.theme, env, this.sky);
    this.lights = buildLights(this.theme, tier);
    this.scene.add(this.lights);
    this.scene.add(this.level.group);
    this.particles = new Particles(Math.round(1600 * tier.particles));
    this.scene.add(this.particles.group);

    this.cam = new ChaseCamera(app.width / app.height);
    this.cam.setAspect(app.width / app.height);
    this.cam.camera.fov = this.cam.fovBase;
    if (this.sim.world.mods.fog) this.cam.camera.far = 64;
    this.cam.camera.updateProjectionMatrix();
    this.cam.sens = 1;
    this.cam.reduced = !!app.settings?.reducedShake;
    this.cam.invertY = !!app.settings?.invertY;
    this.accMat = toy({ key: 'acc' });

    // Characters.
    const mods = this.sim.world.mods;
    this.bodyScale = mods.body;
    this.views = this.sim.racers.map((r, i) => {
      const def2 = r.def;
      const detail = r.isPlayer ? 1 : 0;
      const c = new CharacterMesh(def2.skin || 'pumpkin', {
        detail, tier, hat: def2.hat || 'none', glasses: def2.glasses || 'none', accMaterial: this.accMat,
        shadow: tier.shadow > 0 && (r.isPlayer || tier.shadow >= 2048 || i % 2 === 0),
      });
      c.root.position.set(r.x, r.y, r.z);
      c.root.rotation.y = r.yaw;
      c.root.scale.setScalar(mods.body);
      c.bones[BONE.head].scale.setScalar(mods.headScale);
      this.scene.add(c.root);
      const a = new Animator(c, i * 1.37);
      return { r, c, a, wasGrounded: false, trail: 0 };
    });

    // Blob shadows give grounding on tiers without real-time shadows.
    this.blobs = null;
    if (tier.shadow === 0) this.buildBlobs();

    this.buildMarker();

    // In a fog curse the player carries the only light worth having. The view ends where the fog
    // does, so nothing far away shows through it, on any quality tier.
    if (mods.fog) {
      this.lantern = new THREE.PointLight(0xffc27a, 34, 24, 2);
      this.scene.add(this.lantern);
      this.sky.visible = false;
      this.scene.background = new THREE.Color(this.theme.fog);
      this.level.group.traverse((o) => { if (o.material?.userData?.glass) o.visible = false; });
    }
    this.headLift = (mods.headScale - 1) * 0.9;

    this.accum = 0;
    this.dtScale = 1;
    this.hitstop = 0;
    this.slowmo = 0;
    this.time = 0;
    this.routeYaw = Math.PI;
    this.paused = false;
    const p = this.sim.player;
    if (p) this.cam.snap(p.x, p.y, p.z, p.yaw);
    this.spectate = p;
    this.emoteT = 0; this.emote = null;
    this.intro = opts.intro ? { t: 0, dur: opts.intro } : null;
    this.camOverride = null;
    this.ended = false;
  }

  buildBlobs() {
    const n = this.views.length;
    const g = new THREE.PlaneGeometry(1.3, 1.3);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x1a0844, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.blobs = new THREE.InstancedMesh(g, m, n);
    this.blobs.frustumCulled = false;
    this.scene.add(this.blobs);
    this._blobM = new THREE.Matrix4();
    this._ground = { y: 0, collider: null };
  }

  /** White triangle above the player, as on the key art. */
  buildMarker() {
    const shape = new THREE.Shape([new THREE.Vector2(-0.13, 0.12), new THREE.Vector2(0.13, 0.12), new THREE.Vector2(0, -0.1)].map((v) => v));
    const g = new THREE.ShapeGeometry(shape);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.5), side: THREE.DoubleSide, depthTest: false, transparent: true, fog: false, toneMapped: false }));
    m.renderOrder = 30;
    this.marker = m;
    this.scene.add(m);
  }

  dispose() {
    for (const v of this.views) {
      v.c.root.removeFromParent();
      v.c.skeleton.dispose();
    }
    this.level.dispose();
    this.sky.traverse((o) => { o.geometry?.dispose?.(); if (o.material) o.material.dispose(); });
    this.scene.clear();
    this.particles.normal.g.dispose(); this.particles.glow.g.dispose();
    this.particles.normal.mesh.material.dispose(); this.particles.glow.mesh.material.dispose();
  }

  /** Copies input into the player's controls, camera-relative. */
  applyInput(input) {
    const p = this.sim.player;
    if (!p || !p.active || p.finished || p.bot) { input.clearPresses(); return; }
    const inp = p.input;
    const yaw = this.cam.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // Right vector of the camera.
    const rx = -fz, rz = fx;
    inp.mx = fx * input.moveY + rx * input.moveX;
    inp.mz = fz * input.moveY + rz * input.moveX;
    inp.jump = input.jumpHeld;
    if (input.jumpPressed) { inp.jumpPressed = true; }
    if (input.divePressed) { inp.divePressed = true; }
    input.clearPresses();
  }

  update(frameDt) {
    const app = this.app, input = app.input;
    const dtReal = Math.min(frameDt, 0.1);
    SHARED.uTime.value += dtReal;
    let dt = dtReal;
    if (this.hitstop > 0) { this.hitstop -= dtReal; dt *= 0.2; }
    if (this.slowmo > 0) { this.slowmo -= dtReal; dt *= 0.42; }
    this.time += dt;

    // Camera look is processed every frame so the mouse never feels latent.
    if (this.intro === null && !this.paused) {
      input.poll();
      const [ldx, ldy] = input.takeLook();
      if (input.enabled) this.cam.look(ldx, ldy);
      if (input.enabled) this.applyInput(input);
    }
    if (!this.paused) {
      this.accum += dt;
      let guard = 0;
      while (this.accum >= STEP && guard < 40) {
        this.sim.step();
        this.accum -= STEP;
        guard++;
        // One-shot presses are consumed by the first physics step they reach.
        this.drainEvents();
      }
      if (guard >= 40) this.accum = 0;
    }
    this.syncViews(dtReal);
    this.level.render(dt, this.cam.camera);
    this.particles.update(dt);

    if (!this.intro) {
      const t = this.spectate || this.sim.player;
      if (t) {
        const ry = this.routeYawAt(t);
        const target = t.hidden ? { x: this.cam.tx, y: this.cam.groundY, z: this.cam.tz, vx: 0, vz: 0, grounded: true } : t;
        this.cam.update(dtReal, target, ry);
      }
    } else {
      this.updateIntro(dtReal);
    }
    if (this.camOverride) this.camOverride(dtReal, this.cam.camera);
    this.sky.onCameraMove(this.cam.camera);
    const focus = this.sim.player && !this.sim.player.hidden ? this.sim.player : (this.spectate || { x: this.cam.tx, y: this.cam.groundY, z: this.cam.tz });
    this.lights.follow(focus);
    this.lantern?.position.set(focus.x, (focus.y ?? 0) + 3.4, focus.z);
  }

  routeYawAt(r) {
    // Point along the route ahead of the racer so the camera anticipates turns.
    const L = this.level;
    if (L.cameraYaw !== undefined) return L.cameraYaw;
    if (!L.route.length || L.mode !== 'race') return null;
    const s = L.route;
    let best = 0, bd = Infinity;
    for (let i = 0; i < s.length; i++) {
      const d = (s[i].x - r.x) ** 2 + (s[i].z - r.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    const a = s[best], b = s[Math.min(best + 1, s.length - 1)];
    if (a === b) return this.routeYaw;
    this.routeYaw = Math.atan2(b.x - a.x, b.z - a.z);
    return this.routeYaw;
  }

  updateIntro(dt) {
    const it = this.intro;
    it.t += dt;
    const k = Math.min(1, it.t / it.dur);
    const e = k * k * (3 - 2 * k);
    const L = this.level;
    const path = L.introPath || defaultIntro(L);
    const c = this.cam.camera;
    const p0 = path.from, p1 = path.to;
    c.position.set(p0[0] + (p1[0] - p0[0]) * e, p0[1] + (p1[1] - p0[1]) * e, p0[2] + (p1[2] - p0[2]) * e);
    const l0 = path.lookFrom, l1 = path.lookTo;
    c.lookAt(l0[0] + (l1[0] - l0[0]) * e, l0[1] + (l1[1] - l0[1]) * e, l0[2] + (l1[2] - l0[2]) * e);
    c.fov = 56;
    c.updateProjectionMatrix();
    if (it.t >= it.dur) {
      this.intro = null;
      const p = this.sim.player;
      if (p) this.cam.snap(p.x, p.y, p.z, p.yaw);
      this.onEvent({ type: 'introEnd' });
    }
  }

  skipIntro() { if (this.intro) this.intro.t = this.intro.dur; }

  drainEvents() {
    const ev = this.sim.world.events;
    if (!ev.length) return;
    for (let i = 0; i < ev.length; i++) this.handleEvent(ev[i]);
    ev.length = 0;
  }

  handleEvent(e) {
    const P = this.particles, r = e.racer;
    const mine = r && r.isPlayer;
    const near = r ? Math.hypot(r.x - this.cam.tx, r.z - this.cam.tz) < 30 : true;
    const audio = this.app.audio;
    const dist = r ? Math.hypot(r.x - this.cam.tx, r.y - this.cam.groundY, r.z - this.cam.tz) : 0;
    const vol = mine ? 1 : Math.max(0, 0.45 - dist * 0.018);
    switch (e.type) {
      case 'jump':
        P.dust(e.x, e.y, e.z, mine ? 6 : 3);
        this.viewOf(r)?.a.jump();
        if (vol > 0.03) audio?.sfx('jump', vol, mine ? 1 : 0.9 + Math.random() * 0.25);
        if (mine) this.onEvent({ type: 'playerJump' });
        break;
      case 'land':
        if (e.v > 3) {
          P.dust(e.x, e.y, e.z, mine ? 8 : 3);
          this.viewOf(r)?.a.land(e.v);
          if (vol > 0.03) audio?.sfx('land', vol * Math.min(1, e.v / 12));
          if (mine && e.v > 14) this.cam.addShake(0.25);
        }
        break;
      case 'dive':
        P.dust(e.x, e.y, e.z, mine ? 5 : 2);
        if (vol > 0.03) audio?.sfx('dive', vol);
        if (mine) this.onEvent({ type: 'playerDive' });
        break;
      case 'slide':
        P.dust(e.x, e.y, e.z, mine ? 10 : 4);
        this.viewOf(r)?.a.land(6);
        if (vol > 0.03) audio?.sfx('land', vol * 0.8);
        break;
      case 'hit':
        P.impact(e.x, e.y, e.z, mine ? 1.2 : 0.5);
        this.viewOf(r)?.a.hit();
        if (vol > 0.03) audio?.sfx('bonk', vol);
        if (mine) { this.cam.addShake(0.95); this.hitstop = 0.06; this.onEvent({ type: 'playerHit' }); }
        break;
      case 'bounce':
        P.ringPulse(e.x, e.y + 0.3, e.z, 3, 0xff5ad0);
        P.sparkle(e.x, e.y, e.z, 0xffd23a, near ? 10 : 2);
        if (vol > 0.02) audio?.sfx('boing', vol);
        if (mine) this.onEvent({ type: 'playerBounce' });
        for (const o of this.level.obstacles) if (o.pulse !== undefined && Math.hypot(o.x - e.x, o.z - e.z) < 3) o.pulse = 1;
        break;
      case 'bump':
        P.ringPulse(e.x, e.y, e.z, 2, 0xffffff);
        if (vol > 0.03) audio?.sfx('boing', vol * 0.7, 1.3);
        break;
      case 'fall': {
        const kind = this.level.liquidKind || 'water';
        P.splash(e.x, this.level.liquidY ?? e.y, e.z, kind);
        if (dist < 70) audio?.sfx('splash', mine ? 1 : Math.max(0.05, 0.5 - dist * 0.008));
        if (mine) {
          this.cam.addShake(0.3);
          this.onEvent({ type: 'playerFell' });
          if (this.level.mode !== 'race') this.app.audio?.sfx('splash', 1);
        }
        break;
      }
      case 'respawn':
        P.ringPulse(e.x, e.y + 0.6, e.z, 3, 0x53f0ff);
        P.sparkle(e.x, e.y, e.z, 0x53f0ff, near ? 14 : 2);
        if (mine) { audio?.sfx('respawn', 0.8); this.cam.snap(r.x, r.y, r.z, this.cam.yaw); }
        break;
      case 'qualify':
        P.confetti(e.x, e.y + 1, e.z, mine ? 110 : 26, mine ? 7 : 3);
        P.sparkle(e.x, e.y, e.z, 0xffd23a, 16);
        if (mine) { audio?.sfx('qualify', 1); this.slowmo = 0.9; }
        else if (dist < 40) audio?.sfx('ping', 0.3);
        this.onEvent({ type: 'qualify', racer: r });
        break;
      case 'eliminate':
        this.onEvent({ type: 'eliminate', racer: r });
        break;
      case 'roundEnd':
        this.onEvent({ type: 'roundEnd' });
        break;
      case 'thud':
        P.dust(e.x, e.y, e.z, 7);
        if (dist < 40) audio?.sfx('thud', Math.max(0.05, 0.55 - dist * 0.012));
        if (dist < 22) this.cam.addShake(0.15);
        break;
      case 'shove':
        if (mine && e.v > 2) audio?.sfx('shove', 0.6);
        break;
      case 'climb':
        if (vol > 0.05) audio?.sfx('jump', vol * 0.6, 0.8);
        break;
      case 'caught':
        P.impact(e.x, e.y, e.z, 1);
        for (let i = 0; i < 10; i++) P.spawn(e.x, e.y, e.z, { vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 1, size: 0.6, sizeEnd: 0.2, cell: CELL.GHOST });
        if (mine) this.cam.addShake(1);
        else if (dist < 45) audio?.sfx('boo', 0.3);
        break;
      case 'tileWarn':
        if (Math.hypot(e.x - this.cam.tx, e.z - this.cam.tz) < 12) audio?.sfx('crack', 0.5);
        break;
      case 'tileFall':
        P.dust(e.x, e.y, e.z, 2, 0xcbb4ff);
        if (Math.hypot(e.x - this.cam.tx, e.z - this.cam.tz) < 10) audio?.sfx('drop', 0.5);
        break;
      case 'curse':
        P.ringPulse(e.x, e.y + 0.3, e.z, 7, 0x8cff2e);
        P.sparkle(e.x, e.y + 0.4, e.z, 0xb8ff5a, 7);
        if (Math.hypot(e.x - this.cam.tx, e.z - this.cam.tz) < 26) audio?.sfx('curse', 0.7);
        break;
      default:
        this.level.onLevelEvent?.(e, this);
    }
  }

  viewOf(r) { return this.views[r.id]; }

  syncViews(dt) {
    const alpha = this.accum / STEP;
    let bi = 0;
    for (const v of this.views) {
      const r = v.r, c = v.c;
      if (r.hidden) { c.root.visible = false; continue; }
      const k = alpha > 1 ? 1 : alpha;
      const x = r.px + (r.x - r.px) * k, y = r.py + (r.y - r.py) * k, z = r.pz + (r.z - r.pz) * k;
      // A rival right in front of the lens would blot out the view of the course.
      const cp = this.cam.camera.position;
      c.root.visible = r.isPlayer || (x - cp.x) ** 2 + (y + 1 - cp.y) ** 2 + (z - cp.z) ** 2 > 7.3;
      c.root.position.set(x, y, z);
      let d = r.yaw - r.pyaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      c.root.rotation.y = r.pyaw + d * k;
      const mode = r.finished ? 'win' : r.animMode();
      const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
      let tumble = null;
      if (mode === 'stun') {
        // Convert the world-space tumble into the root's yawed frame.
        _yawQ.setFromAxisAngle(_up, -r.yaw);
        _quat.set(r.tq[0], r.tq[1], r.tq[2], r.tq[3]);
        tumble = _quat.premultiply(_yawQ);
      }
      const wanted = r.isPlayer ? this.emote : v.emote;
      const em = wanted && mode === 'idle' ? wanted : null;
      v.a.update(dt, {
        mode: em ? 'emote' : mode, emote: em, speed: Math.hypot(r.vx - r.gvx, r.vz - r.gvz),
        vx: r.vx, vz: r.vz, vy: r.vy, fwdX: fx, fwdZ: fz, grounded: r.grounded, tumble,
      });
      // Foot dust and cosmetic trail.
      if (r.grounded && r.state === S.RUN) {
        const sp = Math.hypot(r.vx - r.gvx, r.vz - r.gvz);
        v.trail += sp * dt;
        if (v.trail > 3.2 && sp > 3) {
          v.trail = 0;
          if (r.isPlayer || bi % 3 === 0) this.particles.spawn(x, y + 0.08, z, { vx: -r.vx * 0.06, vy: 0.5, vz: -r.vz * 0.06, life: 0.4, size: 0.24, sizeEnd: 0.5, cell: CELL.PUFF, color: 0xe6d0ff, drag: 3 });
        }
      }
      if (r.def.trail && r.def.trail !== 'none') this.emitTrail(v, r, dt, x, y, z);
      if (this.blobs) {
        const g = this.level.world.groundBelow(x, y + 0.3, z, 6, this._ground);
        const yy = g ? this._ground.y + 0.03 : -999;
        this._blobM.makeTranslation(x, yy, z);
        this.blobs.setMatrixAt(bi, this._blobM);
      }
      bi++;
    }
    if (this.blobs) { this.blobs.count = bi; this.blobs.instanceMatrix.needsUpdate = true; }
    // Loose props hide the same way, so one can't park in front of the lens.
    for (const o of this.level.obstacles) {
      if (!o.hidesNearCamera || !o.mesh) continue;
      const cp = this.cam.camera.position;
      o.mesh.visible = (o.x - cp.x) ** 2 + (o.z - cp.z) ** 2 > 9;
    }
    const p = this.sim.player;
    if (this.marker) {
      if (p && !p.hidden && !p.finished) {
        this.marker.visible = true;
        const v = this.viewOf(p);
        this.marker.position.set(v.c.root.position.x, v.c.root.position.y + 2.2 * this.bodyScale + this.headLift + Math.sin(this.time * 4) * 0.05, v.c.root.position.z);
        this.marker.quaternion.copy(this.cam.camera.quaternion);
      } else this.marker.visible = false;
    }
  }

  emitTrail(v, r, dt, x, y, z) {
    const sp = Math.hypot(r.vx, r.vz);
    if (sp < 2.5 && r.grounded) return;
    v.tr = (v.tr || 0) + dt;
    const def = TRAILS[r.def.trail];
    if (!def || v.tr < def.rate) return;
    v.tr = 0;
    const j = () => (Math.random() - 0.5) * 0.5;
    this.particles.spawn(x + j(), y + 0.5 + Math.random() * 0.6, z + j(), {
      vx: -r.vx * 0.05, vy: def.rise ?? 0.6, vz: -r.vz * 0.05, life: def.life ?? 0.8, size: def.size ?? 0.34, sizeEnd: def.sizeEnd ?? 0.08,
      cell: def.cell, color: def.colors[Math.floor(Math.random() * def.colors.length)], additive: !!def.additive, intensity: def.intensity ?? 1, spin: def.spin ?? 2, gravity: def.gravity ?? 0,
    });
  }

  render() {
    const pipe = this.app.pipe;
    // On courses that climb, the mirror plane follows the character up the hill.
    const reflectY = this.level.mode === 'race' && !this.intro ? this.cam.groundY : this.level.reflectY;
    pipe.render(this.scene, this.cam.camera, {
      reflectY, bloom: this.level.bloom ?? 0.3, exposure: this.level.exposure ?? 1, vignette: 0.5, saturation: 1.08, bloomThreshold: 1.15,
    });
  }
}

function defaultIntro(L) {
  const f = L.finish;
  if (f) return { from: [16, f.y + 26, f.z + 46], to: [0, 5.5, 20], lookFrom: [0, f.y + 16, f.z - 30], lookTo: [0, 1.6, -10] };
  return { from: [32, 20, 32], to: [10, 8, 18], lookFrom: [0, 0, 0], lookTo: [0, 1, 0] };
}
