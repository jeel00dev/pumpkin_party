// Shared materials. Most of the world uses one "toy plastic" PBR material driven by vertex attributes,
// so the whole level batches into very few draw calls.
import * as THREE from 'three';
import { SHARED } from './pipeline.js';

let tierRef = { clearcoat: true, reflect: true, refract: true };
export function setMaterialTier(t) { tierRef = t; }

const cache = new Map();

/** Wire aPBR (roughness, clearcoat, emissive) and a soft rim light into a physical material. */
export function patchToy(mat, { rim = 0.22, rimColor = 0xb48cff, wrap = 0.0, key = '' } = {}) {
  const rc = new THREE.Color(rimColor).multiplyScalar(rim);
  mat.userData.uRim = { value: rc };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uRim = mat.userData.uRim;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aPBR;
varying vec3 vPBR;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPBR = aPBR;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vPBR;
uniform vec3 uRim;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = max(vPBR.x, 0.04);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vPBR.z;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= vPBR.y;
#endif`)
      .replace('#include <opaque_fragment>', `{
  vec3 V = normalize(vViewPosition);
  float fr = pow(1.0 - saturate(dot(normal, V)), 3.0);
  outgoingLight += uRim * fr;
  ${wrap > 0 ? `outgoingLight += diffuseColor.rgb * ${wrap.toFixed(3)};` : ''}
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `toy${wrap}${key}`;
  return mat;
}

/** The main batched material: vertex colours + vertex PBR. */
export function toy(opts = {}) {
  const k = `toy:${opts.key || ''}:${opts.side || 0}:${tierRef.clearcoat}:${opts.map ? opts.map.uuid : ''}:${opts.normalMap ? opts.normalMap.uuid : ''}`;
  if (cache.has(k)) return cache.get(k);
  const Base = tierRef.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const params = {
    vertexColors: true, metalness: 0, roughness: 0.5, envMapIntensity: opts.env ?? 1,
    side: opts.side ?? THREE.FrontSide,
  };
  if (opts.map) params.map = opts.map;
  if (opts.normalMap) { params.normalMap = opts.normalMap; params.normalScale = new THREE.Vector2(opts.normalScale ?? 0.5, opts.normalScale ?? 0.5); }
  if (tierRef.clearcoat) { params.clearcoat = 1; params.clearcoatRoughness = opts.clearRough ?? 0.14; }
  const m = patchToy(new Base(params), { rim: opts.rim ?? 0.14, rimColor: opts.rimColor ?? 0xb48cff, wrap: opts.wrap ?? 0, key: opts.key || '' });
  m.userData.shared = true;
  cache.set(k, m);
  return m;
}

/**
 * Glossy tile material: planar reflections from the pipeline blended by Fresnel, perturbed slightly
 * by the tile's normal map so the mirror image shimmers across the bevels.
 */
export function reflectiveFloor({ map, normalMap, color = 0xffffff, rough = 0.28, normalScale = 0.5, reflect = 1.0, repeat = null, instanced = true } = {}) {
  const Base = tierRef.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const params = { color, roughness: rough, metalness: 0, envMapIntensity: 1.0 };
  if (map) params.map = map;
  if (normalMap) { params.normalMap = normalMap; params.normalScale = new THREE.Vector2(normalScale, normalScale); }
  if (tierRef.clearcoat) { params.clearcoat = 0.45; params.clearcoatRoughness = 0.18; params.specularIntensity = 0.55; }
  const m = new Base(params);
  void repeat; void instanced;
  m.userData.uStrength = { value: reflect };
  m.onBeforeCompile = (s) => {
    s.uniforms.tReflect = SHARED.tReflect;
    s.uniforms.uReflectMatrix = SHARED.uReflectMatrix;
    s.uniforms.uReflectOn = SHARED.uReflectOn;
    s.uniforms.uReflectStrength = m.userData.uStrength;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
uniform mat4 uReflectMatrix;
varying vec4 vReflUv;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wp = vec4(transformed,1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix*wp;
  #endif
  wp = modelMatrix*wp;
  vReflUv = uReflectMatrix*wp;
}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tReflect; uniform float uReflectOn; uniform float uReflectStrength;
varying vec4 vReflUv;`)
      .replace('#include <opaque_fragment>', `
if (uReflectOn > 0.5) {
  vec3 V = normalize(vViewPosition);
  float NoV = saturate(dot(normal, V));
  float F = min(0.5, 0.1 + 0.9*pow(1.0-NoV, 4.0));
  vec2 uv = vReflUv.xy/vReflUv.w + (normal.xy-nonPerturbedNormal.xy)*0.05;
  vec3 r = textureLod(tReflect, uv, 1.2).rgb*0.4;
  float b = 0.006;
  r += textureLod(tReflect, uv+vec2(b,0.0), 2.0).rgb*0.15;
  r += textureLod(tReflect, uv-vec2(b,0.0), 2.0).rgb*0.15;
  r += textureLod(tReflect, uv+vec2(0.0,b*1.8), 2.2).rgb*0.15;
  r += textureLod(tReflect, uv-vec2(0.0,b*1.8), 2.2).rgb*0.15;
  outgoingLight = mix(outgoingLight, outgoingLight + r, saturate(F*uReflectStrength));
}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'reflFloor';
  return m;
}

/**
 * Screen-space refractive surface for slime, water and jelly. Samples last frame's half-res HDR colour,
 * so refraction adds no extra scene pass. Falls back to a plain tinted surface on the low tier.
 */
export function refractive({ color = 0x7dff3a, deep = 0x1a7a12, emissive = 0x000000, opacity = 0.9, distort = 0.05, flow = 1, gloss = 0.7, foam = 0x000000, foamAmt = 0, waveScale = 0.35 } = {}) {
  const uniforms = {
    tRefract: SHARED.tRefract, uScreen: SHARED.uScreen, uTime: SHARED.uTime, uRefractOn: SHARED.uRefractOn,
    tReflect: SHARED.tReflect, uReflectMatrix: SHARED.uReflectMatrix, uReflectOn: SHARED.uReflectOn,
    uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) }, uEmissive: { value: new THREE.Color(emissive) },
    uFoam: { value: new THREE.Color(foam) }, uFoamAmt: { value: foamAmt },
    uOpacity: { value: opacity }, uDistort: { value: distort }, uFlow: { value: flow }, uGloss: { value: gloss }, uWaveScale: { value: waveScale },
    uSkyColor: { value: new THREE.Color(0x8a5cff) }, uLightDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
    fogColor: { value: new THREE.Color(0) }, fogDensity: { value: 0 },
  };
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vNormalW; varying vec4 vReflUv; varying float vFogDepth; varying vec2 vUv;
      uniform mat4 uReflectMatrix;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix*vec4(position,1.0);
        vWorld = wp.xyz; vNormalW = normalize(mat3(modelMatrix)*normal);
        vReflUv = uReflectMatrix*wp;
        vec4 mv = viewMatrix*wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vWorld; varying vec3 vNormalW; varying vec4 vReflUv; varying float vFogDepth; varying vec2 vUv;
      uniform sampler2D tRefract, tReflect; uniform vec2 uScreen; uniform float uTime, uRefractOn, uReflectOn;
      uniform vec3 uColor, uDeep, uEmissive, uFoam, uSkyColor, uLightDir; uniform float uFoamAmt, uOpacity, uDistort, uFlow, uGloss, uWaveScale;
      uniform vec3 fogColor; uniform float fogDensity;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ return noise(p)*0.55 + noise(p*2.1+3.7)*0.3 + noise(p*4.3+9.1)*0.15; }
      void main(){
        vec2 p = vWorld.xz*uWaveScale;
        float t = uTime*uFlow;
        float h  = fbm(p + vec2(t*0.22,t*0.13));
        float hx = fbm(p + vec2(0.12,0.0) + vec2(t*0.22,t*0.13));
        float hz = fbm(p + vec2(0.0,0.12) + vec2(t*0.22,t*0.13));
        float camDist = length(cameraPosition - vWorld);
        float near = exp(-camDist*0.006);
        vec2 grad = vec2(hx-h, hz-h)*8.0*near;
        vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float NoV = clamp(dot(N,V),0.0,1.0);
        float F = 0.04 + 0.96*pow(1.0-NoV,5.0);

        vec3 col = mix(uDeep, uColor, mix(0.5, smoothstep(0.32,0.72,h), near));
        if (uRefractOn > 0.5) {
          vec2 suv = gl_FragCoord.xy/uScreen + grad*uDistort;
          vec3 under = texture2D(tRefract, suv).rgb;
          col = mix(under*mix(vec3(1.0),uColor,0.75), col, uOpacity);
        }
        vec3 reflCol = uSkyColor;
        if (uReflectOn > 0.5) {
          vec2 ruv = vReflUv.xy/vReflUv.w + grad*0.04;
          reflCol = textureLod(tReflect, ruv, 1.0).rgb;
        }
        col = mix(col, reflCol, clamp(F*uGloss*1.4,0.0,1.0));
        // sun glitter
        vec3 H = normalize(uLightDir+V);
        col += vec3(1.0,0.97,0.9)*pow(max(dot(N,H),0.0), 90.0)*uGloss*1.6;
        col += uEmissive*(0.6+0.8*mix(0.5, smoothstep(0.35,0.8,h), near));
        if (uFoamAmt > 0.0) col += uFoam*smoothstep(0.58,0.74,fbm(p*2.2 - vec2(t*0.3,t*0.1)))*uFoamAmt*near;
        float fogF = 1.0 - exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
        col = mix(col, fogColor, clamp(fogF,0.0,1.0));
        gl_FragColor = vec4(col, uRefractOn > 0.5 ? 1.0 : max(uOpacity,0.92));
      }`,
  });
}

