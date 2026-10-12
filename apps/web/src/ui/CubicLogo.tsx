/* 천천히 도는 큐빅(토큰 주사위) 로고.
   큐빅 디자인(GAME_NOTES.md): 여섯 면 가운데 마름모 홈 + 꼭짓점·모서리 홈, 마주보는 면 합 7.
   배치는 "꼭짓점 1 + 모서리 6" 계열(1788번)의 거울상 한 쌍 중 하나. 각 면의 눈 = 1 + 테두리 홈 수.
   모델: 뿌연 레진 몸체에 홈을 실제로 얕게 파고, 12개 모서리를 비스듬히 깎아(모따기) 반사광을 받게 한다. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { brandColor } from './brand';
import { type Quality, prefs, usePrefs } from '../prefs';
import { envRotation, prismMaterial, studioEnv } from './prismMaterial';

type V3 = [number, number, number];
type UV = [number, number];
const CORNER: V3 = [1, 1, 1];
const EDGES: V3[] = [[0, 1, 1], [0, 1, -1], [1, 0, 1], [1, 0, -1], [1, 1, 0], [1, -1, 0]];
const FACES: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// 크기 (주사위 한 변 = 1): 모서리 정사각형·마름모 한 변 0.23, 꼭짓점 삼각형 다리 0.188, 모서리 둥글기 3.5%
const SQ = 0.23, LEG = 0.188, HALF_DIAG = SQ / Math.SQRT2;
const DEPTH = 0.03;          // 홈 깊이
const CHAMFER = 0.06;        // 모서리를 깎는 폭

const touches = (p: V3, f: V3) => p.some((v, i) => v !== 0 && v === f[i]);

/** 한 면의 홈 삼각형들(면 좌표 u·v, -0.5~0.5) */
function faceTris(f: V3): UV[][] {
  const a = f.findIndex(v => v !== 0); const axes = [0, 1, 2].filter(i => i !== a);
  const tris: UV[][] = [];
  // 가운데 마름모(삼각형 둘)
  tris.push([[HALF_DIAG, 0], [0, HALF_DIAG], [-HALF_DIAG, 0]], [[-HALF_DIAG, 0], [0, -HALF_DIAG], [HALF_DIAG, 0]]);
  // 꼭짓점 홈: 직각이 꼭짓점에 오는 직각이등변삼각형
  if (touches(CORNER, f)) {
    const su = CORNER[axes[0]] * .5, sv = CORNER[axes[1]] * .5;
    tris.push([[su, sv], [su - Math.sign(su) * LEG, sv], [su, sv - Math.sign(sv) * LEG]]);
  }
  // 모서리 홈: 모서리 가운데를 빗변으로 하는 직각이등변삼각형 (접으면 정사각형)
  for (const e of EDGES) {
    if (!touches(e, f)) continue;
    const eu = e[axes[0]], ev = e[axes[1]];
    if (eu) { const u = eu * .5; tris.push([[u, -HALF_DIAG], [u, HALF_DIAG], [u - Math.sign(u) * HALF_DIAG, 0]]); }
    else { const v = ev * .5; tris.push([[-HALF_DIAG, v], [HALF_DIAG, v], [0, v - Math.sign(v) * HALF_DIAG]]); }
  }
  return tris;
}

/** 위치만 있는 삼각형 묶음에 법선·빈 UV를 붙인다 */
function finish(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(ng.getAttribute('position').count * 2).fill(0), 2));
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  return ng;
}

