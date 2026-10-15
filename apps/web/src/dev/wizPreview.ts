/* 개발 전용: Meshy로 만든 마법사 모델 확인. 텍스처 그대로 · 텍스처 + 게임 효과(3단 명암·잉크 윤곽선) · 단색 + 게임 효과 · 지금 모델(크기 비교) */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildWizard } from '../arena/props';
import { INK_U, addInk, addInkSkinned, gradientMap, toon } from '../arena/toon';

/** 10K로 리메시 + UV 전개 + 텍스처(2026-10-15) */
const TEX = '/models/Meshy_AI_Crystal_Staff_Wizard_1014212149_texture.glb';
/** 지금 마법사 키(모자 끝까지)에 맞춘다 */
const HEIGHT = 2.3;
/** 개발용: ?s=0123 처럼 보일 칸만 고른다(문제 찾기용) */
const only = new URLSearchParams(location.search).get('s') ?? '0123';
const RIG = '/models/wizard_rigged.glb';


const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); gl.setPixelRatio(Math.min(2, devicePixelRatio)); document.body.appendChild(gl.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#3b3647');
scene.add(new THREE.HemisphereLight('#c9bfe0', '#1c1822', 0.9));
const sun = new THREE.DirectionalLight('#fff1d6', 1.6); sun.position.set(4, 8, 7); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), toon('#2a2430')); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
const row = new THREE.Group(); scene.add(row);
const names = ['텍스처 그대로', '텍스처 + 게임 효과', '단색 + 게임 효과', '지금 모델', '뼈대(Blender)'];


/** 바닥에 세우고 키를 맞춘다 */
function fit(o: THREE.Object3D): THREE.Group {
  const g = new THREE.Group(); g.add(o);
  const box = new THREE.Box3().setFromObject(o); const s = HEIGHT / (box.max.y - box.min.y);
  o.scale.setScalar(s); o.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
  return g;
}
// 고른 칸만 가운데 기준으로 나란히
const shown = [0, 1, 2, 3, 4].filter(k => only.includes(String(k)));
const slots: THREE.Group[] = [0, 1, 2, 3, 4].map(k => { const g = new THREE.Group(); g.position.x = (shown.indexOf(k) - (shown.length - 1) / 2) * 2.0; row.add(g); return g; });
if (only.includes('3')) slots[3].add(buildWizard('#2f5fc8').root);

/** 메시만 먼저 모은다(돌면서 잉크 껍데기를 붙이면 그 껍데기까지 다시 돌아 끝없이 붙는다) */
function meshes(root: THREE.Object3D): THREE.Mesh[] { const out: THREE.Mesh[] = []; root.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; }
document.getElementById('lbl')!.innerHTML = shown.map(k => `<span>${names[k]}</span>`).join('');
/* ---- 로브 색 바꾸기(마스크 없이): 텍스처에서 파란 부분(모자·망토·수정)만 골라 색상·채도·밝기를 목표 색으로 옮긴다 ---- */
const SRC = '#2f5fc8';
const hsv = (hex: string) => { const c = new THREE.Color(hex); const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); return new THREE.Vector3(h.h, mx ? (mx - mn) / mx : 0, mx); };
/** 바꾸지 않을 곳: 오른쪽 허리의 파란 포션(모델 좌표 상자) */
/** 예외 상자(모델 좌표, 최소·최대 짝): 1번째 짝(2·3) = 왼쪽 파우치 아래 푸르스름한 그늘(무채색 그늘로). 0번째 짝은 안 쓴다(포션은 구로) */
const KEEP = [[0.14, -0.35, 0.16], [0.3, -0.15, 0.32], [-0.22, -0.44, 0.14], [-0.06, -0.28, 0.3]].map(v => new THREE.Vector3(...v));
/** 포션은 둥글어서 구로 뺀다(중심 · 반지름): 액체 중심에서 위쪽 유리까지 덮게 */
const POTION = new THREE.Vector4(0.19, -0.255, 0.165, 0.1);
/** 왼쪽 허리의 빨간 포션: 위쪽 유리가 푸르스름하다. 바로 뒤가 망토라 작게 */
const POTION2 = new THREE.Vector4(-0.238, -0.235, 0.125, 0.065);
const RC = { keep: { value: KEEP }, potion: { value: POTION }, potion2: { value: POTION2 }, src: { value: hsv(SRC) }, dst: { value: hsv(SRC) }, on: { value: 0 } };
function recolorable<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = sh => {
    sh.uniforms.rcSrc = RC.src; sh.uniforms.rcDst = RC.dst; sh.uniforms.rcOn = RC.on; sh.uniforms.rcKeep = RC.keep; sh.uniforms.rcPotion = RC.potion; sh.uniforms.rcPotion2 = RC.potion2;
    // 모델 좌표를 넘겨 '바꾸지 않을 곳'(포션)을 상자로 뺀다
    sh.vertexShader = `varying vec3 vRcPos;
${sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vRcPos = position;`)}`;
    sh.fragmentShader = `uniform vec3 rcSrc; uniform vec3 rcDst; uniform float rcOn; uniform vec3 rcKeep[4]; uniform vec4 rcPotion; uniform vec4 rcPotion2; varying vec3 vRcPos;
