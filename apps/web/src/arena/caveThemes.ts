/* 동굴 탐험 아레나의 장소(사용자 2026-10-14): 판마다 다른 장소, 순서 고정 — 1판 동굴 → 2판 가시 함정 미궁 → 3판 안개 숲.
   규칙은 같고, 1이 쌓이는 위험만 장소에 맞게 보여 준다(동굴 = 천장이 내려앉음, 미궁 = 바닥 가시가 솟음, 안개 숲 = 안개가 짙어짐).
   장소마다 얻는 재료는 보기만 다르다(크리스탈 · 고대 금화 · 빛나는 약초). */
import * as THREE from 'three';
import { canvasTex, clamp01, ease, gradientMap } from './toon';
import { rng, rockGeo, rockMat } from './caveParts';
import { magicTex, softTex } from './props';

export type ThemeKey = 'cave' | 'maze' | 'fog';
export const THEMES: { key: ThemeKey; name: string; mat: string; bg: string; sky: string; ground: string }[] = [
  { key: 'cave', name: '크리스탈 동굴', mat: '크리스탈', bg: '#b98a5c', sky: '#e2bd8e', ground: '#24160c' },
  { key: 'maze', name: '고대 미궁', mat: '고대 금화', bg: '#8d8170', sky: '#e6d7b8', ground: '#2a2218' },
  { key: 'fog', name: '안개 숲', mat: '파란 빛 버섯', bg: '#a7b4a2', sky: '#d9e4d2', ground: '#1e2619' },
];
export const themeOf = (pan: number) => THEMES[Math.max(0, Math.min(2, pan - 1))];

/** 장소마다 바뀌는 것: 무대·근경·막힌 것(깨뜨려 재료를 캔다)·날아가는 재료·위험 표현 */
export interface Hazard {
  /** 빼 둔 1 단계(0~3) */
  set(stage: number, t: number): void;
  frame(t: number, dt: number): void;
  reset(): void;
  /** 무너짐(3단계) 연출 시각 s(공개 기준 초) */
  collapse?(s: number): void;
}
export interface ThemeParts {
  block: THREE.Group; blockLight: THREE.PointLight; gems: THREE.Object3D[]; hazard: Hazard;
  /** 나아가는 마법(사용자 2026-10-15: 벽을 깨는 대신 — 미궁 = 함정 해제): b = 마법 시작 뒤 초(-1 = 아님, 원래대로) */
  advance?: (b: number, t: number, cam: THREE.Vector3) => void;
  /** 다음 방에서 채집(동굴 = 크리스탈 군집, 미궁 = 보물 상자): 방 상태와 무리 자리(재료가 날아갈 곳) */
  room?: (st: RoomState, t: number, cam: THREE.Vector3, party: THREE.Vector3[]) => void;
}
/** 방 채집 상태: 없음(첫 방) · 아직 그대로 · 채집 중(시작 뒤 초) · 채집 끝 */
export type RoomState = 'hidden' | 'idle' | 'done' | number;
/** 채집 연출 길이(초) */
export const GATHER_T = 1.5;
/** 재료가 날아가는 길: from에서 무리 쪽으로 튀어 올랐다가 작아지며 */
export function flyTo(o: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, u: number, s0: number): void {
  const e = ease(u); o.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e + Math.sin(u * Math.PI) * 1.2, from.z + (to.z - from.z) * e);
  o.rotation.set(u * 5, u * 4, 0); o.scale.setScalar(Math.max(0.001, s0 * (1 - u * 0.6)));
}

