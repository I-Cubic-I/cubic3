/* 3D 장면 — 1 단위 = 1 cm. R3F 캔버스가 렌더러·카메라·루프를 맡고, 이 클래스가 장면을 꾸미고 움직인다.
   (시험판 game/src/scene.js를 옮긴 것. 부분별로 R3F 컴포넌트로 다듬어 간다) */
import * as THREE from 'three';
import {
  BLIMIT, CFLIP, CURL, type Card, type GameState, MAX_SEATS, fullDeck, MG, type MgId, R, SUITS, SYM, type Suit, U, chairOf, countOpenAt, isItem, now,
} from '@cubic3/engine';
import { curlFrames } from '../ui/CurlPad';
import { SEATCOL, SUITCOL } from '../game';
import { feltColor, prefs } from '../prefs';
import { type BurnU, Burns, burnable } from './burn';
import { FONT_B, FONT_D, FONT_M, INKC, backTex, ctex, faceTex, floppyTex, mgLook, numTex, pipTex, rr } from './textures';

const T = THREE;
const PI = Math.PI;
const TY = 75;            // 펠트 윗면 높이
const TR = 70;            // 테이블 반지름
const LOBBY_HALF_W = Math.tan(30 * Math.PI / 180) * 1.1; // 대기실 시점이 가로로 담아야 하는 폭(시야각 60°·가로세로 1.1 기준)
const SEAT_D = 100;       // 의자 거리
const MON = { x: 0, z: -38 };  // 모니터 자리
const BOX = { x: -40, z: 12 }; // 디스크 상자
const DIE = { x: 36, z: 8 };
const CARD_W = 6.3, CARD_H = 8.8;
const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
type E3 = [number, number, number];
const fast = () => !!(window as unknown as { __fast?: number }).__fast;

export type Pick =
  | { kind: 'deck' } | { kind: 'row'; c: Card } | { kind: 'reward'; c: Card } | { kind: 'die' } | { kind: 'seat'; i: number } | { kind: 'chair'; c: number }
  | { kind: 'bomb'; k: number } | { kind: 'door'; z: number } | { kind: 'slot'; k: number };

export interface WorldCtx {
  S(): GameState | null;
  viewSeat(): number;
  /** 내가 자리에 앉아 있는지 (관전이 아닌지) */
  seated(): boolean;
  /** ♣Q·♣K로 내가 지금 고를 수 있는 칸(1~6). 내가 고르는 중이 아니면 빈 배열 */
  clubSlots(): number[];
  whoActs(): number | null;
  uiMode(): string | undefined;
  canPick(p: Pick): boolean;
  pick(p: Pick): void;
  tip3d(c: Card | null, x?: number, y?: number): void;
  fpsHint(ok: boolean, locked: boolean): void;
  rulesReady(): void;
}

/* ---------------- 재료 ---------------- */
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(col: string, opt: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const k = col + JSON.stringify(opt);
  if (!matCache.has(k)) matCache.set(k, new T.MeshStandardMaterial({ color: new T.Color(col), roughness: .8, metalness: 0, ...opt }));
  return matCache.get(k)!;
}
let gCardGeo: THREE.PlaneGeometry | null = null;
const gCard = () => gCardGeo || (gCardGeo = new T.PlaneGeometry(CARD_W, CARD_H));
function makeCard(c: Card | null): THREE.Group {
  const grp = new T.Group();
  const f = new T.Mesh(gCard(), new T.MeshStandardMaterial({ map: c ? faceTex(c) : backTex(), roughness: .6 }));
  const b = new T.Mesh(gCard(), new T.MeshStandardMaterial({ map: backTex(), roughness: .6 })); b.rotation.y = PI;
  f.castShadow = true; grp.add(f, b); grp.userData.card = c; return grp;
}
/* 디스크 모양: 9 × 9.4, 두께 .34. 오른쪽 뒤(그림의 오른쪽 위) 모서리는 비스듬히 깎였고,
   이름표 자리는 얕게(.05) 움푹 들어가 있다(바닥판 위에 이름표 자리가 뚫린 윗판을 겹친다).
   윗면(위를 보는 면)은 그림(floppyTex)을, 나머지 면은 몸통 색을 쓴다: 그룹 0 = 윗면, 1 = 나머지 */
