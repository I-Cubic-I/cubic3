/* 선 가위바위보 아레나(구상 중, 사용자 2026-10-15): 3원소(불·물·풀) 마법 싸움.
   구도(사용자 스케치 2026-10-15): 선은 먼 산 꼭대기에 아주 작게(원근 극대화) 서서 두 팔을 들고 주문을 외운다.
   산 둘레엔 어두운 먹구름, 하늘엔 커다란 마법진. 카메라는 낮게, 도전자들의 등 뒤에서 산을 올려다본다 */
import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { type Hand, type OvnMg, RPS_SHOW, now } from '@cubic3/engine';
import { SEATCOL, seatName } from '../game';
import { useStore } from '../store';
import { cmd } from '../flow';
import { type Wizard, buildWizard, magicTex, softTex } from './props';
import { INK, INK_U, backOut, canvasTex, clamp01, ease, gradientMap, ink, toon } from './toon';
import { ECOL, buildAsh, buildFireball, buildFlames, buildShield, buildVines, buildWave, scorch, unscorch } from './rpsFx';
import { rng } from './caveParts';
import { slabH, uiScale } from '../ui/scale';

/** 화각(넓게: 원근을 키운다) · 카메라 높이 · 도전자 사이 간격 · 산 자리 */
/* 도전자 부채꼴(사용자 2026-10-15): 내 캐릭터가 가운데 맨 앞이라 가장 크게 보이고, 나머지는 양옆으로 산 쪽을 향해 물러난다(drawCamera) */
const FOV = 50, CAM_H = 1.25, HEAD_Y = 0.02, PEAK = new THREE.Vector3(-5.5, 0, -42);

/** slot: 부채꼴 위 자리(0 = 가운데 맨 앞, ±1·±2 = 옆으로 갈수록 멀리) */
interface RW {
  w: Wizard; pos: THREE.Vector3; tag: THREE.Sprite; arms: THREE.Object3D[]; slot: number;
  /** 결과 연출 조각: 방어막 · 불꽃 · 재 · 덩굴 · 불덩이, 그을린 재료 원본 */
  fx: { shield: ReturnType<typeof buildShield>; flames: THREE.Group; ash: ReturnType<typeof buildAsh>; vines: ReturnType<typeof buildVines>; ball: THREE.Group; keep: Map<THREE.Mesh, THREE.Material>; dirty: boolean };
}
/** 결과 연출 시각(모두 낸 뒤 초, 사용자 2026-10-15: 1.5초 텀 → 도전자 방어 → 선의 광역 공격 → 탈락). 숫자는 [제안] */
/** 파도가 달리는 거리: 산 쪽 z = -18에서 도전자 맨 앞(z ≈ 0)을 조금 지난 곳까지 */
const WAVE_RUN = 18.5;
const SH = { shield: 1.5, cast: 1.8, launch: 2.45, fire: 0.6, wave0: 2.4, waveT: 1.5, vine: 2.7, vineHit: 2.95, fade: 4.4 };