/** 3단 명암 툰 재료(빛나는 것은 emissive). metalness·roughness 같은 값은 툰에선 쓰지 않는다 */
const mat = (c: string, o: { emissive?: string; emissiveIntensity?: number; metalness?: number; roughness?: number } = {}) => {
  const m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap() }); (m as unknown as { flatShading: boolean }).flatShading = true; m.userData.rock = true;
  if (o.emissive) { m.emissive.set(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  return m;
};

/* ================= 가시 함정 미궁 ================= */
export function buildMaze(root: THREE.Group, fg: THREE.Group, CX: number, ROCK_X: number, CEIL: number): ThemeParts {
  const r = rng(31);
  const stone = ['#9a8a6c', '#857659', '#a8987a', '#76684f'];
  // 바닥: 낡은 돌 타일
  const floor = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 22), mat('#6f6249')); floor.position.set(1, -0.5, -5); floor.userData.noInk = true; root.add(floor);
  for (let x = -9; x <= 10; x += 1.0) for (let z = -7; z <= 2.5; z += 1.0) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.94), rockMat(stone[(Math.abs(x * 3 + z * 7) | 0) % 4]));
    t.position.set(x + (r() - 0.5) * 0.04, 0.0 + (r() - 0.5) * 0.04, z); t.rotation.y = (r() - 0.5) * 0.05; root.add(t);
  }
  // 뒷벽: 쌓인 돌 블록, 군데군데 빠진 자리 + 기둥
  for (let row = 0; row < 7; row++) for (let x = -13; x <= 13; x += 1.3) {
    if (r() < 0.06) continue;
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.66, 0.8), rockMat(stone[(row + Math.round(x)) & 3])); b.position.set(x + (row % 2) * 0.65, 0.33 + row * 0.68, -3.6 + (r() - 0.5) * 0.08); root.add(b);
  }
  for (const x of [-6.5, -1.9, 2.8, 7.5]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.8, 0.9), rockMat('#a39275')); p.position.set(x, 2.4, -3.0); root.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), rockMat('#8a7b5f')); cap.position.set(x, 4.7, -3.0); root.add(cap);
    // 횃불
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), new THREE.MeshBasicMaterial({ color: '#ffb347' })); fl.position.set(x, 2.9, -2.45); root.add(fl);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.35, 6), rockMat('#4a3a26')); br.position.set(x, 2.65, -2.5); root.add(br);
  }
  const torch1 = new THREE.PointLight('#ffb35a', 14, 9, 1.4); torch1.position.set(-1.9, 3.0, -2.2); root.add(torch1);
  const torch2 = new THREE.PointLight('#ffb35a', 14, 9, 1.4); torch2.position.set(2.8, 3.0, -2.2); root.add(torch2);
  // 먼 복도(안개에 묻힌다)
  for (let k = 0; k < 10; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2 + r() * 2, 3 + r() * 3, 1.5), rockMat(stone[k & 3])); b.position.set(-12 + k * 2.7, 1.8, -12 - r() * 4); root.add(b); }
  // 천장 들보
  for (let x = -10; x <= 10; x += 2.2) { const bm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 9), rockMat('#6b5d45')); bm.position.set(x, CEIL + 0.5, -1.5); root.add(bm); }
  const slab = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 14), rockMat('#5c5039')); slab.position.set(0, CEIL + 0.95, -3); slab.userData.noInk = true; root.add(slab);
  // 근경: 부서진 기둥 조각
  const fgB = (x: number, y: number, sx: number, sy: number, rz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 1), rockMat('#3a3125')); m.position.set(x, y, 0); m.rotation.z = rz; fg.add(m); };
  fgB(-4.9, -0.6, 1.6, 3.4, 0.08); fgB(5.0, -1.6, 2.0, 1.6, -0.15); fgB(0.8, -2.6, 3.0, 0.8, 0.04);
  // 다음 방의 보물 상자(사용자 2026-10-15): 마법 없이 그냥 열린다 → 뚜껑이 열리며 금화가 튀어나온다(마법진은 함정 해제에서만)
  const chest = new THREE.Group(); chest.position.set(CX + 2.75, 0, 0.55); chest.rotation.y = -0.35; chest.visible = false; root.add(chest); const block = chest;
  const wood = mat('#7a4a26'), band = mat('#d9a93a', { emissive: '#5a3a08', emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.62, 0.82), wood); body.position.y = 0.31; block.add(body);
  for (const x of [-0.45, 0.45]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.64, 0.86), band); b.position.set(x, 0.31, 0); block.add(b); }
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.62, -0.41); lidPivot.name = 'lid'; block.add(lidPivot);
  const lidG = new THREE.CylinderGeometry(0.41, 0.41, 1.3, 10, 1, false, 0, Math.PI); lidG.rotateZ(Math.PI / 2); lidG.rotateX(Math.PI / 2);
  const lid = new THREE.Mesh(lidG, wood); lid.position.set(0, 0, 0.41); lidPivot.add(lid);
  const bandG = new THREE.CylinderGeometry(0.43, 0.43, 0.12, 10, 1, false, 0, Math.PI); bandG.rotateZ(Math.PI / 2); bandG.rotateX(Math.PI / 2);
  for (const x of [-0.45, 0.45]) { const b = new THREE.Mesh(bandG, band); b.position.set(x, 0, 0.41); lidPivot.add(b); }
  // 자물쇠(장식)
  const lock = new THREE.Group(); lock.position.set(0, 0.5, 0.43); lock.name = 'lock'; block.add(lock);
  lock.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.06), band));
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), mat('#1a1208')); hole.rotation.x = Math.PI / 2; hole.position.set(0, 0.03, 0.02); lock.add(hole);
  // 안쪽 금빛(뚜껑이 열리면 보인다)
  const inner = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.66), mat('#f2c24f', { emissive: '#c98a1a', emissiveIntensity: 1.1 })); inner.position.y = 0.58; block.add(inner);
  const blockLight = new THREE.PointLight('#ffd27a', 0, 4.5, 1.5); blockLight.position.set(0, 1.1, 0.3); block.add(blockLight);
  // 열릴 때 빛
  const shine = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: softTex(), color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); shine.position.set(0, 1.0, 0.2); block.add(shine);
  const act = (b: number, t: number, cam: THREE.Vector3) => {
    const on = b >= 0;
    void t;
    // 뚜껑이 열리며(0.2~0.55) 금빛
    const open = on ? ease(clamp01((b - 0.2) / 0.35)) : 0;
    lidPivot.rotation.x = -open * 1.85;
    blockLight.intensity = open * 14;
    (shine.material as THREE.MeshBasicMaterial).opacity = open * (on ? 0.8 - clamp01((b - 0.7) / 0.6) * 0.5 : 0); shine.lookAt(cam);
  };

  const gems: THREE.Object3D[] = []; for (let k = 0; k < 3; k++) { const g = coins(k + 11); g.scale.setScalar(0.7); g.visible = false; root.add(g); gems.push(g); }
  const coinFrom = new THREE.Vector3(CX + 2.75, 1.0, 0.7);
  const room = (st: RoomState, t: number, cam: THREE.Vector3, party: THREE.Vector3[]) => {
    chest.visible = st !== 'hidden';
    act(typeof st === 'number' ? st : st === 'done' ? 9 : -1, t, cam);
    if (st === 'done') { (shine.material as THREE.MeshBasicMaterial).opacity = 0.15; blockLight.intensity = 3; }
    gems.forEach((g, k) => { const u = typeof st === 'number' ? (st - 0.45 - k * 0.08) / 0.6 : -1; g.visible = u > 0 && u < 1; if (g.visible) flyTo(g, coinFrom, party[k % Math.max(1, party.length)] ?? coinFrom, u, 0.7); });
  };
  // 나아가는 마법: 앞길의 가시 함정을 해제(마법진 → 가시가 바닥으로 들어간다). 새 방에는 다시 함정
  const trap = new THREE.Group(); trap.position.set(CX + 4.4, 0, 0.3); root.add(trap);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.3), mat('#5e5444')); plate.position.y = 0.04; trap.add(plate);
  const trapSpikes = new THREE.Group(); trap.add(trapSpikes);
  const tsg = new THREE.ConeGeometry(0.08, 0.6, 5); tsg.translate(0, 0.3, 0); const tsm = mat('#c3c6cf');
  for (let x = -0.5; x <= 0.5; x += 0.25) for (let z = -0.45; z <= 0.45; z += 0.3) { const sp = new THREE.Mesh(tsg, tsm); sp.position.set(x + (r() - 0.5) * 0.05, 0, z); trapSpikes.add(sp); }
  const tring = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: magicTex(), color: '#9fe8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); tring.rotation.x = -Math.PI / 2; tring.position.y = 0.1; trap.add(tring);
  // 함정 해제 마법진(사용자 2026-10-15: 마법진은 여기서): 함정 위에 세워진 고리가 떠올라 돌고, 바닥 고리가 함께 빛난다
  const uring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: magicTex(), color: '#9fe8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); uring.position.set(0, 0.9, 0.5); trap.add(uring);
  const advance = (b: number, t: number, cam: THREE.Vector3) => {
    const on = b >= 0;
    const rIn = on ? clamp01(b / 0.25) : 0, rOut = on ? clamp01((b - 0.6) / 0.3) : 0;
    (tring.material as THREE.MeshBasicMaterial).opacity = rIn * (1 - rOut); tring.rotation.z = t * 2;
    (uring.material as THREE.MeshBasicMaterial).opacity = rIn * (1 - rOut); uring.lookAt(cam); uring.rotateZ(t * 2.2); uring.scale.setScalar(0.6 + 0.4 * rIn);
    trapSpikes.position.y = on ? -0.62 * ease(clamp01((b - 0.25) / 0.3)) : 0;
  };
  // 위험: 무리 주변 바닥에서 솟는 가시(단계마다 더 높이, 3단계면 한꺼번에 찌른다)
  const spikes = new THREE.Group(); root.add(spikes);
  const spikeM = mat('#c3c6cf', { metalness: 0.6, roughness: 0.35 });
  const sg = new THREE.ConeGeometry(0.07, 0.7, 5); sg.translate(0, 0.35, 0);
  for (let x = CX - 3.6; x <= CX + 3.4; x += 0.42) for (let z = -1.3; z <= 1.6; z += 0.42) {
    if (r() < 0.25) continue;
    const s = new THREE.Mesh(sg, spikeM); s.position.set(x + (r() - 0.5) * 0.12, 0, z + (r() - 0.5) * 0.12); s.scale.y = 0.8 + r() * 0.5; s.rotation.set((r() - 0.5) * 0.15, r() * 6, (r() - 0.5) * 0.15); spikes.add(s);
  }
  let level = 0, from = 0, to = 0, at = -9, thrust = 0;
  const hazard: Hazard = {
    set(stage, t) { const nt = [-0.75, -0.48, -0.25, -0.25][Math.min(3, stage)]; if (nt !== to) { from = level; to = nt; at = t; } },
    frame(t) { const u = clamp01((t - at) / 0.25); level = from + (to - from) * (u < 1 ? u * u * 1.15 - Math.max(0, u - 0.85) * 0.5 : 1); spikes.position.y = level + thrust; },
    reset() { level = from = to = -0.75; at = -9; thrust = 0; spikes.position.y = level; },
    collapse(s) { thrust = s < 2.15 ? 0 : Math.min(1, (s - 2.15) / 0.15) * 0.9; },
  };
  hazard.reset();
  return { block, blockLight, gems: [], hazard, advance, room };
}
/** 고대 금화 무더기: 기울어진 금화 몇 장 + 작은 유물 */
function coins(seed: number): THREE.Group {
  const r = rng(seed * 13); const g = new THREE.Group();
  const gold = mat('#f2c24f', { metalness: 0.75, roughness: 0.3, emissive: '#7a5410', emissiveIntensity: 0.6 });
  const cg = new THREE.CylinderGeometry(0.16, 0.16, 0.045, 10);
  for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(cg, gold); c.position.set((r() - 0.5) * 0.3, k * 0.035 + r() * 0.02, (r() - 0.5) * 0.25); c.rotation.set((r() - 0.5) * 0.6, r() * 6, (r() - 0.5) * 0.6); g.add(c); }
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.22, 8), gold); cup.position.set(0.12, 0.2, 0); g.add(cup);
  return g;
}