/** 면 위 삼각형을 면 안쪽으로 depth, 바깥으로 넉넉히 뻗은 삼각기둥(깎아 낼 모양). grow만큼 키운다 */
function prism(f: V3, tri: UV[], depth: number, grow = 0): THREE.BufferGeometry {
  const a = f.findIndex(v => v !== 0); const axes = [0, 1, 2].filter(i => i !== a);
  const cu = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cv = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
  const t = tri.map(([u, v]) => [cu + (u - cu) * (1 + grow), cv + (v - cv) * (1 + grow)] as UV);
  const pt = (u: number, v: number, h: number) => { const p: V3 = [0, 0, 0]; p[a] = f[a] * h; p[axes[0]] = u; p[axes[1]] = v; return new THREE.Vector3(...p); };
  const P = [...t.map(([u, v]) => pt(u, v, .5 - depth)), ...t.map(([u, v]) => pt(u, v, .5 + .2))];
  // 아랫면, 윗면, 옆면 3개
  const idx = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5];
  const pos: number[] = []; idx.forEach(i => pos.push(P[i].x, P[i].y, P[i].z));
  // 바깥을 보게 감기 (부피가 음수면 뒤집기)
  let vol = 0; const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) { A.fromArray(pos, i); B.fromArray(pos, i + 3); C.fromArray(pos, i + 6); vol += A.dot(B.clone().cross(C)); }
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let j = 0; j < 3; j++) { const x = pos[i + 3 + j]; pos[i + 3 + j] = pos[i + 6 + j]; pos[i + 6 + j] = x; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return finish(g);
}

/** 모서리를 깎은 정육면체: 각 면의 안쪽 사각형 꼭짓점 24개의 볼록 껍질.
    재질 묶음 0 = 넓은 면, 1 = 깎인 모서리·꼭짓점 */
function chamferedCube(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = []; const k = .5 - CHAMFER;
  for (let a = 0; a < 3; a++) for (const s of [-.5, .5]) for (const u of [-k, k]) for (const v of [-k, k]) {
    const p: V3 = [0, 0, 0]; const o = [0, 1, 2].filter(i => i !== a); p[a] = s; p[o[0]] = u; p[o[1]] = v; pts.push(new THREE.Vector3(...p));
  }
  const hull = new ConvexGeometry(pts).toNonIndexed(); const P = hull.getAttribute('position');
  const flat: number[] = [], bevel: number[] = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 3) {
    A.fromBufferAttribute(P, i); B.fromBufferAttribute(P, i + 1); C.fromBufferAttribute(P, i + 2);
    const n = B.clone().sub(A).cross(C.clone().sub(A)).normalize();
    const axis = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) > .999;
    (axis ? flat : bevel).push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...flat, ...bevel], 3));
  g.addGroup(0, flat.length / 3, 0); g.addGroup(flat.length / 3, bevel.length / 3, 1);
  return g;
}

/** 몸체: 모서리를 깎은 정육면체에 홈을 판다. 돌려주는 재질 배열은 결과의 재질 묶음 순서 */
function buildModel(faceMat: THREE.Material, bevelMat: THREE.Material, pocketMat: THREE.Material) {
  const ev = new Evaluator(); ev.useGroups = true; ev.attributes = ['position', 'normal', 'uv'];
  const base = chamferedCube(); const groups = base.groups.slice(); const fin = finish(base); if (!fin.groups.length) groups.forEach(gr => fin.addGroup(gr.start, gr.count, gr.materialIndex));
  let body = new Brush(fin, [faceMat, bevelMat]); body.updateMatrixWorld();
  for (const f of FACES) for (const tri of faceTris(f)) {
    const b = new Brush(prism(f, tri, DEPTH), pocketMat); b.updateMatrixWorld(); body = ev.evaluate(body, b, SUBTRACTION);
  }
  return { geometry: body.geometry, materials: body.material as THREE.Material[] };
}

const PALE = new THREE.Color('#ffffff');

/** 스튜디오 반사 환경(three.js 내장 RoomEnvironment, 인터넷에서 받지 않음) */
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

