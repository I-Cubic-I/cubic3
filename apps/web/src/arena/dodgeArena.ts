/* 주사위 눈 피하기 아레나: 고대 탑 꼭대기(수비자) + 내려다보는 통제실(공격자).
   규칙은 엔진 그대로, 여기서는 상태를 읽어 그리고 조작을 cmd로 보낸다 */
import * as THREE from 'three';
import { DODGE_SHAPES, DODGE_SHOW, type DodgeMg, R as rankOf, dodgeAtk, dodgeCanBlock, dodgeCanGo, dodgeDefs, now } from '@cubic3/engine';
import { SEATCOL } from '../game';
import { cmd } from '../flow';
import { useStore } from '../store';
import { preview } from '../ui/MgPanel4';
import { type OldHand, type Wizard, buildArrow, buildBulb, buildStay, buildCloud, buildDie, buildDots, buildHand, buildHead, buildWizard, curlHand, glowDisc, keyCap, lightColumn, magicCircle, magicTex, portalDisc, setDie, softTex } from './props';
import { type Pillar, T, TOP, buildTower, cellPos } from './tower';
import { INK, INK_U, backOut, canvasTex, clamp01, ease, glow, ink, toon, wobbleLine } from './toon';
import { RoundedBoxGeometry } from 'three-stdlib';
import { slabH, uiScale } from '../ui/scale';

const col = (j: number) => SEATCOL[j % 5];
/** 통제실 책상: 카메라 앞 높이·크기 */
// 책상을 화면 위쪽으로 올려 주사위·계기판이 왼쪽 아래 아이템 카드보다 위에 오게 한다(앞쪽은 길게 늘려 아래가 비지 않게)
const DESK_Y = -0.64, DESK_S = 0.4, HAND = 1.05;
/** 책상 위 주사위를 카메라 쪽으로 기울이는 각(위에서 비스듬히 봐서 눈이 납작해 보이지 않게) */
const DIE_TILT = 0.75;
/** 탑 뒤 하늘의 주사위 별자리 자리 */
const PEEK_RED = new THREE.Color('#ff5a46');
const STAR_Y = 4.4, STAR_Z = -5.4, STAR_S = 1.7, STAR_GAP = 3.3;
/** 별자리 자리: 넓은 화면은 아레나 왼쪽·위·오른쪽, 좁은 화면은 위쪽 한 줄(사용자 2026-10-14) */
const starSpots = (a: number): THREE.Vector3[] => a >= 1.25
  ? [new THREE.Vector3(-6.0, 2.6, -1.2), new THREE.Vector3(0, STAR_Y, STAR_Z), new THREE.Vector3(6.0, 2.6, -1.2)]
  : [-1, 0, 1].map(k => new THREE.Vector3(k * STAR_GAP, STAR_Y, STAR_Z));
/** 책상 위 물건(주사위 쟁반 ~ 계기판 수정)이 차지하는 반폭(책상 단위). 화면이 좁으면 이게 다 보이게 책상을 줄인다 */
const DESK_HALF = 3.9;
/** 책상 위 배치: 가운데는 수정구 받침, 왼쪽 주사위 쟁반, 오른쪽 계기판 */
const DEV_X = 2.25, TRAY_X = -2.0, TRAY_Z = -0.5; // 쟁반은 책상 안쪽(화면에서 더 위): 왼쪽 아래 아이템 카드에 가리지 않게
/** 연출 시각표(초, 공개 단계 시작부터) */
const TL = { hop: 0.5, circle: 0.4, blast: 1.3, fly: 1.35, back: 2.4, backEnd: 3.2 };

/** 한 칸에 여럿이 서면 조금씩 비켜 선다 */
/** 한 칸에 선 인원별 마법사 크기(사용자 2026-10-14: 모인 인원에 따라 줄이기, 배율은 [제안]) */
const CROWD = [1, 1, 0.9, 0.8, 0.74];
const crowdOf = (pos: Record<number, number>, j: number): number => j in pos ? CROWD[Math.min(4, Object.values(pos).filter(c => c === pos[j]).length)] : 1;
function slots(pos: Record<number, number>): Record<number, THREE.Vector3> {
  const by: Record<number, number[]> = {}; Object.keys(pos).forEach(k => { const j = +k; (by[pos[j]] ||= []).push(j); });
  const out: Record<number, THREE.Vector3> = {};
  const OFF: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-0.42, 0], [0.42, 0]], 3: [[-0.42, 0.3], [0.42, 0.3], [0, -0.38]], 4: [[-0.44, -0.42], [0.44, -0.42], [-0.44, 0.42], [0.44, 0.42]] };
  for (const c in by) by[c].sort((a, b) => a - b).forEach((j, k) => { const o = OFF[Math.min(4, by[c].length)][k] || [0, 0]; out[j] = cellPos(+c, TOP).add(new THREE.Vector3(o[0], 0, o[1])); });
  return out;
}

interface Wiz {
  seat: number; w: Wizard; born: number; leaving: number;
  /** 한 칸에 여럿이면 작게(부드럽게 바뀜) */
  cs?: number;
  portal: THREE.Mesh; column: THREE.Mesh;
  dots: THREE.Group; bulb: THREE.Group; peekAt: number;
  fly: THREE.Vector3;
}

interface Cockpit {
  root: THREE.Group; desk: THREE.Group; frame: THREE.Group;
  dice: THREE.Group[]; diceHome: THREE.Vector3[]; socket: THREE.Vector3;
  grids: { g: THREE.Group; lamps: THREE.Mesh[]; hit: THREE.Mesh; ring: THREE.Mesh }[];
  crystal: THREE.Mesh; crystalGlow: THREE.Mesh; lever: THREE.Group;
  left: OldHand; right: OldHand; candle: THREE.Object3D;
  peek: { root: THREE.Group; portal: THREE.Mesh; holder: THREE.Group; cloud: THREE.Group; die: THREE.Group };
  /** 주사위가 다시 나타날 때 빈자리에 피는 마법진 */
  regenRings: THREE.Mesh[];
  dragDie: THREE.Group;
}