/* ================= 안개 숲 ================= */
export function buildFog(root: THREE.Group, fg: THREE.Group, CX: number, ROCK_X: number, _CEIL: number): ThemeParts {
  const r = rng(57);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 22), mat('#3f4a33')); floor.position.set(1, -0.5, -5); floor.userData.noInk = true; root.add(floor);
  // 풀·이끼 덩이
  const grassM = mat('#4f6a3a');
  for (let k = 0; k < 70; k++) { const g = new THREE.Mesh(new THREE.ConeGeometry(0.06 + r() * 0.05, 0.25 + r() * 0.35, 4), grassM); g.position.set(-10 + r() * 21, 0.12, -10 + r() * 12.5); g.rotation.z = (r() - 0.5) * 0.4; root.add(g); }
  for (let k = 0; k < 18; k++) { const s = 0.15 + r() * 0.35; const m = new THREE.Mesh(rockGeo(k + 300, 0, 0.35), rockMat(k % 2 ? '#55603f' : '#465236')); m.position.set(-10 + r() * 21, s * 0.3, -9 + r() * 11); m.scale.set(s * 1.5, s, s * 1.2); root.add(m); }
  // 나무: 굽은 줄기 + 가지(멀수록 안개에 묻힌다)
  const bark = ['#3b3226', '#2f281f', '#463b2c'];
  const tree = (x: number, z: number, h: number, w: number, seed: number) => {
    const rr = rng(seed); const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.7, w, h, 7, 4), rockMat(bark[seed % 3])); trunk.position.y = h / 2; trunk.rotation.z = (rr() - 0.5) * 0.12; g.add(trunk);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.12, w * 0.25, h * 0.35, 5), rockMat(bark[(seed + k) % 3])); b.position.set((rr() - 0.5) * w, h * (0.55 + rr() * 0.35), 0); b.rotation.z = (rr() < 0.5 ? -1 : 1) * (0.6 + rr() * 0.5); g.add(b); }
  };
  for (let k = 0; k < 16; k++) tree(-12 + k * 1.6 + r(), -3 - r() * 12, 5 + r() * 3, 0.25 + r() * 0.3, 400 + k);
  tree(-4.6, -1.6, 6, 0.42, 431); tree(4.9, -2.0, 6.5, 0.48, 432);
  // 근경: 아주 가까운 굵은 줄기·덤불(흐리게)
  const fgT = (x: number, w: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.8, w, 8, 7), rockMat('#1c1812')); m.position.set(x, 0.5, 0); fg.add(m); };
  fgT(-5.0, 0.7); fgT(5.3, 0.9);
  for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(rockGeo(700 + k, 1, 0.4), rockMat('#1f2617')); m.position.set(-2 + k * 1.2, -2.7, 0.3); m.scale.set(1.2, 0.7, 0.8); fg.add(m); }
  // (사용자 2026-10-15) 막힌 벽 없이: 길 찾기 마법으로 안개 속에 빛의 길을 그려 나아가고, 다음 방에서 파랗게 빛나는 버섯을 모은다
  const block = new THREE.Group(); root.add(block);
  const blockLight = new THREE.PointLight('#8fd8ff', 0, 5, 1.5); block.add(blockLight);
  // 길 찾기: 무리 앞에서 오른쪽 안개 속으로 이어지는 빛 알갱이 길(마법진 + 흐르는 빛)
  const trailM = new THREE.MeshBasicMaterial({ map: softTex(), color: '#bfefff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const trail: THREE.Mesh[] = [];
  for (let k = 0; k < 26; k++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), trailM.clone()); d.visible = false; root.add(d); trail.push(d); }
  const trailLight = new THREE.PointLight('#bfefff', 0, 6, 1.4); root.add(trailLight);
  const nring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: magicTex(), color: '#9fe8ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  nring.rotation.x = -Math.PI / 2; nring.position.set(CX + 1.4, 0.06, 0.4); root.add(nring);
  const advance = (b: number, t: number, cam: THREE.Vector3) => {
    const on = b >= 0;
    (nring.material as THREE.MeshBasicMaterial).opacity = on ? clamp01(b / 0.25) * (1 - clamp01((b - 0.9) / 0.4)) : 0; nring.rotation.z = t * 1.8;
    const reach = on ? ease(clamp01((b - 0.15) / 0.55)) : 0;
    trail.forEach((d, k) => {
      const f = k / (trail.length - 1); d.visible = on && f <= reach;
      if (!d.visible) return;
      // 구불구불 앞으로: 무리 앞(오른쪽)에서 안개 속까지
      const x = CX + 1.4 + f * 8, z = 0.4 + Math.sin(f * 7 + 0.5) * 0.45;
      // 땅을 기지 않고 조금 떠서(사용자 2026-10-15)
      d.position.set(x, 0.75 + Math.sin(f * 5) * 0.12 + Math.sin(t * 3 + k) * 0.06, z); d.lookAt(cam);
      (d.material as THREE.MeshBasicMaterial).opacity = 0.9 * (0.6 + 0.4 * Math.sin(t * 8 - k * 0.7));
      d.scale.setScalar(1 - f * 0.4);
    });
    // 빛의 길 끝이 앞을 비춘다
    trailLight.intensity = on ? 10 * reach * (1 - clamp01((b - 1.2) / 0.4)) : 0; trailLight.position.set(CX + 1.4 + reach * 6, 0.8, 0.6);
  };
  // 다음 방의 파란 빛 버섯(숲 곳곳: 나무 밑동·바닥·쓰러진 통나무)
  const capM = new THREE.MeshToonMaterial({ color: '#7fd7ff', gradientMap: gradientMap() }); capM.emissive.set('#2f9fff'); capM.emissiveIntensity = 1.2;
  const stemM2 = new THREE.MeshToonMaterial({ color: '#d9eef2', gradientMap: gradientMap() }); stemM2.emissive.set('#3a7fa0'); stemM2.emissiveIntensity = 0.4;
  const patches: { g: THREE.Group; p: THREE.Vector3 }[] = [];
  const spots: [number, number, number][] = [[CX + 2.3, 0, 0.8], [CX + 3.6, 0, -0.1], [CX + 1.2, 0, -0.8], [CX + 4.4, 0, 0.7]];
  spots.forEach(([x, y, z], k) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.visible = false; root.add(g);
    const n = 3 + (k % 3);
    for (let q = 0; q < n; q++) {
      const h = 0.14 + r() * 0.22, cr = 0.09 + r() * 0.09;
      const m = new THREE.Group(); m.position.set((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.3); m.rotation.z = (r() - 0.5) * 0.4; g.add(m);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(cr * 0.28, cr * 0.36, h, 6), stemM2); stem.position.y = h / 2; m.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(cr, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capM); cap.scale.y = 0.7; cap.position.y = h; m.add(cap);
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: softTex(), color: '#6fcfff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); halo.name = 'halo'; halo.position.y = 0.25; g.add(halo);
    patches.push({ g, p: new THREE.Vector3(x, y, z) });
  });
  const shroomLight = new THREE.PointLight('#6fcfff', 0, 5, 1.5); shroomLight.position.set(CX + 2.8, 0.8, 0.6); root.add(shroomLight);
  const room = (st: RoomState, t: number, cam: THREE.Vector3, party: THREE.Vector3[]) => {
    patches.forEach((pt, k) => {
      const g = pt.g;
      if (st === 'hidden' || st === 'done') { g.visible = false; return; }
      g.visible = true; (g.getObjectByName('halo') as THREE.Mesh).lookAt(cam);
      if (st === 'idle') { g.position.copy(pt.p); g.scale.setScalar(1); g.rotation.set(0, 0, 0); return; }
      // 채집: 반짝이다가(0~0.5) 쏙 뽑혀 무리에게 날아간다
      const u = clamp01((st - 0.5 - k * 0.08) / 0.7);
      if (u <= 0) { g.position.copy(pt.p); g.scale.setScalar(1 + 0.08 * Math.sin(t * 14 + k)); return; }
      flyTo(g, new THREE.Vector3(pt.p.x, pt.p.y + 0.2, pt.p.z), (party[k % Math.max(1, party.length)] ?? pt.p).clone().setY(1.3), u, 1);
      g.visible = u < 1;
    });
    shroomLight.intensity = st === 'idle' ? 6 : typeof st === 'number' ? 6 * (1 - clamp01((st - 0.5) / 0.8)) : 0;
  };
  // 위험: 안개가 점점 짙어진다(카메라 안개 거리는 아레나가 이 값을 보고 줄인다) + 앞을 흐르는 안개 덩이
  const wisps: THREE.Mesh[] = [];
  const wm = () => new THREE.MeshBasicMaterial({ color: '#dfe8dc', map: fogPuffTex(), transparent: true, opacity: 0, depthWrite: false });
  for (let k = 0; k < 9; k++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), wm()); w.position.set(-6 + k * 1.6, 0.8 + (k % 3) * 0.9, 1.2 + (k % 2) * 0.4); root.add(w); wisps.push(w); }
  let k0 = 0, kTo = 0, at = -9; const state = { thick: 0 };
  const hazard: Hazard & { thick(): number } = {
    set(stage, t) { const nt = Math.min(3, stage); if (nt !== kTo) { k0 = state.thick; kTo = nt; at = t; } },
    frame(t) {
      state.thick = k0 + (kTo - k0) * ease(clamp01((t - at) / 0.8));
      wisps.forEach((w, k) => { (w.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, state.thick * 0.22); w.position.x = -6 + k * 1.6 + Math.sin(t * 0.3 + k) * 0.6; });
    },
    reset() { k0 = kTo = state.thick = 0; at = -9; wisps.forEach(w => (w.material as THREE.MeshBasicMaterial).opacity = 0); },
    collapse(s) { if (s >= 2.0) { kTo = 3.6; state.thick = Math.max(state.thick, 3 + clamp01((s - 2.0) / 0.5) * 0.6); } },
    thick: () => state.thick,
  };
  return { block, blockLight, gems: [], hazard, advance, room };
}
let puffT: THREE.Texture | null = null;
function fogPuffTex(): THREE.Texture {
  if (puffT) return puffT;
  puffT = canvasTex(256, 160, g => { for (let k = 0; k < 7; k++) { const x = 40 + k * 30, y = 80 + Math.sin(k * 1.7) * 18; const rg = g.createRadialGradient(x, y, 4, x, y, 60); rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 256, 160); } });
  return puffT;
}