function Cube() {
  const ref = useRef<THREE.Group>(null);
  // 뿌연 레진: 반투명 + 안에서 은은하게 빛나는 느낌(굴절 없음). 뒷면은 그리지 않는다
  const bodyMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#2f5fc8', roughness: .75, metalness: 0, clearcoat: .15, clearcoatRoughness: .5, envMapIntensity: .12, emissive: '#2f5fc8', emissiveIntensity: .25, transparent: true, opacity: .6, depthWrite: false }), []);
  // 깎인 모서리: 반사광을 강하게 받는다
  const bevelMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#2f5fc8', roughness: .08, metalness: 0, clearcoat: 1, clearcoatRoughness: .04, flatShading: true, envMapIntensity: 3, emissive: '#2f5fc8', emissiveIntensity: .2, transparent: true, opacity: .8, depthWrite: false }), []);
  // 홈 바닥: 깎인 자리처럼 뿌옇게 밝다
  const pocketMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dfe6f5', roughness: .95, envMapIntensity: .3, transparent: true, opacity: .85, depthWrite: false }), []);
  // 뒤쪽 홈: 몸체 너머로 은은하게만 비친다
  const backMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .16, side: THREE.BackSide, depthWrite: false }), []);
  const hidden = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const model = useMemo(() => buildModel(bodyMat, bevelMat, pocketMat), [bodyMat, bevelMat, pocketMat]);
  const backMats = useMemo(() => model.materials.map(m => (m === pocketMat ? backMat : hidden)), [model, pocketMat, backMat, hidden]);
  useFrame((_, dt) => {
    const g = ref.current; if (!g) return;
    if (import.meta.env.DEV && (window as unknown as { __freezeLogo?: boolean }).__freezeLogo) return;
    // 움직임 줄이기: 회전과 조명 흐름을 4분의 1로
    const k = prefs().reduceMotion ? .25 : 1;
    g.rotation.y += dt * .35 * k; g.rotation.x += dt * .14 * k;
    // 색은 문양 4색을 천천히 돈다(탭 제목·화면 로고와 같은 시계)
    brandColor(bodyMat.color); bodyMat.emissive.copy(bodyMat.color); bevelMat.color.copy(bodyMat.color); bevelMat.emissive.copy(bodyMat.color);
    pocketMat.color.copy(bodyMat.color).lerp(PALE, .3); backMat.color.copy(pocketMat.color);
  });
  return (
    <group ref={ref} rotation={[.5, .6, 0]}>
      <mesh geometry={model.geometry} material={backMats} renderOrder={0} />
      <mesh geometry={model.geometry} material={model.materials} renderOrder={1} />
    </group>
  );
}

/* ---------- 프리즘 판: 큐빅 안의 빛 경로를 직접 계산하는 셰이더(prismMaterial.ts) ----------
   분산·전반사·흡수·박막 간섭. 실물 큐빅 규격(굴절 없음)과 달리 디지털 로고 표현만 바꾼 것. */
/** 스튜디오 회전 각도. 개발 중 __prismPose로 고정할 수 있다 */
const envAngle = { v: 0 };
function prismPose() {
  return import.meta.env.DEV ? (window as unknown as { __prismPose?: { rot: [number, number, number]; env: number } }).__prismPose : undefined;
}
const frozen = () => import.meta.env.DEV && !!(window as unknown as { __freezeLogo?: boolean }).__freezeLogo;

