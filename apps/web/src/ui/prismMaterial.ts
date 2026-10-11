/* 큐빅 프리즘 셰이더: 정육면체 안의 빛 경로를 직접 계산한다(텍스처를 칠하지 않는다).
   - 분산: 파장 7개마다 굴절률이 다르다(코시 공식). 들어갈 때·나올 때 스넬의 법칙으로 각각 꺾는다.
   - 전반사: 안에서 면에 닿을 때 임계각을 넘으면 반사되어 다시 안으로(최대 3번).
   - 흡수: 안을 지난 거리만큼 색이 든다(베르-람베르트).
   - 박막 간섭: 표면 반사에 각도에 따른 무지개빛.
   - 홈(젖빛)은 같은 계산에 흐린 반사 환경을 쓴다.
   모델은 한 변 1, 원점 중심 정육면체(모따기는 들어가는 면의 법선으로만 반영). */
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vPos;     // 물체 좌표
varying vec3 vNorm;    // 물체 좌표 법선
varying vec3 vCam;     // 물체 좌표 카메라 위치
void main() {
  vPos = position; vNorm = normal;
  vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform mat4 modelMatrix;
uniform samplerCube envMap;
uniform mat3 envRot;        // 조명 환경 회전(큐빅과 반대로 천천히 돈다)
uniform vec3 tint;          // 흡수 색(문양 색)
uniform float absorb;       // 흡수 세기
uniform float iorBase;      // 550nm 굴절률
uniform float dispersion;   // 분산 세기(코시 B)
uniform float frost;        // 젖빛(0 맑음 ~ 1 뿌연)
uniform float film;         // 박막 간섭 세기
uniform float exposure;
uniform float scatter;      // 유리 속에서 퍼지는 빛(산란) 세기
varying vec3 vPos; varying vec3 vNorm; varying vec3 vCam;

// 파장(nm) → 대략의 RGB (가시광 스펙트럼)
vec3 spectral(float l) {
  vec3 c;
  if (l < 440.0) c = vec3((440.0 - l) / 60.0, 0.0, 1.0);
  else if (l < 490.0) c = vec3(0.0, (l - 440.0) / 50.0, 1.0);
  else if (l < 510.0) c = vec3(0.0, 1.0, (510.0 - l) / 20.0);
  else if (l < 580.0) c = vec3((l - 510.0) / 70.0, 1.0, 0.0);
  else if (l < 645.0) c = vec3(1.0, (645.0 - l) / 65.0, 0.0);
  else c = vec3(1.0, 0.0, 0.0);
  float f = l < 420.0 ? 0.3 + 0.7 * (l - 380.0) / 40.0 : l > 680.0 ? 0.3 + 0.7 * (720.0 - l) / 40.0 : 1.0;
  return c * f;
}

vec3 env(vec3 dirObj, float lod) {
  vec3 d = normalize(envRot * (mat3(modelMatrix) * dirObj));
  return textureLod(envMap, d, lod).rgb;
}

// 안에서 정육면체 벽까지(벽 법선은 바깥 방향)
float exitBox(vec3 p, vec3 r, out vec3 n) {
  vec3 t = (sign(r) * 0.5 - p) / r;
  if (t.x < t.y && t.x < t.z) { n = vec3(sign(r.x), 0.0, 0.0); return t.x; }
  if (t.y < t.z) { n = vec3(0.0, sign(r.y), 0.0); return t.y; }
  n = vec3(0.0, 0.0, sign(r.z)); return t.z;
}

void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(vPos - vCam);           // 들어오는 빛(눈에서 표면으로)
  // 계단 현상 줄이기: 이웃 픽셀 사이 시선·법선 변화(화면 공간 미분)만큼 반사 환경을 흐리게 읽는다.
  // (밉맵을 굴절 광선에 적용하는 셈. 계단은 로고의 초과 샘플링이 대부분 잡으므로 약하게만)
  float foot = length(fwidth(V)) + length(fwidth(N));
  float lodAA = log2(1.0 + foot * 512.0);
  float lod = frost * 6.0 + lodAA;
  vec3 sum = vec3(0.0); vec3 wsum = vec3(0.0);
  for (int k = 0; k < 7; k++) {
    float lam = 400.0 + float(k) * 50.0;
    vec3 w = spectral(lam);
    float ior = iorBase + dispersion * (1.0 / (lam * lam) - 1.0 / (550.0 * 550.0)) * 1.0e5;
    vec3 r = refract(V, N, 1.0 / ior);
    vec3 p = vPos - N * 1e-4;
    float path = 0.0; vec3 col = vec3(0.0); bool out_ = false;
    for (int b = 0; b < 3; b++) {
      vec3 n; float t = exitBox(p, r, n);
      p += r * t; path += t;
      vec3 o = refract(r, -n, ior);
      if (dot(o, o) > 0.0) { col = env(o, lod); out_ = true; break; }   // 빠져나감
      r = reflect(r, -n); p -= n * 1e-4;                                 // 전반사
    }
    if (!out_) col = env(r, lod + 1.0) * 0.6;
    // 흡수: 지나간 거리만큼 문양 색으로
    vec3 att = exp(-(1.0 - tint) * absorb * path);
    // 산란: 안을 지난 거리만큼 문양 색 빛이 은은하게 퍼진다
    vec3 glow = tint * scatter * (1.0 - exp(-path * 1.6));
    sum += (col * att + glow) * w; wsum += w;
  }
  vec3 trans = sum / wsum;

  // 표면 반사(프레넬) + 박막 간섭
  float f0 = pow((iorBase - 1.0) / (iorBase + 1.0), 2.0);
  float cosi = clamp(dot(-V, N), 0.0, 1.0);
  float F = f0 + (1.0 - f0) * pow(1.0 - cosi, 5.0);
  vec3 refl = env(reflect(V, N), lod * 0.6);
  vec3 filmCol = vec3(0.0); vec3 fw = vec3(0.0);
  float cost = sqrt(max(0.0, 1.0 - (1.0 - cosi * cosi) / (1.33 * 1.33)));
  for (int k = 0; k < 7; k++) {
    float lam = 400.0 + float(k) * 50.0; vec3 w = spectral(lam);
    float phase = 4.0 * 3.14159 * 1.33 * 420.0 * cost / lam;
    filmCol += w * (0.5 + 0.5 * cos(phase)); fw += w;
  }
  filmCol = mix(vec3(1.0), filmCol / fw * 1.6, film);
  vec3 color = mix(trans, refl * filmCol, F);
  // 젖빛 홈은 조금 밝고 색이 든다
  color = mix(color, color * 0.7 + tint * 0.25 + 0.08, frost * 0.6);
  gl_FragColor = vec4(color * exposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function prismMaterial(o: { frost?: number; film?: number } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: {
      envMap: { value: null }, envRot: { value: new THREE.Matrix3() }, tint: { value: new THREE.Color('#2f5fc8') }, absorb: { value: 2.2 },
      iorBase: { value: 1.55 }, dispersion: { value: .9 }, frost: { value: o.frost ?? 0 }, film: { value: o.film ?? .5 }, exposure: { value: 1.6 }, scatter: { value: .08 },
    },
  });
}