export class RpsArena {
  private wiz = new Map<number, RW>(); private t = 0; private key = ''; private fan: number[] = [];
  /** 산(높이 1로 짓고 화면에 맞춰 키운다) · 산 둘레 구름 · 하늘 마법진 */
  private mount = new THREE.Group(); private clouds: THREE.Object3D[] = []; private circle!: THREE.Mesh; private circleGlow!: THREE.Mesh;
  private peakH = 16; private chant!: THREE.Mesh; private chantLight!: THREE.PointLight;
  private crown: THREE.Sprite; private meRing: THREE.Mesh;
  /** 원소 고르기(사용자 2026-10-15): 화면 가운데 원형으로 놓인 구슬 3개(선·도전자 모두 같은 방식). 카메라에 붙어 늘 같은 자리·크기 */
  private orbRing = new THREE.Group(); private orbs: { h: Hand; g: THREE.Group; ball: THREE.Mesh; mat: THREE.MeshToonMaterial }[] = [];
  /** 선의 광역 공격: 파도(물) */
  private wave!: THREE.Group;
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(-9, -9); private hover: Hand | null = null;
  /** 개발용: 도전자 수를 바꿔 배치 미리 보기(가짜 자리 번호) */
  fake = 0;

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private dom: HTMLCanvasElement) {
    // 먹구름 낀 어두운 하늘: 멀수록 보랏빛 회색으로 흐려진다
    scene.background = new THREE.Color('#3b3647');
    scene.fog = new THREE.Fog('#3b3647', 25, 140);
    scene.add(new THREE.HemisphereLight('#c9bfe0', '#1c1822', 0.9));
    const sun = new THREE.DirectionalLight('#e8dcff', 1.1); sun.position.set(6, 10, 8); scene.add(sun);
    // 땅(배경은 아직 없다: 어두운 평지만)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), toon('#2a2430')); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    this.buildMountain();
    this.buildSky();
    this.wave = buildWave(); scene.add(this.wave);
    this.crown = tagSprite('선', '#ffe28a'); this.crown.visible = false; scene.add(this.crown);
    this.meRing = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.78, 40), new THREE.MeshBasicMaterial({ color: '#ffe28a', transparent: true, opacity: 0.9, depthWrite: false }));
    this.meRing.rotation.x = -Math.PI / 2; this.meRing.visible = false; scene.add(this.meRing);
    scene.add(camera); this.buildOrbs(); camera.add(this.orbRing);
    dom.addEventListener('pointermove', this.onMove); dom.addEventListener('pointerdown', this.onDown); dom.addEventListener('pointerleave', this.onLeave);
    if (import.meta.env.DEV) (window as unknown as { __rps: RpsArena }).__rps = this;
  }
  dispose(): void {
    this.dom.removeEventListener('pointermove', this.onMove); this.dom.removeEventListener('pointerdown', this.onDown); this.dom.removeEventListener('pointerleave', this.onLeave); this.dom.style.cursor = '';
    this.camera.remove(this.orbRing); this.scene.clear(); this.scene.background = null; this.scene.fog = null; this.wiz.clear(); }

  /* ---------------- 산 · 구름 · 하늘 마법진 ---------------- */
  /** 뾰족한 바위산(높이 1, 꼭대기는 선이 설 만큼 평평하게) + 둘레 먹구름 */
  private buildMountain(): void {
    this.mount.position.copy(PEAK); this.scene.add(this.mount);
    let g: THREE.BufferGeometry = new THREE.CylinderGeometry(0.012, 0.36, 1, 10, 8); g.translate(0, 0.5, 0);
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const p = g.attributes.position; const r = rng(11);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y > 0.99) continue;
      const f = 1 + (r() - 0.5) * 0.5 * (1 - y * 0.6);
      p.setXYZ(i, p.getX(i) * f + (r() - 0.5) * 0.03, y + (y > 0.01 ? (r() - 0.5) * 0.04 : 0), p.getZ(i) * f);
    }
    g.computeVertexNormals();
    const m = new THREE.MeshToonMaterial({ color: '#675b72', gradientMap: gradientMap() }); (m as unknown as { flatShading: boolean }).flatShading = true;
    this.mount.add(ink(g, m, 0.002));
    // 옆 봉우리 둘(낮게)
    for (const [x, z, s] of [[-0.42, 0.1, 0.55], [0.38, -0.15, 0.45]] as const) { const b = new THREE.Mesh(g, m); b.position.set(x, 0, z); b.scale.set(s * 1.2, s, s * 1.2); this.mount.add(b); }
    // 산허리를 감싼 먹구름(산 크기에 맞춰 같이 커진다)
    const cm = [toon('#2e2a38'), toon('#3a3546'), toon('#25212d')];
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + r() * 0.4, y = 0.3 + r() * 0.32, rad = 0.36 * (1 - y) + 0.16 + r() * 0.1;
      const c = puff(r, cm); c.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); c.scale.setScalar(0.045 + r() * 0.035); this.mount.add(c); this.clouds.push(c);
    }
  }
  /** 하늘: 산 위로 넓게 깔린 먹구름 띠 + 오른쪽 위 커다란 마법진(천천히 돈다) */
  private buildSky(): void {
    const r = rng(23); const cm = [toon('#2b2735'), toon('#352f42'), toon('#221e29')];
    for (let k = 0; k < 26; k++) {
      const c = puff(r, cm); c.position.set(-70 + k * 5.6 + r() * 3, 26 + r() * 10, -75 - r() * 25); c.scale.setScalar(4 + r() * 4); this.scene.add(c); this.clouds.push(c);
    }
    const mat = new THREE.MeshBasicMaterial({ map: magicTex(), color: '#c27bff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.circle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); this.circle.rotation.x = -Math.PI / 2; this.scene.add(this.circle);
    this.circleGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTex(), color: '#7a3cff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
    this.circleGlow.rotation.x = -Math.PI / 2; this.scene.add(this.circleGlow);
    // 주문: 선의 머리 위에 맺히는 보랏빛
    this.chant = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTex(), color: '#c48cff', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.scene.add(this.chant);
    this.chantLight = new THREE.PointLight('#b47bff', 30, 8, 1.6); this.scene.add(this.chantLight);
  }

  /* ---------------- 원소 구슬(화면 가운데 원형) ---------------- */
  /** 불(위) · 물(오른쪽 아래) · 풀(왼쪽 아래). 구슬 사이 화살표 = 이기는 쪽에서 지는 쪽으로(물 → 불 → 풀 → 물) */
  private buildOrbs(): void {
    for (const h of ['R', 'P', 'S'] as Hand[]) {
      const e = ORB[h]; const g = new THREE.Group(); const a = THREE.MathUtils.degToRad(e.ang);
      g.position.set(Math.cos(a) * ORB_RING, Math.sin(a) * ORB_RING, 0); this.orbRing.add(g);
      const mat = toon(e.col, { fresh: true, emissive: e.col, ei: 0.5 });
      const ball = ink(new THREE.SphereGeometry(0.5, 28, 20), mat, 0.03); ball.userData.h = h; g.add(ball);
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: iconTex(h), transparent: true, depthWrite: false })); icon.position.z = 0.52; g.add(icon);
      this.orbs.push({ h, g, ball, mat });
    }
    const span = (ORB_RING + 0.7) * 2;
    const arrows = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshBasicMaterial({ map: arrowTex(span), transparent: true, depthWrite: false })); arrows.position.z = -0.2; this.orbRing.add(arrows);
    this.orbRing.visible = false;
  }
  private setNdc(e: PointerEvent): void { const r = this.dom.getBoundingClientRect(); this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  private pickAt(): Hand | null {
    if (!this.orbRing.visible) return null;
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.orbs.map(o => o.ball), false)[0];
    return (hit?.object.userData.h as Hand | undefined) ?? null;
  }
  private onMove = (e: PointerEvent) => { this.setNdc(e); };
  private onLeave = () => { this.ndc.set(-9, -9); };
  private onDown = (e: PointerEvent) => { if (e.button > 0) return; this.setNdc(e); const h = this.pickAt(); if (h) cmd('rsel', { h }); };
  /** 내가 낼 차례(아직 안 냈으면)에만 보인다. 고른 구슬은 커지고 밝게, 나머지는 작고 흐리게 */
  private drawOrbs(m: OvnMg, me: number | null, sel: Hand | undefined, t: number): void {
    const on = me != null && m.step === 'pick' && (me === m.lead || m.alive.includes(me)) && !m.picks[me];
    this.orbRing.visible = on;
    this.hover = on ? this.pickAt() : null; this.dom.style.cursor = this.hover ? 'pointer' : '';
    if (!on) return;
    // 화면 가운데(조금 위), 원 지름이 화면에서 약 ORB_PX * 배율
    const H = this.dom.clientHeight || 720, th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const px = H / (2 * ORB_D * th), want = ORB_PX * uiScale();
    this.orbRing.position.set(0, ORB_Y * ORB_D * th, -ORB_D); this.orbRing.scale.setScalar(want / ((ORB_RING * 2 + 1) * px));
    for (const o of this.orbs) {
      const isSel = sel === o.h, hv = this.hover === o.h;
      o.g.scale.setScalar((isSel ? 1.22 : sel ? 0.82 : 1) * (hv ? 1.08 : 1) * (1 + Math.sin(t * 3 + o.g.position.x) * 0.02));
      o.mat.emissiveIntensity = isSel ? 1.2 : sel ? 0.2 : 0.5 + Math.sin(t * 4) * 0.12;
      o.g.rotation.z = isSel ? Math.sin(t * 6) * 0.08 : 0;
    }
  }

  frame(dt: number): void {
    dt = Math.min(dt, 0.05); this.t += dt; const t = this.t;
    INK_U.res.value.set(this.dom.width, this.dom.height); INK_U.px.value = 2.5 * Math.max(1, this.dom.width / Math.max(1, this.dom.clientWidth));
    const st = useStore.getState(); const S = st.S; const m = S?.mg as OvnMg | undefined;
    if (!S || !m || m.id !== 'rps') return;
    // 결과 연출 중(모두 낸 뒤): 이번 판에 낸 사람 그대로 둔다(탈락은 연출이 끝난 뒤 적용된다)
    const show = m.step === 'show' && m.last && m.until ? (now() - (m.until - RPS_SHOW)) / 1000 : -1;
    const ch = this.fake ? Array.from({ length: this.fake }, (_, k) => m.alive[k] ?? 10 + k) : show >= 0 && this.fan.length ? this.fan : m.alive.slice();
    this.layout(m.lead, ch, st.ctl);
    this.drawCamera();
    this.drawOrbs(m, st.ctl, st.ui.rps, t);
    const top = this.mount.position.clone().setY(this.peakH);
    for (const [j, z] of this.wiz) {
      const on = j === m.lead || ch.includes(j); z.w.root.visible = on; z.tag.visible = on && j !== m.lead && j !== st.ctl; if (!on) continue; // 내 이름표는 빼고(발밑 고리로 안다)
      if (j === m.lead) {
        // 산꼭대기에서 두 팔을 들고 주문(팔이 천천히 오르내리고 몸이 흔들린다)
        z.w.root.position.copy(top); z.w.root.rotation.y = 0;
        z.arms.forEach((a, q) => { const s = q ? 1 : -1; a.rotation.z = s * (2.8 + Math.sin(t * 3 + q) * 0.15); a.rotation.x = -0.2; });
        z.w.body.rotation.z = Math.sin(t * 1.6) * 0.06; z.w.body.position.y = Math.abs(Math.sin(t * 3)) * 0.05;
        continue;
      }
      z.w.root.position.lerp(z.pos, 1 - Math.exp(-dt * 6));
      // 모두 산꼭대기(선)를 바라본다: 등이 카메라 쪽
      z.w.root.rotation.y = Math.atan2(top.x - z.w.root.position.x, top.z - z.w.root.position.z);
      z.w.body.position.y = Math.abs(Math.sin(t * 2.2 + j)) * 0.04;
      z.tag.position.copy(z.w.root.position).add(new THREE.Vector3(0, 2.3, 0));
      if (show >= 0) this.drawFate(m, j, z, show, t, top); else this.resetFate(z);
    }
    this.drawAttack(m, ch, show, t, top);
    // 선의 표시 · 주문 빛
    this.crown.visible = true; this.crown.position.copy(top).add(new THREE.Vector3(0, 3.4, 0));
    // 결과 연출: 선의 주문 빛·하늘 마법진이 공격 원소 색으로 물들고, 쏘는 순간 크게 번쩍
    const Lh = show >= 0 ? (m.last as { picks: Record<number, Hand> }).picks[m.lead] : null;
    const castK = Lh ? clamp01((show - SH.cast) / 0.5) * (1 - clamp01((show - 3.8) / 0.8)) : 0;
    const burst = Lh ? Math.exp(-Math.max(0, show - SH.launch) * 5) * (show >= SH.launch ? 1 : 0) : 0;
    const cc = new THREE.Color('#c48cff').lerp(new THREE.Color(Lh ? ECOL[Lh] : '#c48cff'), castK);
    (this.chant.material as THREE.MeshBasicMaterial).color.copy(cc); this.chantLight.color.copy(cc);
    (this.circle.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color('#c27bff').lerp(new THREE.Color(Lh ? ECOL[Lh] : '#c27bff'), castK));
    this.chant.position.copy(top).add(new THREE.Vector3(0, 2.6, 0.3)); this.chant.lookAt(this.camera.position); this.chant.scale.setScalar(2.4 + Math.sin(t * 5) * 0.4 + castK * 2.5 + burst * 8);
    this.chantLight.position.copy(top).add(new THREE.Vector3(0, 2.4, 1.2)); this.chantLight.intensity = 26 + Math.sin(t * 5) * 8 + castK * 30 + burst * 200;
    // 마법진: 천천히 돌고, 빛이 숨 쉬듯
    this.circle.rotation.z += 0.0024 + castK * 0.03; (this.circle.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(t * 1.3) * 0.15;
    // 구름은 아주 천천히 흐른다
    this.clouds.forEach((c, k) => { c.rotation.y = t * 0.02 * (k % 2 ? 1 : -1); });
    const me = st.ctl != null ? this.wiz.get(st.ctl) : undefined;
    this.meRing.visible = !!me && me.w.root.visible && st.ctl !== m.lead;
    if (me) this.meRing.position.set(me.w.root.position.x, 0.02, me.w.root.position.z);
  }

  /* ---------------- 결과 연출 ---------------- */
  /** 이 도전자가 공격을 맞는 시각: 물 = 파도가 닿을 때, 불 = 불덩이가 떨어질 때, 풀 = 덩굴이 솟을 때 */
  private hitAt(Lh: Hand, z: RW): number {
    if (Lh === 'P') return SH.wave0 + ((z.pos.z - 0.6) + 18) / WAVE_RUN * SH.waveT;
    if (Lh === 'R') return SH.launch + Math.abs(z.slot) * 0.06 + SH.fire;
    return SH.vineHit;
  }
  /** 도전자 한 명: 방어막(1.5초 뒤) → 맞는 순간 이기면 막아 내고, 지면 방어막이 깨지며 원소별 탈락 모습 */
  private drawFate(m: OvnMg, j: number, z: RW, sh: number, t: number, top: THREE.Vector3): void {
    const L = m.last as { picks: Record<number, Hand>; losers: number[] }; const mine = L.picks[j], Lh = L.picks[m.lead];
    if (!mine || !Lh) return;
    const f = z.fx; f.dirty = true; const lose = L.losers.includes(j); const th = this.hitAt(Lh, z);
    // 방어막
    f.shield.set(mine); const sIn = backOut(clamp01((sh - SH.shield) / 0.35));
    const sp = f.shield.g.getObjectByName('spin')!; sp.rotation.x = t * 2; sp.rotation.y = t * 1.3;
    if (lose && sh >= th) { const u = clamp01((sh - th) / 0.25); f.shield.g.visible = u < 1; f.shield.g.scale.setScalar(1 + u * 0.8); f.shield.mat.opacity = 0.3 * (1 - u); f.shield.rim.opacity = 0.8 * (1 - u); }
    else {
      const flash = sh >= th ? Math.exp(-(sh - th) * 6) : 0, out = clamp01((sh - SH.fade) / 0.5);
      f.shield.g.visible = sh >= SH.shield && out < 1; f.shield.g.scale.setScalar(Math.max(0.001, sIn) * (1 + flash * 0.12));
      f.shield.mat.opacity = (0.28 + flash * 0.5) * (1 - out); f.shield.rim.opacity = (0.8 + flash * 0.2) * (1 - out);
      // 막아 낸 사람은 맞는 순간 살짝 뒤로 젖혀졌다 돌아온다
      z.w.body.rotation.x = -0.25 * flash;
    }
    // 불: 선에게서 날아오는 불덩이(이긴 사람에게도 날아와 방어막에서 터진다)
    if (Lh === 'R') {
      const u = clamp01((sh - (th - SH.fire)) / SH.fire); f.ball.visible = sh >= th - SH.fire && u < 1;
      if (f.ball.visible) { const a = top.clone().add(new THREE.Vector3(0, 2.6, 0)), b = z.pos.clone().add(new THREE.Vector3(0, 1.1, 0)); f.ball.position.lerpVectors(a, b, ease(u)); f.ball.position.y += Math.sin(u * Math.PI) * 6; (f.ball.getObjectByName('halo') as THREE.Mesh).lookAt(this.camera.position); }
    } else f.ball.visible = false;
    // 풀: 땅에서 덩굴이 솟는다(이긴 사람은 방어막에 막혀 조금 자라다 시든다)
    if (Lh === 'S' && sh >= SH.vine) {
      f.vines.g.visible = true;
      if (lose) f.vines.setGrow(clamp01((sh - SH.vine) / 0.8));
      else f.vines.setGrow(0.28 * clamp01((sh - SH.vine) / 0.3) * (1 - clamp01((sh - th - 0.2) / 0.6)));
    } else f.vines.g.visible = false;
    if (!lose || sh < th) return;
    const d = sh - th;
    if (Lh === 'P') {
      // 파도에 쓸려 간다: 뒤(카메라 쪽)로 휩쓸리며 굴러 떠오르다 사라진다
      const u = clamp01(d / 1.3), sx = Math.sign(z.pos.x || 1);
      z.w.root.position.set(z.pos.x + sx * u * 1.8, Math.sin(u * Math.PI) * 1.4 + u * 0.6, z.pos.z + ease(u) * 7.5);
      z.w.root.rotation.x = -u * 5; z.w.root.rotation.z = sx * u * 1.2;
      z.w.root.scale.setScalar(1 - clamp01((u - 0.6) / 0.4)); z.w.root.visible = u < 1;
    } else if (Lh === 'R') {
      // 타서 재가 된다: 그을리고(0~0.6) 불꽃에 휩싸였다가 무너져(0.8~1.5) 재 더미만 남는다
      scorch(z.w.root, clamp01(d / 0.6), f.keep);
      f.flames.visible = d < 1.3; f.flames.children.forEach(c => { c.scale.setScalar(0.6 + 0.5 * Math.abs(Math.sin(t * 9 + c.userData.ph))); c.position.y = 0.35 + ((t * 1.6 + c.userData.ph) % 1.2); });
      const c = ease(clamp01((d - 0.8) / 0.7)); z.w.body.scale.set(1 + 0.3 * c, Math.max(0.02, 1 - 0.95 * c), 1 + 0.3 * c); z.w.root.visible = c < 1;
      const pileK = clamp01((d - 1.2) / 0.3) * (1 - clamp01((sh - 4.7) / 0.4));
      f.ash.pile.visible = pileK > 0; f.ash.pile.position.set(z.pos.x, 0.2, z.pos.z); f.ash.pile.scale.setScalar(Math.max(0.001, pileK));
      f.ash.motes.forEach((mo, k) => { const u = clamp01((d - 0.9 - k * 0.04) / 1.4); mo.visible = u > 0 && u < 1; mo.position.set(z.pos.x + Math.sin(k * 2.3 + u * 3) * 0.6, 0.4 + u * 3, z.pos.z + Math.cos(k * 1.7) * 0.4); mo.lookAt(this.camera.position); (mo.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - u); });
    } else {
      // 덩굴에 칭칭 감겨(0~0.8) 땅속으로 끌려 들어간다(0.8~1.7)
      const s = ease(clamp01((d - 0.8) / 0.9)); z.w.root.position.y = -2.8 * s; z.w.root.visible = s < 1;
      z.w.body.rotation.z = Math.sin(t * 18) * 0.04 * (1 - s);
    }
  }
  /** 연출이 끝나면 원래대로(살아남은 사람은 다음 판에 그대로 서 있게) */
  private resetFate(z: RW): void {
    const f = z.fx; if (!f.dirty) return; f.dirty = false;
    f.shield.g.visible = false; f.flames.visible = false; f.vines.g.visible = false; f.ball.visible = false; f.ash.pile.visible = false; f.ash.motes.forEach(mo => mo.visible = false);
    unscorch(f.keep); z.w.body.scale.set(1, 1, 1); z.w.body.rotation.set(0, 0, 0); z.w.root.scale.setScalar(1); z.w.root.rotation.x = 0; z.w.root.rotation.z = 0; z.w.root.position.y = 0;
  }
  /** 광역 공격 물체: 물이면 산 쪽에서 밀려오는 파도 */
  private drawAttack(m: OvnMg, ch: number[], sh: number, _t: number, _top: THREE.Vector3): void {
    const Lh = sh >= 0 ? (m.last as { picks: Record<number, Hand> }).picks[m.lead] : null;
    const u = (sh - SH.wave0) / SH.waveT;
    this.wave.visible = Lh === 'P' && u > 0 && sh < SH.wave0 + SH.waveT + 0.6;
    // 산 쪽에서 밀려와 도전자들을 지나 바로 앞(카메라 앞)에서 부서져 가라앉는다(카메라를 덮지 않게)
    if (this.wave.visible) { this.wave.position.set(0, -Math.max(0, sh - (SH.wave0 + SH.waveT)) * 9, -18 + clamp01(u) * WAVE_RUN); }
    void ch;
  }

  /** 도전자는 부채꼴 호 위에(내가 가운데 맨 앞, 나머지는 자리 순서대로 오른쪽·왼쪽 번갈아), 선은 산꼭대기 */
  private layout(lead: number, ch: number[], me: number | null): void {
    const S = useStore.getState().S!;
    for (const j of [lead, ...ch]) if (!this.wiz.has(j)) {
      const w = buildWizard(SEATCOL[j % 5]); this.scene.add(w.root);
      const tag = tagSprite(seatName(S, j) || `자리 ${j + 1}`, '#f4e6cc'); this.scene.add(tag);
      // 팔(어깨에 붙은 소매 묶음)
      const arms = w.body.children.filter(o => Math.abs(Math.abs(o.position.x) - 0.3) < 1e-3 && Math.abs(o.position.y - 0.92) < 1e-3).sort((a, b) => a.position.x - b.position.x);
      const shield = buildShield(); w.root.add(shield.g);
      const flames = buildFlames(); w.root.add(flames);
      const vines = buildVines(); w.root.add(vines.g);
      const ash = buildAsh(); this.scene.add(ash.pile); ash.motes.forEach(mo => this.scene.add(mo));
      const ball = buildFireball(); this.scene.add(ball);
      this.wiz.set(j, { w, pos: new THREE.Vector3(), tag, arms, slot: 0, fx: { shield, flames, ash, vines, ball, keep: new Map(), dirty: false } });
    }
    const key = `${lead}|${ch.join(',')}|${me}`; if (key === this.key) return; this.key = key;
    // 호 위 자리(각도): 내가 도전자면 0(가운데 맨 앞)부터, 아니면(내가 선·구경) 가운데 기준으로 고르게
    const at = ch.indexOf(me ?? -1);
    if (at >= 0) { const ord = [...ch.slice(at), ...ch.slice(0, at)]; ord.forEach((j, k) => this.wiz.get(j)!.slot = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2)); }
    else ch.forEach((j, k) => this.wiz.get(j)!.slot = k - (ch.length - 1) / 2);
    this.fan = ch.slice();
  }

  /** 카메라: 도전자 등 뒤 낮은 곳. 한 줄이 가로로 다 들어오게 거리를 정하고, 발이 화면 아래에 오게 올려다본다.
      산은 꼭대기(선과 "선" 표시)가 석판 바로 아래에 오도록 높이를 맞춘다 */
  private drawCamera(): void {
    const a = this.camera.aspect || 1.6, H = this.dom.clientHeight || 720, k = uiScale();
    if (this.camera.fov !== FOV) { this.camera.fov = FOV; this.camera.updateProjectionMatrix(); }
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // 거리: 부채꼴이 가로로 다 들어오고(양끝은 멀어서 작아진다), 맨 앞 도전자 이름표가 화면 아래쪽(HEAD_Y 아래)에 머무는 가장 가까운 곳
    // (가까우면 도전자가 산을 가린다). 발(땅, z = 0.4)은 화면 아래 -0.84에 오게 위로 고개를 든다
    let d = 3.4, pitch = 0;
    for (let q = 0; q < 80; q++, d += 0.2) {
      pitch = Math.atan(0.84 * t) - Math.atan(CAM_H / (d - 0.4));
      if (Math.tan(Math.atan((2.6 - CAM_H) / d) - pitch) / t <= HEAD_Y) break;
    }
    // 부채꼴: 나는 꼭짓점(맨 앞), 옆 사람은 한 칸마다 옆으로 SPREAD, 뒤로 DEPTH만큼(멀수록 더 휘어 들어간다).
    // 좁은 화면일수록 뒤로 더 물러나 화면 가로에 들어오게 한다(가까운 나는 늘 크게)
    const fan = this.fan.map(j => this.wiz.get(j)!); const kmax = Math.max(1, ...fan.map(z => Math.abs(z.slot)));
    const back = (k: number, D: number) => D * k * (1 + 0.3 * (k - 1));
    let D = 2.2, S = 2.6;
    for (; D < 9; D += 0.3) {
      let fit = 9; for (let k = 1; k <= kmax; k++) fit = Math.min(fit, (t * a * 0.92 * (d + back(k, D)) - 0.85) / k);
      if (fit >= 1.4) { S = Math.min(2.6, fit); break; }
    }
    fan.forEach(z => { const k = Math.abs(z.slot); z.pos.set(Math.sign(z.slot) * S * k, 0, -back(k, D)); if (z.w.root.position.lengthSq() === 0) z.w.root.position.copy(z.pos); });
    this.camera.position.set(0, CAM_H, d);
    this.camera.rotation.set(pitch, 0, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    // 산꼭대기 + 선 표시가 석판 아래(top)에 오는 높이
    const top = 1 - 2 * ((slabH(k).h2 + Math.round(80 * k)) / H), dist = d - this.mount.position.z;
    const up = pitch + Math.atan(top * t);
    const want = CAM_H + dist * Math.tan(up) - 3.6;
    this.peakH = THREE.MathUtils.clamp(want, 6, 60); this.mount.scale.setScalar(this.peakH);
    // 마법진: 산 오른쪽 위 하늘(산 크기에 맞춰)
    const R = this.peakH * 0.7;
    this.circle.position.set(this.mount.position.x + this.peakH * 1.05, this.peakH * 1.3, this.mount.position.z - 22); this.circle.scale.setScalar(R * 2);
    this.circleGlow.position.copy(this.circle.position).add(new THREE.Vector3(0, -0.5, 0)); this.circleGlow.scale.setScalar(R * 2.6);
  }
}

