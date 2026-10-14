/* 주사위 눈 피하기 아레나: 고대 탑 꼭대기(수비자) + 내려다보는 통제실(공격자).
   규칙은 엔진 그대로, 여기서는 상태를 읽어 그리고 조작을 cmd로 보낸다 */
import * as THREE from 'three';
import { DODGE_SHAPES, DODGE_SHOW, type DodgeMg, R as rankOf, dodgeAtk, dodgeCanBlock, dodgeCanGo, dodgeDefs, now } from '@cubic3/engine';
import { SEATCOL } from '../game';
import { cmd } from '../flow';
import { useStore } from '../store';
import { preview } from '../ui/MgPanel4';
import { type OldHand, type Wizard, buildArrow, buildBulb, buildCloud, buildDie, buildDots, buildHand, buildHead, buildWizard, curlHand, glowDisc, lightColumn, magicCircle, portalDisc, setDie } from './props';
import { type Pillar, T, TOP, buildTower, cellPos } from './tower';
import { INK_U, backOut, clamp01, ease, glow, ink, toon } from './toon';
import { RoundedBoxGeometry } from 'three-stdlib';

const col = (j: number) => SEATCOL[j % 5];
/** 통제실 책상: 카메라 앞 높이·크기 */
const DESK_Y = -0.8, DESK_S = 0.4, HAND = 1.05;
/** 연출 시각표(초, 공개 단계 시작부터) */
const TL = { hop: 0.5, circle: 0.4, blast: 1.3, fly: 1.35, back: 2.4, backEnd: 3.2 };

/** 한 칸에 여럿이 서면 조금씩 비켜 선다 */
function slots(pos: Record<number, number>): Record<number, THREE.Vector3> {
  const by: Record<number, number[]> = {}; Object.keys(pos).forEach(k => { const j = +k; (by[pos[j]] ||= []).push(j); });
  const out: Record<number, THREE.Vector3> = {};
  const OFF: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-0.42, 0], [0.42, 0]], 3: [[-0.42, 0.3], [0.42, 0.3], [0, -0.38]], 4: [[-0.42, -0.4], [0.42, -0.4], [-0.42, 0.4], [0.42, 0.4]] };
  for (const c in by) by[c].sort((a, b) => a - b).forEach((j, k) => { const o = OFF[Math.min(4, by[c].length)][k] || [0, 0]; out[j] = cellPos(+c, TOP).add(new THREE.Vector3(o[0], 0, o[1])); });
  return out;
}

interface Wiz {
  seat: number; w: Wizard; born: number; leaving: number;
  portal: THREE.Mesh; column: THREE.Mesh;
  dots: THREE.Group; bulb: THREE.Group; die: THREE.Group; peekAt: number;
  fly: THREE.Vector3;
}