/**
 * Solid glass or jelly with true screen-space refraction: whatever is behind it bends with the surface
 * normal, tinted by the body colour, with a bright Fresnel edge. On the low tier it degrades to plain alpha.
 */
export function glass({ color = 0xffb0ec, strength = 0.07, tint = 0.65, edge = 0xffffff, envColor = 0xd8c0ff } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide, userData: { glass: true },
    uniforms: {
      tRefract: SHARED.tRefract, uScreen: SHARED.uScreen, uRefractOn: SHARED.uRefractOn,
      uColor: { value: new THREE.Color(color) }, uEdge: { value: new THREE.Color(edge) }, uEnv: { value: new THREE.Color(envColor) },
      uStrength: { value: strength }, uTint: { value: tint }, uLight: { value: new THREE.Vector3(0.42, 0.9, 0.42).normalize() },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW; varying vec3 vVN;
      void main(){
        vN = normalize(mat3(modelMatrix)*normal);
        vVN = normalize(normalMatrix*normal);
        vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vN; varying vec3 vW; varying vec3 vVN;
      uniform sampler2D tRefract; uniform vec2 uScreen; uniform float uRefractOn, uStrength, uTint;
      uniform vec3 uColor, uEdge, uEnv, uLight;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition-vW);
        float NoV = clamp(dot(N,V),0.0,1.0);
        float F = 0.05 + 0.95*pow(1.0-NoV,4.0);
        vec3 body;
        float alpha = 1.0;
        if (uRefractOn > 0.5) {
          // Thicker in the middle: bend most where the surface faces the viewer's edge.
          vec2 uv = gl_FragCoord.xy/uScreen - normalize(vVN).xy*uStrength*(1.0-NoV*0.55);
          body = texture2D(tRefract, uv).rgb * mix(vec3(1.0), uColor, uTint);
        } else { body = uColor*0.8; alpha = 0.6; }
        vec3 H = normalize(uLight+V);
        vec3 spec = uEdge*pow(max(dot(N,H),0.0),160.0)*2.2;
        vec3 c = mix(body, uEnv, F*0.8) + spec + uColor*0.05;
        gl_FragColor = vec4(c, alpha);
      }`,
  });
}

/** Unlit glowing material for lanterns, windows and halos. */
export function glowMat(color = 0xffc23a, intensity = 3, opts = {}) {
  const k = `glow:${color}:${intensity}:${opts.additive ? 1 : 0}:${opts.map ? opts.map.uuid : ''}`;
  if (cache.has(k)) return cache.get(k);
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({
    color: c, map: opts.map || null, transparent: !!opts.additive || !!opts.map, depthWrite: !opts.additive && !opts.map,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: opts.fog ?? false, toneMapped: false, side: opts.side ?? THREE.FrontSide,
  });
  cache.set(k, m);
  return m;
}

export function clearMaterialCache() { for (const m of cache.values()) m.dispose(); cache.clear(); }