/** 원소 구슬: 둘레 각도(불 위 · 물 오른쪽 아래 · 풀 왼쪽 아래)와 색. 원 반지름 · 카메라 앞 거리 · 화면 높이(가운데 기준) · 원 지름(px) */
const ORB: Record<Hand, { ang: number; col: string }> = { R: { ang: 90, col: '#ff6a2a' }, P: { ang: -30, col: '#3aa0ff' }, S: { ang: 210, col: '#4cc45a' } };
const ORB_RING = 1.15, ORB_D = 2.5, ORB_Y = 0.16, ORB_PX = 320;
/** 구슬 위 그림(흰색): 불꽃 · 물방울 · 잎. 글자는 넣지 않는다(사용자 2026-10-15) */
function iconTex(h: Hand): THREE.Texture {
  return canvasTex(128, 128, g => {
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(20,14,10,.55)'; g.lineWidth = 6; g.beginPath();
    if (h === 'R') { g.moveTo(64, 14); g.bezierCurveTo(80, 40, 104, 56, 98, 84); g.bezierCurveTo(94, 108, 76, 116, 64, 116); g.bezierCurveTo(46, 116, 30, 106, 30, 84); g.bezierCurveTo(30, 66, 44, 60, 46, 44); g.bezierCurveTo(54, 56, 60, 58, 62, 52); g.bezierCurveTo(66, 40, 62, 26, 64, 14); }
    else if (h === 'P') { g.moveTo(64, 12); g.bezierCurveTo(74, 34, 100, 60, 100, 82); g.arc(64, 82, 36, 0, Math.PI); g.bezierCurveTo(28, 60, 54, 34, 64, 12); }
    else { g.moveTo(22, 108); g.bezierCurveTo(20, 50, 60, 18, 110, 18); g.bezierCurveTo(110, 70, 78, 108, 22, 108); }
    g.closePath(); g.stroke(); g.fill();
    if (h === 'S') { g.strokeStyle = 'rgba(40,110,50,.9)'; g.lineWidth = 5; g.beginPath(); g.moveTo(26, 104); g.quadraticCurveTo(60, 70, 100, 28); g.stroke(); }
  });
}
/** 구슬 사이 상성 화살표: 원을 따라 반시계 방향(물 → 불 → 풀 → 물), 구슬 자리는 비운다 */
function arrowTex(span: number): THREE.Texture {
  return canvasTex(512, 512, g => {
    const c = 256, r = (ORB_RING / span) * 512, gap = 0.62;
    g.lineCap = 'round';
    for (const [from, to] of [[-30, 90], [90, 210], [210, 330]]) {
      // 캔버스는 y가 아래로: 화면에서 반시계 = 캔버스 각도가 줄어드는 쪽
      const a0 = -THREE.MathUtils.degToRad(from) - gap, a1 = -THREE.MathUtils.degToRad(to) + gap;
      for (const [w, col] of [[16, 'rgba(20,14,10,.8)'], [8, '#f4e6cc']] as const) {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(c, c, r, a0, a1, true); g.stroke();
        const ex = c + Math.cos(a1) * r, ey = c + Math.sin(a1) * r, dx = Math.sin(a1), dy = -Math.cos(a1);
        const L = w === 16 ? 34 : 24, W = w === 16 ? 22 : 14;
        g.fillStyle = col; g.beginPath();
        g.moveTo(ex + dx * L * 0.2, ey + dy * L * 0.2); g.lineTo(ex - dx * L * 0.8 - Math.cos(a1) * W, ey - dy * L * 0.8 - Math.sin(a1) * W); g.lineTo(ex - dx * L * 0.8 + Math.cos(a1) * W, ey - dy * L * 0.8 + Math.sin(a1) * W); g.closePath(); g.fill();
      }
    }
  });
}
/** 이름표: 화면에서 늘 같은 크기(멀리 있는 선의 표시도 읽히게) */
function tagSprite(s: string, col: string): THREE.Sprite {
  const font = "bold 80px 'Black Han Sans', sans-serif"; const mc = document.createElement('canvas').getContext('2d')!; mc.font = font;
  const w = Math.max(160, Math.ceil(mc.measureText(s).width) + 40);
  const mt = new THREE.SpriteMaterial({ map: canvasTex(w, 112, g => { g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = INK; g.strokeText(s, w / 2, 60); g.fillStyle = col; g.fillText(s, w / 2, 60); }), transparent: true, depthTest: false, sizeAttenuation: false });
  const sp = new THREE.Sprite(mt); sp.renderOrder = 30; sp.scale.set(0.05 * w / 112, 0.05, 1); return sp;
}
/** 먹구름 한 덩이: 납작한 구 몇 개를 겹친다 */
function puff(r: () => number, mats: THREE.Material[]): THREE.Group {
  const g = new THREE.Group(); const n = 4 + Math.floor(r() * 3);
  for (let q = 0; q < n; q++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mats[q % mats.length]);
    s.position.set((q - n / 2) * 0.9 + (r() - 0.5) * 0.5, (r() - 0.3) * 0.5, (r() - 0.5) * 0.8); s.scale.set(1 + r() * 0.6, 0.55 + r() * 0.3, 0.9 + r() * 0.4); g.add(s);
  }
  return g;
}