vec3 rc_rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
vec3 rc_hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    if (rcOn > 0.5) {
      vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
      vec3 h = rc_rgb2hsv(sc);
      float d = abs(fract(h.x - rcSrc.x + 0.5) - 0.5);
      float k = (1.0 - smoothstep(0.06, 0.11, d)) * smoothstep(0.25, 0.4, h.y);
      // 포션(구): 원래 색 그대로 / 상자 1(파우치 아래 그늘): 망토 색 대신 갈색빛 무채색 그늘로
      float keep = max(1.0 - step(rcPotion.w, distance(vRcPos, rcPotion.xyz)), 1.0 - step(rcPotion2.w, distance(vRcPos, rcPotion2.xyz)));
      vec3 b1 = step(rcKeep[2], vRcPos) * step(vRcPos, rcKeep[3]); float mute = b1.x * b1.y * b1.z * k;
      k *= (1.0 - keep) * (1.0 - b1.x * b1.y * b1.z);
      vec3 n = rc_hsv2rgb(vec3(fract(h.x + rcDst.x - rcSrc.x), clamp(h.y * rcDst.y / rcSrc.y, 0.0, 1.0), clamp(h.z * rcDst.z / rcSrc.z, 0.0, 1.0)));
      vec3 grey = vec3(h.z * 0.62) * vec3(1.0, 0.86, 0.72);
      diffuseColor.rgb = pow(mix(mix(sc, n, k), grey, mute), vec3(2.2));
    }`);
  };
  return m;
}
const loader = new GLTFLoader();
if (only.includes('0') || only.includes('1')) loader.load(TEX, gltf => {
  if (only.includes('0')) slots[0].add(fit(gltf.scene));
  if (!only.includes('1')) return;
  // 같은 모델을 한 번 더: 텍스처 색을 3단 명암 재료로 + 잉크 윤곽선
  loader.load(TEX, g2 => {
    meshes(g2.scene).forEach(m => {
      const src = m.material as THREE.MeshStandardMaterial;
      m.material = recolorable(new THREE.MeshToonMaterial({ map: src.map, normalMap: src.normalMap, color: '#ffffff', gradientMap: gradientMap() }));
      addInk(m, 0.03);
    });
    slots[1].add(fit(g2.scene));
  });
});
// 텍스처 없이 단색(같은 10K 모델)
if (only.includes('2')) loader.load(TEX, gltf => {
  meshes(gltf.scene).forEach(m => {
    m.material = toon('#b9b0c8'); if (!only.includes('x')) addInk(m, 0.03);
  });
  slots[2].add(fit(gltf.scene));
});

// 뼈대 모델: 지팡이는 오른손 뼈에 붙어 있다. 자세 = 뼈를 캐릭터 기준 축으로 돌린다
const skins: THREE.SkinnedMesh[] = []; let showW = false;
const bones = new Map<string, THREE.Bone>(); const rest = new Map<string, THREE.Quaternion>();
if (only.includes('4')) loader.load(RIG, gltf => {
  const ms: THREE.Mesh[] = []; gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) ms.push(o as THREE.Mesh); if ((o as THREE.Bone).isBone) { bones.set(o.name, o as THREE.Bone); rest.set(o.name, o.quaternion.clone()); } });
  ms.forEach(m => {
    const src = m.material as THREE.MeshStandardMaterial;
    m.material = new THREE.MeshToonMaterial({ map: src.map, normalMap: src.normalMap, color: '#ffffff', gradientMap: gradientMap() });
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) addInkSkinned(m as THREE.SkinnedMesh, 0.03); else addInk(m, 0.03);
    m.frustumCulled = false;
  });
  // 가중치 보기용 색(뼈 이름 순서: 오른팔 = 빨강, 왼팔 = 초록, 머리·목 = 파랑, 나머지 = 회색)
  ms.forEach(m => {
    const sk = m as THREE.SkinnedMesh; if (!sk.isSkinnedMesh) return;
    const names = sk.skeleton.bones.map(b => b.name); const si = sk.geometry.getAttribute('skinIndex'), sw = sk.geometry.getAttribute('skinWeight');
    const cols = new Float32Array(si.count * 3);
    for (let i = 0; i < si.count; i++) {
      let r = 0.25, g = 0.25, b = 0.25;
      for (let q = 0; q < 4; q++) { const n = names[si.getComponent(i, q)] ?? '', w = sw.getComponent(i, q); if (/R$/.test(n) && /arm|hand|shoulder/.test(n)) r += w; else if (/L$/.test(n) && /arm|hand|shoulder/.test(n)) g += w; else if (/head|neck/.test(n)) b += w; }
      cols[i * 3] = Math.min(1, r); cols[i * 3 + 1] = Math.min(1, g); cols[i * 3 + 2] = Math.min(1, b);
    }
    sk.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    sk.userData.toonMat = sk.material; sk.userData.wMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    skins.push(sk);
  });
  slots[4].add(fit(gltf.scene));
  (window as unknown as { __bones: string[] }).__bones = [...bones.keys()];
});
/** 뼈를 캐릭터 기준 축 둘레로 돌린 자세(쉼 자세 기준) */
function turn(name: string, axis: THREE.Vector3, ang: number): void {
  // 불러올 때 이름의 '.'은 빠진다(upper_arm.R → upper_armR)
  name = name.replace(/\./g, ''); const b = bones.get(name); if (!b || !b.parent) return;
  b.quaternion.copy(rest.get(name)!); b.updateWorldMatrix(true, false);
  const pw = b.parent.getWorldQuaternion(new THREE.Quaternion()), bw = pw.clone().multiply(b.quaternion);
  // 축은 캐릭터 기준(모델이 돌아가도 같은 방향으로 들게): 모델 칸의 회전을 축에 입힌다
  const ax = axis.clone().applyQuaternion(slots[4].getWorldQuaternion(new THREE.Quaternion()));
  const nw = new THREE.Quaternion().setFromAxisAngle(ax, ang).multiply(bw);
  b.quaternion.copy(pw.invert().multiply(nw));
}
/** 부모 뼈가 이미 돌아간 뒤에, 지금 자세에 더해 캐릭터 기준 축으로 더 돌린다(손목 되돌리기용) */
function turnAfter(name: string, axis: THREE.Vector3, ang: number): void {
  name = name.replace(/\./g, ''); const b = bones.get(name); if (!b || !b.parent) return;
  b.updateWorldMatrix(true, false);
  const pw = b.parent.getWorldQuaternion(new THREE.Quaternion()), bw = pw.clone().multiply(b.quaternion);
  const ax = axis.clone().applyQuaternion(slots[4].getWorldQuaternion(new THREE.Quaternion()));
  const nw = new THREE.Quaternion().setFromAxisAngle(ax, ang).multiply(bw);
  b.quaternion.copy(pw.invert().multiply(nw));
}
let pose = 'rest';
function applyPose(t: number): void {
  if (!bones.size) return;
  for (const [n, q] of rest) bones.get(n)!.quaternion.copy(q);
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  const k = 0.5 - 0.5 * Math.cos(Math.min(1, (t % 3) / 1.2) * Math.PI);
  // 손목은 팔과 반대로 돌려 지팡이를 세운 채 든다(손 뼈는 팔에 딸려 있으니 팔 각도만큼 되돌린다)
  if (pose === 'staff') { turn('upper_arm.R', X, -1.3 * k); turnAfter('hand.R', X, 1.3 * k); }
  if (pose === 'chant') { turn('upper_arm.R', Z, -2.2 * k); turn('upper_arm.L', Z, 2.2 * k); turnAfter('hand.R', Z, 2.2 * k); }
  if (pose === 'nod') { turn('neck', X, 0.35 * k); turn('head', X, 0.25 * k); }
  if (pose === 'sway') { turn('spine', Z, Math.sin(t * 2) * 0.15); turn('head', Z, Math.sin(t * 2 + 1) * 0.12); }
}
let spin = true, yaw = 0;
const bar = document.getElementById('bar')!;
const btn = (t: string, f: () => void) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { f(); paint(); }; bar.appendChild(b); return b; };
const spinBtn = btn('돌리기', () => { spin = !spin; });
btn('앞', () => { spin = false; yaw = 0; }); btn('옆', () => { spin = false; yaw = Math.PI / 2; }); btn('뒤', () => { spin = false; yaw = Math.PI; }); btn('비스듬히', () => { spin = false; yaw = Math.PI / 5; });
const COLS: [string, string][] = [['원래', ''], ['파랑', '#2f5fc8'], ['빨강', '#d3302f'], ['노랑', '#e0b100'], ['초록', '#2e9450'], ['보라', '#8a5cc8']];
let col = '';
const colBtns = COLS.map(([t, c]) => btn(t, () => { col = c; RC.on.value = c ? 1 : 0; if (c) RC.dst.value.copy(hsv(c)); }));
// 사용자가 고른 주름 선 설정(2026-10-15): 주름 선 켬 · 선 굵기 0.8 · 민감도 1 · 잔주름 켬 · 색 경계 켬
const POSES: [string, string][] = [['rest', '쉼'], ['staff', '지팡이 들기'], ['chant', '두 팔 주문'], ['nod', '고개 숙이기'], ['sway', '흔들기']];
let poseT = 0;
const poseBtns = POSES.map(([k, t]) => btn(t, () => { pose = k; poseT = 0; }));
const wBtn = btn('가중치 보기', () => { showW = !showW; skins.forEach(sk => { sk.material = showW ? sk.userData.wMat : sk.userData.toonMat; }); });
let crease = true, fine = true, thick = 0.8, sens = 1.0, edgeCol = true;
const creaseBtn = btn('주름 선', () => { crease = !crease; });
const fineBtn = btn('잔주름', () => { fine = !fine; });
const colEdgeBtn = btn('색 경계', () => { edgeCol = !edgeCol; });
// 차이 보기: 주름 선을 켠 채 잔주름·색 경계를 네 가지로 바꿔 그려 얼굴~허리를 크게 잘라 나란히 띄운다(누르면 닫힘)
btn('차이 보기', () => {
  const was = [crease, fine, edgeCol]; crease = true;
  const states: [boolean, boolean, string][] = [[false, false, '둘 다 끔'], [true, false, '잔주름만'], [false, true, '색 경계만'], [true, true, '둘 다']];
  const W = gl.domElement.width, H = gl.domElement.height;
  // 잘라 낼 곳: 모델 머리~허리(화면에서 모델 둘레를 찾아 위쪽 60%)
  const box = new THREE.Box3().setFromObject(row); const pts = [new THREE.Vector3(box.min.x, box.min.y, 0), new THREE.Vector3(box.max.x, box.max.y, 0)].map(v => v.project(cam));
  const x0 = Math.max(0, (Math.min(pts[0].x, pts[1].x) + 1) / 2 * W), x1 = Math.min(W, (Math.max(pts[0].x, pts[1].x) + 1) / 2 * W);
  const yTop = (1 - (Math.max(pts[0].y, pts[1].y) + 1) / 2) * H, yBot = (1 - (Math.min(pts[0].y, pts[1].y) + 1) / 2) * H;
  const cw = x1 - x0, ch = (yBot - yTop) * 0.62;
  const out = document.createElement('canvas'); out.width = Math.round(cw * 2); out.height = Math.round(ch * 2 + 60); const g = out.getContext('2d')!;
  g.fillStyle = '#3b3647'; g.fillRect(0, 0, out.width, out.height);
  states.forEach(([f, c, name], k) => {
    fine = f; edgeCol = c; renderCrease();
    const ox = (k % 2) * cw, oy = Math.floor(k / 2) * (ch + 30);
    g.drawImage(gl.domElement, x0, yTop, cw, ch, ox, oy + 30, cw, ch);
    g.fillStyle = '#ffd98a'; g.font = "28px 'Black Han Sans', sans-serif"; g.fillText(name, ox + 12, oy + 26);
  });
  [crease, fine, edgeCol] = was;
  const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;z-index:9;background:rgba(20,16,26,.92);display:flex;align-items:center;justify-content:center;cursor:pointer';
  out.style.cssText = 'max-width:96vw;max-height:92vh'; ov.appendChild(out); ov.onclick = () => ov.remove(); document.body.appendChild(ov);
});
const slider = (t: string, min: number, max: number, v: number, f: (x: number) => void) => { const l = document.createElement('label'); l.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:14px'; l.textContent = t; const i = document.createElement('input'); i.type = 'range'; i.min = String(min); i.max = String(max); i.step = '0.1'; i.value = String(v); i.oninput = () => f(+i.value); l.appendChild(i); bar.appendChild(l); };
slider('선 굵기', 0.8, 3.5, thick, x => { thick = x; }); slider('민감도', 0, 1, sens, x => { sens = x; });
function paint(): void { spinBtn.classList.toggle('on', spin); colBtns.forEach((b, k) => b.classList.toggle('on', COLS[k][1] === col)); creaseBtn.classList.toggle('on', crease); poseBtns.forEach((b, k) => b.classList.toggle('on', POSES[k][0] === pose)); wBtn.classList.toggle('on', showW); fineBtn.classList.toggle('on', fine); colEdgeBtn.classList.toggle('on', edgeCol); }

/* ---- 안쪽 주름 선(화면 효과): 표면 방향(노멀)이 급하게 꺾이는 곳과 앞뒤 거리가 끊기는 곳에 잉크 선 ---- */
const rtColor = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
const rtNormal = new THREE.WebGLRenderTarget(1, 1); rtNormal.depthTexture = new THREE.DepthTexture(1, 1);
const normalMat = new THREE.MeshNormalMaterial();
/** 잔주름: 노멀 맵이 있는 메시는 그 노멀 맵까지 넣어 그린다(수염 결·옷 주름이 선으로) */
const nmCache = new WeakMap<THREE.Material, THREE.MeshNormalMaterial>();
const creaseQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 200 }, px: { value: 1.5 }, lo: { value: 0.12 }, ce: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tColor, tNormal, tDepth; uniform vec2 res; uniform float near, far, px, lo, ce; varying vec2 vUv;
    float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
    void main(){
      vec4 c = texture2D(tColor, vUv);
      vec3 n0 = texture2D(tNormal, vUv).xyz * 2.0 - 1.0; float d0 = lin(texture2D(tDepth, vUv).x);
      float en = 0.0, ed = 0.0, ec = 0.0; float l0 = dot(c.rgb, vec3(0.3, 0.59, 0.11));
      for (int i = 0; i < 8; i++) {
        vec2 o = (i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : i == 3 ? vec2(0.0, -1.0) : i == 4 ? vec2(0.7, 0.7) : i == 5 ? vec2(-0.7, 0.7) : i == 6 ? vec2(0.7, -0.7) : vec2(-0.7, -0.7)) * px / res;
        vec3 n1 = texture2D(tNormal, vUv + o).xyz * 2.0 - 1.0; float d1 = lin(texture2D(tDepth, vUv + o).x);
        en = max(en, 1.0 - dot(n0, n1)); ed = max(ed, abs(d1 - d0) / d0);
        float l1 = dot(texture2D(tColor, vUv + o).rgb, vec3(0.3, 0.59, 0.11)); ec = max(ec, (l0 - l1) / max(l0, 0.05));
      }
      // 색 경계: 이웃보다 어두운 쪽에만(선이 한 줄로) — 텍스처에 칠해진 수염 결·주름 그늘
      float e = max(max(smoothstep(lo, lo + 0.16, en), smoothstep(0.015, 0.03, ed)), ce * smoothstep(0.08 + lo * 0.4, 0.2 + lo * 0.4, -ec));
      gl_FragColor = vec4(mix(c.rgb, vec3(0.006, 0.004, 0.003), e), 1.0);
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false,
}));
const quadScene = new THREE.Scene(); quadScene.add(creaseQuad); const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function renderCrease(): void {
  const w = gl.domElement.width, h = gl.domElement.height;
  if (rtColor.width !== w || rtColor.height !== h) { rtColor.setSize(w, h); rtNormal.setSize(w, h); }
  gl.setRenderTarget(rtColor); gl.render(scene, cam);
  // 노멀 그리기: 잉크 껍데기는 빼고, 배경은 카메라를 보는 노멀로
  const inks: THREE.Object3D[] = []; scene.traverse(o => { if (o.name === 'ink' && o.visible) inks.push(o); }); inks.forEach(o => o.visible = false);
  const bg = scene.background; scene.background = new THREE.Color(0.5, 0.5, 1.0);
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  scene.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || !m.visible || o.name === 'ink') return;
    const src = m.material as THREE.Material & { normalMap?: THREE.Texture | null };
    let nm = normalMat; if (fine && src.normalMap) { nm = nmCache.get(src) ?? new THREE.MeshNormalMaterial({ normalMap: src.normalMap }); nmCache.set(src, nm); }
    swapped.push([m, m.material]); m.material = nm; });
  gl.setRenderTarget(rtNormal); gl.render(scene, cam);
  swapped.forEach(([m, mt]) => { m.material = mt; }); scene.background = bg; inks.forEach(o => o.visible = true);
  const u = (creaseQuad.material as THREE.ShaderMaterial).uniforms;
  u.tColor.value = rtColor.texture; u.tNormal.value = rtNormal.texture; u.tDepth.value = rtNormal.depthTexture; u.res.value.set(w, h); u.near.value = cam.near; u.far.value = cam.far; u.px.value = thick * gl.getPixelRatio(); u.lo.value = 0.4 - sens * 0.34; u.ce.value = edgeCol ? 1 : 0;
  gl.setRenderTarget(null); gl.render(quadScene, quadCam);
}
paint();

function resize(): void { gl.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (spin) yaw += dt * 0.6;
  poseT += dt; applyPose(poseT);
  slots.forEach(s => { s.rotation.y = yaw; });
  const half = shown.length * 1.0 + 0.2, th = Math.tan(THREE.MathUtils.degToRad(15));
  const d = Math.max(1.5 / th, half / (th * cam.aspect));
  cam.position.set(0, 1.3 + d * 0.06, d); cam.lookAt(0, 1.15, 0);
  INK_U.res.value.set(gl.domElement.width, gl.domElement.height); INK_U.px.value = 2.5 * gl.getPixelRatio();
  if (crease) renderCrease(); else gl.render(scene, cam);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
