/* 동굴 탐험 아레나(사용자 2026-10-14): 실제 3D 동굴 무대를 카메라로 본다.
   - 각진 저폴리 바위·불규칙한 종유석(평면 음영), 갈색 안개로 멀수록 밝고 흐려진다(원근).
   - 각자 데리고 다니는 빛 정령과 크리스탈이 실제 광원. 가까운 바위는 카메라 심도로 흐리게, 양옆은 어둡게 사라진다.
   - 옆에서 본 한 장면: 무리는 가운데, 오른쪽은 크리스탈이 박힌 바위로 막혀 있다. 깊이(버틴 턴)는 표지판 숫자.
   - 선의 마법사가 주사위를 굴린다. 1이 나온 주사위는 천장으로 올라가 균열이 커진다(3단계면 무너짐).
   - 버티면: 폭파 마법으로 바위를 깨 크리스탈을 캐고 → 오른쪽으로 걸어 나가고 → 어두워졌다 밝아지며 → 왼쪽에서 가운데로 들어온다.
   - 나가기 = 귀환 스크롤을 펼쳐 빛과 함께 사라진다. 무너지면 바위가 떨어져 남은 사람을 덮친다. */
import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CAVE_SHOW, CAVE_SHOW_FALL, type CaveMg, caveDecider, now } from '@cubic3/engine';
import { SEATCOL } from '../game';
import { useStore } from '../store';
import { usePrefs } from '../prefs';
import { type Wizard, buildDie, buildDots, buildWizard, lightColumn, portalDisc, setDie, softTex } from './props';
import { INK, INK_U, backOut, canvasTex, clamp01, ease, glow, ink, toon } from './toon';
import { slabH, uiScale } from '../ui/scale';

const col = (j: number) => SEATCOL[j % 5];
/** 천장 높이 · 무리가 서는 곳 · 막힌 바위 · 무대 반폭 */
const CEIL = 4.3, CX = -0.6, ROCK_X = 3.6, HALF = 7;
/** 공개(굴림) 연출 시각(초) [제안]. 버틴 턴: 주사위 → 1은 천장으로 → 폭파 → 오른쪽으로 → 어두워짐 → 장면 바꿈 → 밝아짐 → 왼쪽에서 들어옴 */
const RT = { land: 0.9, up: 1.25, hit: 1.75, blast: 1.9, out: 2.6, fadeOut: 3.2, swap: 3.6, fadeIn: 3.75, inEnd: 4.7, shake: 1.9, fall: 2.15, buried: 2.55 };
const LEAVE_T = 2.2;
const FOG = '#b98a5c';
/** 망원 카메라 화각(원근 왜곡을 줄여 층이 겹친 것처럼, 사용자 2026-10-14) */
const FOV = 18;


interface CW {
  w: Wizard; spirit: THREE.Group; light: THREE.PointLight; dots: THREE.Group;
  pos: THREE.Vector3; born: number; leaveAt: number; gone: boolean; got: number;
  scroll: THREE.Group; portal: THREE.Mesh; column: THREE.Mesh; pop: THREE.Sprite;
}