export function CubePrism({ envSpin = true }: { envSpin?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const glass = useMemo(() => prismMaterial({ film: .55 }), []);
  const bevel = useMemo(() => prismMaterial({ film: 1 }), []);
  const frost = useMemo(() => prismMaterial({ frost: .7, film: 0 }), []);
  const model = useMemo(() => buildModel(glass, bevel, frost), [glass, bevel, frost]);
  useEffect(() => { const env = studioEnv(gl); for (const m of [glass, bevel, frost]) m.uniforms.envMap.value = env; }, [gl, glass, bevel, frost]);
  if (import.meta.env.DEV) (window as unknown as { __prism: unknown }).__prism = { glass, bevel, frost };
  useFrame((_, dt) => {
    const g = ref.current; if (!g || frozen()) return;
    // 움직임 줄이기: 회전과 조명 흐름을 4분의 1로
    const k = prefs().reduceMotion ? .25 : 1;
    g.rotation.y += dt * .35 * k; g.rotation.x += dt * .14 * k;
    // 문양 색은 유리 속 빛깔(흡수)로 돈다
    for (const m of [glass, bevel, frost]) brandColor(m.uniforms.tint.value);
    // 조명 환경은 큐빅과 반대로 천천히 돌아, 빛줄기와 무지개가 큐빅 안을 흘러 지나간다
    if (envSpin) envAngle.v += dt * .25 * k;
    const pose = prismPose(); if (pose) { g.rotation.set(...pose.rot); envAngle.v = pose.env; }
    for (const m of [glass, bevel, frost]) envRotation(envAngle.v, m.uniforms.envRot.value as THREE.Matrix3);
  });
  return (
    <group ref={ref} rotation={[.5, .6, 0]}>
      <mesh geometry={model.geometry} material={model.materials} />
    </group>
  );
}

/** 초과 샘플링 배율(그래픽 품질별): 작은 로고라 화면 해상도보다 크게 그려 줄인다(최대 4배) */
const SS = { low: 1.5, mid: 2, high: 3 } as const;
const supersample = (q: Quality) => Math.min(4, (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) * SS[q]);

/** 로고 표현: prism(분산·전반사·박막 간섭, 기본) · resin(뿌연 레진). 비교용으로 주소의 ?logo=resin 을 따른다 */
const LOOK = new URLSearchParams(location.search).get('logo') === 'resin' ? 'resin' : 'prism';

/** 로고가 들어갈 자리. 실제 로고(LogoHost)는 앱에 하나만 있고, 이 자리를 따라간다 */
export function LogoSlot({ size = 72, label = 'Cubic³' }: { size?: number; label?: string }) {
  return <span className="cubiclogo" data-logo-slot role="img" aria-label={label} style={{ width: size, height: size }} />;
}

/** 앱 전체에 하나만 두는 로고. 화면이 바뀌어도 사라지지 않고, 화면의 LogoSlot 위치·크기로 미끄러져 간다.
    그래서 방을 만들거나 로비로 넘어가도 회전·색·반사 환경이 끊기지 않는다. 자리가 없으면 숨고 그리기도 멈춘다.
    size는 그리는 크기(가장 큰 자리 기준). 작은 자리에서는 줄여 보인다 */
export function LogoHost({ size = 120, look = LOOK }: { size?: number; look?: 'resin' | 'prism' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const quality = usePrefs(s => s.quality);
  useEffect(() => {
    let raf = 0, was = false, first = true;
    const loop = () => {
      const el = ref.current; const slot = document.querySelector<HTMLElement>('[data-logo-slot]');
      if (el) {
        if (slot) {
          const r = slot.getBoundingClientRect();
          // 처음 나타날 때는 바로 그 자리에, 그 뒤 자리가 옮겨지면 미끄러지게
          el.style.transition = first ? 'none' : 'transform .45s cubic-bezier(.2,.8,.2,1), opacity .25s';
          el.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / size})`;
          first = false;
        }
        // 자리가 사라지면(방에 들어가는 등) 서서히 지우지 않고 바로 숨긴다
        if (!!slot !== was) { was = !!slot; setShown(was); if (!was) el.style.transition = 'none'; el.style.opacity = was ? '1' : '0'; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [size]);
  const prism = look === 'prism';
  return (
    <div ref={ref} className="logohost" aria-hidden="true" style={{ width: size, height: size, opacity: 0 }}>
      <Canvas dpr={supersample(quality)} frameloop={shown ? 'always' : 'never'} gl={{ alpha: true, antialias: true }} camera={{ fov: 30, position: [0, 0, 3.4] }} style={{ width: size, height: size }}>
        <ambientLight intensity={prism ? .2 : .4} />
        <directionalLight position={[2, 3, 4]} intensity={prism ? 1.2 : .7} />
        <Studio />
        {prism ? <CubePrism /> : <Cube />}
      </Canvas>
    </div>
  );
}