const FW = 9, FD = 9.4, FT = .34, FPIT = .05;
let floppyGeo: THREE.BufferGeometry | null = null;
function diskGeometry(): THREE.BufferGeometry {
  if (floppyGeo) return floppyGeo;
  const cut = 24 / 256 * FW; // 깎인 모서리 크기(그림과 같은 비율)
  // 모양은 xy 평면에 그리고 나중에 눕힌다(모양 y = -z)
  const outline = () => {
    const sh = new T.Shape(); const x0 = -FW / 2, x1 = FW / 2, y0 = -FD / 2, y1 = FD / 2;
    sh.moveTo(x0, y0); sh.lineTo(x1, y0); sh.lineTo(x1, y1 - cut); sh.lineTo(x1 - cut, y1); sh.lineTo(x0, y1); sh.closePath(); return sh;
  };
  // 이름표 자리: 그림의 u 0.086~0.914, v 0.045~0.597 → x ±3.73, z -0.91~4.28 → 모양 y -4.28~0.91 (모서리 둥글게)
  const lx0 = (.086 - .5) * FW, lx1 = (.914 - .5) * FW, ly0 = -(.5 - .045) * FD, ly1 = -(.5 - .597) * FD, r = .25;
  const hole = new T.Path();
  hole.moveTo(lx0 + r, ly0); hole.lineTo(lx1 - r, ly0); hole.quadraticCurveTo(lx1, ly0, lx1, ly0 + r); hole.lineTo(lx1, ly1 - r); hole.quadraticCurveTo(lx1, ly1, lx1 - r, ly1);
  hole.lineTo(lx0 + r, ly1); hole.quadraticCurveTo(lx0, ly1, lx0, ly1 - r); hole.lineTo(lx0, ly0 + r); hole.quadraticCurveTo(lx0, ly0, lx0 + r, ly0);
  const rimShape = outline(); rimShape.holes.push(hole);
  const base = new T.ExtrudeGeometry(outline(), { depth: FT - FPIT, bevelEnabled: false, curveSegments: 4 });
  const rim = new T.ExtrudeGeometry(rimShape, { depth: FPIT, bevelEnabled: false, curveSegments: 4 });
  rim.translate(0, 0, FT - FPIT);
  // 눕히기: (x, y, z) → (x, z, -y), 가운데 높이로
  const parts = [base, rim].map(g => { g.rotateX(-Math.PI / 2); g.translate(0, -FT / 2, 0); return g; }); // 돌출 도형은 이미 꼭짓점을 공유하지 않는다
  // 삼각형을 윗면 / 나머지로 나누고, 윗면은 위에서 내려다본 좌표로 그림을 입힌다
  const top: number[] = [], rest: number[] = [];
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3();
  for (const g of parts) {
    const P = g.attributes.position.array as ArrayLike<number>;
    for (let i = 0; i < P.length; i += 9) {
      a.set(P[i], P[i + 1], P[i + 2]); b.set(P[i + 3], P[i + 4], P[i + 5]); c.set(P[i + 6], P[i + 7], P[i + 8]);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      (n.y > .5 ? top : rest).push(...Array.from({ length: 9 }, (_, k) => P[i + k]));
    }
  }
  const pos = new Float32Array([...top, ...rest]); const uv = new Float32Array(pos.length / 3 * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) { uv[j] = pos[i] / FW + .5; uv[j + 1] = .5 - pos[i + 2] / FD; }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.computeVertexNormals(); g.addGroup(0, top.length / 3, 0); g.addGroup(top.length / 3, rest.length / 3, 1);
  return (floppyGeo = g);
}
/** 디스크 둘레의 테두리 띠(디스크 바깥 .6, 디스크 가운데 높이, 위에서 보면 액자처럼) */
let frameGeo: THREE.BufferGeometry | null = null;
function diskFrameGeometry(): THREE.BufferGeometry {
  if (frameGeo) return frameGeo;
  const cut = 24 / 256 * FW, pad = .6;
  const out = (o: number, sh: THREE.Shape | THREE.Path) => {
    const x0 = -FW / 2 - o, x1 = FW / 2 + o, y0 = -FD / 2 - o, y1 = FD / 2 + o, c = cut + o * .41;
    sh.moveTo(x0, y0); sh.lineTo(x1, y0); sh.lineTo(x1, y1 - c); sh.lineTo(x1 - c, y1); sh.lineTo(x0, y1); sh.lineTo(x0, y0); return sh;
  };
  const sh = out(pad, new T.Shape()) as THREE.Shape; sh.holes.push(out(.08, new T.Path()) as THREE.Path);
  const g = new T.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, FT / 2 + .02, 0);
  return (frameGeo = g);
}
/** 지금 누를 수 있는 물건(덱·버림 줄 카드)에 두르는 금빛 테두리. flat: xz 평면(눕힌 것), 아니면 xy 평면 */
const hiGeos = new Map<string, THREE.BufferGeometry>();
function hiFrame(w: number, h: number, pad: number, flat: boolean): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const key = [w, h, pad, flat].join(); let g = hiGeos.get(key);
  if (!g) {
    const rect = (o: number, p: THREE.Shape | THREE.Path) => { p.moveTo(-w / 2 - o, -h / 2 - o); p.lineTo(w / 2 + o, -h / 2 - o); p.lineTo(w / 2 + o, h / 2 + o); p.lineTo(-w / 2 - o, h / 2 + o); p.lineTo(-w / 2 - o, -h / 2 - o); return p; };
    const sh = rect(pad, new T.Shape()) as THREE.Shape; sh.holes.push(rect(.2, new T.Path()) as THREE.Path);
    g = new T.ShapeGeometry(sh); if (flat) g.rotateX(-Math.PI / 2); hiGeos.set(key, g);
  }
  const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: lin('#ffb320'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  m.visible = false; m.renderOrder = 2; m.userData.hi = true; return m;
}
function makeFloppy(id: MgId): THREE.Mesh {
  const geo = diskGeometry(); const [, body] = mgLook(id);
  // 디스크마다 따로 탈 수 있게 재질을 따로 만든다(태우기 셰이더, burn.ts)
  const u: BurnU = { uBurn: { value: 0 }, uChar: { value: 0 }, uSeed: { value: Math.random() }, uBody: { value: new T.Color(body) } };
  const side = burnable(new T.MeshStandardMaterial({ color: new T.Color(body), roughness: .8, metalness: 0 }), u);
  const top = burnable(new T.MeshStandardMaterial({ map: floppyTex(id), roughness: .5 }), u);
  const m = new T.Mesh(geo, [top, side]); m.castShadow = true; m.receiveShadow = true; m.userData.burn = u;
  // 고를 수 있을 때 두르는 금빛 테두리(평소엔 숨김)
  const frame = new T.Mesh(diskFrameGeometry(), new T.MeshBasicMaterial({ color: lin('#ffb320'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  frame.visible = false; frame.renderOrder = 2; m.add(frame); m.userData.frame = frame;
  return m;
}
function makeDie(): THREE.Mesh {
  const mats = [3, 4, 1, 6, 2, 5].map(n => new T.MeshStandardMaterial({ map: pipTex(n), roughness: .4 }));
  const m = new T.Mesh(new T.BoxGeometry(2.6, 2.6, 2.6), mats); m.castShadow = true; return m;
}
function dieEuler(v: number): E3 {
  return ({ 1: [0, 0, 0], 6: [PI, 0, 0], 2: [-PI / 2, 0, 0], 5: [PI / 2, 0, 0], 3: [0, 0, PI / 2], 4: [0, 0, -PI / 2] } as Record<number, E3>)[v] || [0, 0, 0];
}
function makeCube(s: Suit): THREE.Mesh {
  const m = new T.Mesh(new T.BoxGeometry(2.2, 2.2, 2.2), mat(SUITCOL[s], { roughness: .35 })); m.castShadow = true; return m;
}
/** 시험판(r128)은 조명·일부 재질의 16진수 색을 변환 없이 썼다. 같은 색이 나오게 선형 값으로 해석한다 */
const lin = (hex: string) => new T.Color().setHex(parseInt(hex.slice(1), 16), T.LinearSRGBColorSpace);
function hsl(h: number, s: number, l: number): THREE.Color { return new T.Color().setHSL(h / 360, s, l, T.SRGBColorSpace); }

/* ---------------- 아바타 (앉아서 테이블을 바라본다) ---------------- */
const HAIRS = ['#3b2416', '#15110e', '#7a5236', '#5a3a22', '#2a1d15'];
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): THREE.Mesh {
  const d = b.clone().sub(a); const len = d.length(); const g = new T.CylinderGeometry(r, r * .9, len, 10); g.translate(0, len / 2, 0);
  const mesh = new T.Mesh(g, m); mesh.position.copy(a); mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); mesh.castShadow = true; return mesh;
}
interface AvatarData { head: THREE.Group; fan: THREE.Group; ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>; torso: THREE.Mesh; fanN: number; at: string; hop: { p: THREE.Vector3; l: THREE.Vector3; done?: boolean } | null; hopT: number }
/** 의자 (아바타와 대기실의 빈 의자가 같이 쓴다). 테이블 쪽이 +z */
function addChair(g: THREE.Group): void {
  const woodm = mat('#3e2716', { roughness: .6 });
  const seat = new T.Mesh(new T.BoxGeometry(44, 4, 42), woodm); seat.position.set(0, 45, -4);
  const back = new T.Mesh(new T.BoxGeometry(44, 56, 4), woodm); back.position.set(0, 75, -25);
  g.add(seat, back);
  [[-19, -21], [19, -21], [-19, 14], [19, 14]].forEach(([x, z]) => { const l = new T.Mesh(new T.BoxGeometry(3, 44, 3), woodm); l.position.set(x, 22, z); g.add(l); });
}
function buildChair(): THREE.Group {
  const g = new T.Group(); addChair(g);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function buildAvatar(col: string, hairCol: string): THREE.Group {
  const g = new T.Group(); const body = mat(col, { roughness: .7 }), skin = mat('#e3bd98', { roughness: .65 }), hair = mat(hairCol, { roughness: .9 });
  addChair(g);
  const torso = new T.Mesh(new T.CylinderGeometry(15, 17, 46, 18), body); torso.scale.z = .62; torso.position.set(0, 72, -6);
  const sh = new T.Mesh(new T.SphereGeometry(16.5, 20, 12), body); sh.scale.set(1.05, .46, .62); sh.position.set(0, 94, -6);
  const hips = new T.Mesh(new T.BoxGeometry(32, 12, 34), body); hips.position.set(0, 52, 2);
  const neck = new T.Mesh(new T.CylinderGeometry(4, 4.5, 8, 10), skin); neck.position.set(0, 101, -5);
  const head = new T.Group(); head.position.set(0, 104, -4);
  const hd = new T.Mesh(new T.SphereGeometry(10, 24, 18), skin); hd.scale.set(.95, 1.05, 1); hd.position.y = 8;
  const hr = new T.Mesh(new T.SphereGeometry(10.7, 24, 16, 0, PI * 2, 0, PI * .56), hair); hr.position.y = 8.4; hr.rotation.x = -.42;
  const eyeM = mat('#1b1408'); [-3.4, 3.4].forEach(x => { const e = new T.Mesh(new T.SphereGeometry(1.1, 8, 6), eyeM); e.position.set(x, 9, 9.3); head.add(e); });
  const nose = new T.Mesh(new T.SphereGeometry(1.4, 8, 6), skin); nose.position.set(0, 6.5, 10);
  head.add(hd, hr, nose); head.rotation.x = .28;
  const L = [-1, 1].flatMap(sx => {
    const s = V(sx * 16, 92, -6), e = V(sx * 13, 79, 10), h = V(sx * 5, 85, 25);
    const hand = new T.Mesh(new T.SphereGeometry(3.4, 10, 8), skin); hand.position.copy(h);
    return [limb(s, e, 3.8, body), limb(e, h, 3.3, body), hand];
  });
  const fan = new T.Group(); fan.position.set(0, 86, 26); fan.rotation.set(-0.35, PI, 0);
  const ring = new T.Mesh(new T.TorusGeometry(30, 1.4, 8, 48), new T.MeshBasicMaterial({ color: new T.Color('#e8b84a'), transparent: true, opacity: 0 }));
  ring.rotation.x = PI / 2; ring.position.y = .6;
  g.add(torso, sh, hips, neck, head, ...L, fan, ring);
  const ud: AvatarData = { head, fan, ring, torso, fanN: -1, at: 'main', hop: null, hopT: 0 };
  g.userData = ud;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}
function setFan(av: THREE.Group, n: number): void {
  const ud = av.userData as AvatarData; const fan = ud.fan; n = Math.min(n, 9); if (ud.fanN === n) return; ud.fanN = n;
  while (fan.children.length) fan.remove(fan.children[0]);
  for (let k = 0; k < n; k++) { const c = makeCard(null); const a = (k - (n - 1) / 2) * 0.17; const piv = new T.Group(); piv.rotation.z = a; c.position.set(0, CARD_H / 2, k * .05); piv.add(c); fan.add(piv); }
}

/* ---------------- 미니게임 테이블 배치 ---------------- */
// 미니게임 테이블: 안쪽 원 8개 + 바깥 원(나머지)
const ST_IDS: MgId[] = ['balloon', 'vault', 'race', 'count', 'hold', 'bomb', 'auction', 'rps', 'nunchi', 'updown', 'curling', 'line', 'speed', 'fold', 'chain', 'mid', 'gesture', 'stack', 'change', 'cave', 'ten', 'balance', 'liar', 'fore', 'fork'];
const ST_R = [440, 720];
const STYLE: Record<MgId, { felt: string; wood: string; shape: 'round' | 'octa' | 'square' | 'long' }> = {
  balloon: { felt: '#7a3b22', wood: '#c99a6a', shape: 'round' }, vault: { felt: '#30363f', wood: '#1f2329', shape: 'square' }, race: { felt: '#2c5a3c', wood: '#5b3b23', shape: 'long' }, count: { felt: '#23405e', wood: '#3a2a1c', shape: 'round' },
  hold: { felt: '#5a2626', wood: '#2a1a12', shape: 'octa' }, bomb: { felt: '#3a1414', wood: '#1a1a1a', shape: 'round' }, auction: { felt: '#4a3a12', wood: '#6b4a2a', shape: 'square' }, rps: { felt: '#2e2e5a', wood: '#c9c2b4', shape: 'round' },
  nunchi: { felt: '#7a4a22', wood: '#4a2c18', shape: 'round' }, updown: { felt: '#2f4a3a', wood: '#3a2a1c', shape: 'round' }, curling: { felt: '#2a3442', wood: '#5b3b23', shape: 'long' }, line: { felt: '#22303f', wood: '#2a1f18', shape: 'square' },
  speed: { felt: '#4a1f3a', wood: '#2a1a20', shape: 'round' }, fold: { felt: '#4a3a5a', wood: '#3a2a3a', shape: 'octa' }, chain: { felt: '#3a4a2a', wood: '#2a2a1a', shape: 'octa' }, mid: { felt: '#2a3a5a', wood: '#1f2a3a', shape: 'square' },
  gesture: { felt: '#5a3a2a', wood: '#3a2418', shape: 'round' }, stack: { felt: '#1f2f3f', wood: '#2a1f18', shape: 'square' }, change: { felt: '#2f3f2a', wood: '#3a2a1c', shape: 'square' }, cave: { felt: '#3a3026', wood: '#241a12', shape: 'octa' },
  ten: { felt: '#3f1f2a', wood: '#2a1a1a', shape: 'round' }, balance: { felt: '#2a2f4a', wood: '#c9c2b4', shape: 'round' },
  liar: { felt: '#3a1f1f', wood: '#2a1612', shape: 'round' }, fore: { felt: '#1f3a2a', wood: '#3a2a1c', shape: 'octa' }, fork: { felt: '#2a3a3f', wood: '#2a2018', shape: 'square' },
};
function stFrame(id: MgId) { const k = ST_IDS.indexOf(id); const ring = k < 8 ? 0 : 1; const cnt = ring ? ST_IDS.length - 8 : 8; const a = (ring ? k - 8 : k) * 2 * PI / cnt + PI / cnt; const x = Math.sin(a) * ST_R[ring], z = Math.cos(a) * ST_R[ring]; return { x, z, ry: Math.atan2(-x, -z) }; }
/** 말 컬링 판 좌표(cm, x 폭·y 길이) → 미니게임 테이블 위 위치. 화면 아래쪽이 출발 가장자리, 위쪽이 끝 벽 */
const CS = 3;
const curlLocal = (x: number, y: number): [number, number] => [-x * CS, (y - CURL.L / 2) * CS];
function stLocal(id: MgId, lx: number, ly: number, lz: number) { const f = stFrame(id); const c = Math.cos(f.ry), s = Math.sin(f.ry); return V(f.x + lx * c + lz * s, ly, f.z - lx * s + lz * c); }
const HALL = 900;
const SLOTX = (k: number) => -27.5 + k * 11;
const BURN_T = 1.1; // 디스크가 다 타는 데 걸리는 초
const onTable = (x: number, z: number, h = 0) => V(x, TY + .1 + h, z);

interface PoolEntry { obj: THREE.Object3D; tp: THREE.Vector3; tq: THREE.Quaternion; ts: number; speed: number; lift: number; alive: boolean; dying?: boolean }
interface WantOpt { from?: THREE.Vector3 | null; fromEuler?: E3; fromScale?: number; speed?: number; lift?: number; pick?: Pick | null }
type FlopMode = 'box' | 'pop' | 'slot' | 'lift' | 'away' | 'fly' | 'in';

type ShotName = 'seat' | 'myturn' | 'top' | 'monitor' | 'zoom' | 'reward' | 'station' | 'menu' | 'lobby' | 'disks';
interface Shot { p: THREE.Vector3; l: THREE.Vector3; fov: number }

export class World {
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  canvas!: HTMLCanvasElement;
  private W = 1; private H = 1;
  private t0 = performance.now();
  private pool = new Map<string, PoolEntry>();
  private picks = new Set<THREE.Object3D>();
  private hatch!: THREE.Mesh;
  private avatars = new Map<number, THREE.Group>();
  private chairs = new Map<number, THREE.Group>(); // 대기실의 빈 의자 (의자 번호 → 의자)
  private seatKey = '';
  private stations = new Map<MgId, { g: THREE.Group; props: THREE.Group; parts: Record<string, any>; lamp?: THREE.Group }>();
  private mgSpot!: THREE.SpotLight;
  private monitor!: THREE.Group;
  private screenCtx!: CanvasRenderingContext2D;
  private screenTex!: THREE.CanvasTexture;
  private screenState: { mode: string; name?: string; p?: number } = { mode: 'off' };
  private dbox!: THREE.Group;
  private feltMat!: THREE.MeshStandardMaterial;
  private die!: THREE.Mesh;
  private SHOTS: Record<ShotName, Shot> = {
    seat: { p: V(0, 150, 128), l: V(0, 66, -24), fov: 52 },
    myturn: { p: V(-8, 124, 44), l: V(-8, TY, -12), fov: 48 },
    top: { p: V(0, 250, 34), l: V(0, TY, 6), fov: 40 },
    // 미니게임 선택 화면: 디스크 6장·상자·주사위가 꽉 차게 가까이
    disks: { p: V(0, TY + 105, 70), l: V(0, TY, -2), fov: 36 },
    monitor: { p: V(MON.x, TY + 30, MON.z + 70), l: V(MON.x, TY + 22, MON.z + 14), fov: 42 },
    zoom: { p: V(MON.x, TY + 26, MON.z + 30), l: V(MON.x, TY + 26, MON.z + 15.8), fov: 42 },
    reward: { p: V(0, 150, 82), l: V(0, TY, 8), fov: 48 },
    station: { p: V(0, 150, 128), l: V(0, 66, -24), fov: 50 },
    // 메인 화면: 왼쪽은 메뉴 자리로 비우고, 테이블은 화면 오른쪽에 비스듬히
    menu: { p: V(-60, 185, 235), l: V(-60, 62, 0), fov: 50 },
    // 대기실: 고정 시점. 테이블 이쪽에서 건너편 반원의 의자 5개(앉은 사람 얼굴)를 본다
    lobby: { p: V(0, 138, 145), l: V(0, 88, -60), fov: 60 },
  };
  private camS = { p: V(0, 150, 128), l: V(0, 66, -24), fov: 52, shot: 'seat' as ShotName, speed: 2.6 };
  private yaw = 0; private pitch = 0;
  private lookT = { yaw: 0, pitch: 0 };
  private readonly MOUSE_LOOK = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  private locked = false; private fpsOK = false; private lockFailed = false;
  private down: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  private hover: THREE.Object3D | null = null;
  private ray = new T.Raycaster(); private mv = new T.Vector2();
  /** burn: 디스크마다 이번 라운드에 탄 횟수(n), 지금 타는 중/탄 상태인지(on), 탄 지 몇 초(t) */
  private flop: { round: string | null; ids: MgId[]; mode: Record<number, FlopMode>; chosen: number | null; introDone: boolean; boxGone?: boolean; burn: Record<number, { n: number; on: boolean; t: number }> } = { round: null, ids: [], mode: {}, chosen: null, introDone: false, burn: {} };
  private burns!: Burns;
  private dieFrame!: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** 라운드 시작 연출에서 지금까지 뽑아 놓은 보상 카드 수 */
  private rewardShown = 99;
  private lastActorSeat: number | null = null;
  private lastMG: MgId | null = null;
  private gen = 0;
  private cleanup: (() => void)[] = [];

  constructor(private ctx: WorldCtx) {}

  get camShot(): ShotName { return this.camS.shot; }
  isLocked(): boolean { return this.locked; }

  /* ---------------- 시작 ---------------- */
  attach(scene: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): void {
    this.scene = scene; this.camera = camera; this.canvas = canvas;
    this.buildRoom(); this.buildHall(); this.buildStations(); this.buildMonitor(); this.buildBox(); this.buildDie();
    this.burns = new Burns(scene);
    this.mgSpot = new T.SpotLight(lin('#ffe4bf'), 0, 0, .6, .5, 0); scene.add(this.mgSpot, this.mgSpot.target);
    this.bindInput();
  }
  /** 미리 데워 두기: 처음 등장할 때 멈칫하지 않게, 카드 앞뒤·디스크·주사위·큐빅 그림을 그래픽 카드에 미리 올리고
      그것들을 그리는 셰이더도 미리 만든다(눈에 안 보이는 바닥 아래에 잠깐 두었다가 치운다) */
  warmup(gl: THREE.WebGLRenderer): void {
    const g = new T.Group(); g.position.set(0, -400, 0);
    const deck = fullDeck(1);
    deck.forEach((c, k) => { if (k < 4) g.add(makeCard(c)); gl.initTexture(faceTex(c)); });
    gl.initTexture(backTex());
    ST_IDS.forEach(id => { g.add(makeFloppy(id)); gl.initTexture(floppyTex(id)); });
    for (let n = 1; n <= 6; n++) { gl.initTexture(pipTex(n)); gl.initTexture(numTex(n)); }
    g.add(makeDie()); SUITS.forEach(s => g.add(makeCube(s)));
    this.scene.add(g);
    try { gl.compile(this.scene, this.camera); } finally { this.scene.remove(g); }
  }
  dispose(): void {
    this.cleanup.forEach(f => f()); this.cleanup = []; this.burns?.clear();
    if (this.locked) { try { document.exitPointerLock(); } catch { /* 이미 풀림 */ } }
  }
  resize(w: number, h: number): void {
    this.W = w; this.H = h;
    const narrow = w / h < 1.1; const S = this.SHOTS;
    S.myturn.p.set(-8, narrow ? 150 : 124, narrow ? 66 : 44); S.seat.p.set(0, narrow ? 190 : 150, narrow ? 170 : 128);
    S.top.p.set(0, narrow ? 330 : 250, narrow ? 44 : 34); S.disks.p.set(0, TY + (narrow ? 150 : 105), narrow ? 100 : 70); S.reward.p.set(0, narrow ? 190 : 150, narrow ? 110 : 82);
    // 대기실: 의자 5개가 가로로 꼭 차게 시야각을 맞춘다(좁은 화면은 넓게, 가로로 긴 휴대폰은 좁게 당겨서)
    S.lobby.fov = Math.min(84, Math.max(38, 2 * Math.atan(LOBBY_HALF_W / (w / h)) * 180 / PI));
  }

  /* ---------------- 방과 테이블 ---------------- */
  private buildRoom(): void {
    const scene = this.scene;
    scene.background = new T.Color('#14110e');
    // 시험판(three r128, 예전 조명 단위)과 같은 밝기가 되도록 세기에 π를 곱하고 거리 감쇠를 끈다
    scene.add(new T.HemisphereLight(lin('#fff1dd'), lin('#1a1410'), .6 * PI));
    const spot = new T.SpotLight(lin('#ffe4bf'), 1.25 * PI, 0, 0.72, 0.55, 0); spot.position.set(0, 280, 60); spot.target.position.set(0, TY, 0);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 100; spot.shadow.camera.far = 500; spot.shadow.bias = -0.0006; scene.add(spot, spot.target);
    const fill = new T.DirectionalLight(lin('#c9d8ff'), .18 * PI); fill.position.set(-120, 160, 200); scene.add(fill);
    const rug = new T.Mesh(new T.CircleGeometry(165, 64), mat('#3a1f1a', { roughness: 1 })); rug.rotation.x = -PI / 2; rug.position.y = .2; rug.receiveShadow = true; scene.add(rug);
    const wood = mat('#5b3b23', { roughness: .55 });
    const top = new T.Mesh(new T.CylinderGeometry(TR, TR - 1, 4, 72), wood); top.position.y = TY - 2; top.castShadow = true; top.receiveShadow = true; scene.add(top);
    const rim = new T.Mesh(new T.TorusGeometry(TR - 3.2, 3.2, 12, 96), wood); rim.rotation.x = PI / 2; rim.position.y = TY + .4; rim.castShadow = true; scene.add(rim);
    this.feltMat = new T.MeshStandardMaterial({ color: new T.Color(feltColor(prefs().felt)), roughness: .95, metalness: 0 });
    const felt = new T.Mesh(new T.CircleGeometry(TR - 6, 72), this.feltMat); felt.rotation.x = -PI / 2; felt.position.y = TY + .05; felt.receiveShadow = true; scene.add(felt);
    const ped = new T.Mesh(new T.CylinderGeometry(9, 12, TY - 4, 24), wood); ped.position.y = (TY - 4) / 2; scene.add(ped);
    const foot = new T.Mesh(new T.CylinderGeometry(34, 38, 4, 48), wood); foot.position.y = 2; foot.receiveShadow = true; scene.add(foot);
    // 엘리베이터 해치(가운데가 내려갔다 올라오는 연출용)
    this.hatch = new T.Mesh(new T.CircleGeometry(24, 48), mat('#0d0b09', { roughness: 1 })); this.hatch.rotation.x = -PI / 2;
    this.hatch.position.set(MON.x, TY + .08, MON.z + 2); this.hatch.scale.setScalar(.001); scene.add(this.hatch);
  }

  /* ================= 넓은 홀: 방 꾸미기 ================= */
  private buildHall(): void {
    const scene = this.scene;
    scene.fog = new T.Fog(new T.Color('#14110e'), 700, 2100);
    const ft = ctex('plank', 512, 512, (g, w, h) => {
      g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { const off = (y / 32 % 2) * 130; for (let x = -off; x < w; x += 260) { const l = 40 + ((x * 7 + y * 3) % 25); g.fillStyle = `rgb(${l + 18},${l},${Math.round(l * .62)})`; g.fillRect(x + 2, y + 2, 256, 28); } }
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    });
    ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.repeat.set(9, 9);
    const floor = new T.Mesh(new T.PlaneGeometry(HALL * 2, HALL * 2), new T.MeshStandardMaterial({ map: ft, roughness: .75 })); floor.rotation.x = -PI / 2; floor.position.y = .05; floor.receiveShadow = true; scene.add(floor);
    const wt = ctex('wall', 256, 512, (g, w, h) => {
      g.fillStyle = '#2b201a'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? '#2f231c' : '#281d17'; g.fillRect(x, 0, 32, h * .62); }
      g.fillStyle = '#4a3020'; g.fillRect(0, h * .62, w, h * .38); g.fillStyle = '#5b3b23'; g.fillRect(0, h * .62, w, 10);
      for (let x = 8; x < w; x += 64) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(x, h * .68, 48, h * .26); }
    });
    wt.wrapS = T.RepeatWrapping; wt.repeat.set(10, 1); const wm = new T.MeshStandardMaterial({ map: wt, roughness: .9 });
    for (let k = 0; k < 4; k++) { const w = new T.Mesh(new T.PlaneGeometry(HALL * 2, 420), wm); const a = k * PI / 2; w.position.set(Math.sin(a) * HALL, 210, Math.cos(a) * HALL); w.rotation.y = a + PI; scene.add(w); }
    const ceil = new T.Mesh(new T.PlaneGeometry(HALL * 2, HALL * 2), mat('#1a1410', { roughness: 1 })); ceil.rotation.x = PI / 2; ceil.position.y = 420; scene.add(ceil);
    for (let k = -2; k <= 2; k++) { const b = new T.Mesh(new T.BoxGeometry(HALL * 2, 22, 26), mat('#3a2716')); b.position.set(0, 408, k * 360); scene.add(b); }
    // 창문(달빛)과 커튼
    const win = new T.MeshBasicMaterial({
      map: ctex('win', 128, 192, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d3a5c'); gr.addColorStop(1, '#0e1a2a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,.5)'; for (let s = 0; s < 14; s++) g.fillRect((s * 53) % w, (s * 37) % (h * .6), 2, 2);
        g.fillStyle = '#3a2716'; g.fillRect(w / 2 - 3, 0, 6, h); g.fillRect(0, h * .45, w, 6); g.strokeStyle = '#3a2716'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
      }),
    });
    ([[-1, 0], [1, 0], [0, -1]] as const).forEach(([sx, sz]) => {
      for (const o of [-300, 300]) {
        const m = new T.Mesh(new T.PlaneGeometry(120, 180), win);
        if (sx) { m.position.set(sx * (HALL - 1), 220, o); m.rotation.y = -sx * PI / 2; } else { m.position.set(o, 220, sz * (HALL - 1)); }
        scene.add(m);
        const cur = mat('#5a1f1c', { roughness: 1 });
        for (const cs of [-1, 1]) { const c = new T.Mesh(new T.BoxGeometry(34, 230, 8), cur); if (sx) c.position.set(sx * (HALL - 6), 205, o + cs * 76); else c.position.set(o + cs * 76, 205, sz * (HALL - 6)); scene.add(c); }
      }
    });
    // 책장
    const shelfM = mat('#3e2716', { roughness: .7 }); const bookCols = ['#7a2e2e', '#2f4f6f', '#6b5a2a', '#2e5a3e', '#5a3a6b', '#8a5a2a'];
    for (const x of [-560, -300, 300, 560]) {
      const sh = new T.Group(); const frame = new T.Mesh(new T.BoxGeometry(180, 240, 40), shelfM); frame.position.y = 120; sh.add(frame);
      for (let r = 0; r < 4; r++) { let bx = -80; let q = 0; while (bx < 78) { const bw = 5 + ((q * 7 + r * 3) % 6); const bh = 34 + ((q * 11 + r) % 14); const bk = new T.Mesh(new T.BoxGeometry(bw, bh, 30), mat(bookCols[(q + r) % 6], { roughness: .8 })); bk.position.set(bx + bw / 2, 24 + r * 56 + bh / 2, 4); sh.add(bk); bx += bw + 1; q++; } }
      sh.position.set(x, 0, HALL - 24); sh.rotation.y = PI; scene.add(sh);
    }
    // 화분
    const pot = mat('#6b4a32'), leaf = mat('#2f5a34', { roughness: .9 });
    [[-800, -800], [800, -800], [-800, 800], [800, 800], [-820, 0], [820, 0]].forEach(([x, z]) => {
      const g = new T.Group(); const p = new T.Mesh(new T.CylinderGeometry(22, 16, 40, 16), pot); p.position.y = 20; g.add(p);
      for (let k = 0; k < 7; k++) { const s = new T.Mesh(new T.SphereGeometry(26 - k * 2, 12, 10), leaf); s.position.set(Math.sin(k * 2.3) * 14, 60 + k * 16, Math.cos(k * 2.3) * 14); g.add(s); }
      g.position.set(x, 0, z); scene.add(g);
    });
    // 등: 가운데 테이블 위 큰 등 + 구석의 따뜻한 빛
    this.pendant(0, 0, 1.25);
    // 예전 감쇠((1-d/900)²)에 가깝게: 물리 감쇠(1/d²)로 바꾸고 세기를 d≈500에서 맞춘다
    [[-600, -600], [600, 600], [600, -600], [-600, 600]].forEach(([x, z]) => { const l = new T.PointLight(lin('#ffb36b'), .35 * PI * 61000, 900, 2); l.position.set(x, 300, z); scene.add(l); });
  }
  private pendant(x: number, z: number, s = 1, col = '#e8b84a'): THREE.Group {
    const g = new T.Group(); const cord = new T.Mesh(new T.CylinderGeometry(.6, .6, 150, 6), mat('#111')); cord.position.y = 345; g.add(cord);
    const shade = new T.Mesh(new T.ConeGeometry(30 * s, 24 * s, 32, 1, true), new T.MeshStandardMaterial({ color: new T.Color('#2e3a2c'), side: T.DoubleSide, roughness: .5, metalness: .3 })); shade.position.y = 270; g.add(shade);
    const bulb = new T.Mesh(new T.SphereGeometry(7 * s, 16, 12), new T.MeshBasicMaterial({ color: new T.Color('#ffe2a8') })); bulb.position.y = 262; g.add(bulb);
    const ring = new T.Mesh(new T.TorusGeometry(30 * s, 1.2, 6, 32), new T.MeshBasicMaterial({ color: new T.Color(col) })); ring.rotation.x = PI / 2; ring.position.y = 258; g.add(ring);
    g.position.set(x, 0, z); this.scene.add(g); return g;
  }

  /* ================= 미니게임 테이블 (게임마다 따로) ================= */
  private buildStations(): void {
    ST_IDS.forEach(id => {
      const f = stFrame(id), st = STYLE[id]; const g = new T.Group(); g.position.set(f.x, 0, f.z); g.rotation.y = f.ry;
      const wood = mat(st.wood, { roughness: .5 }), felt = mat(st.felt, { roughness: .95 });
      let top: THREE.Mesh, fl: THREE.Mesh;
      if (st.shape === 'round' || st.shape === 'octa') { const seg = st.shape === 'octa' ? 8 : 56; top = new T.Mesh(new T.CylinderGeometry(52, 51, 4, seg), wood); fl = new T.Mesh(new T.CylinderGeometry(47, 47, .4, seg), felt); }
      else if (st.shape === 'square') { top = new T.Mesh(new T.BoxGeometry(104, 4, 104), wood); fl = new T.Mesh(new T.BoxGeometry(94, .4, 94), felt); }
      else { top = new T.Mesh(new T.BoxGeometry(150, 4, 96), wood); fl = new T.Mesh(new T.BoxGeometry(140, .4, 86), felt); }
      top.position.y = TY - 2; fl.position.y = TY + .1; top.castShadow = fl.receiveShadow = top.receiveShadow = true;
      const leg = new T.Mesh(new T.CylinderGeometry(7, 10, TY - 4, 16), wood); leg.position.y = (TY - 4) / 2;
      const rug = new T.Mesh(new T.CircleGeometry(120, 48), mat(st.felt, { roughness: 1 })); rug.rotation.x = -PI / 2; rug.position.y = .3; rug.receiveShadow = true;
      const props = new T.Group();
      // 미니게임 이름 간판(테이블 뒤 받침대)
      const look = mgLook(id);
      const sign = new T.Mesh(new T.PlaneGeometry(70, 18), new T.MeshBasicMaterial({
        map: ctex('sign' + id, 512, 132, (gg, w, h) => { gg.fillStyle = look[1]; rr(gg, 0, 0, w, h, 30); gg.fill(); gg.fillStyle = '#fbf8f0'; gg.font = `76px ${FONT_D}`; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(MG[id] ? MG[id].name : id, w / 2, h / 2 + 4); }), transparent: true,
      }));
      sign.position.set(0, 172, 96); sign.rotation.y = PI;
      g.add(rug, top, fl, leg, props, sign); this.scene.add(g); this.stations.set(id, { g, props, parts: {}, lamp: this.pendant(f.x, f.z, .8, look[0]) });
    });
  }
  private stationSeat(id: MgId, i: number): THREE.Vector3 {
    const S = this.ctx.S()!; const n = S.seats.length, v = this.ctx.viewSeat(); const r = (i - v + n) % n; const phi = PI + r * 2 * PI / n; const d = 78;
    return stLocal(id, Math.sin(phi) * d, 0, Math.cos(phi) * d);
  }
  private stationShot(id: MgId): void {
    // 미니게임은 모두 테이블을 위에서 내려다보는 시점(탑뷰)으로. 아래 조작판에 가리지 않게 테이블을 화면 위쪽으로 조금 올린다
    // (똑바로 위에서 보면 화면의 위아래 방향이 정해지지 않으니 아주 살짝만 기울인다)
    const h = this.W / this.H < 1.1 ? 205 : 140;
    this.SHOTS.station = { p: stLocal(id, 0, TY + h, -22), l: stLocal(id, 0, TY, -16), fov: 50 };
    this.mgSpot.position.copy(stLocal(id, 0, 320, -40)); this.mgSpot.target.position.copy(stLocal(id, 0, TY, 0)); this.mgSpot.intensity = 1.1 * PI;
  }

  /* --- 미니게임 소품: 상태(S.mg)를 그대로 그린다 --- */
  private propCard(id: MgId, key: string, c: Card | null, lx: number, ly: number, lz: number, yaw = 0, sc = 1, pick: Pick | null = null, down = false): PoolEntry {
    const p = stLocal(id, lx, TY + .6 + ly, lz); const f = stFrame(id); const w = f.ry + PI + yaw;
    return this.want('m:' + key, () => makeCard(c), p, down ? [PI / 2, 0, -w] : [-PI / 2, 0, w], sc, { lift: 6, pick, from: stLocal(id, 0, TY + 30, 0) });
  }
  private layoutMG(): void {
    const S = this.ctx.S(); if (!S || S.phase !== 'mg' || !S.mg) return;
    const m = S.mg, id = m.id; const st0 = this.stations.get(id); if (!st0) return; const P = st0.parts;
    if (m.id === 'balloon') {
      if (!P.bal) {
        const b = new T.Mesh(new T.SphereGeometry(10, 32, 24), new T.MeshStandardMaterial({ color: lin('#e8853a'), roughness: .35 })); b.castShadow = true;
        const knot = new T.Mesh(new T.ConeGeometry(1.6, 3, 12), b.material); knot.position.y = -10.5; knot.rotation.x = PI; b.add(knot);
        const str = new T.Mesh(new T.CylinderGeometry(.15, .15, 40, 4), mat('#d8cfc0')); st0.props.add(b, str); P.bal = b; P.str = str;
      }
      const r = Math.min(1, m.total / BLIMIT); const s = .8 + r * 2.1; P.bal.userData.ts = s; P.bal.material.color.copy(hsl(130 - 130 * r, .7, .52));
      P.bal.position.set(0, TY + 40 + s * 10, 0); P.str.position.set(0, TY + 20 + s * 2, 0); P.str.scale.y = (s * 10) / 40 + .3;
      m.pile.slice(-6).forEach((c, k) => this.propCard(id, 'bp' + c, c, (k - 2.5) * 2.2, k * .03, -14 + ((k * 13) % 5), ((k * 37) % 11 - 5) * .08));
    }
    if (m.id === 'hold') {
      if (!P.tray) {
        const tr = new T.Mesh(new T.BoxGeometry(40, 3, 28), mat('#1d3a2a')); tr.position.y = TY + 1.5; const rim = new T.Mesh(new T.BoxGeometry(42, 5, 30), mat('#2a1a12')); rim.position.y = TY + 1; st0.props.add(rim, tr);
        const d1 = makeDie(); d1.scale.setScalar(2.4); const d2 = makeDie(); d2.scale.setScalar(2.4); st0.props.add(d1, d2); P.d1 = d1; P.d2 = d2; P.tray = tr;
      }
      const L = m.last; P.d1.position.set(L && L.b != null ? -7 : 0, TY + 6.2, 0); P.d1.rotation.set(...dieEuler(L ? L.a : 1));
      P.d2.visible = !!(L && L.b != null); if (L && L.b != null) { P.d2.position.set(7, TY + 6.2, 0); P.d2.rotation.set(...dieEuler(L.b)); }
    }
    if (m.id === 'bomb') {
      m.lay.forEach((c, k) => { if (!c) return; const n = m.lay.length; const a = (k - (n - 1) / 2) * .32; this.propCard(id, 'bl' + k + '_' + c, null, Math.sin(a) * 26, 0, -Math.cos(a) * 6 + 10, a, 1.3, { kind: 'bomb', k }, true); });
      Object.keys(m.flip).forEach(j => {
        const sp = this.stationSeat(id, +j); const v = sp.clone().sub(stLocal(id, 0, 0, 0)).multiplyScalar(.55); const p = stLocal(id, 0, 0, 0).add(v); const fc = m.flip[+j].c;
        this.want('m:bf' + fc, () => makeCard(fc), V(p.x, TY + .6, p.z), [-PI / 2, 0, Math.atan2(v.x, v.z) + PI], 1.4, { lift: 8 });
      });
    }
    if (m.id === 'auction') {
      m.pot.forEach((p, k) => this.propCard(id, 'ap' + p.c, p.c, (k - (m.pot.length - 1) / 2) * 9, 0, 0, 0, 1.5));
      m.prizes.forEach((p, k) => { if (!p) return; this.propCard(id, 'aq' + p.c, p.up ? p.c : null, (k - 2) * 8.5, 0, 26, 0, 1.1, null, !p.up); });
      Object.keys(m.won).forEach(j => m.won[+j].forEach((c, k) => {
        const sp = this.stationSeat(id, +j); const v = sp.clone().sub(stLocal(id, 0, 0, 0)).multiplyScalar(.6); const p = stLocal(id, 0, 0, 0).add(v);
        this.want('m:aw' + c, () => makeCard(c), V(p.x + k * 1.5, TY + .6 + k * .05, p.z), [-PI / 2, 0, Math.atan2(v.x, v.z) + PI], .9, { lift: 8 });
      }));
    }
    if (m.id === 'vault') {
      if (!P.doors) {
        P.doors = [1, 2, 3].map(z => {
          const g = new T.Group(); const bx = new T.Mesh(new T.BoxGeometry(22, 30, 16), mat('#4a5260', { roughness: .35, metalness: .6 })); bx.position.y = 15; bx.castShadow = true;
          const face = new T.Mesh(new T.PlaneGeometry(18, 26), new T.MeshStandardMaterial({
            map: ctex('vd' + z, 128, 180, (gg, w, h) => { gg.fillStyle = '#6b7584'; gg.fillRect(0, 0, w, h); gg.strokeStyle = '#2a2f37'; gg.lineWidth = 6; gg.strokeRect(8, 8, w - 16, h - 16); gg.beginPath(); gg.arc(w / 2, h * .62, 30, 0, 7); gg.stroke(); gg.fillStyle = '#e8b84a'; gg.font = `64px ${FONT_D}`; gg.textAlign = 'center'; gg.fillText(String(z), w / 2, 64); }), roughness: .4, metalness: .4,
          }));
          face.position.set(0, 15, -8.1); face.rotation.y = PI; const lamp = new T.Mesh(new T.SphereGeometry(2.2, 12, 8), new T.MeshBasicMaterial({ color: lin('#3a1010') })); lamp.position.set(0, 33, -2);
          g.add(bx, face, lamp); g.userData.lamp = lamp; g.position.set((2 - z) * 30, TY, 8); st0.props.add(g); this.setPick(bx, { kind: 'door', z }); return g;
        });
      }
      const hit = (m.last as { zones?: number[] } | null)?.zones || [];
      P.doors.forEach((d: THREE.Group, k: number) => { (d.userData.lamp.material as THREE.MeshBasicMaterial).color.copy(lin(hit.includes(k + 1) ? '#ff4d4d' : '#3a1010')); });
    }
    if (m.id === 'count') {
      // 위에서 내려다보므로 넘기는 카드는 테이블 가운데에 크게 눕힌다(12장을 한 장씩 같은 자리에)
      if (!P.stand) { const c = makeCard(null); c.scale.setScalar(3); c.rotation.set(-PI / 2, 0, PI); c.position.set(0, TY + .6, -4); st0.props.add(c); P.stand = c; P.card = c; }
      // 12장을 다 넘긴 뒤 뒤집는 정답 문양 카드는 옆에 따로 놓아, 세는 카드와 헷갈리지 않게
      if (now() >= countOpenAt(m) && m.dec) this.propCard(id, 'cdec' + m.dec, m.dec, 34, 0, -4, 0, 2.2);
    }
    if (m.id === 'curling') {
      if (!P.cboard) {
        const { W, L } = CURL;
        const bd = new T.Mesh(new T.BoxGeometry(W * CS, 1.2, L * CS), [mat('#3a2a1c'), mat('#3a2a1c'), new T.MeshStandardMaterial({
          map: ctex('curlboard', 170, 300, (gg, w, h) => {
            [['#e9dfc8', '1'], ['#e2d3b2', '2'], ['#d9c596', '3']].forEach(([c, z], k) => { gg.fillStyle = c; gg.fillRect(0, h - (k + 1) * 100, w, 100); gg.fillStyle = 'rgba(80,60,30,.35)'; gg.font = `64px ${FONT_D}`; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(z, w / 2, h - k * 100 - 50); });
            gg.fillStyle = 'rgba(80,60,30,.5)'; gg.fillRect(0, 99, w, 2); gg.fillRect(0, 199, w, 2);
          }), roughness: .35,
        }), mat('#3a2a1c'), mat('#3a2a1c'), mat('#3a2a1c')]);
        // 텍스처의 위쪽(3번 구역)이 판 끝(+z)으로 오게
        bd.position.set(0, TY + .6, 0); bd.rotation.y = PI; bd.receiveShadow = true; st0.props.add(bd); P.cboard = bd;
        const wall = new T.Mesh(new T.BoxGeometry(W * CS + 8, 14, 4), mat('#6b4a2a', { roughness: .6 })); wall.position.set(0, TY + 7, L / 2 * CS + 2); wall.castShadow = true; st0.props.add(wall); P.cwall = wall;
        P.cstones = new Map<string, THREE.Mesh>();
      }
      P.cwall.visible = !m.noWall;
      P.cm = m;
    }
    if (m.id === 'line') {
      m.pile.slice(-5).forEach((c, k) => this.propCard(id, 'lp' + c, c, (k - 2) * 1.2, k * .05, -2 + ((k * 13) % 4), ((k * 37) % 11 - 5) * .08, 1.6));
      m.ord.forEach(j => m.won[j].forEach((c, k) => {
        const sp = this.stationSeat(id, j); const v = sp.clone().sub(stLocal(id, 0, 0, 0)).multiplyScalar(.6); const p = stLocal(id, 0, 0, 0).add(v);
        this.want('m:lw' + c, () => makeCard(c), V(p.x + k * 1.5, TY + .6 + k * .05, p.z), [-PI / 2, 0, Math.atan2(v.x, v.z) + PI], .9, { lift: 8 });
      }));
    }
    if (m.id === 'speed') {
      m.piles.forEach((p, k) => { const c = p[p.length - 1]; this.propCard(id, 'sp' + k + '_' + c, c, (k - (m.piles.length - 1) / 2) * 13, 0, 0, 0, 1.5); });
      m.ord.forEach(j => m.won[j].forEach((c, k) => {
        const sp = this.stationSeat(id, j); const v = sp.clone().sub(stLocal(id, 0, 0, 0)).multiplyScalar(.62); const p = stLocal(id, 0, 0, 0).add(v);
        this.want('m:sw' + c, () => makeCard(null), V(p.x + k * 1.2, TY + .6 + k * .05, p.z), [PI / 2, 0, -(Math.atan2(v.x, v.z) + PI)], .8, { lift: 8 });
      }));
    }
    if (m.id === 'mid') {
      if (m.deckCard) this.propCard(id, 'md' + m.deckCard, m.deckCard, 0, 0, 22, 0, 1.4);
      // 직전 판에 낸 카드: 크기 순으로 한 줄
      const L = m.last; if (L) {
        const cs = Object.values(L.picks).concat(L.deckCard ? [L.deckCard] : []).sort((a, b) => R(a) - R(b));
        cs.forEach((c, k) => this.propCard(id, 'ml' + c, c, (k - (cs.length - 1) / 2) * 9, 0, -6, 0, 1.3));
      }
    }
    if (m.id === 'updown' && m.last) {
      // 직전 판에 쥐었던 동전: 각자 앞에
      if (!P.coinGeo) { P.coinGeo = new T.CylinderGeometry(2.2, 2.2, .5, 24); P.coinMat = mat('#d9b24a', { roughness: .35, metalness: .7 }); }
      while (P.coins?.children.length) P.coins.remove(P.coins.children[0]);
      if (!P.coins) { P.coins = new T.Group(); st0.props.add(P.coins); }
      Object.keys(m.last.grip).forEach(j => {
        const sp = this.stationSeat(id, +j); const v = sp.clone().sub(stLocal(id, 0, 0, 0)).multiplyScalar(.55); const p = stLocal(id, 0, 0, 0).add(v);
        for (let k = 0; k < m.last!.grip[+j]; k++) { const c = new T.Mesh(P.coinGeo, P.coinMat); c.position.set(p.x + (k % 2) * 5, TY + .9 + Math.floor(k / 2) * .6, p.z); c.castShadow = true; P.coins.add(c); }
      });
    }
    if (m.id === 'race') {
      if (!P.board) {
        const bd = new T.Mesh(new T.PlaneGeometry(120, 70), new T.MeshStandardMaterial({
          map: ctex('raceboard', 640, 380, (gg, w, h) => {
            gg.fillStyle = '#f3ecdc'; gg.fillRect(0, 0, w, h); const lw = (w - 120) / 5;
            ['밖', '1', '2', '3', '결승'].forEach((t, c) => { gg.fillStyle = c === 4 ? '#f2d27a' : c === 0 ? '#ddd3c0' : '#e8dfcc'; gg.fillRect(100 + c * lw, 12, lw - 6, h - 24); gg.fillStyle = '#8a7f6a'; gg.font = `28px ${FONT_D}`; gg.textAlign = 'center'; gg.fillText(t, 100 + c * lw + lw / 2, h - 24); });
            SUITS.forEach((s, k) => { gg.fillStyle = INKC[s]; gg.font = `56px ${FONT_D}`; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText(SYM[s], 50, 40 + k * 80); });
          }), roughness: .8,
        }));
        bd.rotation.x = -PI / 2; bd.rotation.z = PI; bd.position.y = TY + .4; st0.props.add(bd); P.board = bd; P.horse = {};
        SUITS.forEach(s => { const h = new T.Mesh(new T.CylinderGeometry(3.4, 3.8, 6, 20), mat(SUITCOL[s], { roughness: .4 })); h.castShadow = true; st0.props.add(h); P.horse[s] = h; });
      }
      SUITS.forEach((s, k) => { const h = P.horse[s]; h.userData.tp = V(-((100 + m.pos[s] * 104 + 52) * .1875 - 60), TY + 3.4, 35 - (40 + k * 80) * 70 / 380); });
      m.pile.slice(-1).forEach(c => this.propCard(id, 'rp' + c, c, -66, 0, -22, 0, 1.3));
    }
  }
  private tickMG(dt: number, t: number): void {
    const S = this.ctx.S(); if (!S || S.phase !== 'mg' || !S.mg) return; const m = S.mg; const st0 = this.stations.get(m.id); if (!st0) return;
    const P = st0.parts; const a = 1 - Math.exp(-dt * 6);
    if (m.id === 'curling' && P.cstones) {
      // 직전 샷이 굴러가는 중이면 그 프레임, 아니면 상태의 말 위치
      let list: { seat: number; x: number; y: number; out?: boolean }[] = m.stones;
      const fr = m.si > 0 || m.step === 'score' ? curlFrames(m) : null; const key = m.last ? `${m.end}:${m.last.n}` : '';
      if (fr && key) {
        if (P.animKey !== key) { P.animKey = key; P.animT0 = performance.now(); }
        const el = (performance.now() - P.animT0) / 1000;
        if (el < fr.secs) { const f = fr.frames.find(x => x.t >= el) || fr.frames[fr.frames.length - 1]; list = f.st; }
      }
      const used = new Set<string>(); const cnt: Record<number, number> = {};
      list.forEach(s => {
        if (s.out) return; cnt[s.seat] = (cnt[s.seat] || 0) + 1; const k = s.seat + ':' + cnt[s.seat]; used.add(k);
        let mesh = P.cstones.get(k) as THREE.Mesh | undefined;
        if (!mesh) { mesh = new T.Mesh(new T.CylinderGeometry(CURL.R * CS, CURL.R * CS * 1.05, 2.4 * CS / 2, 28), mat(SEATCOL[s.seat % 5], { roughness: .35 })); mesh.castShadow = true; st0.props.add(mesh); P.cstones.set(k, mesh); }
        const [lx, lz] = curlLocal(s.x, s.y); mesh.position.copy(stLocal(m.id, lx, TY + 1.2 + 1.8, lz)); mesh.visible = true;
      });
      for (const [k, mesh] of P.cstones as Map<string, THREE.Mesh>) if (!used.has(k)) mesh.visible = false;
    }
    if (P.bal) { const s = P.bal.scale.x + ((P.bal.userData.ts || 1) - P.bal.scale.x) * a; P.bal.scale.set(s, s * 1.12, s); P.bal.position.x = Math.sin(t * 1.3) * .8; P.bal.rotation.z = Math.sin(t * 1.1) * .05; }
    if (P.horse) for (const s of SUITS) { const h = P.horse[s]; if (h.userData.tp) { h.position.lerp(h.userData.tp, a); h.position.y = h.userData.tp.y + Math.max(0, Math.sin(t * 6 + SUITS.indexOf(s))) * .6; } }
    if (P.card && m.id === 'count') {
      const nw = now(); let c: Card | null = null;
      // 넘기는 동안은 12장 중 지금 장, 다 넘기면 다시 뒷면(정답 문양 카드는 옆에 따로 나온다)
      if (nw >= m.t0 && nw < countOpenAt(m)) { const k = Math.floor((nw - m.t0) / CFLIP); c = m.seq![Math.min(k, m.seq!.length - 1)]; }
      if (P.card.userData.cur !== c) { P.card.userData.cur = c; const f = P.card.children[0] as THREE.Mesh; f.material = new T.MeshStandardMaterial({ map: c ? faceTex(c) : backTex(), roughness: .6 }); P.card.scale.x = .3; }
      P.card.scale.x += (3 - P.card.scale.x) * Math.min(1, dt * 12); // 넘길 때 휙 뒤집히는 느낌
      // 정답 문양 카드는 시간이 되면 나온다(상태가 바뀌지 않으므로 그때 한 번 다시 배치)
      if (nw >= countOpenAt(m) && P.decAt !== m.dec) { P.decAt = m.dec; this.layout(); }
    }
  }
  private clearMG(): void {
    for (const [, st] of this.stations) { while (st.props.children.length) st.props.remove(st.props.children[0]); for (const k in st.parts) delete st.parts[k]; }
  }

  /* ---------------- 모니터 (플로피 드라이브 일체형) ---------------- */
  private buildMonitor(): void {
    const monitor = new T.Group(); const shell = mat('#e6dcc7', { roughness: .55 }), dark = mat('#c9bea7', { roughness: .6 });
    const body = new T.Mesh(new T.BoxGeometry(36, 40, 30), shell); body.position.y = 20; body.castShadow = true; body.receiveShadow = true;
    const bez = new T.Mesh(new T.BoxGeometry(31, 23, 1), dark); bez.position.set(0, 26, 15.2);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 742; this.screenCtx = c.getContext('2d')!;
    this.screenTex = new T.CanvasTexture(c); this.screenTex.colorSpace = T.SRGBColorSpace;
    const scr = new T.Mesh(new T.PlaneGeometry(29, 21), new T.MeshBasicMaterial({ map: this.screenTex })); scr.position.set(0, 26, 15.8);
    const slotPlate = new T.Mesh(new T.BoxGeometry(13, 2.6, .6), dark); slotPlate.position.set(4, 9.5, 15.2);
    const slot = new T.Mesh(new T.BoxGeometry(11, .6, .8), mat('#120f0c')); slot.position.set(4, 9.8, 15.3);
    const led1 = new T.Mesh(new T.SphereGeometry(.45, 8, 6), new T.MeshBasicMaterial({ color: lin('#5bd47a') })); led1.position.set(-13, 9.6, 15.4);
    const led2 = led1.clone(); led2.material = new T.MeshBasicMaterial({ color: lin('#e8b84a') }); led2.position.x = -11.6;
    const logo = new T.Mesh(new T.PlaneGeometry(10, 1.6), new T.MeshBasicMaterial({ map: ctex('logo', 256, 40, (g, w, h) => { g.fillStyle = '#e6dcc7'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a7f6a'; g.font = `34px ${FONT_M}`; g.textBaseline = 'middle'; g.fillText('CUBIC·VISION', 4, 22); }) }));
    logo.position.set(-9, 12.4, 15.55);
    const foot = new T.Mesh(new T.BoxGeometry(30, 2, 26), dark); foot.position.y = 1;
    monitor.add(body, bez, scr, slotPlate, slot, led1, led2, logo, foot); monitor.position.set(MON.x, TY - 46, MON.z); monitor.visible = false; this.scene.add(monitor);
    monitor.userData = { ty: TY - 46 }; this.monitor = monitor; this.drawScreen();
  }
  private monitorUp(up: boolean): void { this.monitor.userData.ty = up ? TY : TY - 46; if (up) this.monitor.visible = true; }
  private slotW(): THREE.Vector3 { return V(MON.x + 4, TY + 9.8, MON.z + 15.6); }
  private drawScreen(): void {
    const g = this.screenCtx, w = 1024, h = 742, st = this.screenState;
    const bg = g.createRadialGradient(w / 2, h * .42, 40, w / 2, h * .45, w * .7); bg.addColorStop(0, '#1d3550'); bg.addColorStop(1, '#0c1622'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (st.mode === 'off') { g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h); }
    if (st.mode === 'insert') { g.fillStyle = '#7fe3ff'; g.shadowColor = 'rgba(127,227,255,.8)'; g.shadowBlur = 18; g.font = `120px ${FONT_M}`; g.fillText('INSERT DISK', w / 2, h * .43); g.shadowBlur = 0; g.fillStyle = 'rgba(200,235,255,.75)'; g.font = `44px ${FONT_B}`; g.fillText('디스크를 넣어 주세요', w / 2, h * .62); }
    if (st.mode === 'loading') {
      g.fillStyle = '#7fe3ff'; g.shadowColor = 'rgba(127,227,255,.8)'; g.shadowBlur = 16; g.font = `86px ${FONT_M}`; g.fillText('NOW LOADING', w / 2, h * .22);
      g.shadowColor = 'rgba(255,179,92,.8)'; g.shadowBlur = 30; g.fillStyle = '#fff'; const nm = st.name || ''; g.font = `${nm.length > 5 ? 130 : 160}px ${FONT_D}`; g.fillText(nm, w / 2, h * .5); g.shadowBlur = 0;
      g.strokeStyle = 'rgba(127,227,255,.6)'; g.lineWidth = 5; rr(g, w / 2 - 300, h * .74, 600, 34, 17); g.stroke(); g.fillStyle = '#7fe3ff'; rr(g, w / 2 - 300, h * .74, 600 * Math.min(1, st.p || 0), 34, 17); g.fill();
    }
    if (st.mode === 'alert') {
      g.strokeStyle = '#ff4d4d'; g.lineWidth = 22; g.shadowColor = 'rgba(255,77,77,.8)'; g.shadowBlur = 30; rr(g, 140, 110, w - 280, h - 220, 70); g.stroke();
      const cx = w / 2, cy = h / 2; g.lineWidth = 18; g.beginPath(); g.moveTo(cx - 110, cy - 120); g.lineTo(cx + 80, cy - 120); g.lineTo(cx + 110, cy - 90); g.lineTo(cx + 110, cy + 120); g.lineTo(cx - 110, cy + 120); g.closePath(); g.stroke();
      g.strokeRect(cx - 60, cy - 120, 110, 70); g.strokeRect(cx - 75, cy + 5, 150, 95); g.lineWidth = 34; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 150, cy - 150); g.lineTo(cx + 150, cy + 150); g.moveTo(cx + 150, cy - 150); g.lineTo(cx - 150, cy + 150); g.stroke(); g.shadowBlur = 0;
    }
    if (st.mode === 'title') { g.shadowColor = 'rgba(255,179,92,.8)'; g.shadowBlur = 30; g.fillStyle = '#fff'; g.font = `150px ${FONT_D}`; g.fillText(st.name || '', w / 2, h * .48); g.shadowBlur = 0; }
    for (let y = 0; y < h; y += 5) { g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(0, y, w, 2); }
    this.screenTex.needsUpdate = true;
  }
  setScreen(s: { mode: string; name?: string; p?: number }): void { this.screenState = s; this.drawScreen(); }

  /* ---------------- 디스크 상자 ---------------- */
  private buildBox(): void {
    const dbox = new T.Group(); const pl = mat('#2a2f37', { roughness: .4 });
    const base = new T.Mesh(new T.BoxGeometry(14, 7, 22), pl); base.position.y = 3.5; base.castShadow = true;
    const front = new T.Mesh(new T.PlaneGeometry(13.6, 6), new T.MeshBasicMaterial({ map: ctex('boxlbl', 256, 112, (g, w) => { g.fillStyle = '#2a2f37'; g.fillRect(0, 0, w, 112); g.fillStyle = '#9fb0c4'; g.font = `40px ${FONT_M}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MINIGAME', w / 2, 38); g.fillText('DISKS', w / 2, 78); }) }));
    front.position.set(7.05, 3.5, 0); front.rotation.y = PI / 2;
    const lid = new T.Mesh(new T.BoxGeometry(14, .4, 22), new T.MeshStandardMaterial({ color: new T.Color('#bcd4ee'), transparent: true, opacity: .22, roughness: .1 })); lid.position.set(-7, 13, 0); lid.rotation.z = 1.25;
    const ids = Object.keys(MG) as MgId[];
    for (let k = 0; k < 12; k++) { const id = ids[k % ids.length]; const f = new T.Mesh(new T.BoxGeometry(9, 9.4, .34), mat(mgLook(id)[1])); f.position.set(0, 7 + ((k * 7) % 3) * .4, -9 + k * 1.6); dbox.add(f); } // 상자 안에 세워 꽂은 디스크: 넓은 면이 상자 앞뒤(z)를 보고 줄지어 선다
    dbox.add(base, front, lid); dbox.position.set(BOX.x, TY - 30, BOX.z); dbox.rotation.y = -0.35; dbox.visible = false; dbox.userData = { ty: TY - 30 }; this.scene.add(dbox); this.dbox = dbox;
  }
  private boxUp(up: boolean): void { this.dbox.userData.ty = up ? TY : TY - 30; if (up) this.dbox.visible = true; }

  /* ---------------- 미니게임 주사위 ---------------- */
  private buildDie(): void {
    this.die = makeDie(); this.die.position.set(DIE.x, TY - 10, DIE.z); this.die.visible = false; this.scene.add(this.die); this.setPick(this.die, { kind: 'die' });
    // 손가락으로도 누르기 쉽게 주사위보다 넉넉한 보이지 않는 누르기 상자
    this.die.add(new T.Mesh(new T.BoxGeometry(8, 8, 8), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })));
    // 굴릴 수 있을 때 주사위 아래 테이블에 두르는 금빛 테두리
    this.dieFrame = hiFrame(4.2, 4.2, 1.2, true); this.dieFrame.position.set(DIE.x, TY + .12, DIE.z); this.scene.add(this.dieFrame);
  }

  /* ---------------- 풀: 키로 관리하고 목표로 미끄러진다 ---------------- */
  private want(key: string, make: () => THREE.Object3D, pos: THREE.Vector3, euler: E3, scale = 1, opt: WantOpt = {}): PoolEntry {
    let e = this.pool.get(key);
    if (!e) {
      const obj = make(); obj.position.copy(opt.from || pos);
      if (opt.fromEuler) obj.rotation.set(...opt.fromEuler); else obj.rotation.set(...euler);
      obj.scale.setScalar(opt.fromScale != null ? opt.fromScale : scale);
      this.scene.add(obj); e = { obj, tp: new T.Vector3(), tq: new T.Quaternion(), ts: 1, speed: 8, lift: 0, alive: true }; this.pool.set(key, e);
    }
    e.tp.copy(pos); e.tq.setFromEuler(new T.Euler(...euler)); e.ts = scale; e.alive = true; e.dying = false; e.speed = opt.speed || 8; e.lift = opt.lift || 0; e.obj.visible = true;
    if (opt.pick) this.setPick(e.obj, opt.pick); else this.clearPick(e.obj);
    return e;
  }
  private sweep(): void { for (const [, e] of this.pool) { if (!e.alive && !e.dying) { e.dying = true; e.ts = 0.001; } e.alive = false; } }
  private setPick(o: THREE.Object3D, data: Pick): void { o.userData.pick = data; this.picks.add(o); }
  private clearPick(o: THREE.Object3D): void { if (o.userData.pick) { delete o.userData.pick; this.picks.delete(o); } }
  private stepPool(dt: number): void {
    for (const [k, e] of this.pool) {
      const a = fast() ? 1 : 1 - Math.exp(-dt * e.speed);
      const tp = e.tp.clone(); if (!fast() && e.lift && e.obj.position.distanceTo(e.tp) > 1.2) tp.y += e.lift * Math.min(1, e.obj.position.distanceTo(e.tp) / 20);
      e.obj.position.lerp(tp, a); e.obj.quaternion.slerp(e.tq, a); const s = e.obj.scale.x + (e.ts - e.obj.scale.x) * a; e.obj.scale.setScalar(s);
      if (e.dying && s < 0.02) { this.scene.remove(e.obj); this.clearPick(e.obj); this.pool.delete(k); }
    }
  }

  /* ---------------- 자리 ---------------- */
  private seatPos(i: number) { const S = this.ctx.S()!; const n = S.seats.length, v = this.ctx.viewSeat(); const r = (i - v + n) % n; const phi = r * 2 * PI / n; return { phi, x: Math.sin(phi) * SEAT_D, z: Math.cos(phi) * SEAT_D }; }
  private buildSeats(): void {
    const S = this.ctx.S()!; const vs = this.ctx.viewSeat();
    const key = S.seats.length + ':' + vs + ':' + S.seats.map(p => p.uid).join(','); if (key === this.seatKey) return; this.seatKey = key;
    this.clearSeats();
    S.seats.forEach((_, i) => {
      if (i === vs) return; const a = buildAvatar(SEATCOL[i % 5], HAIRS[i % 5]); const sp = this.seatPos(i); a.position.set(sp.x, 0, sp.z); a.lookAt(0, 0, 0);
      a.traverse(o => { if ((o as THREE.Mesh).isMesh) this.setPick(o, { kind: 'seat', i }); }); this.scene.add(a); this.avatars.set(i, a);
    });
  }
  private clearSeats(): void {
    for (const g of [...this.avatars.values(), ...this.chairs.values()]) { g.traverse(o => this.clearPick(o)); this.scene.remove(g); }
    this.avatars.clear(); this.chairs.clear();
  }
  /** 대기실: 테이블 건너편 반원에 의자 5개를 늘 둔다(반원을 5등분한 칸의 가운데, 왼쪽부터 의자 0~4).
      카메라는 테이블 이쪽에 고정되어 앉은 사람들의 얼굴이 모두 보인다(나도). 앉은 사람은 아바타로, 빈 의자는 눌러서 앉거나 옮겨 앉는다.
      게임을 시작하면 buildSeats가 인원수에 맞게 테이블 둘레에 고르게 다시 앉힌다 */
  private chairSpot(c: number) {
    const th = PI - (c + .5) * PI / MAX_SEATS; // 162° · 126° · 90° · 54° · 18°
    return { x: Math.cos(th) * SEAT_D, z: -Math.sin(th) * SEAT_D };
  }
  private buildLobby(): void {
    const S = this.ctx.S()!; const me = this.ctx.seated() ? this.ctx.viewSeat() : -1;
    const key = 'L' + me + ':' + S.seats.map((p, k) => p.uid + '@' + chairOf(S, k)).join(','); if (key === this.seatKey) return; this.seatKey = key;
    this.clearSeats();
    const taken = new Map<number, number>(); S.seats.forEach((_, k) => taken.set(chairOf(S, k), k));
    for (let c = 0; c < MAX_SEATS; c++) {
      const { x, z } = this.chairSpot(c);
      const k = taken.get(c);
      if (k != null) {
        const a = buildAvatar(SEATCOL[k % 5], HAIRS[k % 5]); a.position.set(x, 0, z); a.lookAt(0, 0, 0);
        // 내 자리는 바닥에 금색 고리
        if (k === me) (a.userData as AvatarData).ring.material.opacity = .85;
        a.traverse(o => { if ((o as THREE.Mesh).isMesh) this.setPick(o, { kind: 'seat', i: k }); }); this.scene.add(a); this.avatars.set(k, a);
      } else {
        const ch = buildChair(); ch.position.set(x, 0, z); ch.lookAt(0, 0, 0);
        ch.traverse(o => { if ((o as THREE.Mesh).isMesh) this.setPick(o, { kind: 'chair', c }); }); this.scene.add(ch); this.chairs.set(c, ch);
      }
    }
  }
  private lastSeatPos() { const S = this.ctx.S(); if (this.lastActorSeat == null || !S?.seats[this.lastActorSeat]) return null; return this.seatPos(this.lastActorSeat); }

  /* ---------------- 배치 (상태 → 목표) ---------------- */
  private layout(): void {
    const S = this.ctx.S(); if (!S || !S.seats) return;
    const phase = S.phase; const vs = this.ctx.viewSeat();
    if (phase === 'lobby') { this.sweep(); return; }
    // 덱
    const dn = S.deck ? S.deck.length : 0;
    this.want('deck', () => {
      const g = new T.Group(); const side = mat('#e8dfcf');
      const box = new T.Mesh(new T.BoxGeometry(CARD_W, 1, CARD_H), [side, side, new T.MeshStandardMaterial({ map: backTex() }), side, side, side]); box.castShadow = true; g.add(box); g.userData.box = box;
      // 누를 수 있을 때 두르는 테두리, 그리고 손가락으로도 누르기 쉽게 덱보다 넉넉한 보이지 않는 누르기 판
      const fr = hiFrame(CARD_W, CARD_H, 1.1, true); fr.position.y = .08; g.add(fr); g.userData.frame = fr;
      // 맨 위 카드 한 장: 마우스를 올리면 이 한 장만 들린다(덱과 테두리는 그대로)
      const top = makeCard(null); top.rotation.x = -PI / 2; g.add(top); g.userData.top = top;
      const hit = new T.Mesh(new T.PlaneGeometry(CARD_W + 8, CARD_H + 8), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })); hit.rotation.x = -PI / 2; hit.position.y = .1; g.add(hit);
      return g;
    }, onTable(-38, -14), [0, .3, 0], 1, { pick: { kind: 'deck' } });
    const de = this.pool.get('deck')!; const hgt = Math.max(.2, dn * .035); de.obj.userData.box.scale.y = hgt; de.obj.userData.box.position.y = hgt / 2;
    de.obj.userData.hgt = hgt; de.obj.userData.top.visible = dn > 0;
    // 버림 줄
    const gather = ['roll', 'clubs', 'mg', 'reward'].includes(phase);
    const row = S.row || []; const sp = Math.min(7.2, 92 / Math.max(1, row.length));
    row.forEach((c, k) => {
      const from = this.lastSeatPos();
      const pos = gather ? onTable(40, -16, k * .04) : onTable((k - (row.length - 1) / 2) * sp, 2, k * .02); const yawr = gather ? .15 + ((k * 37) % 9 - 4) * .02 : 0;
      const e = this.want('c:' + c, () => makeCard(c), pos, [-PI / 2, 0, yawr], 1, { from: from && V(from.x * .6, TY + 30, from.z * .6), lift: 8, pick: !gather ? { kind: 'row', c } : null });
      // 버림 줄 카드도 주울 수 있을 때 테두리(카드는 xy 평면에 그려져 눕혀 있으므로 xy 테두리를 카드 뒤에 붙인다)
      if (!e.obj.userData.frame) { const fr = hiFrame(CARD_W, CARD_H, .9, false); fr.position.z = -.03; e.obj.add(fr); e.obj.userData.frame = fr; }
      e.obj.userData.baseY = pos.y;
    });
    // 자리별 토큰과 앞에 놓인 아이템
    S.seats.forEach((p, i) => {
      const sp_ = this.seatPos(i); const ux = Math.sin(sp_.phi), uz = Math.cos(sp_.phi), tx = Math.cos(sp_.phi), tz = -Math.sin(sp_.phi);
      (p.tokens || []).forEach((t, k) => { const o = (k - (p.tokens.length - 1) / 2) * 3.2; this.want(`t:${i}:${k}`, () => makeCube(t), onTable(ux * 52 + tx * o, uz * 52 + tz * o, 1.1), [0, sp_.phi, 0], 1, { from: onTable(0, 0, 40), lift: 10 }); });
      (p.front || []).forEach((c, k) => {
        const o = (k - (p.front.length - 1) / 2) * 7 + (i === vs ? -18 : 0); const r = i === vs ? 40 : 42;
        this.want('c:' + c, () => makeCard(c), onTable(ux * r + tx * o, uz * r + tz * o, .05 + k * .02), [-PI / 2, 0, sp_.phi + PI], 0.85, { from: onTable(ux * 80, uz * 80, 30), lift: 6 });
      });
      const av = this.avatars.get(i);
      if (av) {
        setFan(av, (p.hand || []).length); const ud = av.userData as AvatarData;
        const inMG = phase === 'mg' && !!S.mg && this.stations.has(S.mg.id); const key = inMG ? S.mg!.id : 'main';
        if (ud.at !== key) { ud.at = key; ud.hop = inMG ? { p: this.stationSeat(S.mg!.id, i), l: stLocal(S.mg!.id, 0, 0, 0) } : { p: V(sp_.x, 0, sp_.z), l: V(0, 0, 0) }; ud.hopT = 0; }
        const act = this.ctx.whoActs() === i; ud.ring.material.opacity = act ? .85 : 0;
      }
    });
    // 보상 진열
    const disp = phase === 'reward' ? (S.reward ? S.reward.disp : []) : (['roll', 'clubs', 'mg'].includes(phase) ? (S.rewardDisp || []) : []);
    const rsp = Math.min(7.4, 104 / Math.max(1, disp.length));
    disp.forEach((c, k) => {
      if (phase === 'roll' && !this.flop.introDone && k >= this.rewardShown) return; // 라운드 시작 연출: 보상을 한 장씩 뽑은 뒤 디스크
      this.want('c:' + c, () => makeCard(c), onTable((k - (disp.length - 1) / 2) * rsp, phase === 'mg' ? -26 : 18, .05), [-PI / 2, 0, 0], phase === 'mg' ? .7 : 1, { from: onTable(-38, -14, 1), lift: 12, pick: phase === 'reward' ? { kind: 'reward', c } : null });
    });
    // 미니게임 디스크
    this.layoutFloppies();
    if (phase === 'mg') this.layoutMG(); else if (this.lastMG) { this.clearMG(); this.lastMG = null; }
    if (phase === 'mg' && S.mg) this.lastMG = S.mg.id;
    // 상자·모니터·주사위
    const drawPhase = phase === 'roll' || phase === 'clubs';
    this.boxUp(drawPhase && !this.flop.boxGone); this.monitorUp(drawPhase);
    // 라운드 시작 연출 중(보상·디스크가 다 나오기 전)에는 주사위를 숨긴다. 나타날 땐 작게 시작해 커진다
    const dieOn = drawPhase && !(phase === 'roll' && !this.flop.introDone);
    if (dieOn && !this.die.visible) this.die.scale.setScalar(.05);
    this.die.visible = dieOn;
    this.hatch.scale.setScalar(drawPhase ? 1 : .001);
    this.sweep();
  }
  private layoutFloppies(): void {
    const S = this.ctx.S()!; const flop = this.flop;
    if (!S.board || !['roll', 'clubs'].includes(S.phase)) { flop.round = null; return; }
    const rk = S.round + '|' + S.board.join(',');
    if (flop.round !== rk) { this.flop = { round: rk, ids: S.board.slice(), mode: {}, chosen: null, introDone: false, boxGone: false, burn: {} }; S.board.forEach((_, k) => { this.flop.mode[k] = 'box'; }); }
    const f = this.flop;
    const bx = V(BOX.x, TY + 6, BOX.z);
    f.ids.forEach((id, k) => {
      const m = f.mode[k]; let pos = bx.clone(); let eu: E3 = [0, 0, 0]; let sc = 1; const opt: WantOpt = { speed: 7 };
      if (m !== 'away' && f.burn[k]) f.burn[k].on = false; // 다시 불러오면 탄 자국만 남는다
      if (m === 'box') { pos = bx.clone().add(V(0, 0, -6 + k * 2)); eu = [PI / 2, -0.35 + PI / 2, 0]; sc = .001; }
      else if (m === 'pop') { pos = V(BOX.x + 6, TY + 26, BOX.z - 6); eu = [-1.1, 0, .4]; sc = 1.2; opt.speed = 9; }
      else if (m === 'slot') { pos = onTable(SLOTX(k), -4, .2); eu = [0, ((k * 53) % 7 - 3) * .03, 0]; } // 바닥과 평행하게, 살짝 돌려 놓는다(고를 수 있는 디스크는 마우스를 올리면 떠오른다: stepBurn)
      else if (m === 'lift') { pos = onTable(SLOTX(k), 2, 18); eu = [.68, 0, 0]; sc = 1.35; opt.speed = 6; } // 고른 디스크: 들어 올려 그림 면을 카메라(우리) 쪽으로 기울인다
      else if (m === 'away') {
        // 고르지 않은 디스크: 제자리에서 타 없어진다(frame에서 태운다)
        pos = onTable(SLOTX(k), -4, .2); eu = [0, ((k * 53) % 7 - 3) * .03, 0];
        const b = f.burn[k] || (f.burn[k] = { n: 0, on: false, t: 0 }); if (!b.on) { b.on = true; b.n++; b.t = 0; }
      }
      else if (m === 'fly') { pos = this.slotW().add(V(0, 0, 6)); eu = [0, 0, 0]; sc = .95; opt.speed = 5; }
      else if (m === 'in') { pos = this.slotW().add(V(0, 0, -4)); eu = [0, 0, 0]; sc = .001; opt.speed = 6; }
      this.want('fl:' + k, () => makeFloppy(id), pos, eu, sc, { ...opt, from: bx.clone().add(V(0, 2, 0)), fromScale: .2, pick: S.phase === 'clubs' && !!S.clubChoose && m !== 'in' ? { kind: 'slot', k: k + 1 } : null });
      this.want('sn:' + k, () => new T.Mesh(new T.CircleGeometry(1.9, 24), new T.MeshBasicMaterial({ map: numTex(k + 1) })), onTable(SLOTX(k), 5.5, .06), [-PI / 2, 0, 0], f.introDone ? 1 : .001);
    });
  }

  /* ---------------- 연출 순서 (비동기, 새 상태가 오면 끊긴다) ---------------- */
  private async step(g: number, ms: number): Promise<void> { await new Promise(r => setTimeout(r, ms)); if (g !== this.gen) throw 'cut'; }
  cut(): void { this.gen++; }
  async playIntro(): Promise<void> {
    const g = ++this.gen;
    try {
      this.flop.introDone = false; this.setScreen({ mode: 'insert' }); this.shot('disks', 1.8);
      // 먼저 이번 라운드 보상을 덱에서 한 장씩 뽑아 늘어놓고, 그다음 디스크 상자를 연다
      const nR = (this.ctx.S()?.rewardDisp || []).length; this.rewardShown = 0; this.layout(); await this.step(g, 600);
      for (let k = 0; k < nR; k++) { this.rewardShown = k + 1; this.layout(); await this.step(g, 230); }
      await this.step(g, 450);
      this.flop.boxGone = false; this.layout(); await this.step(g, 500);
      for (let k = 0; k < this.flop.ids.length; k++) { this.flop.mode[k] = 'pop'; this.layout(); await this.step(g, 260); this.flop.mode[k] = 'slot'; this.layout(); await this.step(g, 180); }
      this.flop.introDone = true; this.layout(); await this.step(g, 400); this.flop.boxGone = true; this.layout();
    } catch (e) { if (e !== 'cut') console.error(e); } finally { this.rewardShown = 99; }
  }
  /** ♣Q·♣K를 쓴 뒤: 디스크 6장을 다시 늘어놓고 위에서 본다(미니게임 선택 화면). 고르면 playChoose가 이어진다 */
  playSelect(): void {
    ++this.gen; this.flop.ids.forEach((_, j) => { this.flop.mode[j] = 'slot'; }); this.flop.chosen = null; this.flop.introDone = true; this.flop.boxGone = true;
    this.setScreen({ mode: 'insert' }); this.layout(); this.shot('disks', 2);
  }
  settleLined(): void { this.flop.introDone = true; this.flop.boxGone = true; this.flop.ids.forEach((_, k) => { this.flop.mode[k] = 'slot'; }); this.layout(); }
  private async rollDie(v: number, g: number): Promise<void> {
    const die = this.die; die.visible = true; const e = dieEuler(v);
    die.position.set(DIE.x - 14, TY + 22, DIE.z + 16);
    const t0 = performance.now();
    while (performance.now() - t0 < 900) {
      const t = (performance.now() - t0) / 900; die.rotation.set(t * 14, t * 9, t * 6);
      die.position.set(DIE.x - 14 + 14 * t, TY + 22 - 20 * t + Math.abs(Math.sin(t * 9)) * 6 * (1 - t), DIE.z + 16 - 16 * t); await this.step(g, 16);
    }
    die.position.set(DIE.x, TY + 1.3, DIE.z); die.rotation.set(...e);
  }
  async playChoose(v: number, opt: { restore?: boolean; roll?: boolean } = {}): Promise<void> {
    const g = ++this.gen;
    try {
      const k = v - 1; if (!this.flop.ids.length) return;
      if (opt.restore) { this.flop.ids.forEach((_, j) => { this.flop.mode[j] = 'slot'; }); this.flop.chosen = null; this.layout(); }
      this.shot('disks', 2); await this.step(g, opt.restore ? 900 : 300);
      if (opt.roll) await this.rollDie(v, g); await this.step(g, 250);
      this.flop.chosen = k; this.flop.mode[k] = 'lift'; this.flop.ids.forEach((_, j) => { if (j !== k) this.flop.mode[j] = 'away'; }); this.layout(); await this.step(g, 1100);
      this.setScreen({ mode: 'insert' }); this.shot('monitor', 1.6); await this.step(g, 700);
      this.flop.mode[k] = 'fly'; this.layout(); await this.step(g, 700); this.flop.mode[k] = 'in'; this.layout(); await this.step(g, 350);
      const name = MG[this.flop.ids[k]].name; for (let p = 0; p <= 1.001; p += .2) { this.setScreen({ mode: 'loading', name, p }); await this.step(g, 110); }
      this.shot('zoom', 2.2); await this.step(g, 900);
      this.ctx.rulesReady();
    } catch (e) { if (e !== 'cut') console.error(e); }
  }
  jumpChosen(v: number): void {
    const k = v - 1; this.flop.chosen = k; this.flop.ids.forEach((_, j) => { this.flop.mode[j] = j === k ? 'in' : 'away'; if (j !== k) this.flop.burn[j] = { n: (this.flop.burn[j]?.n ?? 0) + 1, on: true, t: BURN_T }; }); this.flop.introDone = true; this.flop.boxGone = true;
    if (this.flop.ids[k]) this.setScreen({ mode: 'loading', name: MG[this.flop.ids[k]].name, p: 1 });
    const e = dieEuler(v); this.die.position.set(DIE.x, TY + 1.3, DIE.z); this.die.rotation.set(...e); this.layout();
  }
  alertScreen(): void { this.setScreen({ mode: 'alert' }); }

  /* ---------------- 카메라 ---------------- */
  shot(name: ShotName, speed = 2.6): void { this.camS.shot = name; this.camS.speed = speed; }
  goStation(id: MgId): boolean {
    if (!this.stations.has(id)) return false; this.stationShot(id); this.shot('station', 1.4);
    // 위에서 내려다보는 시점이라 그 테이블 위 전등이 화면을 가린다: 미니게임 중엔 숨긴다(빛은 따로 비추는 조명이 맡는다)
    for (const [k, s] of this.stations) if (s.lamp) s.lamp.visible = k !== id;
    return true;
  }
  /** 꾸미기: 가운데 테이블 천 색 (내 화면에만) */
  setFelt(hex: string): void { this.feltMat?.color.set(hex); }
  lightsMain(): void { if (this.mgSpot) this.mgSpot.intensity = 0; for (const [, s] of this.stations) if (s.lamp) s.lamp.visible = true; }
  resetLook(): void { this.yaw = 0; this.pitch = 0; this.lookT.yaw = 0; this.lookT.pitch = 0; }
  private cursorLook(x: number, y: number): void {
    const nx = x / this.W * 2 - 1, ny = y / this.H * 2 - 1; const dz = (v: number, e: number) => Math.sign(v) * Math.max(0, Math.abs(v) - e) / (1 - e);
    this.lookT.yaw = dz(nx, .72) * 0.75; this.lookT.pitch = ny < 0 ? -dz(ny, .75) * 0.3 : 0;
  }
  private canLock(): boolean { return this.MOUSE_LOOK && !this.lockFailed && !!this.canvas.requestPointerLock; }
  /** FPS 시점: 남의 차례(메인 턴)에만 마우스를 잠근다 */
  setFps(ok: boolean): void {
    this.fpsOK = ok && this.canLock();
    if (!this.fpsOK && this.locked) { this.locked = false; try { document.exitPointerLock(); } catch { /* 이미 풀림 */ } }
    this.ctx.fpsHint(this.fpsOK, this.locked);
  }
  private tryLock(): void {
    if (!this.fpsOK || this.locked) return;
    try { const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined; if (r && r.catch) r.catch(() => { this.lockFailed = true; this.setFps(false); }); }
    catch { this.lockFailed = true; this.setFps(false); }
  }
  private stepCam(dt: number): void {
    const s = this.SHOTS[this.camS.shot]; const a = fast() ? 1 : 1 - Math.exp(-dt * this.camS.speed);
    let look = s.l.clone();
    if (this.camS.shot === 'myturn') { this.yaw = 0; this.pitch = 0; }
    if (this.MOUSE_LOOK && this.camS.shot === 'seat' && !this.locked) { const k = 1 - Math.exp(-dt * 4); this.yaw += (this.lookT.yaw - this.yaw) * k; this.pitch += (this.lookT.pitch - this.pitch) * k; }
    if (this.camS.shot === 'seat' && (this.yaw || this.pitch)) {
      const d = s.l.clone().sub(s.p); const r = d.length(); const th = Math.atan2(d.x, -d.z) + this.yaw; let ph = Math.asin(d.y / r) + this.pitch; ph = Math.max(-1.25, Math.min(.55, ph));
      look = s.p.clone().add(V(Math.sin(th) * Math.cos(ph) * r, Math.sin(ph) * r, -Math.cos(th) * Math.cos(ph) * r));
    }
    const c = this.camS;
    c.p.lerp(s.p, a); c.l.lerp(look, a); c.fov += (s.fov - c.fov) * a;
    this.camera.position.copy(c.p); this.camera.lookAt(c.l);
    if (Math.abs(this.camera.fov - c.fov) > .01) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
  }

  /* ---------------- 입력: 끌어서 둘러보기, 눌러서 고르기 ---------------- */
  private setMv(x: number, y: number): void { const r = this.canvas.getBoundingClientRect(); this.mv.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.mv, this.camera); }
  private pickAt(x: number, y: number): THREE.Object3D | null {
    this.setMv(x, y);
    const hits = this.ray.intersectObjects([...this.picks], true);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o && !o.userData.pick) o = o.parent; if (o && o.visible !== false && this.ctx.canPick(o.userData.pick)) return o; }
    return null;
  }
  private bindInput(): void {
    const cv = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Document | Window, ev: K | string, f: (e: any) => void) => { t.addEventListener(ev, f); this.cleanup.push(() => t.removeEventListener(ev, f)); };
    on(cv, 'pointerdown', (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false }; cv.setPointerCapture(e.pointerId); });
    on(cv, 'pointermove', (e: PointerEvent) => {
      const d = this.down;
      if (d) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.hypot(dx, dy) > 6) d.moved = true;
        if (d.moved && this.camS.shot === 'seat' && !this.MOUSE_LOOK) { this.yaw = Math.max(-1.6, Math.min(1.6, d.yaw + dx * 0.004)); this.pitch = Math.max(-.5, Math.min(.6, d.pitch - dy * 0.003)); }
        return;
      }
      const o = this.pickAt(e.clientX, e.clientY); if (o !== this.hover) this.setHover(o); this.tipAt(e.clientX, e.clientY);
    });
    on(cv, 'pointerup', (e: PointerEvent) => {
      const d = this.down; this.down = null; if (!d || d.moved) return;
      if (this.locked) { const o = this.pickAt(this.W / 2, this.H / 2); if (o) this.ctx.pick(o.userData.pick); return; }
      if (this.fpsOK) { this.tryLock(); return; }
      const o = this.pickAt(e.clientX, e.clientY); if (o) this.ctx.pick(o.userData.pick);
    });
    on(document, 'pointerlockchange', () => { const was = this.locked; this.locked = document.pointerLockElement === cv; if (!this.locked && was && !this.fpsOK) this.resetLook(); this.ctx.fpsHint(this.fpsOK, this.locked); });
    on(document, 'pointerlockerror', () => { this.lockFailed = true; this.setFps(false); });
    on(document, 'mousemove', (e: MouseEvent) => {
      if (!this.locked) return; this.tipAt(this.W / 2, this.H / 2); this.yaw += e.movementX * 0.0024; this.pitch -= e.movementY * 0.002;
      if (this.yaw > PI) this.yaw -= 2 * PI; if (this.yaw < -PI) this.yaw += 2 * PI; this.pitch = Math.max(-.9, Math.min(.6, this.pitch));
    });
    on(cv, 'pointerleave', () => { this.setHover(null); this.ctx.tip3d(null); });
    if (this.MOUSE_LOOK) {
      on(window, 'pointermove', (e: PointerEvent) => { if (e.pointerType === 'mouse' && !this.locked) this.cursorLook(e.clientX, e.clientY); });
      on(document, 'mouseleave', () => { this.lookT.yaw = 0; this.lookT.pitch = 0; });
      on(window, 'blur', () => { this.lookT.yaw = 0; this.lookT.pitch = 0; });
    }
    on(cv, 'dblclick', () => this.resetLook());
  }
  /** 테이블 위 앞면 아이템 카드: 마우스를 올리면 효과 툴팁 */
  private tipAt(x: number, y: number): void {
    this.setMv(x, y);
    const objs: THREE.Object3D[] = []; for (const [, e] of this.pool) { const c = e.obj.userData.card; if (c && isItem(c) && !e.dying) objs.push(e.obj); }
    let found: Card | null = null;
    for (const h of this.ray.intersectObjects(objs, true)) { let o: THREE.Object3D | null = h.object; while (o && !o.userData.card) o = o.parent; if (o) { found = o.userData.card; break; } }
    this.ctx.tip3d(found, x, y);
  }
  private setHover(o: THREE.Object3D | null): void { if (this.hover) this.glow(this.hover, false); this.hover = o; if (o) this.glow(o, true); this.canvas.style.cursor = o ? 'pointer' : (this.MOUSE_LOOK ? 'default' : 'grab'); }
  private glow(o: THREE.Object3D, on: boolean): void {
    o.traverse(m => {
      const mesh = m as THREE.Mesh; if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material)) return;
      const mt = mesh.material as THREE.MeshStandardMaterial; if (!mt.emissive) return;
      if (on) { mesh.userData.em = mt.emissive.getHex(); mesh.material = mt.clone(); (mesh.material as THREE.MeshStandardMaterial).emissive.copy(lin('#5a4612')); }
      else if (mesh.userData.em != null) mt.emissive.setHex(mesh.userData.em);
    });
  }
  seatAt(x: number, y: number): number | null {
    this.setMv(x, y);
    for (const h of this.ray.intersectObjects([...this.avatars.values()], true)) { let o: THREE.Object3D | null = h.object; while (o && !(o.userData.pick && o.userData.pick.kind === 'seat')) o = o.parent; if (o) return o.userData.pick.i; }
    return null;
  }

  /* ---------------- 이름표 위치 ---------------- */
  anchors(): { i: number; x: number; y: number; vis: boolean }[] {
    const out = [];
    for (const [i, a] of this.avatars) { const p = a.localToWorld(V(0, 64, 30)); const q = p.clone().project(this.camera); out.push({ i, x: (q.x * .5 + .5) * this.W, y: (-q.y * .5 + .5) * this.H, vis: q.z < 1 && q.z > -1 }); }
    return out;
  }
  /** 대기실 빈 의자의 화면 위치 (이름표 자리) */
  chairAnchors(): { c: number; x: number; y: number; vis: boolean }[] {
    const out = [];
    for (const [c, g] of this.chairs) { const p = g.localToWorld(V(0, 64, -4)); const q = p.clone().project(this.camera); out.push({ c, x: (q.x * .5 + .5) * this.W, y: (-q.y * .5 + .5) * this.H, vis: q.z < 1 && q.z > -1 }); }
    return out;
  }

  /* ---------------- 상태 반영과 루프 ---------------- */
  sync(): void {
    const S = this.ctx.S();
    // 방을 나가면 의자·아바타를 치운다
    if (!S) { this.clearSeats(); this.seatKey = ''; this.sweep(); this.sweep(); this.lightsMain(); this.burns.clear(); return; } // 두 번: 살아 있던 것까지 모두 치운다
    if (!S.seats) return;
    if (S.phase === 'lobby') this.buildLobby(); else this.buildSeats();
    if (S.phase === 'main' && S.turn) this.lastActorSeat = S.turn.seat;
    this.layout();
  }
  /** 지금 누를 수 있는 덱·버림 줄 카드: 금빛 테두리가 맥박치듯 빛나고, 마우스를 올리면 살짝 떠오른다 */
  private stepPickHi(): void {
    const pulse = .7 + .3 * Math.sin(performance.now() / 260);
    for (const [key, e] of this.pool) {
      if (key !== 'deck' && !key.startsWith('c:')) continue;
      const fr = e.obj.userData.frame as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined; if (!fr) continue;
      const pk = e.obj.userData.pick as Pick | undefined; const can = !!pk && !e.dying && this.ctx.canPick(pk);
      fr.visible = can; fr.material.opacity = can ? pulse : 0;
      const up = can && this.hover === e.obj;
      if (key === 'deck') {
        // 덱은 그대로 두고 맨 위 카드 한 장만 들어 올린다
        const top = e.obj.userData.top as THREE.Object3D; const ty = (e.obj.userData.hgt ?? .2) + .02 + (up ? 2.2 : 0);
        top.position.y += (ty - top.position.y) * .25; top.rotation.x = -PI / 2 + (up ? .12 : 0);
      } else if (e.obj.userData.baseY != null) e.tp.y = e.obj.userData.baseY + (up ? 1.6 : 0);
    }
  }
  /** 디스크 태우기: 타는 중이면 불길을 번지게 하고 불씨·연기를 뿜는다. 다시 불러온 디스크는 탄 횟수만큼 누렇게 그슬린다 */
  private stepBurn(dt: number): void {
    this.burns.step(dt);
    // ♣로 고를 수 있는 디스크는 금빛 테두리가 맥박치듯 빛난다
    const slots = this.ctx.clubSlots(); const pulse = .7 + .3 * Math.sin(performance.now() / 260);
    this.flop.ids.forEach((_, k) => {
      const fr = this.pool.get('fl:' + k)?.obj.userData.frame as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined; if (!fr) return;
      const on = this.flop.mode[k] === 'slot' && slots.includes(k + 1); fr.visible = on; fr.material.opacity = on ? pulse : 0;
      // 고를 수 있는 디스크에 마우스를 올리면 떠오른다
      const e = this.pool.get('fl:' + k)!; if (this.flop.mode[k] === 'slot') e.tp.y = TY + .3 + (on && this.hover === e.obj ? 3.2 : 0);
    });
    for (const [kk, b] of Object.entries(this.flop.burn)) {
      const e = this.pool.get('fl:' + kk); const u = e?.obj.userData.burn as BurnU | undefined; if (!u || !e) continue;
      if (b.on) {
        b.t += dt; const p = Math.min(1, b.t / BURN_T); u.uBurn.value = p < 1 ? .02 + p * p * (3 - 2 * p) * .98 : 1; u.uChar.value = 0;
        e.obj.castShadow = p < .5;
        if (p < .95 && Math.random() < dt * 40) {
          const at = e.obj.localToWorld(V((Math.random() - .5) * 8, .3, (Math.random() - .5) * 8));
          this.burns.emit(at, Math.random() < .2);
        }
      } else { u.uBurn.value = 0; u.uChar.value = [0, .85, 1, 1.15][Math.min(3, b.n)]; e.obj.castShadow = true; }
    }
  }
  frame(dt: number): void {
    dt = Math.min(.12, dt); const t = (performance.now() - this.t0) / 1000;
    this.stepPool(dt); this.stepCam(dt); this.tickMG(dt, t); this.stepBurn(dt); this.stepPickHi();
    for (const [, a] of this.avatars) {
      const ud = a.userData as AvatarData; const h = ud.hop; if (!h) continue; ud.hopT += dt; const T_ = ud.hopT;
      if (T_ < .3) a.scale.setScalar(Math.max(.01, 1 - T_ / .3));
      else { if (!h.done) { h.done = true; a.position.copy(h.p); a.lookAt(h.l.x, 0, h.l.z); } a.scale.setScalar(Math.min(1, (T_ - .3) / .35)); if (T_ > .65) { a.scale.setScalar(1); ud.hop = null; } }
    }
    for (const [i, a] of this.avatars) {
      const ud = a.userData as AvatarData; ud.head.rotation.y = Math.sin(t * .6 + i) * .12; ud.head.position.y = 104 + Math.sin(t * 1.4 + i * 2) * .4; ud.torso.scale.x = 1 + Math.sin(t * 1.4 + i * 2) * .01;
      if (ud.ring.material.opacity > 0) ud.ring.scale.setScalar(1 + Math.sin(t * 3) * .04);
    }
    for (const o of [this.monitor, this.dbox]) {
      if (!o) continue; o.position.y += (o.userData.ty - o.position.y) * (1 - Math.exp(-dt * 4));
      if (o.position.y < o.userData.ty + 0.01 && o.userData.ty < TY - 1 && Math.abs(o.position.y - o.userData.ty) < .5) o.visible = false;
    }
    const S = this.ctx.S();
    if (this.die.visible && this.die.scale.x < 1) this.die.scale.setScalar(Math.min(1, this.die.scale.x + dt * 4));
    const canRoll = this.die.visible && !!S && S.phase === 'roll' && this.ctx.canPick({ kind: 'die' });
    if (this.die.visible && S && S.phase === 'roll') { this.die.position.y = TY + 1.3 + Math.abs(Math.sin(t * 2.4)) * 1.5 + (canRoll && this.hover === this.die ? 2 : 0); this.die.rotation.y = t * .8; }
    this.dieFrame.visible = canRoll; this.dieFrame.material.opacity = .7 + .3 * Math.sin(performance.now() / 260);
  }
}