export class CaveArena {
  private t = 0;
  private wiz = new Map<number, CW>();
  private dice: THREE.Group[] = [];
  private diceGlow: THREE.Mesh[] = [];
  private shields: THREE.Mesh[] = [];
  private crack: { m: THREE.Mesh; stage: number };
  private pebbles: { m: THREE.Mesh; v: THREE.Vector3; on: boolean }[] = [];
  private boulders: THREE.Mesh[] = [];
  private dust: THREE.Mesh[] = [];
  private block!: THREE.Group; private blockLight!: THREE.PointLight;
  private chunks: { m: THREE.Mesh; v: THREE.Vector3; p0: THREE.Vector3 }[] = [];
  private gems: THREE.Mesh[] = [];
  private flash!: THREE.PointLight; private burst!: THREE.Mesh;
  private sign!: THREE.Mesh; private signN = -1; private entrance!: THREE.Group;
  private fade: THREE.Mesh; private sides: THREE.Mesh;
  private prev: { pan: number; inside: number[]; step: string } | null = null;
  private panAt = -9;
  private shakeT = -9; private shakeK = 0;
  private camX = 0; private camD = 11; private camY = 2.4; private lookY = 2;
  private hud = new THREE.Scene(); private hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  /** 카메라에 붙은 흐린 근경 */
  private fg = new THREE.Group(); private fov0 = 40;
  private composer: EffectComposer | null = null; private bokeh: BokehPass | null = null; private size = new THREE.Vector2();

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private dom: HTMLCanvasElement, private gl: THREE.WebGLRenderer) {
    scene.background = new THREE.Color(FOG);
    this.fov0 = camera.fov; camera.fov = FOV; camera.updateProjectionMatrix();
    // 갈색 안개: 멀수록 밝은 황토빛으로 흐려진다
    scene.fog = new THREE.Fog(FOG, 10, 34);
    scene.add(new THREE.HemisphereLight('#e2bd8e', '#24160c', 0.55));
    const back = new THREE.DirectionalLight('#ffd9a0', 0.6); back.position.set(2, 8, -12); scene.add(back);
    this.buildCave();
    scene.add(this.fg);
    this.crack = this.buildCrack();
    for (let k = 0; k < 3; k++) {
      const d = buildDie(1); d.scale.setScalar(0.5); d.visible = false; scene.add(d); this.dice.push(d);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), glow('#ff5a3a', 0.9)); (g.material as THREE.MeshBasicMaterial).map = softTex(); g.visible = false; scene.add(g); this.diceGlow.push(g);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), glow('#8fe3ff', 0.35)); sh.visible = false; scene.add(sh); this.shields.push(sh);
    }
    for (let k = 0; k < 7; k++) { const p = new THREE.Mesh(rockGeo(500 + k, 0, 0.3), rockMat('#5e3e28')); p.scale.setScalar(0.08 + (k % 3) * 0.04); p.visible = false; scene.add(p); this.pebbles.push({ m: p, v: new THREE.Vector3(), on: false }); }
    for (let k = 0; k < 8; k++) { const b = new THREE.Mesh(rockGeo(600 + k, 1, 0.35), rockMat(k % 2 ? '#5a3a25' : '#4a2f1e')); b.scale.set(0.5 + (k % 3) * 0.2, 0.42 + (k % 2) * 0.15, 0.5); b.visible = false; scene.add(b); this.boulders.push(b); }
    for (let k = 0; k < 7; k++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ color: '#d8b48a', map: softTex(), transparent: true, opacity: 0, depthWrite: false })); d.visible = false; scene.add(d); this.dust.push(d); }
    // 화면 앞 막: 장면 전환(검정) · 양옆이 어둡게 사라짐
    // (심도 계산에 끼지 않게 장면과 따로, 맨 마지막에 화면 전체로 그린다)
    this.sides = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: sideTex(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.fade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.sides.renderOrder = 1; this.fade.renderOrder = 2; this.hud.add(this.sides, this.fade);
    scene.add(camera);
    this.setupComposer();
    if (import.meta.env.DEV) (window as unknown as { __arena: CaveArena }).__arena = this;
  }
  dispose(): void {
    this.camera.fov = this.fov0; this.camera.updateProjectionMatrix();
    this.hud.clear(); this.scene.clear(); this.scene.background = null; this.scene.fog = null;
    this.composer?.dispose();
  }
  private mg(): CaveMg | null { const S = useStore.getState().S; return S?.phase === 'mg' && S.mg?.id === 'cave' ? S.mg : null; }

  /* ---------------- 카메라 심도(가까운 바위가 흐려진다). 낮은 품질에서는 끈다 ---------------- */
  private setupComposer(): void {
    const c = new EffectComposer(this.gl);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 22, aperture: 0.0008, maxblur: 0.012 });
    c.addPass(this.bokeh); c.addPass(new OutputPass());
    // 색 단계 줄이기: 색조는 두고 밝기만 몇 단계로 끊는다(그러데이션이 판화처럼)
    c.addPass(new ShaderPass(POSTER));
    this.composer = c;
  }
  /** 직접 그린다(심도 효과를 거쳐서) */
  render(): void {
    const low = usePrefs.getState().quality === 'low';
    if (!this.composer || low) { this.gl.render(this.scene, this.camera); this.drawHud(); return; }
    this.gl.getSize(this.size);
    const c = this.composer as unknown as { _width: number; _height: number };
    if (c._width !== this.size.x || c._height !== this.size.y) { this.composer.setPixelRatio(this.gl.getPixelRatio()); this.composer.setSize(this.size.x, this.size.y); }
    // 초점: 무리가 서는 깊이
    (this.bokeh!.uniforms as Record<string, { value: number }>).focus.value = this.camD;
    this.composer.render();
    this.drawHud();
  }
  private drawHud(): void { const ac = this.gl.autoClear; this.gl.autoClear = false; this.gl.render(this.hud, this.hudCam); this.gl.autoClear = ac; }

  /* ---------------- 동굴 짓기 ---------------- */
  private buildCave(): void {
    const sc = this.scene; const r = rng(7);
    const rock = (geo: THREE.BufferGeometry, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => { const m = new THREE.Mesh(geo, rockMat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(r() * 0.4, ry || r() * 6, r() * 0.4); sc.add(m); return m; };
    const shades = ['#5b3b26', '#4c311f', '#6a4630', '#3f2819'];
    // 바닥: 거의 평평하게, 위에 작은 돌멩이
    const fg = new THREE.BoxGeometry(34, 1, 22, 34, 1, 22); const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) if (fp.getY(i) > 0) fp.setY(i, 0.5 + (r() - 0.5) * 0.08);
    fg.computeVertexNormals();
    const floor = new THREE.Mesh(fg, rockMat('#4a2f1f')); floor.position.set(1, -0.5, -5); sc.add(floor);
    for (let k = 0; k < 46; k++) { const s = 0.06 + r() * r() * 0.32; rock(rockGeo(k, 0, 0.35), shades[k % 4], -10 + r() * 22, s * 0.3, -12 + r() * 15, s * 1.4, s, s * 1.2); }
    // 뒤쪽 바위 벽과 중간 덩어리(멀수록 안개에 묻혀 밝아진다)
    for (let k = 0; k < 18; k++) { const s = 2 + r() * 2.5; rock(rockGeo(100 + k, 1, 0.4), shades[k % 4], -14 + k * 1.7 + r(), s * 0.6, -15 - r() * 3, s, s * 1.4, s); }
    for (let k = 0; k < 12; k++) { const s = 0.8 + r() * 1.4; rock(rockGeo(140 + k, 1, 0.4), shades[k % 4], -11 + r() * 22, s * 0.45, -6 - r() * 6, s * 1.3, s, s); }
    // 석순(아래에서 솟은 것) 몇 개
    for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(stalGeo(160 + k, 0.35 + r() * 0.4, 1.2 + r() * 2.2), rockMat(shades[k % 4])); m.rotation.x = Math.PI; m.position.set(-10 + r() * 20, 0, -4 - r() * 8); sc.add(m); }
    // 천장: 납작한 큰 바위로 덮고, 아래로 크고 작은 종유석(몇 개씩 붙은 덩어리도)
    for (let k = 0; k < 34; k++) { const s = 2 + r() * 2; rock(rockGeo(200 + k, 1, 0.35), shades[k % 4], -13 + (k % 12) * 2.4 + r(), CEIL + 0.9 + r() * 0.6, -14 + Math.floor(k / 12) * 6 + r() * 3, s, 0.9 + r() * 0.6, s); }
    for (let k = 0; k < 70; k++) {
      const z = -13 + r() * 15.5, x = -12 + r() * 24;
      // 놀이 깊이 바로 앞뒤에는 길게 늘어진 것을 피해 무리를 가리지 않게
      const near = z > -1.5 && z < 1.5 && x > -3 && x < 5;
      const len = near ? 0.3 + r() * 0.6 : 0.4 + r() * r() * 2.6, rad = 0.12 + r() * 0.42;
      const m = new THREE.Mesh(stalGeo(300 + k, rad, len), rockMat(shades[k % 4])); m.position.set(x, CEIL + 0.3, z); m.rotation.y = r() * 6; sc.add(m);
      if (r() < 0.3) { const m2 = new THREE.Mesh(stalGeo(400 + k, rad * 0.6, len * (0.4 + r() * 0.5)), rockMat(shades[(k + 1) % 4])); m2.position.set(x + rad * 1.3, CEIL + 0.3, z + (r() - 0.5) * 0.3); sc.add(m2); }
    }
    // 앞(카메라 가까이, 초점이 흐려진다): 양옆 큰 바위와 늘어진 종유석
    // (망원 카메라라 장면 속에 두면 작아져서, 카메라 앞 일정 거리에 붙여 화면을 감싸게 한다: drawCamera)
    const fgRock = (seed: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => { const m = new THREE.Mesh(rockGeo(seed, 1, 0.4), rockMat('#2c1b10')); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(r() * 0.4, r() * 6, r() * 0.4); m.userData.fg = true; this.fg.add(m); };
    fgRock(700, -4.9, -0.9, 0, 1.6, 2.4, 1.2);
    fgRock(701, 5.1, -1.8, 0.2, 1.8, 1.4, 1.2);
    fgRock(702, 0.7, -2.7, 0.5, 2.4, 0.9, 1.0);
    for (const [x, len, rad, z] of [[2.3, 2.6, 0.5, -0.3], [-1.9, 1.6, 0.35, 0.1], [0.3, 1.0, 0.28, -0.7]]) { const m = new THREE.Mesh(stalGeo(800 + x * 10, rad, len), rockMat('#2a190f')); m.position.set(x, 2.6, z); m.userData.fg = true; this.fg.add(m); }
    // 부러진 나무 울타리
    const wood = rockMat('#3a2416');
    for (const x0 of [-5.2, 5.6]) for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9 + r() * 0.5, 0.09), wood); st.position.set(x0 + k * 0.32, 0.45, -1.4); st.rotation.z = (r() - 0.5) * 0.4; sc.add(st); }
    // 입구(깊이 0에서만): 왼쪽 멀리서 들어오는 햇빛
    this.entrance = new THREE.Group(); sc.add(this.entrance);
    const day = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshBasicMaterial({ color: '#fff1d2', map: softTex(), transparent: true, depthWrite: false, fog: false })); day.position.set(-12, 2.2, -10); this.entrance.add(day);
    const sun = new THREE.PointLight('#ffe6b8', 60, 18, 1.3); sun.position.set(-9, 3, -6); this.entrance.add(sun);
    // 깊이 표지(나무 말뚝 + 판)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), wood); post.position.set(CX - 2.6, 0.75, -0.6); sc.add(post);
    this.sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.08), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: signTex(0), roughness: 1 }), wood]);
    this.sign.position.set(CX - 2.6, 1.55, -0.55); this.sign.rotation.z = -0.05; sc.add(this.sign);
    // 앞을 막은 바위 + 박힌 크리스탈(스스로 빛나고 주변을 비춘다)
    this.block = new THREE.Group(); this.block.position.set(ROCK_X + 0.6, 0, -0.2); sc.add(this.block);
    const bm = new THREE.Mesh(rockGeo(900, 1, 0.3), rockMat('#4e331f')); bm.scale.set(1.5, CEIL / 2 + 0.6, 1.4); bm.position.y = CEIL / 2 - 0.1; this.block.add(bm);
    const cc = ['#8ff3ff', '#d2b6ff', '#8ff7cf'];
    for (let k = 0; k < 3; k++) { const c = crystal(cc[k]); c.position.set(-1.45 + k * 0.2, 0.7 + k * 0.9, 1.05 - k * 0.2); c.rotation.z = 0.7 - k * 0.3; c.scale.setScalar(1.0 - k * 0.15); this.block.add(c); }
    this.blockLight = new THREE.PointLight('#9fe8ff', 6, 5, 1.5); this.blockLight.position.set(-1.3, 1.6, 1.0); this.block.add(this.blockLight);
    for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(rockGeo(950 + k, 0, 0.35), rockMat('#4e331f')); m.scale.setScalar(0.25 + (k % 3) * 0.12); m.visible = false; sc.add(m); this.chunks.push({ m, v: new THREE.Vector3(), p0: new THREE.Vector3() }); }
    for (let k = 0; k < 3; k++) { const g = crystal(cc[k]); g.scale.setScalar(0.6); g.visible = false; sc.add(g); this.gems.push(g); }
    this.flash = new THREE.PointLight('#ffd9a0', 0, 10, 1.4); this.flash.position.set(ROCK_X, 1.8, 1.2); sc.add(this.flash);
    this.burst = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), glow('#ffc070', 1)); (this.burst.material as THREE.MeshBasicMaterial).map = softTex(); this.burst.visible = false; sc.add(this.burst);
  }
  private buildCrack() {
    // 천장 아래 뒤쪽에 걸린 균열(틈으로 빛이 샌다)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false }));
    m.position.set(CX, CEIL - 0.5, -1.7); m.visible = false; this.scene.add(m);
    return { m, stage: 0 };
  }
  private setCrack(stage: number): void {
    const c = this.crack; if (c.stage === stage) return; c.stage = stage; c.m.visible = stage > 0;
    if (stage > 0) { const mt = c.m.material as THREE.MeshBasicMaterial; mt.map = crackTex(stage); mt.needsUpdate = true; }
  }
  private setDepth(n: number): void {
    if (this.signN === n) return; this.signN = n;
    const mats = this.sign.material as THREE.MeshStandardMaterial[]; mats[4].map = signTex(n); mats[4].needsUpdate = true;
    this.entrance.visible = n === 0;
  }

  /* ---------------- 마법사 ---------------- */
  private makeWiz(j: number): CW {
    const w = buildWizard(col(j)); this.scene.add(w.root);
    // 빛 정령: 빛나는 작은 구 + 빛무리 + 점광원(랜턴처럼 주변 바위를 비춘다)
    const spirit = new THREE.Group(); this.scene.add(spirit);
    spirit.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: '#fffbe8', toneMapped: false, fog: false })));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glow(col(j), 0.5)); (halo.material as THREE.MeshBasicMaterial).map = softTex(); halo.name = 'halo'; spirit.add(halo);
    const halo2 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), glow('#fff3d0', 0.9)); (halo2.material as THREE.MeshBasicMaterial).map = softTex(); spirit.add(halo2);
    const light = new THREE.PointLight('#ffe2b0', 8, 8, 1.6); spirit.add(light);
    const dots = buildDots(); dots.visible = false; w.above.add(dots);
    const scroll = buildScroll(); scroll.visible = false; this.scene.add(scroll);
    const portal = portalDisc(col(j), 1.6); portal.rotation.x = -Math.PI / 2; portal.visible = false; this.scene.add(portal);
    const column = lightColumn(col(j), 0.7, 6); column.visible = false; this.scene.add(column);
    const pop = textSprite('+0'); pop.visible = false; this.scene.add(pop);
    const z: CW = { w, spirit, light, dots, pos: new THREE.Vector3(CX, 0, 0), born: this.t, leaveAt: 0, gone: false, got: 0, scroll, portal, column, pop };
    this.wiz.set(j, z); return z;
  }

  /* ---------------- 매 프레임 ---------------- */
  frame(dt: number): void {
    dt = Math.min(dt, 0.05); this.t += dt; const t = this.t;
    INK_U.res.value.set(this.dom.width, this.dom.height); INK_U.px.value = 2.5 * Math.max(1, this.dom.width / Math.max(1, this.dom.clientWidth));
    const m = this.mg(); if (!m) return;
    const L = m.last;
    const dur = L?.collapse ? CAVE_SHOW_FALL : CAVE_SHOW;
    const showS = m.step === 'show' && L ? (now() - (m.until - dur)) / 1000 : -1;
    this.sync(m, t);
    const collapse = !!L?.collapse && m.step === 'show';
    const moving = m.step === 'show' && !!L && !L.collapse;
    this.setDepth(moving && showS < RT.swap ? Math.max(0, m.turn - 1) : m.turn);
    const lost = L ? L.faces.filter(v => v === 1).length - L.kept : 0;
    const crackN = m.step === 'show' && L ? (showS >= RT.hit ? L.ones : L.ones - lost) : m.ones;
    this.setCrack(Math.max(0, Math.min(3, crackN)));
    if (this.crack.m.visible) (this.crack.m.material as THREE.MeshBasicMaterial).opacity = 0.85 + Math.sin(t * 6) * 0.15;
    if (m.step === 'show' && L && showS >= RT.hit && showS < RT.hit + dt * 1.5 && lost > 0) { this.kick(L.collapse ? 0.16 : 0.07); this.dropPebbles(); }
    this.drawWizards(m, t, dt, showS, collapse, moving);
    this.drawDice(m, t, showS, moving);
    this.drawBlast(showS, moving, dt);
    this.drawCollapse(showS, collapse, dt);
    this.drawPebbles(dt);
    // 장면 전환: 어두워졌다가 밝아진다
    const fo = moving && showS >= RT.fadeOut && showS < RT.swap ? ease((showS - RT.fadeOut) / (RT.swap - RT.fadeOut)) : 0;
    const fi = moving && showS >= RT.swap && showS < RT.fadeIn + 0.45 ? 1 - ease((showS - RT.fadeIn) / 0.45) : 0;
    (this.fade.material as THREE.MeshBasicMaterial).opacity = Math.max(fo, fi);
    // 걸어 나갈 때 카메라도 오른쪽으로 흐르고, 새 장면에서는 왼쪽에서 따라 들어온다(실제 시차)
    this.camX = moving && showS >= RT.out && showS < RT.swap ? ease((showS - RT.out) / 1.0) * 2.2 : moving && showS >= RT.swap && showS < RT.inEnd ? -2.2 * (1 - ease((showS - RT.fadeIn) / 1.0)) : 0;
    this.drawCamera(t);
  }

  /** 상태 변화: 새 판(모두 왼쪽 입구에서 걸어 들어온다), 나간 사람(귀환 스크롤) */
  private sync(m: CaveMg, t: number): void {
    const p = this.prev;
    for (const j of m.ord) if (!this.wiz.has(j)) { const z = this.makeWiz(j); z.gone = !m.inside.includes(j); }
    if (!p) this.panAt = t - 9;
    if (p) {
      const left = p.step === 'decide' ? p.inside.filter(j => !m.inside.includes(j) || m.pan !== p.pan) : [];
      const leavers = m.pan !== p.pan ? left.slice(-1) : left;
      for (const j of leavers) { const z = this.wiz.get(j)!; if (!z.gone && !z.leaveAt) { z.leaveAt = t; z.got = m.pan === p.pan ? m.got[j] ?? 0 : m.score[j][p.pan - 1] ?? 0; } }
      if (m.pan !== p.pan) {
        const wait = leavers.length ? LEAVE_T : 0.25;
        this.panAt = t + wait;
        m.ord.forEach(j => { const z = this.wiz.get(j)!; z.born = t + wait; z.gone = false; if (!leavers.includes(j)) z.leaveAt = 0; });
      }
    }
    this.prev = { pan: m.pan, inside: m.inside.slice(), step: m.step };
  }

  private drawWizards(m: CaveMg, t: number, dt: number, showS: number, collapse: boolean, moving: boolean): void {
    const dec = caveDecider(m); const n = m.inside.length; const inP = t - this.panAt;
    for (const [j, z] of this.wiz) {
      const w = z.w; const k = m.inside.indexOf(j);
      if (z.leaveAt) {
        const l = t - z.leaveAt;
        if (l >= LEAVE_T) { z.leaveAt = 0; z.gone = true; }
        else { this.drawLeave(z, l); continue; }
      }
      const vis = !z.gone && t >= z.born && (k >= 0 || m.step !== 'decide' || inP < 2);
      w.root.visible = vis; z.spirit.visible = vis; z.scroll.visible = false; z.pop.visible = false; z.portal.visible = z.column.visible = false;
      if (!vis) { z.light.intensity = 0; continue; }
      const slot = CX + ((k >= 0 ? k : 0) - (n - 1) / 2) * 0.95;
      let x = slot, walking = false;
      if (moving && showS >= RT.out && showS < RT.swap) { const u = clamp01((showS - RT.out) / 1.0); x = slot + u * (HALF + 3 - slot); walking = u < 1; }
      else if (moving && showS >= RT.swap && showS < RT.inEnd) { const u = clamp01((showS - RT.fadeIn) / 0.95); x = -HALF - 3 + u * (slot + HALF + 3); walking = u < 1; }
      else if (inP >= 0 && inP < 1.2) { const u = clamp01(inP / 1.1); x = -HALF - 3 + ease(u) * (slot + HALF + 3); walking = u < 1; }
      else z.pos.x += (slot - z.pos.x) * Math.min(1, dt * 6);
      if (walking || inP < 1.2 || (moving && showS >= RT.out && showS < RT.inEnd)) z.pos.x = x;
      z.pos.z = k % 2 ? -0.35 : 0.2;
      const cast = moving && showS >= RT.blast - 0.15 && showS < RT.out;
      const down = collapse && k >= 0 && showS >= RT.buried;
      w.root.position.set(z.pos.x, walking ? Math.abs(Math.sin(t * 10 + j)) * 0.1 : 0, z.pos.z);
      w.root.scale.set(1, down ? 0.2 : 1, 1); w.root.visible = !down || showS < RT.buried + 0.3;
      w.root.rotation.y = walking ? 1.1 : cast ? 0.9 : 0.35;
      w.body.rotation.set(cast ? -0.15 : 0, 0, walking ? Math.sin(t * 10 + j) * 0.06 : 0);
      z.dots.visible = m.step === 'decide' && dec === j; if (z.dots.visible) z.dots.children.forEach((d, q) => { d.position.y = Math.max(0, Math.sin(t * 7 - q * 0.8)) * 0.15; });
      w.above.lookAt(this.camera.position.x, w.above.getWorldPosition(new THREE.Vector3()).y, this.camera.position.z);
      w.eyesShut.visible = collapse && showS > RT.shake; w.eyesOpen.visible = !w.eyesShut.visible;
      // 빛 정령: 앞(깊은 쪽) 위에서 떠다닌다
      const sp = z.spirit; sp.visible = !down;
      sp.position.set(z.pos.x + 0.6 + Math.sin(t * 1.3 + j) * 0.12, 2.2 + Math.sin(t * 2.1 + j * 1.7) * 0.12, z.pos.z + 0.5 + Math.cos(t * 1.1 + j) * 0.1);
      sp.children.forEach((c, q) => { if (q > 0 && c.type === 'Mesh') c.lookAt(this.camera.position); });
      (sp.getObjectByName('halo') as THREE.Mesh).scale.setScalar(1 + Math.sin(t * 5 + j) * 0.1);
      z.light.intensity = down ? 0 : 8;
    }
  }
  private drawLeave(z: CW, l: number): void {
    const w = z.w; const p = z.pos;
    w.root.visible = true; w.root.rotation.y = 0; z.dots.visible = false;
    const sc = z.scroll; sc.visible = l < 1.6; sc.position.set(p.x, 1.1, p.z + 0.6);
    const appear = backOut(clamp01(l / 0.35)), open = ease((l - 0.35) / 0.45), lit = clamp01((l - 0.8) / 0.3), burn = clamp01((l - 1.3) / 0.3);
    sc.scale.setScalar(0.85 * Math.max(0.001, appear) * (1 - burn));
    const paper = sc.getObjectByName('paper') as THREE.Mesh, rodB = sc.getObjectByName('rodB') as THREE.Mesh, runes = sc.getObjectByName('runes') as THREE.Mesh;
    paper.scale.y = runes.scale.y = Math.max(0.02, open); paper.position.y = runes.position.y = -0.04 - open * 0.28; rodB.position.y = -0.04 - open * 0.56;
    (runes.material as THREE.MeshBasicMaterial).opacity = lit * (1 - burn);
    const pk = clamp01((l - 0.85) / 0.25) * (1 - clamp01((l - 1.8) / 0.3));
    z.portal.visible = z.column.visible = pk > 0.01;
    z.portal.position.set(p.x, 0.04, p.z); z.portal.scale.setScalar(pk); z.portal.rotation.z = l * 5;
    z.column.position.set(p.x, 0, p.z); z.column.scale.set(pk, 1, pk); (z.column.material as THREE.MeshBasicMaterial).opacity = 0.75 * pk;
    const up = ease((l - 1.15) / 0.6);
    w.root.position.set(p.x, up * 1.6, p.z); w.root.scale.setScalar(Math.max(0.001, 1 - up)); w.body.rotation.set(0, up * 7, 0);
    w.root.visible = up < 0.99;
    z.spirit.visible = up < 0.99; z.spirit.position.set(p.x + 0.4 * (1 - up), 2.2 + up * 2.2, p.z + 0.5); z.light.intensity = 8 * (1 - up);
    z.pop.visible = l > 0.8; if (z.pop.visible) { setText(z.pop, `+${z.got}`); z.pop.position.set(p.x, 3.1 + (l - 0.8) * 0.5, p.z + 0.4); (z.pop.material as THREE.SpriteMaterial).opacity = 1 - clamp01((l - 1.7) / 0.4); }
  }

  /* ---------------- 주사위 ---------------- */
  private drawDice(m: CaveMg, t: number, showS: number, moving: boolean): void {
    const L = m.last;
    this.dice.forEach(d => d.visible = false); this.diceGlow.forEach(g => g.visible = false); this.shields.forEach(s => s.visible = false);
    const thrower = m.inside.includes(m.ord[0]) ? m.ord[0] : m.inside[0];
    const tw = thrower != null ? this.wiz.get(thrower) : null;
    const hand = tw ? tw.pos.clone().add(new THREE.Vector3(0.5, 1.35, 0.5)) : new THREE.Vector3(CX, 1.3, 0.5);
    // 나온 눈이 카메라를 보게: 윗면(+y)을 앞(+z)으로
    const faceFront = (d: THREE.Group, k: number) => d.rotation.set(Math.PI / 2, 0, (k - 1) * 0.12);
    if (m.step === 'pre') {
      const nd = Math.min(3, m.pool + 1);
      for (let k = 0; k < nd; k++) { const d = this.dice[k]; d.visible = true; d.scale.setScalar(0.32); d.position.copy(hand).add(new THREE.Vector3((k - (nd - 1) / 2) * 0.34, 0.25 + Math.sin(t * 3 + k) * 0.05, 0)); d.rotation.set(t + k, t * 1.3, 0); }
      return;
    }
    if (m.step !== 'show' || !L || showS < 0 || (moving && showS >= RT.out)) return;
    const nd = L.faces.length; let oneK = 0;
    L.faces.forEach((v, k) => {
      const d = this.dice[k]; d.visible = true; d.scale.setScalar(0.5);
      if (d.userData.v !== v) setDie(d, v);
      const to = new THREE.Vector3(CX + 2.5 + (k - (nd - 1) / 2) * 0.7, 0.25, 1.1);
      const isOne = v === 1; const kept = isOne && oneK < L.kept; if (isOne) oneK++;
      if (showS < RT.land) {
        const u = showS / RT.land; const a = Math.min(1, u / 0.7);
        const p = hand.clone().lerp(to, ease(a)); p.y = u < 0.7 ? hand.y * (1 - a) + to.y * a + Math.sin(a * Math.PI) * 0.8 : to.y + Math.sin((u - 0.7) / 0.3 * Math.PI) * 0.15;
        d.position.copy(p); const sp = (1 - u) * 14; d.rotation.set(sp + k, sp * 0.7, sp * 0.4);
        if (u > 0.92) faceFront(d, k);
        return;
      }
      d.position.copy(to); faceFront(d, k);
      if (!isOne) return;
      const g = this.diceGlow[k]; g.visible = showS < RT.up + 0.25; g.position.set(to.x, to.y, to.z - 0.3); g.lookAt(this.camera.position); g.scale.setScalar(1 + Math.sin(t * 10) * 0.08);
      if (kept) { const sh = this.shields[k]; sh.visible = showS < RT.blast; sh.position.copy(to); sh.scale.setScalar(backOut(clamp01((showS - RT.land) / 0.3))); return; }
      if (showS >= RT.up) {
        const u = ease((showS - RT.up) / (RT.hit - RT.up));
        d.position.set(to.x + (CX - to.x) * u * 0.5, to.y + (CEIL - 0.6 - to.y) * u, to.z + (-1.6 - to.z) * u);
        d.rotation.set(u * 9, u * 6, 0); d.scale.setScalar(0.5 * (1 - u * 0.8)); d.visible = u < 0.99;
      }
    });
  }

  /* ---------------- 폭파: 바위가 깨지고 크리스탈을 캔다 ---------------- */
  private drawBlast(showS: number, moving: boolean, dt: number): void {
    const open = moving && showS >= RT.blast + 0.1 && showS < RT.swap;
    this.block.visible = !open; this.blockLight.intensity = 6;
    const b = moving ? showS - RT.blast : -1;
    this.burst.visible = b >= 0 && b < 0.5;
    if (this.burst.visible) { this.burst.position.set(ROCK_X + 0.2, 1.8, 0.8); this.burst.lookAt(this.camera.position); this.burst.scale.setScalar(0.5 + ease(b / 0.25) * 1.2); (this.burst.material as THREE.MeshBasicMaterial).opacity = 1 - clamp01((b - 0.15) / 0.35); }
    this.flash.intensity = b >= 0 && b < 0.6 ? 80 * (1 - b / 0.6) : 0;
    if (b >= 0 && b < dt * 1.5) { this.kick(0.12); this.chunks.forEach((c, k) => { c.p0.set(ROCK_X + 0.6 + (Math.random() - 0.5) * 1.2, 0.6 + k * 0.4, (Math.random() - 0.3) * 1.2); c.v.set(1.5 + Math.random() * 3, 2 + Math.random() * 3, (Math.random() - 0.3) * 2); c.m.position.copy(c.p0); }); }
    this.chunks.forEach(c => {
      c.m.visible = b >= 0 && b < 1.2 && showS < RT.swap;
      if (!c.m.visible) return;
      c.v.y -= 12 * dt; c.m.position.addScaledVector(c.v, dt); if (c.m.position.y < 0.15) { c.m.position.y = 0.15; c.v.y *= -0.3; c.v.x *= 0.6; }
      c.m.rotation.x += dt * 5; c.m.rotation.z += dt * 3;
    });
    // 크리스탈: 튀어 올랐다가 무리에게 날아간다
    this.gems.forEach((g, k) => {
      const u = b >= 0.1 ? (b - 0.1) / 0.6 : -1; g.visible = u >= 0 && u < 1;
      if (!g.visible) return;
      const fx = ROCK_X + 0.2 + k * 0.2, tx = CX + (k - 1) * 0.95;
      g.position.set(fx + (tx - fx) * ease(u), 1.4 + k * 0.3 + Math.sin(u * Math.PI) * 1.4 - u * 0.4, 0.8); g.rotation.set(u * 6, u * 4, 0); g.scale.setScalar(0.6 * (1 - u * 0.5));
    });
  }

  /* ---------------- 무너짐·돌가루 ---------------- */
  private drawCollapse(showS: number, collapse: boolean, dt: number): void {
    if (collapse && showS >= RT.shake && showS < RT.shake + dt * 1.5) this.kick(0.25);
    this.boulders.forEach((b, k) => {
      const at = RT.fall + (k % 3) * 0.08; b.visible = collapse && showS >= at;
      if (!b.visible) return;
      const u = clamp01((showS - at) / 0.4); const gy = 0.4 + (k % 3) * 0.3;
      b.position.set(CX + (k - 3.5) * 0.5, CEIL + 0.5 + (gy - CEIL - 0.5) * u * u, (k % 2 ? -0.3 : 0.45)); b.rotation.set(u * 3 + k, u * 2, 0);
    });
    this.dust.forEach((d, k) => {
      const u = collapse ? (showS - RT.buried + 0.1) / 0.9 : -1; d.visible = u > 0 && u < 1;
      if (!d.visible) return;
      d.position.set(CX + (k - 3) * 0.6, 0.5 + u * 0.9, 1.2); d.scale.setScalar(0.8 + u * 1.4); (d.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - u); d.lookAt(this.camera.position);
    });
  }
  private dropPebbles(): void {
    this.pebbles.forEach((r, k) => { r.on = true; r.m.visible = true; r.m.position.set(CX + (Math.random() - 0.5) * 2.4, CEIL - 0.2, (Math.random() - 0.4) * 1.6); r.v.set((Math.random() - 0.5) * 0.4, -0.5 - k * 0.2, 0); });
  }
  private drawPebbles(dt: number): void {
    for (const r of this.pebbles) {
      if (!r.on) continue;
      r.v.y -= 14 * dt; r.m.position.addScaledVector(r.v, dt); r.m.rotation.x += dt * 6;
      if (r.m.position.y < 0.08) { r.m.position.y = 0.08; if (Math.abs(r.v.y) > 1.5) r.v.y *= -0.3; else { r.on = false; r.m.visible = false; } }
    }
  }
  private kick(k: number): void { this.shakeT = this.t; this.shakeK = k; }

  /* ---------------- 카메라 ---------------- */
  private drawCamera(t: number): void {
    const H = this.dom.clientHeight || 720, a = this.camera.aspect || 1.6, k = uiScale();
    const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const top = 1 - 2 * ((slabH(k).h2 + 10) / H), bottom = -0.9;
    // 놀이 깊이(z=0)에서 바닥 아래 조금 ~ 천장까지, 가로는 무대 폭이 들어오게
    const y0 = -0.6, y1 = CEIL + 0.9, Ww = 12.5;
    const d = Math.max((y1 - y0) / ((top - bottom) * th), Ww / (2 * 0.98 * th * a));
    const cy = (y0 + y1) / 2 - ((top + bottom) / 2) * d * th;
    this.camD = d; this.camY = cy + 0.25; this.lookY = cy;
    // 안개(빛을 받는 것들: 마법사·주사위·크리스탈)도 카메라 거리에 맞춘다
    const fog = this.scene.fog as THREE.Fog; fog.near = d - 1; fog.far = d + 30;

    const s = t - this.shakeT; const sh = s < 0.5 ? this.shakeK * (1 - s / 0.5) : 0;
    const px = 0.3 + this.camX;
    this.camera.position.set(px + Math.sin(t * 61) * sh, this.camY + Math.sin(t * 47) * sh, d);
    this.camera.lookAt(px, this.lookY, 0);
    // 근경: 카메라 앞 FG_D 거리에, 원래 화각 40°에서 거리 4.3에 둔 것과 같은 크기로 보이게
    const FG_D = 4.5, sc = (FG_D * th) / (4.3 * Math.tan(THREE.MathUtils.degToRad(20)));
    this.fg.position.set(px, this.lookY + (this.camY - this.lookY) * (FG_D / d), d - FG_D); this.fg.scale.setScalar(sc);
  }
}