export class DodgeArena {
  private tower = buildTower();
  private wiz = new Map<number, Wiz>();
  private arrows = new Map<number, THREE.Group>();
  private circles: THREE.Mesh[] = []; private glows: THREE.Mesh[] = []; private columns: THREE.Mesh[] = []; private rings: THREE.Mesh[] = []; private flashes: THREE.Mesh[] = [];
  private cp: Cockpit;
  private mode: 'atk' | 'def' = 'def'; private modeK = 0;
  private camPos = new THREE.Vector3(0, 11.5, 9.6); private camLook = new THREE.Vector3(0, 0.2, -1.1);
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(-9, -9);
  private hover: { kind: string; k: number } | null = null;
  private drag: { k: number; moved: boolean; x0: number; y0: number } | null = null;
  private lastCell = -1;
  private prev: { ai: number; blocked: number[]; peek: Record<number, boolean>; turn: number } | null = null;
  private peekQ: { seat: number; die: number }[] = []; private peekNow: { seat: number; t0: number } | null = null;
  private heads = new Map<number, THREE.Group>();
  private aspect = 0; private t = 0;
  /** 화면 비율에 맞춘 책상 크기·높이 */
  private deskS = DESK_S; private deskY = DESK_Y;
  private shotSeen = { key: '', at: 0, k: -1, from: new THREE.Vector3() }; private regenAll = -1; private deskAi = -1;
  /** 키보드 단축키 키캡: 주사위 1·2·3, 방향판 R(이동 방향·확정에는 표시하지 않는다, 사용자 2026-10-14) */
  private caps = { dice: [] as THREE.Sprite[], rot: keyCap('R') };

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private dom: HTMLCanvasElement, private gl: THREE.WebGLRenderer) {
    scene.add(this.tower.root);
    // 빛은 탑(층 0)과 통제실(층 1) 모두에
    const hemi = new THREE.HemisphereLight('#8f8fc8', '#3a2820', 0.7); hemi.layers.enableAll(); scene.add(hemi);
    const sun = new THREE.DirectionalLight('#ffd2a0', 1.7); sun.position.set(-8, 14, 9); sun.layers.enableAll(); scene.add(sun);
    // 칸마다 마법진·빛 기둥·충격 고리·섬광(필요할 때만 보인다)
    for (let c = 0; c < 9; c++) {
      const p = cellPos(c, TOP + 0.03);
      const m = magicCircle('#ffffff', 1.95); m.position.copy(p); m.visible = false; scene.add(m); this.circles.push(m);
      const gd = glowDisc('#ffffff', 2.6); gd.position.copy(p).setY(TOP + 0.02); gd.visible = false; scene.add(gd); this.glows.push(gd);
      const col_ = lightColumn('#ffffff', 0.9, 8); col_.position.copy(p); col_.visible = false; scene.add(col_); this.columns.push(col_);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 40), glow('#ffffff', 1)); ring.rotation.x = -Math.PI / 2; ring.position.copy(p).setY(TOP + 0.06); ring.visible = false; scene.add(ring); this.rings.push(ring);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glow('#ffffff', 1)); fl.position.copy(p).setY(TOP + 0.6); fl.visible = false; scene.add(fl); this.flashes.push(fl);
    }
    scene.add(camera);
    this.cp = this.buildCockpit(); camera.add(this.cp.root);
    // 키캡: 통제실 것은 책상에, 판 위 것은 장면에
    ['1', '2', '3'].forEach(k => { const s = keyCap(k, 0.2); this.cp.desk.add(s); this.caps.dice.push(s); });
    this.caps.rot.scale.multiplyScalar(0.6); this.cp.desk.add(this.caps.rot);
    // 공격자는 통제실(층 1)의 수정구로 탑(층 0)을 본다: 수정구 카메라가 탑을 그려 수정구에 비춘다
    this.ball = this.buildBall(); camera.add(this.ball.root);
    this.backdrop = this.buildBackdrop(); camera.add(this.backdrop);
    for (const o of [this.cp.root, this.ball.root, this.backdrop]) o.traverse(x => x.layers.set(1));
    this.ray.layers.enableAll();
    this.buildStars();
    dom.addEventListener('pointermove', this.onMove); dom.addEventListener('pointerdown', this.onDown); window.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointerleave', this.onLeave);
    // 처음 상태 반영
    const m = this.mg(); if (m) { m.blocked.forEach(c => this.tower.pillars[c].collapse(true)); }
    if (import.meta.env.DEV) (window as unknown as { __arena: DodgeArena }).__arena = this;
  }

  dispose(): void {
    this.dom.removeEventListener('pointermove', this.onMove); this.dom.removeEventListener('pointerdown', this.onDown); window.removeEventListener('pointerup', this.onUp);
    this.dom.removeEventListener('pointerleave', this.onLeave);
    this.camera.remove(this.cp.root, this.ball.root, this.backdrop); this.scene.clear(); this.rt.dispose();
  }

  private mg(): DodgeMg | null { const S = useStore.getState().S; return S?.phase === 'mg' && S.mg?.id === 'dodge' ? S.mg : null; }

  /* ---------------- 통제실(공격자) ---------------- */
  private buildCockpit(): Cockpit {
    const root = new THREE.Group();
    const desk = new THREE.Group(); desk.position.set(0, DESK_Y, -3.0); desk.rotation.x = 0.85; desk.scale.setScalar(DESK_S); root.add(desk);
    const wood = toon('#5a3a26'), dark = toon('#2e2018'), brass = toon('#b88a3e'), plate = toon('#2a2320');
    const top = ink(new RoundedBoxGeometry(12, 0.4, 3.6, 2, 0.08), wood, 0.05); top.position.set(0, -0.2, 0.85); desk.add(top);
    const lip = ink(new RoundedBoxGeometry(12, 0.2, 0.25, 2, 0.06), dark, 0.04); lip.position.set(0, 0.04, -0.9); desk.add(lip);
    // 나뭇결
    for (let k = 0; k < 10; k++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.02), toon('#3b2618')); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.002, -0.75 + k * 0.33); desk.add(l); }
    // 주사위 쟁반
    const tray = ink(new RoundedBoxGeometry(2.15, 0.1, 0.9, 2, 0.04), dark, 0.035); tray.position.set(TRAY_X, 0.05, TRAY_Z); desk.add(tray);
    const diceHome = [-0.68, 0, 0.68].map(x => new THREE.Vector3(TRAY_X + x, 0.33, TRAY_Z));
    // 주사위는 크게, 윗면(눈)이 카메라 쪽을 보게 앞으로 기울인다
    const dice = diceHome.map(p => { const d = buildDie(1); d.scale.setScalar(0.42); d.position.copy(p); d.rotation.x = DIE_TILT; desk.add(d); d.userData.kind = 'die'; return d; });
    // 계기판: 소켓(고른 주사위) · 방향 표시판 4개 · 발동 수정
    const dev = new THREE.Group(); dev.position.set(DEV_X, 0, -0.05); desk.add(dev);
    const base = ink(new RoundedBoxGeometry(2.9, 0.32, 1.05, 2, 0.06), toon('#6b5530'), 0.04); base.position.y = 0.16; dev.add(base);
    const face = ink(new RoundedBoxGeometry(2.75, 0.06, 0.9, 2, 0.02), plate, 0.02); face.position.y = 0.34; dev.add(face);
    for (const x of [-1.33, 1.33]) for (const z of [-0.42, 0.42]) { const r = ink(new THREE.SphereGeometry(0.045, 8, 6), brass, 0.012); r.position.set(x, 0.34, z); dev.add(r); }
    const sock = ink(new THREE.TorusGeometry(0.22, 0.05, 8, 24), brass, 0.02); sock.rotation.x = Math.PI / 2; sock.position.set(-0.95, 0.38, 0); dev.add(sock);
    // 소켓 자리(책상 기준): 계기판 x + 소켓 -0.95
    const socket = new THREE.Vector3(DEV_X - 0.95, 0.62, -0.05);
    const grids: Cockpit['grids'] = [];
    for (let o = 0; o < 4; o++) {
      const g = new THREE.Group(); g.position.set(-0.32 + (o % 2) * 0.5, 0.38, -0.21 + Math.floor(o / 2) * 0.42); dev.add(g);
      const bp = ink(new RoundedBoxGeometry(0.4, 0.04, 0.38, 2, 0.015), toon('#1a1512'), 0.015); g.add(bp);
      const lamps: THREE.Mesh[] = [];
      for (let c = 0; c < 9; c++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 6), toon('#4a3b2a', { fresh: true, emissive: '#000000', ei: 1 })); l.position.set(((c % 3) - 1) * 0.105, 0.03, (Math.floor(c / 3) - 1) * 0.105); l.scale.y = 0.6; g.add(l); lamps.push(l); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.29, 4, 1), glow('#ffd36a', 1)); ring.rotation.set(-Math.PI / 2, 0, Math.PI / 4); ring.position.y = 0.025; ring.visible = false; g.add(ring);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.42), new THREE.MeshBasicMaterial({ visible: false })); hit.userData = { kind: 'grid', k: o }; g.add(hit);
      grids.push({ g, lamps, hit, ring });
    }
    const ped = ink(new THREE.CylinderGeometry(0.16, 0.22, 0.2, 12), brass, 0.02); ped.position.set(0.95, 0.44, 0); dev.add(ped);
    const crystal = ink(new THREE.OctahedronGeometry(0.22, 0), toon('#e05a3c', { fresh: true, emissive: '#e05a3c', ei: 0.3 }), 0.025); crystal.scale.y = 1.5; crystal.position.set(0.95, 0.82, 0); crystal.userData = { kind: 'fire', k: 0 }; dev.add(crystal);
    const crystalGlow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), glow('#ff7a4a', 0.0)); crystalGlow.position.copy(crystal.position); dev.add(crystalGlow);
    const lever = new THREE.Group(); lever.position.set(1.33, 0.34, 0.2); dev.add(lever);
    const lv = ink(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 6), brass, 0.012); lv.position.y = 0.2; lv.rotation.z = -0.4; lever.add(lv);
    // 촛불
    const candle = new THREE.Group(); candle.position.set(-4.3, 0, -0.6); desk.add(candle);
    const wax = ink(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 12), toon('#efe2c2'), 0.025); wax.position.y = 0.25; candle.add(wax);
    const fl = ink(new THREE.ConeGeometry(0.07, 0.22, 8), toon('#ffcf5a', { fresh: true, emissive: '#ffb030', ei: 1.2 }), 0.015); fl.position.y = 0.62; candle.add(fl);
    const cl = new THREE.PointLight('#ffb060', 3, 4, 1.5); cl.position.y = 0.8; candle.add(cl);
    // 손: 왼손은 책상에 얹고, 오른손은 포인터를 따라간다
    const left = buildHand(-1); left.root.scale.setScalar(HAND); left.root.position.set(-2.9, 0.16, 0.35); left.root.rotation.y = -0.5; desk.add(left.root); curlHand(left, 0.3);
    const right = buildHand(1); right.root.scale.setScalar(HAND * DESK_S); root.add(right.root);
    // 창틀(통제실 창 너머로 실험장을 내려다본다)
    const frame = new THREE.Group(); root.add(frame);
    // 엿보기: 통제실 허공에 포탈이 열리고 얼굴이 튀어나온다
    // 수정구 왼쪽 위 허공에 열린다(수정구를 가리지 않게)
    const pr = new THREE.Group(); pr.position.set(-1.2, 0.3, -2.6); pr.visible = false; root.add(pr);
    const portal = portalDisc('#9b7bff', 0.62); pr.add(portal);
    const holder = new THREE.Group(); pr.add(holder);
    const cloud = buildCloud(0.3); cloud.position.set(0.42, 0.3, 0.1); pr.add(cloud);
    const pdie = buildDie(1); pdie.scale.setScalar(0.12); pdie.rotation.set(0.5, 0.6, 0); pdie.position.set(0, 0.0, 0.12); cloud.add(pdie);
    const dragDie = buildDie(1); dragDie.scale.setScalar(0.3 * DESK_S); dragDie.visible = false; root.add(dragDie);
    const regenRings = diceHome.map(() => { const r = magicCircle('#b9a6ff', 0.95); r.visible = false; desk.add(r); return r; });
    return { root, desk, frame, dice, diceHome, socket, grids, crystal, crystalGlow, lever, left, right, candle, peek: { root: pr, portal, holder, cloud, die: pdie }, dragDie, regenRings };
  }

  /* ---------------- 주사위 별자리(수비자 시점: 탑 뒤 하늘의 공개 주사위 3개) ---------------- */
  private stars: { g: THREE.Group; v: number; body: THREE.Group }[] = [];
  /** 공개 때 별자리가 현실화한 주사위(날아가 마법진으로) */
  private fireDie!: THREE.Group; private fireHalo!: THREE.Mesh;
  private buildStars(): void {
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group(); g.position.set((k - 1) * STAR_GAP, STAR_Y, STAR_Z); this.scene.add(g);
      const body = new THREE.Group(); g.add(body);
      this.stars.push({ g, v: 0, body });
    }
    this.fireDie = buildDie(1); this.fireDie.visible = false; this.scene.add(this.fireDie);
    this.fireHalo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), glow('#ffe9a8', 0.7)); (this.fireHalo.material as THREE.MeshBasicMaterial).map = softTex(); this.fireHalo.visible = false; this.scene.add(this.fireHalo);
    for (const o of [...this.stars.map(s => s.g), this.fireDie, this.fireHalo]) o.traverse(x => x.layers.set(2));
  }
  /** 별자리 하나: 네 모서리 별 + 테두리 선 + 눈(별) + 눈 사이 선 */
  private starFace(st: { g: THREE.Group; v: number; body: THREE.Group }, v: number): void {
    if (st.v === v) return; st.v = v; st.body.clear();
    const lineM = new THREE.LineBasicMaterial({ color: '#d9ccff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    const h = 0.66;
    st.body.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => new THREE.Vector3(x, y, 0))), lineM));
    const star = (x: number, y: number, s: number, c: string) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), glow(c, 1)); (m.material as THREE.MeshBasicMaterial).map = softTex(); m.position.set(x, y, 0.01); st.body.add(m); return m; };
    for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]]) star(x, y, 0.22, '#b9a6ff');
    const FACE: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    const pts = FACE[v].map(i => new THREE.Vector3(((i % 3) - 1) * 0.36, (1 - Math.floor(i / 3)) * 0.36, 0));
    if (pts.length > 1) st.body.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineM));
    pts.forEach(p => { star(p.x, p.y, 0.62, v === 1 ? '#ffb4a0' : '#fff1c8'); star(p.x, p.y, 0.2, '#ffffff'); });
    st.body.traverse(x => x.layers.set(2));
  }
  /** 수비자 시점의 별자리·현실화 연출 */
  private peekT = -1;
  private drawStars(m: DodgeMg, i: number | null, t: number, showS: number): void {
    const sk = m.step === 'show' && m.shot && m.last ? m.shot.k : -1;
    // 엿보기(사용자 2026-10-14): 쓴 사람에게만, 공격자가 고른 주사위의 별자리가 붉게 빛나며 커지고 나머지는 흐려진다
    const pkK = m.step === 'pick' && m.shot && i != null && i !== dodgeAtk(m) && m.peek[i] ? m.shot.k : -1;
    if (pkK < 0) this.peekT = -1; else if (this.peekT < 0) this.peekT = t;
    const pe = pkK < 0 ? 0 : ease(clamp01((t - this.peekT - 1.2) / 0.6));
    const spots = starSpots(this.camera.aspect || 1.6);
    this.stars.forEach((st, j) => {
      st.g.position.copy(spots[j]);
      let v = m.dice[j], a = 1, pulse = 0;
      if (j === sk) {
        if (showS < 0.35) { v = m.last!.die; pulse = Math.sin(showS / 0.35 * Math.PI); }
        else if (showS < 2.3) a = 0;
        else a = ease((showS - 2.3) / 0.7);
      }
      this.starFace(st, v);
      // 화면과 나란히(비스듬히 틀어져 보이지 않게)
      st.g.visible = a > 0.01; st.g.quaternion.copy(this.camera.quaternion);
      const hot = j === pkK ? pe : 0, dim = pkK >= 0 && j !== pkK ? pe : 0;
      st.g.scale.setScalar(STAR_S * (1 + pulse * 0.25 + hot * (0.3 + 0.05 * Math.sin(t * 4))));
      st.body.children.forEach((c, k) => {
        const mt = (c as THREE.Mesh).material as THREE.MeshBasicMaterial; if (!mt) return;
        const base = c.type === 'Mesh' ? 0.8 + 0.2 * Math.sin(t * 3 + k * 1.7 + j) : 0.7; mt.opacity = base * a * (1 + pulse) * (1 - dim * 0.7);
        const c0 = (mt.userData.c0 ||= mt.color.clone()) as THREE.Color; mt.color.copy(c0).lerp(PEEK_RED, hot * 0.75);
      });
    });
    // 현실화: 별자리가 진짜 주사위가 되어 마법진 쪽으로 날아들어 빛과 함께 사라진다
    const f = this.fireDie, hl = this.fireHalo;
    f.visible = hl.visible = false;
    if (sk >= 0 && showS >= 0.2 && showS < 1.3) {
      if (f.userData.v !== m.last!.die) setDie(f, m.last!.die);
      const from = this.stars[sk].g.position, to = new THREE.Vector3(); m.last!.cells.forEach(c => to.add(cellPos(c, TOP + 0.6))); to.multiplyScalar(1 / m.last!.cells.length);
      f.visible = hl.visible = true;
      if (showS < 0.65) {
        const u = (showS - 0.2) / 0.45; f.position.copy(from); f.scale.setScalar(STAR_S * (0.4 + 0.6 * backOut(u))); f.lookAt(this.camera.position); f.rotateX(Math.PI / 2);
        hl.position.copy(from); hl.scale.setScalar(1 + u * 0.4); (hl.material as THREE.MeshBasicMaterial).opacity = 0.8;
      } else {
        const u = ease((showS - 0.65) / 0.6); const p = from.clone().lerp(to, u); p.y += Math.sin(u * Math.PI) * 1.2;
        f.position.copy(p); f.scale.setScalar(STAR_S * (1 - u * 0.5)); f.rotation.set(u * 9, u * 6, u * 4);
        hl.position.copy(p); hl.scale.setScalar(1.2 - u * 0.5); (hl.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - u * 0.5);
      }
      hl.lookAt(this.camera.position);
    }
  }

  /* ---------------- 수정구(공격자가 탑을 보는 창) ---------------- */
  private rt = new THREE.WebGLRenderTarget(1024, 1024, { samples: 4 });
  /** 수정구 속 시점: 거의 위에서 내려다본다 */
  private ballCam = (() => { const c = new THREE.PerspectiveCamera(32, 1, 0.5, 600); const e = 1.22, d = 17; c.position.set(0, Math.sin(e) * d + 0.4, Math.cos(e) * d); c.lookAt(0, 0.4, 0); return c; })();
  private ball!: { root: THREE.Group; disc: THREE.Mesh; ring: THREE.Mesh; motes: THREE.Group; r: number; z: number; y: number };
  private backdrop!: THREE.Group;
  private ballPx = 300;
  private buildBall() {
    const root = new THREE.Group();
    // 가운데는 평평하고 또렷하게, 가장자리에만 어둡게·빛 번짐(반사는 테두리와 하이라이트로)
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture }, t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform sampler2D map; uniform float t; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float d = length(p);
          vec3 c = texture2D(map, vUv).rgb;
          c = mix(c, c * vec3(0.55, 0.5, 0.8), smoothstep(0.62, 1.0, d));
          c += vec3(0.55, 0.45, 1.0) * smoothstep(0.8, 1.0, d) * (0.45 + 0.1 * sin(t * 2.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    root.add(disc);
    // 유리 테두리(잉크) + 바깥 빛무리 + 반사 하이라이트
    const rim = ink(new THREE.TorusGeometry(1, 0.035, 10, 96), toon('#cfd7ff', { fresh: true, emissive: '#7a6cff', ei: 0.5 }), 0.03); root.add(rim);
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.28, 72), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'varying vec2 vP; void main(){ float d = length(vP); float a = 1.0 - smoothstep(1.0, 1.28, d); gl_FragColor = vec4(vec3(0.55,0.45,1.0) * a * 0.55, a * 0.55); }',
    })); halo.position.z = -0.01; root.add(halo);
    const hi = (a0: number, len: number, rr: number, w: number, op: number) => { const m = new THREE.Mesh(new THREE.RingGeometry(rr - w, rr, 40, 1, a0, len), glow('#ffffff', op)); m.position.z = 0.01; root.add(m); };
    hi(Math.PI * 0.58, Math.PI * 0.32, 0.93, 0.05, 0.7); hi(Math.PI * 0.62, Math.PI * 0.12, 0.84, 0.035, 0.45); hi(Math.PI * 1.62, Math.PI * 0.2, 0.94, 0.03, 0.3);
    // 받침대 없이 공중에 뜬다(관측 마법): 뒤에서 천천히 도는 마법진 고리 + 둘레를 도는 빛 알갱이
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), glow('#8f7bff', 0.55)); (ring.material as THREE.MeshBasicMaterial).map = magicTex(); ring.position.z = -0.03; root.add(ring);
    const motes = new THREE.Group(); root.add(motes);
    for (let k = 0; k < 7; k++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.035 + (k % 3) * 0.012, 10), glow(k % 2 ? '#e6dcff' : '#b9a6ff', 0.9)); d.userData = { a: k / 7 * Math.PI * 2, rr: 1.12 + (k % 3) * 0.07, sp: 0.35 + (k % 4) * 0.08 }; motes.add(d); }
    return { root, disc, ring, motes, r: 1, z: 2.95, y: 0 };
  }
  /** 통제실 뒷벽(공격자 시점에서 탑 대신 보이는 배경) */
  private buildBackdrop(): THREE.Group {
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: wallTex(), toneMapped: false })); wall.name = 'wall'; g.add(wall);
    return g;
  }

  /** 화면 비율에 맞춰 책상·수정구·뒷벽을 다시 놓는다 */
  private fitFrame(): void {
    const a = this.camera.aspect; if (Math.abs(a - this.aspect) < 1e-3) return; this.aspect = a;
    // 책상: 3 앞에 놓인다. 보이는 반폭에 책상 위 물건이 다 들어오게 줄이고, 줄인 만큼 화면 아래쪽에 붙인다
    const hh = 3 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.deskS = Math.min(DESK_S, (hh * a * 0.9) / DESK_HALF);
    this.deskY = -hh + (hh + DESK_Y) * (this.deskS / DESK_S);
    this.cp.desk.scale.setScalar(this.deskS); this.cp.right.root.scale.setScalar(HAND * this.deskS); this.cp.dragDie.scale.setScalar(0.42 * this.deskS);
    // 수정구: 위쪽 석판 아래 ~ 책상(계기판 꼭대기) 위 사이에 가장 크게
    const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), H = this.dom.clientHeight || 720, k = uiScale();
    const topN = 1 - 2 * ((slabH(k).h2 + 14) / H);
    const s = this.deskS, sn = Math.sin(0.85), cs = Math.cos(0.85);
    // 수정구는 책상 가운데에 놓인다: 아래 끝 = 책상 윗면 가운데쯤
    const bz = 0.35, botN = (this.deskY + (-bz * sn) * s) / ((3 - bz * cs * s) * th);
    // 가로로는 주사위 쟁반·계기판 사이에 들어가게
    const D = this.ball.z; const gapN = (Math.min(DEV_X - 1.45, -(TRAY_X + 1.075)) * s) / (3 * th);
    // ① 책상 가운데(쟁반·계기판 사이)에 놓기 ② 책상 위 허공(세로로 긴 화면) 중 더 크게 보이는 쪽
    const rA = Math.min((topN - botN) / 2 * 0.96, gapN * 0.98);
    const deskTop = Math.max(...([[-0.95, 0.1], [-0.05, 0.85]] as [number, number][]).map(([z, y]) => { const yy = this.deskY + (-z * sn + y * cs) * s, zz = -3 + (z * cs + y * sn) * s; return yy / (-zz * th); })) + 0.04;
    const rB = Math.min((topN - deskTop) / 2 * 0.94, 0.85 * a);
    // 너무 커지지 않게: 반지름이 화면 폭의 42%·높이의 30%를 넘지 않는다(좌우 여백은 조금만)(NDC 세로 단위로 환산)
    const Wpx = this.dom.clientWidth || H * a, rMax = 2 * Math.min(Wpx * 0.42, H * 0.3) / H;
    const useB = rB > rA, rN = Math.min(Math.max(rA, rB), rMax);
    // 공중에 뜬다: 주어진 영역의 가운데
    const cN = useB ? (topN + deskTop) / 2 : (topN + botN) / 2;
    const r = rN * th * D, cy = cN * th * D;
    this.ball.r = r; this.ball.y = cy; this.ball.root.position.set(0, cy, -D); this.ball.root.scale.setScalar(r);
    this.ballPx = rN * H;
    // 뒷벽: 화면을 꽉 덮는다
    const wd = 9, wh = wd * th * 2.2; const wall = this.backdrop.getObjectByName('wall')!; wall.scale.set(wh * a, wh, 1); wall.position.set(0, 0, -wd);
  }

  /* ---------------- 입력 ---------------- */
  private setNdc(e: PointerEvent): void { const r = this.dom.getBoundingClientRect(); this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  private onLeave = () => { this.ndc.set(-9, -9); this.hover = null; };
  /** 통제실 물건 중 포인터 아래 것 */
  private pickCockpit(): { kind: string; k: number } | null {
    if (this.mode !== 'atk') return null;
    this.ray.setFromCamera(this.ndc, this.camera);
    const objs: THREE.Object3D[] = [...this.cp.dice, ...this.cp.grids.map(g => g.hit), this.cp.crystal];
    const hit = this.ray.intersectObjects(objs, true)[0]; if (!hit) return null;
    let o: THREE.Object3D | null = hit.object; while (o && !o.userData.kind) o = o.parent;
    if (!o) return null; if (o.userData.kind === 'die') return { kind: 'die', k: this.cp.dice.indexOf(o as THREE.Group) };
    return { kind: o.userData.kind, k: o.userData.k };
  }
  /** 포인터 아래 발판 칸(-1 = 없음) */
  private pickCell(): number {
    if (this.mode === 'atk') {
      // 수정구 위의 점 → 수정구 카메라의 화면 좌표 → 탑 위의 칸
      const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), a = this.camera.aspect, D = this.ball.z;
      const cy = this.ball.y / (th * D), rx = this.ball.r / (th * a * D), ry = this.ball.r / (th * D);
      const u = this.ndc.x / rx, v = (this.ndc.y - cy) / ry; if (u * u + v * v > 1) return -1;
      this.ray.setFromCamera(new THREE.Vector2(u, v), this.ballCam);
    } else this.ray.setFromCamera(this.ndc, this.camera);
    const p = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP), p)) return -1;
    const cc = Math.round(p.x / T) + 1, rr = Math.round(p.z / T) + 1;
    if (cc < 0 || cc > 2 || rr < 0 || rr > 2 || Math.abs(p.x - (cc - 1) * T) > T * 0.49 || Math.abs(p.z - (rr - 1) * T) > T * 0.49) return -1;
    return rr * 3 + cc;
  }
  /** 이 기기에서 지금 할 수 있는 조작 */
  private ctx() {
    const st = useStore.getState(); const m = this.mg(); const i = st.ctl;
    if (!m || i == null) return null;
    const atk = dodgeAtk(m); const amAtk = i === atk;
    const selItem = st.sel.length === 1 && rankOf(st.sel[0]) >= 11;
    return { m, i, amAtk, selItem, ui: st.ui, aiming: amAtk && m.step === 'pick' && !m.shot, blocking: amAtk && m.step === 'pick' && !m.shot && selItem, moving: !amAtk && i in m.pos && m.step === 'pick' && !m.done[i] };
  }
  private onMove = (e: PointerEvent) => {
    this.setNdc(e);
    if (this.drag) {
      if (Math.hypot(e.clientX - this.drag.x0, e.clientY - this.drag.y0) > 6) this.drag.moved = true;
      if (this.drag.moved) { const c = this.pickCell(); if (c >= 0 && c !== this.lastCell) { this.lastCell = c; cmd('dplace', { c }); } }
      return;
    }
    const x = this.ctx(); this.hover = this.pickCockpit();
    const c = this.hover ? -1 : this.pickCell();
    let can = !!this.hover && !!x?.aiming;
    if (!this.hover && c >= 0 && x) can = (x.aiming && x.ui.dk != null) || (x.blocking && dodgeCanBlock(x.m, c)) || (x.moving && dodgeCanGo(x.m, x.i, c));
    this.dom.style.cursor = can ? 'pointer' : 'default';
  };
  private onDown = (e: PointerEvent) => {
    this.setNdc(e); const x = this.ctx(); if (!x) return;
    const h = this.pickCockpit();
    if (h) {
      if (!x.aiming) return;
      if (h.kind === 'die') { if (x.ui.dk !== h.k) cmd('dk', { k: h.k }); this.drag = { k: h.k, moved: false, x0: e.clientX, y0: e.clientY }; this.lastCell = -1; }
      else if (h.kind === 'grid') cmd('dorient', { o: h.k });
      else if (h.kind === 'fire' && x.ui.dk != null) cmd('dshot');
      return;
    }
    const c = this.pickCell(); if (c < 0) return;
    if (x.blocking) cmd('dblock', { c });
    else if (x.aiming && x.ui.dk != null) cmd('dplace', { c });
    else if (x.moving && dodgeCanGo(x.m, x.i, c)) cmd('dmove', { c });
  };
  private onUp = () => { this.drag = null; this.lastCell = -1; };

  /* ---------------- 매 프레임 ---------------- */
  frame(dt: number): void {
    dt = Math.min(dt, 0.05); this.t += dt;
    INK_U.res.value.set(this.dom.width, this.dom.height); INK_U.px.value = 2.5 * Math.max(1, this.dom.width / Math.max(1, this.dom.clientWidth));
    const st = useStore.getState(); const m = this.mg(); if (!m) return;
    const i = st.ctl; const atk = dodgeAtk(m); const amAtk = i === atk; const t = this.t;
    const showS = m.step === 'show' && m.last ? (now() - (m.until - DODGE_SHOW)) / 1000 : -1;
    this.syncEvents(m, i, t);
    this.mode = amAtk ? 'atk' : 'def';
    this.tower.pillars.forEach(p => p.frame(dt));
    // 불꽃·구름
    this.tower.flames.forEach((f, k) => { f.scale.set(1 + Math.sin(t * 13 + k) * 0.06, 1 + Math.sin(t * 9 + k * 2) * 0.12, 1); f.rotation.y = t * 0.6 + k; });
    this.tower.clouds.forEach((c, k) => { c.position.y += Math.sin(t * 0.4 + k) * 0.002; });

    this.drawWizards(m, i, t, showS);
    this.drawCells(m, i, t, showS, amAtk);
    this.drawArrows(m, i, t);
    this.drawCockpit(m, amAtk, t, dt);
    this.drawCamera(dt);
    // 공격자: 화면에는 통제실(층 1)만, 탑은 수정구 카메라로 그려 수정구에 비춘다
    this.drawStars(m, i, t, showS);
    this.camera.layers.set(this.mode === 'atk' ? 1 : 0); if (this.mode !== 'atk') this.camera.layers.enable(2);
    if (this.mode === 'atk') {
      (this.ball.disc.material as THREE.ShaderMaterial).uniforms.t.value = t;
      // 떠다니기·고리 돌기·빛 알갱이
      const b = this.ball; b.root.position.y = b.y + Math.sin(t * 1.3) * b.r * 0.025; b.ring.rotation.z = t * 0.25;
      b.motes.children.forEach(d => { const u = d.userData as { a: number; rr: number; sp: number }; const a = u.a + t * u.sp; d.position.set(Math.cos(a) * u.rr, Math.sin(a) * u.rr * 0.92, 0.02); });
      const res = INK_U.res.value.clone(), px = INK_U.px.value;
      INK_U.res.value.set(this.rt.width, this.rt.height); INK_U.px.value = 2.2 * this.rt.width / Math.max(120, this.ballPx * 2);
      this.gl.setRenderTarget(this.rt); this.gl.render(this.scene, this.ballCam); this.gl.setRenderTarget(null);
      INK_U.res.value.copy(res); INK_U.px.value = px;
    }
  }

  /** 상태 변화(공격자 교대·봉쇄·엿보기)를 잡아 연출을 건다 */
  private syncEvents(m: DodgeMg, i: number | null, t: number): void {
    const defs = dodgeDefs(m); const first = !this.prev;
    const newAtk = !first && this.prev!.ai !== m.ai;
    // 수비자: 새로 들어오면(처음·공격자 교대) 포탈로 등장, 빠지면 포탈로 사라진다
    defs.forEach((j, k) => {
      let z = this.wiz.get(j);
      if (!z) { z = this.makeWiz(j); z.born = t + (first ? 0.5 + k * 0.22 : 0.15 + k * 0.15); }
      else if (newAtk || z.leaving) { z.leaving = 0; z.born = t + 0.6 + k * 0.15; }
    });
    for (const [j, z] of this.wiz) if (!defs.includes(j) && !z.leaving) z.leaving = t;
    // 봉쇄: 새로 막힌 칸은 무너지고, 풀리면(공격자 교대) 다시 솟는다
    const pb = this.prev?.blocked || [];
    m.blocked.forEach(c => { if (!pb.includes(c)) this.tower.pillars[c].collapse(first); });
    pb.forEach(c => { if (!m.blocked.includes(c)) this.tower.pillars[c].restore(); });
    // 엿보기
    const pp = this.prev && this.prev.turn === m.turn && this.prev.ai === m.ai ? this.prev.peek : {};
    for (const k in m.peek) if (m.peek[k] && !pp[k]) {
      const j = +k; const z = this.wiz.get(j); if (z) z.peekAt = t;
      if (i === dodgeAtk(m) && m.shot) this.peekQ.push({ seat: j, die: m.shot.die });
    }
    this.prev = { ai: m.ai, blocked: m.blocked.slice(), peek: { ...m.peek }, turn: m.turn };
  }

  private makeWiz(j: number): Wiz {
    const w = buildWizard(col(j)); this.scene.add(w.root);
    const portal = portalDisc(col(j), 1.8); portal.rotation.x = -Math.PI / 2; portal.visible = false; this.scene.add(portal);
    const column = lightColumn(col(j), 0.75, 6); column.visible = false; this.scene.add(column);
    const dots = buildDots(); dots.visible = false; w.above.add(dots);
    const bulb = buildBulb(); bulb.visible = false; w.above.add(bulb);
    const z: Wiz = { seat: j, w, born: 0, leaving: 0, portal, column, dots, bulb, peekAt: -99, fly: new THREE.Vector3() };
    // 날아갈 방향: 탑 바깥쪽(가운데 칸이면 자리마다 다른 쪽)
    const a = j * 2.1 + 0.7; z.fly.set(Math.cos(a), 0, Math.sin(a));
    this.wiz.set(j, z); return z;
  }

  private drawWizards(m: DodgeMg, i: number | null, t: number, showS: number): void {
    const L = m.last; const home = slots(m.pos); const from = showS >= 0 && L ? slots(L.from) : null;
    const camYaw = Math.atan2(this.camera.position.x, this.camera.position.z);
    for (const [j, z] of [...this.wiz]) {
      const w = z.w; let p = (home[j] || z.w.root.position).clone(); let s = 1; let portalK = 0; let shut = false;
      const body = w.body; body.rotation.set(0, 0, 0); body.position.set(0, Math.sin(t * 2.2 + j) * 0.03, 0);
      w.root.rotation.set(0, camYaw * 0.6, 0);
      // 포탈 등장
      const b = t - z.born;
      if (b < 0) s = 0;
      else if (b < 1.1) { portalK = b < 0.2 ? b / 0.2 : b > 0.8 ? 1 - (b - 0.8) / 0.3 : 1; const k = clamp01((b - 0.2) / 0.5); s = backOut(k); p.y -= (1 - ease(k)) * 1.2; body.rotation.y = (1 - k) * 6; }
      // 포탈로 퇴장
      if (z.leaving) {
        const l = t - z.leaving; if (l > 1.0) { this.removeWiz(j); continue; }
        p = w.root.position.clone(); portalK = l < 0.2 ? l / 0.2 : 1 - clamp01((l - 0.6) / 0.4); const k = clamp01((l - 0.15) / 0.5); s = 1 - ease(k); body.rotation.y = k * 8; p.y -= k * 1.0;
      }
      // 공개 단계
      if (from && L && j in L.to && !z.leaving) {
        const a = from[j], c = home[j];
        if (showS < TL.hop) { const k = ease(showS / TL.hop); p = a.clone().lerp(c, k); p.y += Math.sin(k * Math.PI) * (L.from[j] !== L.to[j] ? 0.9 : 0.25); }
        if (L.hit.includes(j)) {
          if (showS >= TL.fly && showS < TL.back) {
            const u = showS - TL.fly; const out = new THREE.Vector3(c.x, 0, c.z); if (out.lengthSq() < 0.01) out.copy(z.fly); out.normalize();
            p = c.clone().addScaledVector(out, u * 8); p.y += 7 * u - 9 * u * u; body.rotation.set(u * 14, 0, u * 9); shut = true;
            if (u > 0.95) s = 0;
          } else if (showS >= TL.back) {
            const r = clamp01((showS - TL.back) / (TL.backEnd - TL.back)); portalK = r < 0.8 ? 1 : 1 - (r - 0.8) / 0.2;
            const k = clamp01((r - 0.15) / 0.6); s = backOut(k); p.y += (1 - ease(k)) * 2.2; body.rotation.y = (1 - k) * 5;
          } else if (showS >= TL.blast - 0.2) shut = true;
        } else if (showS > TL.blast + 0.2 && showS < TL.blast + 0.8) {
          p.y += Math.sin((showS - TL.blast - 0.2) / 0.6 * Math.PI) * 0.45;
        }
      }
      const cs0 = crowdOf(from && L && showS < TL.hop ? L.from : m.pos, j); z.cs = z.cs == null ? cs0 : z.cs + (cs0 - z.cs) * 0.15;
      w.root.position.copy(p); w.root.scale.setScalar(Math.max(0.001, s * z.cs)); w.root.visible = s > 0.001;
      const sh = w.root.getObjectByName('shadow'); if (sh) sh.visible = p.y > -0.2 && p.y < 2;
      // 포탈 원반 + 빛 기둥
      const at = home[j] || p;
      z.portal.visible = z.column.visible = portalK > 0.01;
      if (portalK > 0.01) {
        z.portal.position.set(at.x, TOP + 0.05, at.z); z.portal.rotation.z = t * 4; z.portal.scale.setScalar(ease(portalK));
        z.column.position.set(at.x, TOP, at.z); z.column.scale.set(ease(portalK), 1, ease(portalK)); (z.column.material as THREE.MeshBasicMaterial).opacity = 0.7 * portalK;
      }
      // 엿보기: 눈을 감고 생각(…) → 전구(수비자 모두에게 같게. 쓴 사람에게만 별자리가 바뀐다)
      const pk = t - z.peekAt; const peeking = m.step === 'pick' && !!m.peek[j];
      const think = peeking && pk < 1.5;
      z.dots.visible = think && i !== dodgeAtk(m); if (think) z.dots.children.forEach((d, k) => { d.position.y = Math.max(0, Math.sin(t * 7 - k * 0.8)) * 0.15; });
      const lit = peeking && !think && i !== dodgeAtk(m);
      z.bulb.visible = lit;
      if (lit) {
        const k = backOut(clamp01((pk - 1.5) / 0.35)); z.bulb.scale.setScalar(Math.max(0.001, k)); z.bulb.position.y = Math.sin(t * 2.5) * 0.06;
        const halo = z.bulb.getObjectByName('halo'); if (halo) halo.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
      }
      w.above.lookAt(this.camera.position.x, w.above.getWorldPosition(new THREE.Vector3()).y, this.camera.position.z);
      w.eyesShut.visible = shut || think; w.eyesOpen.visible = !w.eyesShut.visible;
      // 가끔 눈 깜박
      if (!w.eyesShut.visible && ((t + j * 1.3) % 4) < 0.12) { w.eyesOpen.visible = false; w.eyesShut.visible = true; }
    }
  }
  private removeWiz(j: number): void {
    const z = this.wiz.get(j); if (!z) return; this.scene.remove(z.w.root, z.portal, z.column); this.wiz.delete(j);
  }

  private drawCells(m: DodgeMg, i: number | null, t: number, showS: number, amAtk: boolean): void {
    const st = useStore.getState(); const L = m.last; const atkCol = col(L && showS >= 0 ? L.atk : dodgeAtk(m));
    const pv = amAtk && m.step === 'pick' ? (m.shot ? m.shot.cells : preview(m, st.ui)?.cells || []) : [];
    const selItem = st.sel.length === 1 && rankOf(st.sel[0]) >= 11;
    const blockable = amAtk && m.step === 'pick' && !m.shot && selItem;
    const canMove = i != null && !amAtk && i in m.pos && m.step === 'pick' && !m.done[i];
    const hoverCell = !this.hover ? this.pickCellCached() : -1;
    for (let c = 0; c < 9; c++) {
      const circ = this.circles[c], colm = this.columns[c], ring = this.rings[c], fl = this.flashes[c];
      const cm = circ.material as THREE.MeshBasicMaterial;
      const firing = showS >= 0 && !!L && L.cells.includes(c);
      const gd = this.glows[c]; const gm = gd.material as THREE.MeshBasicMaterial;
      circ.visible = colm.visible = ring.visible = fl.visible = gd.visible = false;
      if (firing && showS >= TL.circle && showS < TL.blast + 0.7) {
        const k = (showS - TL.circle) / 0.5; circ.visible = true; cm.color.set(atkCol); circ.scale.setScalar(Math.max(0.01, backOut(k)));
        cm.opacity = showS < TL.blast ? 0.6 + 0.4 * Math.sin(showS * 30) ** 2 : 1 - (showS - TL.blast) / 0.7;
        circ.rotation.z = showS * 2.5;
        // 모이는 빛: 터지기 직전까지 점점 밝아진다
        gd.visible = true; gm.color.set(atkCol); gm.opacity = showS < TL.blast ? 0.3 + 0.7 * clamp01((showS - TL.circle) / (TL.blast - TL.circle)) : cm.opacity; gd.scale.setScalar(0.8 + 0.3 * Math.sin(showS * 20) ** 2);
      } else if (pv.includes(c)) {
        circ.visible = true; cm.color.set(atkCol); circ.scale.setScalar(m.shot ? 0.92 : 0.96); cm.opacity = m.shot ? 0.7 : 0.75 + 0.2 * Math.sin(t * 4); circ.rotation.z = t * 0.6;
      }
      if (firing && showS >= TL.blast && showS < TL.blast + 0.9) {
        const u = (showS - TL.blast) / 0.9;
        colm.visible = true; (colm.material as THREE.MeshBasicMaterial).color.set('#ffffff').lerp(new THREE.Color(atkCol), 0.3); colm.scale.set(1 - u * 0.6, Math.min(1, u * 6), 1 - u * 0.6); (colm.material as THREE.MeshBasicMaterial).opacity = 1 - u;
        ring.visible = true; (ring.material as THREE.MeshBasicMaterial).color.set(atkCol); ring.scale.setScalar(1 + u * 2.2); (ring.material as THREE.MeshBasicMaterial).opacity = 1 - u;
        fl.visible = u < 0.4; (fl.material as THREE.MeshBasicMaterial).color.set('#ffffff'); fl.scale.setScalar(0.4 + u * 3); (fl.material as THREE.MeshBasicMaterial).opacity = 1 - u / 0.4;
      }
      // 발판 고리: 수비자가 갈 수 있는 칸 / 공격자가 막을 수 있는 칸
      const p = this.tower.pillars[c]; const hm = p.hint.material as THREE.MeshBasicMaterial;
      if (canMove && dodgeCanGo(m, i!, c)) { hm.color.set('#fff4d6'); hm.opacity = hoverCell === c ? 0.95 : 0.35 + 0.2 * Math.sin(t * 4); }
      else if (blockable && dodgeCanBlock(m, c)) { hm.color.set('#ff7a5a'); hm.opacity = hoverCell === c ? 1 : 0.45 + 0.25 * Math.sin(t * 5); }
      else hm.opacity = 0;
    }
  }
  private pcT = -1; private pcV = -1;
  private pickCellCached(): number { if (this.pcT !== this.t) { this.pcT = this.t; this.pcV = this.pickCell(); } return this.pcV; }

  /** 화살표: 수비자끼리는 서로 고른 칸이 보인다(원소 색). 엿본 사람이 고르는 칸은 본인에게만.
      원래 칸에서 갈 칸으로 향하는 납작한 화살표가 발판 위에 살짝 떠 있다. 제자리는 발밑 고리 */
  private stays = new Map<number, THREE.Group>();
  private drawArrows(m: DodgeMg, i: number | null, t: number): void {
    const see = i != null && i in m.pos && m.step === 'pick';
    const shown = new Set<number>(), shownS = new Set<number>();
    const vis = see ? Object.keys(m.moves).map(Number).filter(j => j in m.pos && (j === i || !m.peek[j])) : [];
    for (const j of vis) {
      const from = m.pos[j], to = m.moves[j]; const bob = m.done[j] ? 0 : Math.abs(Math.sin(t * 3 + j)) * 0.05;
      if (from === to) {
        // 같은 칸에서 여럿이 제자리면 고리를 겹치지 않게 안팎으로(자리 순)
        const same = vis.filter(k => m.pos[k] === from && m.moves[k] === from).sort((x, y) => x - y);
        let r = this.stays.get(j); if (!r) { r = buildStay(col(j)); this.scene.add(r); this.stays.set(j, r); }
        r.position.copy(cellPos(from, TOP + 0.1 + bob)); r.scale.setScalar((1 + same.indexOf(j) * 0.2) * (m.done[j] ? 1 : 1 + Math.sin(t * 4 + j) * 0.04)); r.visible = true; shownS.add(j); continue;
      }
      let a = this.arrows.get(j); if (!a) { a = buildArrow(col(j)); this.scene.add(a); this.arrows.set(j, a); }
      const p0 = cellPos(from), p1 = cellPos(to); const d = p1.clone().sub(p0).normalize();
      // 같은 경계를 지나는 화살표(같은 칸에서 같은 쪽으로, 또는 맞바꾸기)는 나란히 벌려 겹치지 않게(자리 순)
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const lane = vis.filter(k => m.pos[k] !== m.moves[k] && Math.min(m.pos[k], m.moves[k]) === lo && Math.max(m.pos[k], m.moves[k]) === hi).sort((x, y) => x - y);
      const e = cellPos(hi).sub(cellPos(lo)).normalize();
      const side = new THREE.Vector3(-e.z, 0, e.x).multiplyScalar((lane.indexOf(j) - (lane.length - 1) / 2) * 0.4);
      a.position.copy(p0).addScaledVector(d, 0.5).add(side); a.position.y = TOP + 0.12 + bob;
      a.rotation.set(0, Math.atan2(-d.x, -d.z), 0); a.visible = true; shown.add(j);
    }
    for (const [j, a] of this.arrows) if (!shown.has(j)) a.visible = false;
    for (const [j, r] of this.stays) if (!shownS.has(j)) r.visible = false;
  }

  private drawCockpit(m: DodgeMg, amAtk: boolean, t: number, dt: number): void {
    const cp = this.cp; this.modeK += ((this.mode === 'atk' ? 1 : 0) - this.modeK) * Math.min(1, dt * 5);
    cp.root.visible = this.modeK > 0.02;
    if (!cp.root.visible) return;
    this.fitFrame();
    cp.desk.position.y = this.deskY - (1 - this.modeK) * 1.2;
    const st = useStore.getState(); const ui = st.ui;
    const aiming = amAtk && m.step === 'pick' && !m.shot;
    const pv = amAtk && m.step === 'pick' ? preview(m, ui) : null;
    const selK = m.shot ? m.shot.k : pv?.k ?? -1;
    // 키캡: 고를 수 있을 때만
    // 1·2·3 키캡은 주사위를 따라가지 않고 쟁반의 칸(주사위가 원래 있던 자리)에 고정
    this.caps.dice.forEach((s, k) => { const h = cp.diceHome[k]; s.visible = aiming; s.position.set(h.x, h.y + 0.02, h.z + 0.42); });
    const many = !!pv && pv.groups.length > 1;
    this.caps.rot.visible = aiming && many; this.caps.rot.position.set(DEV_X + 0.62, 0.5, 0.36);
    // 주사위: 쟁반 ↔ 소켓, 끄는 중이면 손에 들린다.
    // 발동하면 고른 주사위가 수정구로 빨려 들어가 사라지고(소모), 공개가 끝날 무렵 빈자리에 마법진과 함께 새 주사위가 나타나
    // 한 번 떠올라 돌다가 눈이 정해지고, 정해진 눈은 잠깐 확대해 강조한다. 공격자가 바뀌면 3개 모두 차례로 나타난다
    const showS = m.step === 'show' && m.last ? (now() - (m.until - DODGE_SHOW)) / 1000 : -1;
    const key = `${m.ai}|${m.turn}`;
    if (m.shot && this.shotSeen.key !== key) this.shotSeen = { key, at: t, k: m.shot.k, from: cp.dice[m.shot.k].position.clone() };
    if (this.deskAi !== m.ai) { this.deskAi = m.ai; this.regenAll = t + 0.3; }
    const ballL = cp.desk.worldToLocal(this.ball.root.getWorldPosition(new THREE.Vector3()));
    cp.dice.forEach((d, k) => {
      const ring = cp.regenRings[k]; ring.visible = false;
      const home = k === selK && !m.shot ? cp.socket.clone() : cp.diceHome[k].clone();
      // 다시 나타나기(공개 끝무렵, 또는 공격자가 바뀔 때)
      let r = -1;
      if (this.regenAll >= 0 && t - this.regenAll - k * 0.25 < 1.45) r = t - this.regenAll - k * 0.25;
      if (m.shot && k === m.shot.k && m.step === 'show') r = showS - 1.9;
      const consumed = !!m.shot && k === m.shot.k && this.shotSeen.key === key && (m.step === 'pick' || r < 0);
      if (consumed && r < 0) {
        // 소모: 빛나며 수정구로 빨려 들어간다
        const u = (t - this.shotSeen.at) / 0.6; d.visible = u < 1;
        if (u < 1) { const e = ease(u); d.position.copy(this.shotSeen.from).lerp(ballL, e); d.scale.setScalar(0.42 * (1 - e * 0.85)); d.rotation.set(DIE_TILT + e * 6, e * 8, 0); }
        return;
      }
      if (r >= 0 && r < 1.45) {
        ring.visible = true; ring.position.set(cp.diceHome[k].x, 0.06, cp.diceHome[k].z);
        const rm = ring.material as THREE.MeshBasicMaterial; rm.opacity = r < 1.1 ? Math.min(1, r / 0.25) : 1 - (r - 1.1) / 0.35; ring.rotation.z = t * 2; ring.scale.setScalar(0.6 + 0.4 * backOut(Math.min(1, r / 0.3)));
        d.visible = true; const p = cp.diceHome[k].clone(); let sc = 0.42;
        if (r < 0.5) { sc = 0.42 * backOut(r / 0.5); d.rotation.set(DIE_TILT, 0, 0); if (d.userData.spin !== key + k) { d.userData.spin = key + k; setDie(d, 1 + Math.floor(Math.random() * 6)); } }
        else if (r < 1.05) {
          const u = (r - 0.5) / 0.55; p.y += Math.sin(u * Math.PI) * 0.6; const sp = (1 - u) * 18;
          d.rotation.set(DIE_TILT + r * sp, r * sp * 0.8, r * sp * 0.5);
          if (u > 0.82 && d.userData.v !== m.dice[k]) setDie(d, m.dice[k]);
          if (u > 0.82) d.rotation.set(DIE_TILT, 0, 0);
        } else { d.rotation.set(DIE_TILT, 0, 0); if (d.userData.v !== m.dice[k]) setDie(d, m.dice[k]); const u = (r - 1.05) / 0.4; sc = 0.42 * (1 + 0.3 * Math.sin(Math.min(1, u) * Math.PI)); }
        d.position.copy(p); d.scale.setScalar(sc); return;
      }
      d.scale.setScalar(0.42);
      if (d.userData.v !== m.dice[k]) setDie(d, m.dice[k]);
      const target = home;
      const hov = this.hover?.kind === 'die' && this.hover.k === k && aiming;
      if (hov) target.y += 0.12;
      d.position.lerp(target, Math.min(1, dt * 10));
      d.visible = !(this.drag?.moved && this.drag.k === k);
      d.rotation.x = DIE_TILT; d.rotation.z = 0; if (k === selK && !m.shot) d.rotation.y = Math.sin(t * 1.4) * 0.3; else d.rotation.y *= 0.9;
    });
    // 방향 표시판: 고른 주사위의 방향마다 대표 모양을 등불로
    const groups = selK >= 0 ? DODGE_SHAPES[m.dice[selK] ?? 1] : [];
    const curO = m.shot ? -1 : pv?.dor ?? -1;
    cp.grids.forEach((g, o) => {
      const ps = groups[o]; const on = !!ps; const rep = on ? (ps.find(p => p.includes(4)) || ps[Math.floor(ps.length / 2)]) : [];
      g.lamps.forEach((l, c) => { const mt = l.material as THREE.MeshToonMaterial; const lit = rep.includes(c); mt.color.set(lit ? '#ffcf6a' : '#3a2e22'); mt.emissive.set(lit ? (o === curO ? '#ffb020' : '#a06a10') : '#000000'); });
      g.ring.visible = on && o === curO; g.hit.visible = on;
      const hov = this.hover?.kind === 'grid' && this.hover.k === o && on && aiming; g.g.position.y = 0.38 + (hov ? 0.04 : 0);
    });
    // 발동 수정: 고른 주사위가 있으면 빛난다. 발동하면 꺼진다
    const ready = aiming && pv != null; const fired = !!m.shot && m.step === 'pick';
    const cm = cp.crystal.material as THREE.MeshToonMaterial; cm.color.set(col(dodgeAtk(m))); cm.emissive.set(col(dodgeAtk(m)));
    cm.emissiveIntensity = ready ? 0.7 + 0.4 * Math.sin(t * 6) : fired ? 1.2 : 0.15;
    cp.crystal.rotation.y = t * (ready ? 1.5 : 0.3); (cp.crystalGlow.material as THREE.MeshBasicMaterial).opacity = ready ? 0.25 + 0.15 * Math.sin(t * 6) : fired ? 0.35 : 0;
    (cp.crystalGlow.material as THREE.MeshBasicMaterial).color.set(col(dodgeAtk(m)));
    cp.lever.rotation.z = fired ? -0.9 : 0;
    // 오른손: 끄는 주사위 / 가리키는 물건 / 쉬는 자리
    const toCam = (p: THREE.Vector3) => p.clone().multiplyScalar(this.deskS).applyQuaternion(cp.desk.quaternion).add(cp.desk.position);
    let goal = toCam(new THREE.Vector3(DEV_X + 1.6, 0.3, 1.0)); let curl = 0.2 + Math.sin(t * 2) * 0.05;
    if (this.drag?.moved) {
      const d = 2.3; const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const p = new THREE.Vector3(this.ndc.x * th * this.camera.aspect * d, this.ndc.y * th * d, -d);
      cp.dragDie.visible = true; cp.dragDie.position.copy(p); cp.dragDie.rotation.set(t * 2, t * 3, 0); if (cp.dragDie.userData.v !== m.dice[this.drag.k]) setDie(cp.dragDie, m.dice[this.drag.k]);
      goal = p.clone().add(new THREE.Vector3(0.15, -0.4, 0.8).multiplyScalar(this.deskS).applyQuaternion(cp.desk.quaternion)); curl = 0.75;
    } else {
      cp.dragDie.visible = false;
      const hv = this.hover && aiming ? this.hover : null;
      if (hv?.kind === 'die') { goal = toCam(cp.dice[hv.k].position.clone().add(new THREE.Vector3(0.15, 0.35, 0.95))); curl = 0.5; }
      else if (hv?.kind === 'grid') { goal = toCam(cp.grids[hv.k].g.position.clone().add(new THREE.Vector3(DEV_X + 0.15, 0.3, -0.05 + 0.95))); curl = 0.35; }
      else if (hv?.kind === 'fire') { goal = toCam(new THREE.Vector3(DEV_X + 0.95 + 0.15, 0.55, 0.95)); curl = 0.35; }
      else if (aiming && ui.dk != null) { goal = toCam(new THREE.Vector3(DEV_X + 0.9, 0.4, 1.1)); }
    }
    cp.right.root.position.lerp(goal, Math.min(1, dt * 9)); cp.right.root.quaternion.copy(cp.desk.quaternion); cp.right.root.rotateY(0.25);
    curlHand(cp.right, curl);
    curlHand(cp.left, 0.25 + Math.max(0, Math.sin(t * 1.3)) * 0.12);
    // 엿보기: 포탈 → 얼굴 → 주사위 훑기 → 구름 말풍선 → 돌아간다
    const pk = cp.peek;
    if (!this.peekNow && this.peekQ.length) {
      const q = this.peekQ.shift()!; this.peekNow = { seat: q.seat, t0: t };
      pk.holder.clear(); let h = this.heads.get(q.seat); if (!h) { h = buildHead(col(q.seat)).head; h.traverse(x => x.layers.set(1)); this.heads.set(q.seat, h); } pk.holder.add(h);
      (pk.portal.material as THREE.MeshBasicMaterial).color.set(col(q.seat)); setDie(pk.die, q.die);
    }
    pk.root.visible = !!this.peekNow && amAtk;
    if (this.peekNow) {
      const u = t - this.peekNow.t0; const D = 3.4;
      if (u > D) this.peekNow = null;
      else {
        const open = u < 0.35 ? u / 0.35 : u > D - 0.35 ? (D - u) / 0.35 : 1;
        pk.portal.scale.setScalar(Math.max(0.01, ease(open))); pk.portal.rotation.z = -t * 5;
        const out = u < 0.4 ? 0 : u < 0.8 ? ease((u - 0.4) / 0.4) : u < D - 0.8 ? 1 : ease((D - 0.4 - u) / 0.4);
        const head = pk.holder; head.scale.setScalar(0.27); head.position.set(0, -0.06, -0.15 + out * 0.3);
        // 훑어보기: 아래(주사위 쪽)를 보며 좌우로
        const look = u > 0.9 && u < 2.0 ? Math.sin((u - 0.9) / 1.1 * Math.PI * 2) * 0.6 : 0;
        head.rotation.set(0.35 * out, look + 0.2, 0);
        head.visible = out > 0.01;
        const bub = u > 1.9 && u < D - 0.6; pk.cloud.visible = bub; if (bub) pk.cloud.scale.setScalar(backOut(clamp01((u - 1.9) / 0.3)));
        pk.die.rotation.y = t;
      }
    }
  }

  /** 카메라 맞추기: 위쪽 석판과 아래(공격자는 책상, 수비자는 화면 끝) 사이에 탑 꼭대기가 가장 크게 들어오는 거리를 찾고 가운데에 둔다 */
  private fitRes: Record<string, { pos: THREE.Vector3; look: THREE.Vector3 }> = {};
  private fitCam(mode: 'atk' | 'def'): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const H = this.dom.clientHeight || 720, a = this.camera.aspect || 1.6, k = uiScale();
    const key = [mode, a.toFixed(3), H, k.toFixed(3), this.deskS.toFixed(3)].join('|');
    if (this.fitRes[key]) return this.fitRes[key];
    const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const top = 1 - 2 * ((slabH(k).h2 + 12) / H);
    // 공격자: 책상(계기판 꼭대기까지)보다 위
    let bottom = -0.92;
    if (mode === 'atk') {
      const s = this.deskS, sn = Math.sin(0.85), cs = Math.cos(0.85);
      const pts: [number, number][] = [[-0.95, 0.1], [-0.05, 0.85]];
      bottom = Math.max(...pts.map(([z, y]) => { const cy = this.deskY + (-z * sn + y * cs) * s, cz = -3 + (z * cs + y * sn) * s; return cy / (-cz * th); })) + 0.03;
    }
    const side = 0.99;
    const elev = mode === 'atk' ? 1.05 : 0.86;
    const R = 3.9, hd = 2.4;
    // 폭은 꼭대기 테두리로만 잰다(아래 몸통까지 넣으면 좌우가 필요 이상 비었다)
    const pts = [[-R, 0.3, -R], [R, 0.3, -R], [-R, 0.3, R], [R, 0.3, R], [-2.6, hd, -2.6], [2.6, hd, -2.6], ...(mode === 'def' ? starSpots(a).flatMap(p => [[p.x - 1.25, p.y + 1.25, p.z], [p.x + 1.25, p.y - 1.25, p.z]]) : [])].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const cam = new THREE.PerspectiveCamera(this.camera.fov, a, 0.1, 1000);
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
    const look = new THREE.Vector3(0, 0.6, 0);
    const box = (d: number) => {
      cam.position.copy(look).addScaledVector(dir, d); cam.lookAt(look); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of pts) { const v = p.clone().project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      return { x0, x1, y0, y1 };
    };
    let d = 20;
    for (let pass = 0; pass < 3; pass++) {
      let lo = 4, hi = 80;
      // 공격자는 영역을 꽉 채우지 않고 여백을 둔다(내려다보는 통제실 느낌, 사용자 2026-10-14)
      const fill = mode === 'atk' ? 0.9 : 1;
      for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2; const b = box(m); if (b.y1 - b.y0 <= (top - bottom) * fill && b.x1 - b.x0 <= 2 * side * fill) hi = m; else lo = m; }
      d = hi; const b = box(d);
      // 세로 가운데 맞추기: 카메라를 화면 위아래 방향으로 옮긴다
      const off = (top + bottom) / 2 - (b.y0 + b.y1) / 2;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      look.addScaledVector(up, -off * th * d);
    }
    const res = { pos: look.clone().addScaledVector(dir, d), look: look.clone() };
    this.fitRes[key] = res; return res;
  }

  private drawCamera(dt: number): void {
    const g = this.fitCam(this.mode);
    const k = Math.min(1, dt * 3.5);
    this.camPos.lerp(g.pos, k); this.camLook.lerp(g.look, k);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
  }
}

/** 통제실 돌벽(어두운 벽돌 + 잉크 줄 + 촛불 빛) */
let wallT: THREE.Texture | null = null;
function wallTex(): THREE.Texture {
  if (wallT) return wallT;
  wallT = canvasTex(1024, 640, g => {
    const lg = g.createRadialGradient(512, 300, 60, 512, 320, 640); lg.addColorStop(0, '#3a2c34'); lg.addColorStop(1, '#120c10'); g.fillStyle = lg; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round';
    for (let r = 0; r < 10; r++) {
      const y = r * 64 + 20; wobbleLine(g, [[0, y], [512, y + 2], [1024, y]], 3);
      for (let c = 0; c < 7; c++) { const x = c * 160 + (r % 2) * 80; wobbleLine(g, [[x, y], [x + 1, y + 64]], 3); }
    }
    const cg = g.createRadialGradient(840, 420, 10, 840, 420, 260); cg.addColorStop(0, 'rgba(255,170,90,.28)'); cg.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = cg; g.fillRect(0, 0, 1024, 640);
  });
  return wallT;
}