/* ================= 붕대(무너짐에 깔린 적이 있으면 다음 판부터) ================= */
export function buildBandage(): THREE.Group {
  const g = new THREE.Group(); g.visible = false;
  const cloth = new THREE.MeshStandardMaterial({ color: '#f1ece0', roughness: 1 });
  const wrap1 = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.055, 6, 24), cloth); wrap1.rotation.x = Math.PI / 2 - 0.18; wrap1.position.y = 0.08; wrap1.name = 'w1'; g.add(wrap1);
  const wrap2 = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 6, 24), cloth); wrap2.rotation.set(Math.PI / 2 + 0.5, 0, 0.6); wrap2.position.y = 0.02; wrap2.name = 'w2'; wrap2.visible = false; g.add(wrap2);
  // 반창고(+ 모양)
  const patch = new THREE.Group(); patch.position.set(0.2, 0.18, 0.26); patch.rotation.set(-0.3, 0.6, 0.4);
  const pm = new THREE.MeshStandardMaterial({ color: '#e9c9a0', roughness: 1 });
  patch.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), pm)); const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), pm); patch.add(p2); g.add(patch);
  return g;
}

/* ================= 판 사이 지도 ================= */
/** 지도 위 장소 자리(캔버스 1024×576 기준): 출발 → 동굴 → 미궁 → 안개 숲 */
export const MAP_NODES: [number, number][] = [[140, 400], [370, 250], [640, 380], [880, 210]];
export function mapTex(pan: number): THREE.Texture {
  const th = themeOf(pan);
  return canvasTex(1024, 576, g => {
    // 양피지
    g.fillStyle = '#e9d6ab'; g.beginPath(); g.moveTo(30, 40); g.lineTo(994, 26); g.lineTo(1004, 546); g.lineTo(22, 552); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,80,40,.55)'; g.lineWidth = 6; g.stroke();
    const vg = g.createRadialGradient(512, 290, 160, 512, 290, 560); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,55,20,.35)'); g.fillStyle = vg; g.fill();
    // 길(점선)
    g.setLineDash([16, 14]); g.lineWidth = 7; g.strokeStyle = '#7a4e2a'; g.lineCap = 'round';
    g.beginPath(); MAP_NODES.forEach(([x, y], k) => { if (!k) g.moveTo(x, y); else { const [px, py] = MAP_NODES[k - 1]; g.quadraticCurveTo((px + x) / 2, Math.min(py, y) - 70, x, y); } }); g.stroke(); g.setLineDash([]);
    // 장소 그림
    const icon = (k: number, x: number, y: number) => {
      g.lineWidth = 5; g.strokeStyle = '#4a2f18';
      if (k === 0) { g.fillStyle = '#c98a4a'; g.beginPath(); g.moveTo(x - 34, y + 20); g.lineTo(x, y - 24); g.lineTo(x + 34, y + 20); g.closePath(); g.fill(); g.stroke(); }
      if (k === 1) { g.fillStyle = '#6b4a30'; g.beginPath(); g.arc(x, y + 22, 52, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#1e120a'; g.beginPath(); g.arc(x, y + 22, 24, Math.PI, 0); g.closePath(); g.fill(); }
      if (k === 2) { g.fillStyle = '#9a8a6c'; g.fillRect(x - 46, y - 30, 92, 56); g.strokeRect(x - 46, y - 30, 92, 56); g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(x - 30 + i * 20, y + 26); g.lineTo(x - 22 + i * 20, y + 6); g.lineTo(x - 14 + i * 20, y + 26); } g.fillStyle = '#d9dbe2'; g.fill(); g.stroke(); }
      if (k === 3) { for (let i = 0; i < 3; i++) { g.fillStyle = '#3d5a34'; g.beginPath(); g.moveTo(x - 40 + i * 30, y + 24); g.lineTo(x - 26 + i * 30, y - 30); g.lineTo(x - 12 + i * 30, y + 24); g.closePath(); g.fill(); g.stroke(); } g.fillStyle = 'rgba(240,245,238,.7)'; g.fillRect(x - 56, y + 4, 112, 14); }
      g.font = "30px 'Black Han Sans', sans-serif"; g.textAlign = 'center'; g.fillStyle = k === pan ? '#7a1e10' : '#4a2f18';
      g.fillText(k ? THEMES[k - 1].name : '출발', x, y + 74);
    };
    MAP_NODES.forEach(([x, y], k) => icon(k, x, y));
    // 지난 장소에는 × 표시
    for (let k = 1; k < pan; k++) { const [x, y] = MAP_NODES[k]; g.strokeStyle = '#8a1e10'; g.lineWidth = 8; g.beginPath(); g.moveTo(x - 22, y - 22); g.lineTo(x + 22, y + 22); g.moveTo(x + 22, y - 22); g.lineTo(x - 22, y + 22); g.stroke(); }
    // 제목
    g.textAlign = 'center'; g.font = "64px 'Black Han Sans', sans-serif"; g.fillStyle = '#3a2410'; g.fillText(`${pan}판 · ${th.name}`, 512, 110);
  });
}
/** 지도 위 무리 표시(모자) */
export function markerTex(): THREE.Texture {
  return canvasTex(128, 128, g => {
    g.fillStyle = '#4a6fd0'; g.strokeStyle = '#140a05'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(20, 96); g.lineTo(108, 96); g.lineTo(84, 86); g.lineTo(70, 22); g.lineTo(52, 86); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e8b84a'; g.fillRect(48, 80, 40, 9);
  });
}