/* ---------------- 바위·종유석·크리스탈 ---------------- */
function rng(seed: number) { let s = Math.floor(seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const matC = new Map<string, THREE.MeshStandardMaterial>();
/** 각진 면(평면 음영) 바위 재료 */
function rockMat(c: string): THREE.MeshStandardMaterial { let m = matC.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.95, metalness: 0 }); matC.set(c, m); } return m; }
/** 각진 바위: 다면체 꼭짓점을 들쭉날쭉 밀고 당긴다 */
function rockGeo(seed: number, detail = 1, rough = 0.35): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const r = rng(seed + 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 1 + (r() - 0.5) * 2 * rough; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * (0.85 + r() * 0.3), p.getZ(i) * f); }
  g.computeVertexNormals(); return g;
}
/** 종유석: 위가 넓고 아래로 들쭉날쭉 좁아지며 끝이 살짝 휜다(위 = 0, 아래 끝 = -len) */
function stalGeo(seed: number, rad: number, len: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.ConeGeometry(rad, len, 7, 5, false); g.rotateX(Math.PI); g.translate(0, -len / 2, 0);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const r = rng(seed + 3); const p = g.attributes.position; const bend = (r() - 0.5) * rad * 1.6, bendZ = (r() - 0.5) * rad;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); const tt = clamp01(-y / len); const f = 1 + (r() - 0.5) * 0.7;
    p.setXYZ(i, p.getX(i) * f + bend * tt * tt, y + (tt > 0 && tt < 1 ? (r() - 0.5) * len * 0.08 : 0), p.getZ(i) * f + bendZ * tt * tt);
  }
  g.computeVertexNormals(); return g;
}
/** 크리스탈: 길쭉한 팔면체, 스스로 빛난다 */
function crystal(c: string): THREE.Mesh {
  const g = new THREE.OctahedronGeometry(0.35, 0); g.scale(0.6, 1.5, 0.6);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4, flatShading: true, roughness: 0.3 }));
}

