/* 디스크 태우기 연출: 고르지 않은 미니게임 디스크가 모서리부터 타들어 가 사라진다(불씨·연기).
   ♣로 다시 불러오면 누렇게 그슬린 채 돌아온다(탄 횟수만큼 짙게). 디지털판 연출일 뿐 규칙과는 무관 */
import * as THREE from 'three';
import { ctex } from './textures';

export interface BurnU { uBurn: { value: number }; uChar: { value: number }; uSeed: { value: number }; uBody: { value: THREE.Color } }

/** 재질에 태우기 셰이더를 덧붙인다. u를 같이 쓰는 재질들은 함께 탄다 */
export function burnable(m: THREE.MeshStandardMaterial, u: BurnU): THREE.MeshStandardMaterial {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBPos; uniform float uBurn; uniform float uChar; uniform float uSeed; uniform vec3 uBody;
float bh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bh(i), bh(i + vec2(1, 0)), f.x), mix(bh(i + vec2(0, 1)), bh(i + vec2(1, 1)), f.x), f.y); }
float bf(vec2 p){ return bn(p) * .55 + bn(p * 2.3) * .3 + bn(p * 5.1) * .15; }
/* 0(먼저 탐) ~ 1(나중에 탐): 한쪽 모서리에서 시작해 얼룩지게 번진다 */
float burnD(){ vec2 p = vBPos.xz / 9.0 + .5; float s = uSeed * 7.0;
  float corner = length(p - vec2(fract(uSeed * 3.1), fract(uSeed * 5.7))) / 1.3;
  return clamp(corner * .62 + bf(p * 3.0 + s) * .48 - .05, 0.0, 1.0); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float bD = burnD();
if (bD < uBurn) discard;
/* 타는 앞쪽은 검게 그을린다 */
float bChar = smoothstep(uBurn + .18, uBurn, bD) * step(.001, uBurn);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.06, .045, .035), bChar * .92);
/* 다시 불러온 디스크(uChar) */
if (uChar > .001) {
  vec3 c = diffuseColor.rgb;
#ifdef USE_MAP
  /* 이름표는 종이라 끄트머리가 타서 사라졌다: 가장자리를 군데군데(모서리일수록 많이) 갉아 먹고,
     사라진 자리는 바로 옆 디스크 표면을 그대로 이어 보여 준다(원래 직사각형 윤곽이 남지 않게). 남은 종이 가장자리는 검게 탔다.
     이름표 자리(디스크 그림 floppyTex의 흰 칸): u 0.086~0.914, v 0.045~0.597 */
  vec2 lu = vMapUv;
  vec2 lp = (lu - vec2(.086, .045)) / vec2(.828, .552);           // 이름표 안 좌표 0~1
  if (lp.x > -.01 && lp.x < 1.01 && lp.y > -.01 && lp.y < 1.01) {
    float ex = min(lp.x, 1.0 - lp.x) * 1.43, ey = min(lp.y, 1.0 - lp.y); // 가장자리까지 거리(이름표 높이 단위)
    float de = min(ex, ey);
    float cornerB = smoothstep(.32, .0, max(ex, ey));
    float n = bf(lp * vec2(4.0, 2.6) + uSeed * 9.0);
    float eat = (smoothstep(.38, .72, n) * .17 + cornerB * .13) * (.55 + uChar * .6);
    float on = smoothstep(.006, .03, eat);
    float gone = smoothstep(eat + .005, eat - .005, de) * on;
    float rim = smoothstep(eat + .028, eat + .003, de) * (1.0 - gone) * on;
    float toast = smoothstep(eat + .15, eat, de) * (1.0 - gone) * on;
    // 사라진 자리: 이름표 바로 바깥(가까운 쪽 가장자리 너머)의 디스크 표면을 가져온다
    vec2 outUv = ex < ey ? vec2(lp.x < .5 ? .05 : .95, lu.y) : vec2(lu.x, lp.y < .5 ? .02 : .62);
    vec3 under = texture2D(map, outUv).rgb;
    under *= 1.0 - smoothstep(eat - .05, eat, de) * .35 * gone;     // 종이가 붙어 있던 경계 바로 안쪽에 옅은 그을음
    c = mix(c, c * vec3(.78, .55, .3), toast * .7);                 // 타기 직전의 눌은 갈색
    c = mix(c, vec3(.07, .045, .03), rim * .9);                      // 타다 남은 검은 종이 가장자리
    c = mix(c, under, gone);                                         // 종이가 사라진 곳
  }
#endif
  /* 불에 그슬려 전체가 누렇게 바랬다. 많이 탈수록 더 누렇고, 가장자리와 얼룩진 곳이 더 짙다 */
  vec2 q = vBPos.xz / 9.0;
  float edge = smoothstep(.28, .5, max(abs(q.x), abs(q.y)));
  float blot = bf(vBPos.xz * .45 + uSeed * 13.0);
  float k = clamp(uChar * (.8 + blot * .45) + edge * uChar * .55, 0.0, 1.0);
  float lum = dot(c, vec3(.3, .59, .11));
  vec3 yellowed = mix(c, vec3(lum) * vec3(1.0, .74, .32) + vec3(.08, .035, 0.), .95) * (1.0 - .3 * k);
  c = mix(c, yellowed, k);
  c = mix(c, c * vec3(.5, .33, .16), smoothstep(.3, 1.0, k) * .9);
  diffuseColor.rgb = c;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
/* 불붙은 가장자리: 주황빛으로 달아오른다 */
float bGlow = smoothstep(uBurn + .05, uBurn, bD) * step(.001, uBurn) * (1.0 - step(.999, uBurn));
totalEmissiveRadiance += vec3(1.0, .42, .08) * bGlow * 4.0;`);
  };
  m.customProgramCacheKey = () => 'burn';
  return m;
}

/* ---- 불씨·연기 ---- */
const emberTex = () => ctex('ember', 64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(.3, 'rgba(255,150,40,.9)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const smokeTex = () => ctex('smoke', 64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(70,64,60,.55)'); gr.addColorStop(1, 'rgba(70,64,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

interface Part { s: THREE.Sprite; v: THREE.Vector3; life: number; t: number; s0: number; s1: number; a0: number }
export class Burns {
  private parts: Part[] = [];
  private emberM?: THREE.SpriteMaterial; private smokeM?: THREE.SpriteMaterial;
  constructor(private scene: THREE.Scene) {}
  /** 타고 있는 디스크 위 한 점에서 불씨(와 가끔 연기)를 뿜는다 */
  emit(at: THREE.Vector3, smoke: boolean): void {
    if (!this.emberM) {
      this.emberM = new THREE.SpriteMaterial({ map: emberTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      this.smokeM = new THREE.SpriteMaterial({ map: smokeTex(), depthWrite: false, transparent: true });
    }
    const mk = (m: THREE.SpriteMaterial, life: number, s0: number, s1: number, v: THREE.Vector3, a0: number) => {
      const s = new THREE.Sprite(m.clone()); s.position.copy(at); s.scale.setScalar(s0); this.scene.add(s);
      this.parts.push({ s, v, life, t: 0, s0, s1, a0 });
    };
    mk(this.emberM, .6 + Math.random() * .7, .9 + Math.random() * .6, .1, new THREE.Vector3((Math.random() - .5) * 6, 8 + Math.random() * 10, (Math.random() - .5) * 6), 1);
    if (smoke) mk(this.smokeM!, 1.4 + Math.random() * .6, 2.5, 7, new THREE.Vector3((Math.random() - .5) * 3, 6 + Math.random() * 4, (Math.random() - .5) * 3), .55);
  }
  step(dt: number): void {
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k]; p.t += dt; const f = p.t / p.life;
      if (f >= 1) { this.scene.remove(p.s); p.s.material.dispose(); this.parts.splice(k, 1); continue; }
      p.s.position.addScaledVector(p.v, dt); p.v.y *= 1 - dt * .6;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * f); (p.s.material as THREE.SpriteMaterial).opacity = p.a0 * (1 - f) * Math.min(1, f * 6);
    }
  }
  clear(): void { for (const p of this.parts) { this.scene.remove(p.s); p.s.material.dispose(); } this.parts = []; }
}
