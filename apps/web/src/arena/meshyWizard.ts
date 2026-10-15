/* 새 마법사(시안, 2026-10-15): Meshy로 만든 모델(10K 리메시 + UV + 텍스처)을 3단 명암 + 잉크 윤곽선으로.
   한 번 불러와 자리마다 복제하고, 텍스처의 파란 부분(모자·망토·지팡이 수정)을 자리 색으로 바꾼다.
   모델이 한 덩어리라 팔·고개는 따로 움직이지 않는다(몸 전체 흔들기·기울이기만) */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Wizard } from './props';
import { addInk, gradientMap } from './toon';

/** 개발용 미리보기: 주소에 wiz=new 를 붙이면 아레나들이 새 마법사(이 모델) + 안쪽 주름 선으로 그린다 */
export const NEW_WIZ = import.meta.env.DEV && new URLSearchParams(location.search).get('wiz') === 'new';

const URL_ = `${import.meta.env.BASE_URL}models/Meshy_AI_Crystal_Staff_Wizard_1014212149_texture.glb`;
/** 지금 마법사와 같은 키(모자 끝까지) */
const HEIGHT = 2.3;

let proto: THREE.Object3D | null = null; let loading: Promise<THREE.Object3D> | null = null;
function load(): Promise<THREE.Object3D> {
  if (proto) return Promise.resolve(proto);
  loading ??= new GLTFLoader().loadAsync(URL_).then(g => {
    const box = new THREE.Box3().setFromObject(g.scene); const s = HEIGHT / (box.max.y - box.min.y);
    const o = new THREE.Group(); g.scene.scale.setScalar(s); g.scene.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s); o.add(g.scene);
    proto = o; return o;
  });
  return loading;
}

/* ---- 자리 색 바꾸기(마스크 없이): 파란 부분만 골라 색상·채도·밝기를 목표 색으로. 포션 둘(구)과 파우치 아래 그늘(상자)은 예외 ---- */
const SRC = '#2f5fc8';
const hsv = (hex: string) => { const c = new THREE.Color(hex); const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); return new THREE.Vector3(h.h, mx ? (mx - mn) / mx : 0, mx); };
const POTION = new THREE.Vector4(0.19, -0.255, 0.165, 0.1), POTION2 = new THREE.Vector4(-0.238, -0.235, 0.125, 0.065);
const SHADE0 = new THREE.Vector3(-0.22, -0.44, 0.14), SHADE1 = new THREE.Vector3(-0.06, -0.28, 0.3);
function recolor(m: THREE.MeshToonMaterial, color: string): void {
  const on = color.toLowerCase() !== SRC; if (!on) return;
  const dst = hsv(color), src = hsv(SRC);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { rcSrc: { value: src }, rcDst: { value: dst }, rcP: { value: POTION }, rcP2: { value: POTION2 }, rcS0: { value: SHADE0 }, rcS1: { value: SHADE1 } });
    sh.vertexShader = `varying vec3 vRcPos;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRcPos = position;')}`;
    sh.fragmentShader = `uniform vec3 rcSrc, rcDst, rcS0, rcS1; uniform vec4 rcP, rcP2; varying vec3 vRcPos;
vec3 rc_rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
vec3 rc_hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
${sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)); vec3 h = rc_rgb2hsv(sc);
    float d = abs(fract(h.x - rcSrc.x + 0.5) - 0.5);
    float k = (1.0 - smoothstep(0.06, 0.11, d)) * smoothstep(0.25, 0.4, h.y);
    float keep = max(1.0 - step(rcP.w, distance(vRcPos, rcP.xyz)), 1.0 - step(rcP2.w, distance(vRcPos, rcP2.xyz)));
    vec3 b1 = step(rcS0, vRcPos) * step(vRcPos, rcS1); float inS = b1.x * b1.y * b1.z; float mute = inS * k;
    k *= (1.0 - keep) * (1.0 - inS);
    vec3 n = rc_hsv2rgb(vec3(fract(h.x + rcDst.x - rcSrc.x), clamp(h.y * rcDst.y / rcSrc.y, 0.0, 1.0), clamp(h.z * rcDst.z / rcSrc.z, 0.0, 1.0)));
    vec3 grey = vec3(h.z * 0.62) * vec3(1.0, 0.86, 0.72);
    diffuseColor.rgb = pow(mix(mix(sc, n, k), grey, mute), vec3(2.2));
  }`)}`;
  };
  m.customProgramCacheKey = () => `rc-${color}`;
}

/** 자리 하나의 새 마법사. 모델이 오기 전에는 빈 몸통이고, 불러오면 채운다 */
export function buildMeshyWizard(color: string): Wizard {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  // 머리 · 눈은 따로 없다(연출 코드가 붙이는 자리만 맞춰 둔다)
  const head = new THREE.Group(); head.position.y = 1.55; body.add(head);
  const eyesOpen = new THREE.Group(), eyesShut = new THREE.Group(); eyesShut.visible = false; head.add(eyesOpen, eyesShut);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; shadow.name = 'shadow'; root.add(shadow);
  const above = new THREE.Group(); above.position.y = HEIGHT + 0.3; root.add(above);
  load().then(p => {
    const o = p.clone(true);
    const meshes: THREE.Mesh[] = []; o.traverse(x => { if ((x as THREE.Mesh).isMesh) meshes.push(x as THREE.Mesh); });
    meshes.forEach(m => {
      const src = m.material as THREE.MeshStandardMaterial;
      const t = new THREE.MeshToonMaterial({ map: src.map, normalMap: src.normalMap, color: '#ffffff', gradientMap: gradientMap() });
      recolor(t, color); m.material = t; addInk(m, 0.03);
    });
    body.add(o);
  });
  return { root, body, head, eyesOpen, eyesShut, above };
}