interface Cockpit {
  root: THREE.Group; desk: THREE.Group; frame: THREE.Group;
  dice: THREE.Group[]; diceHome: THREE.Vector3[]; socket: THREE.Vector3;
  grids: { g: THREE.Group; lamps: THREE.Mesh[]; hit: THREE.Mesh; ring: THREE.Mesh }[];
  crystal: THREE.Mesh; crystalGlow: THREE.Mesh; lever: THREE.Group;
  left: OldHand; right: OldHand; candle: THREE.Object3D;
  peek: { root: THREE.Group; portal: THREE.Mesh; holder: THREE.Group; cloud: THREE.Group; die: THREE.Group };
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
  private headDie = new Map<number, number>();

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private dom: HTMLCanvasElement) {
    scene.add(this.tower.root);
    scene.add(new THREE.HemisphereLight('#8f8fc8', '#3a2820', 0.7));
    const sun = new THREE.DirectionalLight('#ffd2a0', 1.7); sun.position.set(-8, 14, 9); scene.add(sun);
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
    dom.addEventListener('pointermove', this.onMove); dom.addEventListener('pointerdown', this.onDown); window.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointerleave', this.onLeave);
    // 처음 상태 반영
    const m = this.mg(); if (m) { m.blocked.forEach(c => this.tower.pillars[c].collapse(true)); }
    if (import.meta.env.DEV) (window as unknown as { __arena: DodgeArena }).__arena = this;
  }

  dispose(): void {
    this.dom.removeEventListener('pointermove', this.onMove); this.dom.removeEventListener('pointerdown', this.onDown); window.removeEventListener('pointerup', this.onUp);
    this.dom.removeEventListener('pointerleave', this.onLeave);
    this.camera.remove(this.cp.root); this.scene.clear();
  }

  private mg(): DodgeMg | null { const S = useStore.getState().S; return S?.phase === 'mg' && S.mg?.id === 'dodge' ? S.mg : null; }

  /* ---------------- 통제실(공격자) ---------------- */
  private buildCockpit(): Cockpit {
    const root = new THREE.Group();
    const desk = new THREE.Group(); desk.position.set(0, DESK_Y, -3.0); desk.rotation.x = 0.85; desk.scale.setScalar(DESK_S); root.add(desk);
    const wood = toon('#5a3a26'), dark = toon('#2e2018'), brass = toon('#b88a3e'), plate = toon('#2a2320');
    const top = ink(new RoundedBoxGeometry(12, 0.4, 2.1, 2, 0.08), wood, 0.05); top.position.set(0, -0.2, 0.1); desk.add(top);
    const lip = ink(new RoundedBoxGeometry(12, 0.2, 0.25, 2, 0.06), dark, 0.04); lip.position.set(0, 0.04, -0.9); desk.add(lip);
    // 나뭇결
    for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.02), toon('#3b2618')); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.002, -0.75 + k * 0.33); desk.add(l); }
    // 주사위 쟁반
    const tray = ink(new RoundedBoxGeometry(1.75, 0.1, 0.75, 2, 0.04), dark, 0.035); tray.position.set(-1.65, 0.05, 0.05); desk.add(tray);
    const diceHome = [-2.2, -1.65, -1.1].map(x => new THREE.Vector3(x, 0.27, 0.05));
    const dice = diceHome.map(p => { const d = buildDie(1); d.scale.setScalar(0.3); d.position.copy(p); desk.add(d); d.userData.kind = 'die'; return d; });
    // 계기판: 소켓(고른 주사위) · 방향 표시판 4개 · 발동 수정
    const dev = new THREE.Group(); dev.position.set(0.95, 0, -0.05); desk.add(dev);
    const base = ink(new RoundedBoxGeometry(2.9, 0.32, 1.05, 2, 0.06), toon('#6b5530'), 0.04); base.position.y = 0.16; dev.add(base);
    const face = ink(new RoundedBoxGeometry(2.75, 0.06, 0.9, 2, 0.02), plate, 0.02); face.position.y = 0.34; dev.add(face);
    for (const x of [-1.33, 1.33]) for (const z of [-0.42, 0.42]) { const r = ink(new THREE.SphereGeometry(0.045, 8, 6), brass, 0.012); r.position.set(x, 0.34, z); dev.add(r); }
    const sock = ink(new THREE.TorusGeometry(0.22, 0.05, 8, 24), brass, 0.02); sock.rotation.x = Math.PI / 2; sock.position.set(-0.95, 0.38, 0); dev.add(sock);
    // 소켓 자리(책상 기준): 계기판 x 0.95 + 소켓 -0.95
    const socket = new THREE.Vector3(0, 0.62, -0.05);
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
    const candle = new THREE.Group(); candle.position.set(3.9, 0, -0.5); desk.add(candle);
    const wax = ink(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 12), toon('#efe2c2'), 0.025); wax.position.y = 0.25; candle.add(wax);
    const fl = ink(new THREE.ConeGeometry(0.07, 0.22, 8), toon('#ffcf5a', { fresh: true, emissive: '#ffb030', ei: 1.2 }), 0.015); fl.position.y = 0.62; candle.add(fl);
    const cl = new THREE.PointLight('#ffb060', 3, 4, 1.5); cl.position.y = 0.8; candle.add(cl);
    // 손: 왼손은 책상에 얹고, 오른손은 포인터를 따라간다
    const left = buildHand(-1); left.root.scale.setScalar(HAND); left.root.position.set(-3.1, 0.16, 0.55); left.root.rotation.y = -0.5; desk.add(left.root); curlHand(left, 0.3);
    const right = buildHand(1); right.root.scale.setScalar(HAND * DESK_S); root.add(right.root);
    // 창틀(통제실 창 너머로 실험장을 내려다본다)
    const frame = new THREE.Group(); root.add(frame);
    // 엿보기: 통제실 허공에 포탈이 열리고 얼굴이 튀어나온다
    const pr = new THREE.Group(); pr.position.set(-1.08, -0.3, -2.6); pr.visible = false; root.add(pr);
    const portal = portalDisc('#9b7bff', 0.62); pr.add(portal);
    const holder = new THREE.Group(); pr.add(holder);
    const cloud = buildCloud(0.3); cloud.position.set(0.42, 0.3, 0.1); pr.add(cloud);
    const pdie = buildDie(1); pdie.scale.setScalar(0.12); pdie.rotation.set(0.5, 0.6, 0); pdie.position.set(0, 0.0, 0.12); cloud.add(pdie);
    const dragDie = buildDie(1); dragDie.scale.setScalar(0.3 * DESK_S); dragDie.visible = false; root.add(dragDie);
    return { root, desk, frame, dice, diceHome, socket, grids, crystal, crystalGlow, lever, left, right, candle, peek: { root: pr, portal, holder, cloud, die: pdie }, dragDie };
  }

  /** 창틀을 화면 비율에 맞춰 다시 짓는다 */
  private fitFrame(): void {
    const a = this.camera.aspect; if (Math.abs(a - this.aspect) < 1e-3) return; this.aspect = a;
    const f = this.cp.frame; f.clear(); const d = 2.0; const h = d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)); const w = h * a;
    const stone = toon('#4d4238'), dark = toon('#2b231d');
    const post = new RoundedBoxGeometry(0.2, h * 2 + 0.4, 0.2, 2, 0.04);
    for (const s of [-1, 1]) { const p = ink(post, stone, 0.03); p.position.set(s * (w + 0.02), 0, -d); f.add(p); }
    const lintel = ink(new RoundedBoxGeometry(w * 2 + 0.6, 0.2, 0.2, 2, 0.04), stone, 0.02); lintel.position.set(0, h + 0.02, -d); f.add(lintel);
    // 아치 모서리 돌
    for (const s of [-1, 1]) { const k = ink(new RoundedBoxGeometry(0.5, 0.18, 0.28, 2, 0.04), dark, 0.025); k.position.set(s * (w - 0.18), h - 0.12, -d + 0.02); k.rotation.z = s * 0.6; f.add(k); }
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
    this.ray.setFromCamera(this.ndc, this.camera);
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
    return { m, i, amAtk, selItem, ui: st.ui, aiming: amAtk && m.step === 'pick' && !m.shot, blocking: amAtk && m.step === 'block' && selItem, moving: !amAtk && i in m.pos && m.step === 'pick' && !m.done[i] };
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
    const die = buildDie(1); die.scale.setScalar(0.5); die.rotation.set(0.5, 0.7, 0); die.visible = false; w.above.add(die);
    const z: Wiz = { seat: j, w, born: 0, leaving: 0, portal, column, dots, bulb, die, peekAt: -99, fly: new THREE.Vector3() };
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
      w.root.position.copy(p); w.root.scale.setScalar(Math.max(0.001, s)); w.root.visible = s > 0.001;
      const sh = w.root.getObjectByName('shadow'); if (sh) sh.visible = p.y > -0.2 && p.y < 2;
      // 포탈 원반 + 빛 기둥
      const at = home[j] || p;
      z.portal.visible = z.column.visible = portalK > 0.01;
      if (portalK > 0.01) {
        z.portal.position.set(at.x, TOP + 0.05, at.z); z.portal.rotation.z = t * 4; z.portal.scale.setScalar(ease(portalK));
        z.column.position.set(at.x, TOP, at.z); z.column.scale.set(ease(portalK), 1, ease(portalK)); (z.column.material as THREE.MeshBasicMaterial).opacity = 0.7 * portalK;
      }
      // 엿보기: 눈을 감고 생각(…) → 전구(쓴 사람에게는 주사위 눈)
      const pk = t - z.peekAt; const peeking = m.step === 'pick' && !!m.peek[j];
      const think = peeking && pk < 1.5;
      z.dots.visible = think && i !== dodgeAtk(m); if (think) z.dots.children.forEach((d, k) => { d.position.y = Math.max(0, Math.sin(t * 7 - k * 0.8)) * 0.15; });
      const lit = peeking && !think && i !== dodgeAtk(m); const mine = i === j;
      z.bulb.visible = lit && !mine; z.die.visible = lit && mine;
      if (lit) {
        const k = backOut(clamp01((pk - 1.5) / 0.35)); const o = mine ? z.die : z.bulb; o.scale.setScalar((mine ? 0.5 : 1) * Math.max(0.001, k)); o.position.y = Math.sin(t * 2.5) * 0.06;
        if (mine && m.shot) { if (this.headDie.get(j) !== m.shot.die) { setDie(z.die, m.shot.die); this.headDie.set(j, m.shot.die); } z.die.rotation.set(0.45, t * 0.8, 0.15); }
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
    const blockable = amAtk && m.step === 'block' && selItem;
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

  /** 화살표: 수비자끼리는 서로 고른 칸이 보인다(원소 색) */
  private drawArrows(m: DodgeMg, i: number | null, t: number): void {
    const see = i != null && i in m.pos && m.step === 'pick';
    const occ = new Set(Object.values(m.pos));
    const byCell: Record<number, number[]> = {};
    if (see) for (const k in m.moves) (byCell[m.moves[k]] ||= []).push(+k);
    const shown = new Set<number>();
    for (const c in byCell) byCell[c].sort((a, b) => a - b).forEach((j, k, arr) => {
      let a = this.arrows.get(j); if (!a) { a = buildArrow(col(j)); this.scene.add(a); this.arrows.set(j, a); }
      const p = cellPos(+c); const y = occ.has(+c) ? 2.9 : 0.9; const bob = m.done[j] ? 0 : Math.abs(Math.sin(t * 4 + j)) * 0.25;
      a.position.set(p.x + (k - (arr.length - 1) / 2) * 0.5, y + bob, p.z); a.rotation.y = Math.atan2(this.camera.position.x - p.x, this.camera.position.z - p.z);
      a.visible = true; shown.add(j);
    });
    for (const [j, a] of this.arrows) if (!shown.has(j)) a.visible = false;
  }

  private drawCockpit(m: DodgeMg, amAtk: boolean, t: number, dt: number): void {
    const cp = this.cp; this.modeK += ((this.mode === 'atk' ? 1 : 0) - this.modeK) * Math.min(1, dt * 5);
    cp.root.visible = this.modeK > 0.02;
    if (!cp.root.visible) return;
    this.fitFrame();
    cp.desk.position.y = DESK_Y - (1 - this.modeK) * 1.2; cp.frame.position.y = (1 - this.modeK) * 1.2;
    const st = useStore.getState(); const ui = st.ui;
    const aiming = amAtk && m.step === 'pick' && !m.shot;
    const pv = amAtk && m.step === 'pick' ? preview(m, ui) : null;
    const selK = m.shot ? m.shot.k : pv?.k ?? -1;
    // 주사위: 쟁반 ↔ 소켓, 끄는 중이면 손에 들린다
    cp.dice.forEach((d, k) => {
      if (d.userData.v !== m.dice[k]) setDie(d, m.dice[k]);
      const target = k === selK ? cp.socket.clone() : cp.diceHome[k].clone();
      const hov = this.hover?.kind === 'die' && this.hover.k === k && aiming;
      if (hov) target.y += 0.12;
      d.position.lerp(target, Math.min(1, dt * 10));
      d.visible = !(this.drag?.moved && this.drag.k === k);
      if (k === selK) d.rotation.y = Math.sin(t * 1.4) * 0.3; else d.rotation.y *= 0.9;
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
    const toCam = (p: THREE.Vector3) => p.clone().multiplyScalar(DESK_S).applyQuaternion(cp.desk.quaternion).add(cp.desk.position);
    let goal = toCam(new THREE.Vector3(2.7, 0.3, 1.0)); let curl = 0.2 + Math.sin(t * 2) * 0.05;
    if (this.drag?.moved) {
      const d = 2.3; const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const p = new THREE.Vector3(this.ndc.x * th * this.camera.aspect * d, this.ndc.y * th * d, -d);
      cp.dragDie.visible = true; cp.dragDie.position.copy(p); cp.dragDie.rotation.set(t * 2, t * 3, 0); if (cp.dragDie.userData.v !== m.dice[this.drag.k]) setDie(cp.dragDie, m.dice[this.drag.k]);
      goal = p.clone().add(new THREE.Vector3(0.15, -0.4, 0.8).multiplyScalar(DESK_S).applyQuaternion(cp.desk.quaternion)); curl = 0.75;
    } else {
      cp.dragDie.visible = false;
      const hv = this.hover && aiming ? this.hover : null;
      if (hv?.kind === 'die') { goal = toCam(cp.dice[hv.k].position.clone().add(new THREE.Vector3(0.15, 0.35, 0.95))); curl = 0.5; }
      else if (hv?.kind === 'grid') { goal = toCam(cp.grids[hv.k].g.position.clone().add(new THREE.Vector3(0.95 + 0.15, 0.3, -0.05 + 0.95))); curl = 0.35; }
      else if (hv?.kind === 'fire') { goal = toCam(new THREE.Vector3(0.95 + 0.95 + 0.15, 0.55, 0.95)); curl = 0.35; }
      else if (aiming && ui.dk != null) { goal = toCam(new THREE.Vector3(1.9, 0.4, 1.1)); }
    }
    cp.right.root.position.lerp(goal, Math.min(1, dt * 9)); cp.right.root.quaternion.copy(cp.desk.quaternion); cp.right.root.rotateY(0.25);
    curlHand(cp.right, curl);
    curlHand(cp.left, 0.25 + Math.max(0, Math.sin(t * 1.3)) * 0.12);
    // 엿보기: 포탈 → 얼굴 → 주사위 훑기 → 구름 말풍선 → 돌아간다
    const pk = cp.peek;
    if (!this.peekNow && this.peekQ.length) {
      const q = this.peekQ.shift()!; this.peekNow = { seat: q.seat, t0: t };
      pk.holder.clear(); let h = this.heads.get(q.seat); if (!h) { h = buildHead(col(q.seat)).head; this.heads.set(q.seat, h); } pk.holder.add(h);
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

  private drawCamera(dt: number): void {
    const a = this.camera.aspect || 1.6;
    // 화면이 좁을수록 멀리서(판이 다 들어오게)
    const fit = Math.max(1, 1.75 / a);
    const def = { pos: new THREE.Vector3(0, 11.5 * fit, 9.6 * fit), look: new THREE.Vector3(0, 0.2, -1.1) };
    const atk = { pos: new THREE.Vector3(0, 19 * fit, 11.5 * fit), look: new THREE.Vector3(0, -1, 1.1) };
    const g = this.mode === 'atk' ? atk : def;
    const k = Math.min(1, dt * 3.5);
    this.camPos.lerp(g.pos, k); this.camLook.lerp(g.look, k);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
  }
}