/* ---------------- 귀환 스크롤 · 글자 · 균열 · 표지 ---------------- */
function buildScroll(): THREE.Group {
  const g = new THREE.Group(); const rodM = toon('#7a4e2a');
  const rodT = ink(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 10), rodM, 0.02); rodT.rotation.z = Math.PI / 2; g.add(rodT);
  const rodB = ink(new THREE.CylinderGeometry(0.05, 0.05, 0.62, 10), rodM, 0.02); rodB.rotation.z = Math.PI / 2; rodB.name = 'rodB'; rodB.position.y = -0.04; g.add(rodB);
  const pg = new THREE.PlaneGeometry(0.52, 0.56);
  const paper = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: scrollTex(false), side: THREE.DoubleSide })); paper.name = 'paper'; g.add(paper);
  const runes = new THREE.Mesh(pg, glow('#9fe6ff', 0)); (runes.material as THREE.MeshBasicMaterial).map = scrollTex(true); runes.position.z = 0.005; runes.name = 'runes'; g.add(runes);
  return g;
}
function textSprite(s: string): THREE.Sprite { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false })); sp.renderOrder = 30; setText(sp, s); sp.scale.set(1.0, 0.5, 1); return sp; }
function setText(sp: THREE.Sprite, s: string): void {
  if (sp.userData.s === s) return; sp.userData.s = s;
  const mt = sp.material as THREE.SpriteMaterial; mt.map?.dispose();
  mt.map = canvasTex(256, 128, g => { g.font = "bold 92px 'Black Han Sans', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = INK; g.strokeText(s, 128, 68); g.fillStyle = '#ffe28a'; g.fillText(s, 128, 68); });
  mt.needsUpdate = true;
}
const scrollT: THREE.Texture[] = [];
function scrollTex(runes: boolean): THREE.Texture {
  const k = runes ? 1 : 0; if (scrollT[k]) return scrollT[k];
  scrollT[k] = canvasTex(256, 256, g => {
    if (!runes) { g.fillStyle = '#f0dfb4'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(120,80,40,.5)'; g.lineWidth = 4; g.strokeRect(10, 6, 236, 244); }
    g.strokeStyle = runes ? '#ffffff' : '#7a4e2a'; g.lineWidth = runes ? 9 : 6; g.lineCap = 'round';
    g.beginPath(); g.arc(128, 128, 62, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(128, 168); g.lineTo(128, 88); g.moveTo(100, 114); g.lineTo(128, 86); g.lineTo(156, 114); g.stroke();
    for (let r = 0; r < 3; r++) { const y = 26 + r * 12; g.beginPath(); g.moveTo(40, y); g.lineTo(216 - r * 30, y); g.stroke(); }
    for (let r = 0; r < 3; r++) { const y = 206 + r * 12; g.beginPath(); g.moveTo(40 + r * 20, y); g.lineTo(216, y); g.stroke(); }
  });
  return scrollT[k];
}
/** 균열: 어두운 금 사이로 따뜻한 빛이 샌다(단계마다 늘어난다) */
const crackT: THREE.Texture[] = [];
function crackTex(stage: number): THREE.Texture {
  if (crackT[stage]) return crackT[stage];
  crackT[stage] = canvasTex(512, 256, g => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const seeds: [number, number][] = [[256, 0], [150, 0], [370, 0]];
    for (let st = 0; st < stage; st++) {
      const r = rng(200 + st * 13); let [x, y] = seeds[st]; const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 70; y += 22 + r() * 20; pts.push([x, y]); }
      for (const [w, c] of [[18, 'rgba(255,170,80,.35)'], [12, '#140a05'], [5, '#ffd27a']] as [number, string][]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke(); }
      for (let k = 2; k < 5; k += 2) { const [bx, by] = pts[k]; g.strokeStyle = '#140a05'; g.lineWidth = 7; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (r() > 0.5 ? 1 : -1) * (30 + r() * 30), by + 20 + r() * 20); g.stroke(); }
    }
  });
  return crackT[stage];
}
const signT = new Map<number, THREE.Texture>();
function signTex(n: number): THREE.Texture {
  let t = signT.get(n); if (t) return t;
  t = canvasTex(128, 96, g => { g.fillStyle = '#8a6440'; g.fillRect(0, 0, 128, 96); g.strokeStyle = '#3a2416'; g.lineWidth = 4; for (let y = 16; y < 96; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + 3); g.stroke(); }
    g.font = "64px 'Black Han Sans', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffe7b0'; g.strokeStyle = '#2a170c'; g.lineWidth = 8; g.strokeText(String(n), 64, 52); g.fillText(String(n), 64, 52); });
  signT.set(n, t); return t;
}
/** 양옆이 어둡게 사라지는 막: 가장자리는 거의 검정, 가운데로 갈수록 투명(위아래도 살짝) */
let sideT: THREE.Texture | null = null;
function sideTex(): THREE.Texture {
  if (sideT) return sideT;
  sideT = canvasTex(512, 256, g => {
    const lg = g.createLinearGradient(0, 0, 512, 0);
    lg.addColorStop(0, 'rgba(8,4,2,1)'); lg.addColorStop(0.12, 'rgba(8,4,2,.8)'); lg.addColorStop(0.28, 'rgba(8,4,2,0)');
    lg.addColorStop(0.72, 'rgba(8,4,2,0)'); lg.addColorStop(0.88, 'rgba(8,4,2,.8)'); lg.addColorStop(1, 'rgba(8,4,2,1)');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 256);
    const tg = g.createLinearGradient(0, 0, 0, 256);
    tg.addColorStop(0, 'rgba(8,4,2,.55)'); tg.addColorStop(0.2, 'rgba(8,4,2,0)'); tg.addColorStop(0.82, 'rgba(8,4,2,0)'); tg.addColorStop(1, 'rgba(8,4,2,.65)');
    g.fillStyle = tg; g.fillRect(0, 0, 512, 256);
  });
  return sideT;
}

/** 포스터라이즈: 색조·채도는 그대로 두고 명도(HSV의 V)만 몇 단계로 끊는다.
    (밝기 비율로 곱하는 방식은 어두운 곳이 보랏빛으로 들뜨고, 채널별로 끊으면 갈색이 붉게·초록으로 틀어졌다) */
const POSTER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, levels: { value: 8 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv;
    vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
    vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
    void main(){
      vec3 h = rgb2hsv(clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0));
      h.z = floor(h.z * levels + 0.5) / levels;
      // 투명도는 1로(심도 효과를 거친 값이 1보다 작아 페이지 배경이 비친다)
      gl_FragColor = vec4(hsv2rgb(h), 1.0);
    }`,
};