/** 스튜디오 기울기(라디안): 피치(x축) · 롤(z축, 시선 축) */
export const STUDIO_PITCH = Math.PI / 4, STUDIO_ROLL = Math.PI / 4;

/** 반사·굴절에 쓸 스튜디오 장면: 어두운 공간에 밝은 조명판과 숨긴 문양 조명. 스튜디오 보기 화면에서도 쓴다 */
export function buildStudio(): { scene: THREE.Scene; dispose: () => void } {
  const scene = new THREE.Scene();
  // 위는 밝고 아래는 어두운 공간(큐빅이 돌 때 통과해 보이는 밝기가 계속 바뀐다)
  const sky = new THREE.SphereGeometry(40, 32, 16); const cols: number[] = []; const P = sky.getAttribute('position');
  const top = new THREE.Color('#4a5878'), mid = new THREE.Color('#141824'), bot = new THREE.Color('#040507');
  for (let i = 0; i < P.count; i++) { const y = P.getY(i) / 40; const c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y); cols.push(c.r, c.g, c.b); }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // 가장자리가 살짝 흐린 조명판(굴절로 크게 확대돼도 칼같이 끊기지 않게)
  const soft = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    g.filter = 'blur(6px)'; g.fillStyle = '#fff'; g.fillRect(12, 12, 104, 104);
    return new THREE.CanvasTexture(c);
  })();
  // 원형 소프트박스용: 가장자리가 부드러운 원판
  const softRound = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(128, 128, 96, 128, 128, 124); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const panel = (w: number, h: number, pos: [number, number, number], col: string, k: number, round = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), map: round ? softRound : soft, transparent: true, side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); scene.add(m);
  };
  // 조명은 사방에 고르게 둔다(스튜디오 전체가 돌기 때문에 한쪽에 몰리면 밝기가 들쭉날쭉하다).
  // 큐빅 높이의 가로 띠(약 ±15°)는 숨긴 문양 전용으로 비워 둔다.
  const deg = Math.PI / 180;
  const ring = (azDeg: number, elDeg: number, dist: number) => { const a = azDeg * deg, e = elDeg * deg; return [Math.cos(a) * Math.cos(e) * dist, Math.sin(e) * dist, Math.sin(a) * Math.cos(e) * dist] as [number, number, number]; };
  panel(5, 5, [0, 9, 0], '#ffffff', 6, true);           // 꼭대기 소프트박스(원형, 바닥과 같은 크기)
  // 위쪽 고리(+35°): 가로 조명 3개, 문양과 문양 사이
  panel(5, 1.4, ring(70, 35, 9), '#ffffff', 5);
  panel(5, 1.4, ring(190, 35, 9), '#ffe2a8', 4);
  panel(5, 1.4, ring(310, 35, 9), '#c9d8ff', 4);
  // 아래쪽 고리(−30°): 짧은 조명 3개, 위쪽과 60° 엇갈리게
  panel(1.2, 3.5, ring(10, -30, 9), '#ffffff', 4);
  panel(1.2, 3.5, ring(130, -30, 9), '#c9d8ff', 3);
  panel(1.2, 3.5, ring(250, -30, 9), '#ffe2a8', 3);
  panel(5, 5, [0, -9, 0], '#c9d8ff', 1.5, true);        // 바닥 소프트박스(원형, 약한 보조광)
  // 이스터에그: 문양 모양 조명 4개(♠♥♦♣). 조명 환경과 함께 돌다가 각도가 맞을 때만 면에 스치거나 큐빅 안에 무지개로 일그러져 지나간다
  // 문양 위치는 기울인 뒤(실제 화면 기준)의 방향으로 정한다: 방위각·높이(라디안)
  const untilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(STUDIO_PITCH, 0, STUDIO_ROLL)).invert();
  const suitPanel = (sym: string, az: number, el: number, size: number, k: number) => {
    // 문양은 또렷하게(테두리를 흐리지 않고 고해상도로)
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.font = "440px 'Segoe UI Symbol','DejaVu Sans','Noto Sans Symbols2',serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sym, 256, 280);
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffffff').multiplyScalar(k), transparent: true, side: THREE.DoubleSide }));
    m.position.set(Math.cos(az) * Math.cos(el) * 7, Math.sin(el) * 7, Math.sin(az) * Math.cos(el) * 7).applyQuaternion(untilt); m.lookAt(0, 0, 0); scene.add(m);
    disposeLater.push(tex);
  };
  const disposeLater: THREE.Texture[] = [];
  // 빈도 줄이기: 시선이 지나가는 띠(수평 ±20° 정도)의 가장자리에 둔다. 평소엔 큐빅 뒤를 비켜 가고,
  // 스튜디오가 흔들리는 폭과 큐빅 기울기가 맞을 때만 가끔 걸쳐 보인다. 밝기는 다른 조명과 비슷하게(×4)
  // 높이는 문양마다 계산해 맞췄다: 큐빅 정면 시선에 들어오는 시간이 각각 약 0.8%(합계 약 3%, 띠 가운데 둘 때의 절반)
  const D = Math.PI / 180;
  suitPanel('♠', .4, 18 * D, 2.4, 4); suitPanel('♥', 2.0, -26.5 * D, 2.4, 4); suitPanel('♦', 3.55, 18 * D, 2.4, 4); suitPanel('♣', 5.1, -27 * D, 2.4, 4);
  // 스튜디오 전체를 기울인다(피치 45° · 롤 45°): 조명 고리가 비스듬한 궤도가 되어, 돌 때 위·아래 조명도 큐빅 앞뒤를 오간다
  const tilt = new THREE.Group(); tilt.rotation.set(STUDIO_PITCH, 0, STUDIO_ROLL);
  [...scene.children].forEach(o => tilt.add(o)); scene.add(tilt);
  const dispose = () => {
    scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    disposeLater.forEach(t => t.dispose()); soft.dispose(); softRound.dispose();
  };
  return { scene, dispose };
}

/** 스튜디오를 한 번 찍어 정육면체 지도(반사 환경)로 만든다 */
export function studioCube(gl: THREE.WebGLRenderer): THREE.WebGLCubeRenderTarget {
  const { scene, dispose } = buildStudio();
  const rt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cam = new THREE.CubeCamera(.1, 100, rt); cam.update(gl, scene);
  dispose();
  return rt;
}

/** 캔버스(렌더러)마다 스튜디오 반사 환경은 한 번만 찍어 함께 쓴다 */
const envCache = new WeakMap<THREE.WebGLRenderer, THREE.WebGLCubeRenderTarget>();
export function studioEnv(gl: THREE.WebGLRenderer): THREE.Texture {
  let rt = envCache.get(gl);
  if (!rt) { rt = studioCube(gl); envCache.set(gl, rt); }
  return rt.texture;
}

/** 스튜디오 회전(큐빅과 반대로 천천히): 같은 캔버스의 모든 프리즘 물체가 같은 시계(초)를 쓴다 */
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
export function envRotation(angle: number, out: THREE.Matrix3): THREE.Matrix3 {
  _q.setFromEuler(_e.set(Math.sin(angle * .7) * .35, -angle, 0));
  return out.setFromMatrix4(_m.makeRotationFromQuaternion(_q));
}
