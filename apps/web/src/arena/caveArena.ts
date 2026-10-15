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
import { cmd } from '../flow';
import { usePrefs } from '../prefs';
import { NEW_WIZ, buildMeshyWizard } from './meshyWizard';
import { CreasePass, CreaseRenderPass } from './crease';
import { type Wizard, buildDie, buildDots, buildWizard, lightColumn, portalDisc, setDie, softTex } from './props';
import { INK, INK_U, addInk, backOut, canvasTex, clamp01, ease, glow, ink, toon } from './toon';
import { slabH, uiScale } from '../ui/scale';
import { arrow3D, crystal, rng, rockGeo, rockMat, rockWall, stalGeo } from './caveParts';
import { GATHER_T, type Hazard, type RoomState, type ThemeKey, MAP_NODES, THEMES, buildBandage, buildFog, buildMaze, flyTo, mapTex, markerTex, themeOf } from './caveThemes';

const col = (j: number) => SEATCOL[j % 5];
/** 천장 높이 · 무리가 서는 곳 · 막힌 바위 · 무대 반폭 */
const CEIL = 4.3, CX = -0.6, ROCK_X = 3.6, HALF = 7;
/** 공개(굴림) 연출 시각(초) [제안]. 버틴 턴: 주사위 → 1은 천장으로 → 폭파 → 오른쪽으로 → 어두워짐 → 장면 바꿈 → 밝아짐 → 왼쪽에서 들어옴 */
const RT = { land: 0.9, up: 1.25, hit: 1.75, blast: 1.9, out: 2.6, fadeOut: 3.2, swap: 3.6, fadeIn: 3.75, inEnd: 4.7, gather: 4.55, shake: 1.9, fall: 2.15, buried: 2.55 };
const LEAVE_T = 2.2;
/** 1 주사위 칸(로컬 크기, 화면 UI 칸과 같은 비율): 날아가는 주사위의 목적지 */
const TRAY_H = 1.1, TRAY_W = 3.4, TRAY_GAP = 0.985, TRAY_DIE = 0.64, TRAY_Z = 1.6;
const FOG = '#b98a5c';
/** 망원 카메라 화각(원근 왜곡을 줄여 층이 겹친 것처럼, 사용자 2026-10-14) */
const FOV = 18;


interface CW {
  w: Wizard; spirit: THREE.Group; light: THREE.PointLight; dots: THREE.Group;
  pos: THREE.Vector3; born: number; leaveAt: number; gone: boolean; got: number;
  scroll: THREE.Group; portal: THREE.Mesh; column: THREE.Mesh; pop: THREE.Sprite;
  /** 전진을 고른 표시(머리 위 작은 화살표) · "전진!" 말풍선을 띄운 시각 */
  badge: THREE.Group; stayAt: number;
  /** 무너짐에 깔린 적이 있으면 다음 판부터 붕대 */
  band: THREE.Group; hurt: number;
}

export class CaveArena {
  private t = 0;
  private wiz = new Map<number, CW>();
  private dice: THREE.Group[] = [];
  private diceGlow: THREE.Mesh[] = [];
  private shields: THREE.Mesh[] = [];
  private pebbles: { m: THREE.Mesh; v: THREE.Vector3; on: boolean }[] = [];
  private boulders: THREE.Mesh[] = [];
  private dust: THREE.Mesh[] = [];
  private block!: THREE.Group; private blockLight!: THREE.PointLight;
  private chunks: { m: THREE.Mesh; v: THREE.Vector3; p0: THREE.Vector3 }[] = [];
  private gems: THREE.Object3D[] = [];
  private flash!: THREE.PointLight; private burst!: THREE.Mesh;
  /** 무리 위쪽 천장(바위·종유석·균열이 생기는 앞 바위면): 1이 빠질 때마다 통째로 쿵 내려앉는다 */
  private ceil = new THREE.Group(); private ceilY = 0; private ceilFrom = 0; private ceilTo = 0; private ceilAt = -9;
  private ceilDust: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  /** 균열: 앞 바위면에 생기는 3D 금(단계마다 한 줄기씩 갈라지며 자란다) */
  private cracks: { core: THREE.Mesh; edge: THREE.Mesh; n: number; at: number }[] = []; private crackN = 0;
  private sign!: THREE.Mesh; private signN = -1; private entrance!: THREE.Group;
  private fade: THREE.Mesh; private sides: THREE.Mesh;
  private prev: { pan: number; inside: number[]; step: string; di: number } | null = null;
  /** 판 사이 장면(사용자 2026-10-14): 어두워짐(start→black) → "N판" → 밝아짐(end→). 어두운 동안 무대를 정리한다 */
  private trans = { start: -9, black: -9, end: -9, pan: 0, reset: true };
  private title!: THREE.Mesh; private titlePan = -1; private marker!: THREE.Mesh;
  /** 장소(판마다): 무대 묶음 · 근경 묶음 · 막힌 것 · 재료 · 위험 */
  private themes = {} as Record<ThemeKey, { root: THREE.Group; fg: THREE.Group; block: THREE.Group; blockLight: THREE.PointLight; gems: THREE.Object3D[]; hazard: Hazard | null; blast?: boolean; advance?: (b: number, t: number, cam: THREE.Vector3) => void; room?: (st: RoomState, t: number, cam: THREE.Vector3, party: THREE.Vector3[]) => void }>;
  /** 방 채집: 어느 방에서 언제 시작했는지 */
  private gKey = ''; private gT = -9;
  private themeKey: ThemeKey = 'cave'; private hemi!: THREE.HemisphereLight;
  /** 무너짐에 깔린 사람(다음 판부터 붕대) */
  private hurtNext = new Set<number>(); private hurtKey = '';
  /** 정해 둔 자리(사용자 2026-10-14): 누가 귀환해도 남은 사람은 그 자리 그대로, 다음 장면으로 넘어갈 때(턴 장면 전환·새 판) 다시 정한다 */
  private slots = new Map<number, number>(); private slotKey = '';
  private panAt = -9;
  private shakeT = -9; private shakeK = 0;
  private camX = 0; private camD = 11; private camY = 2.4; private lookY = 2;
  private hud = new THREE.Scene(); private hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  /** 카메라에 붙은 흐린 근경 */
  private fg = new THREE.Group(); private fov0 = 40;
  /** 고르기 화살표(사용자 2026-10-14): 전진 = 머리 위 오른쪽, 나가기 = 출구 쪽 왼쪽. 눌러 고르고 [확정] */
  private pick!: { fwd: THREE.Group; exit: THREE.Group; fwdLbl: THREE.Sprite; exitLbl: THREE.Sprite };
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(-9, -9); private hover: 'stay' | 'leave' | null = null;
  /** 위쪽 가운데 1 주사위 칸(사용자 2026-10-15): 돌판에 칸 3개, 빠진 1 주사위가 하나씩 꽂힌다. 화면에 붙은 듯 카메라 앞 일정 자리 */
  private trayScene = new THREE.Scene(); private tray = new THREE.Group(); private trayDie: THREE.Group[] = []; private trayN = 0; private trayPan = -1; private trayAt = [-9, -9, -9]; private trayK = 1;
  /** 칸 돌판은 위쪽 석판과 같은 화면 UI(사용자 2026-10-15: 헤더와 같은 그림). 3D 칸 자리는 날아가는 주사위의 목적지로만 쓴다 */
  private trayEl = document.createElement('div'); private traySlots: HTMLElement[] = [];
  private crease: CreasePass | null = null;
  private composer: EffectComposer | null = null; private bokeh: BokehPass | null = null; private size = new THREE.Vector2();

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private dom: HTMLCanvasElement, private gl: THREE.WebGLRenderer) {
    scene.background = new THREE.Color(FOG);
    this.fov0 = camera.fov; camera.fov = FOV; camera.updateProjectionMatrix();
    // 갈색 안개: 멀수록 밝은 황토빛으로 흐려진다
    scene.fog = new THREE.Fog(FOG, 10, 34);
    this.hemi = new THREE.HemisphereLight('#e2bd8e', '#24160c', 0.55); scene.add(this.hemi);
    const back = new THREE.DirectionalLight('#ffd9a0', 0.6); back.position.set(2, 8, -12); scene.add(back);
    this.buildCave();
    scene.add(this.fg);
    // 2판 미궁 · 3판 안개 숲
    for (const [key, build] of [['maze', buildMaze], ['fog', buildFog]] as const) {
      const root = new THREE.Group(), fg = new THREE.Group(); scene.add(root); this.fg.add(fg);
      const parts = build(root, fg, CX, ROCK_X, CEIL); this.themes[key] = { root, fg, ...parts };
    }
    { const m0 = this.mg(); this.applyTheme(themeOf(m0?.pan ?? 1).key); }
    this.inkStage();
    for (let k = 0; k < 3; k++) {
      const d = buildDie(1); d.scale.setScalar(0.5); d.visible = false; scene.add(d); this.dice.push(d);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), glow('#ff5a3a', 0.9)); (g.material as THREE.MeshBasicMaterial).map = softTex(); g.visible = false; scene.add(g); this.diceGlow.push(g);
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), glow('#8fe3ff', 0.35)); sh.visible = false; scene.add(sh); this.shields.push(sh);
    }
    this.buildTray(); this.trayScene.add(this.tray, new THREE.HemisphereLight('#f2dcb8', '#3a2818', 0.9));
    { const l = new THREE.DirectionalLight('#fff1d6', 1.4); l.position.set(0.3, 6, 30); this.trayScene.add(l); }
    for (let k = 0; k < 7; k++) { const p = new THREE.Mesh(rockGeo(500 + k, 0, 0.3), rockMat('#5e3e28')); p.scale.setScalar(0.08 + (k % 3) * 0.04); p.visible = false; scene.add(p); this.pebbles.push({ m: p, v: new THREE.Vector3(), on: false }); }
    for (let k = 0; k < 8; k++) { const b = new THREE.Mesh(rockGeo(600 + k, 1, 0.35), rockMat(k % 2 ? '#5a3a25' : '#4a2f1e')); b.scale.set(0.5 + (k % 3) * 0.2, 0.42 + (k % 2) * 0.15, 0.5); b.visible = false; scene.add(b); this.boulders.push(b); }
    for (let k = 0; k < 7; k++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ color: '#d8b48a', map: softTex(), transparent: true, opacity: 0, depthWrite: false })); d.visible = false; scene.add(d); this.dust.push(d); }
    // 화면 앞 막: 장면 전환(검정) · 양옆이 어둡게 사라짐
    // (심도 계산에 끼지 않게 장면과 따로, 맨 마지막에 화면 전체로 그린다)
    this.sides = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: sideTex(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.fade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.sides.renderOrder = 1; this.fade.renderOrder = 2; this.hud.add(this.sides, this.fade);
    this.title = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    this.title.renderOrder = 3; this.title.visible = false; this.hud.add(this.title);
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: markerTex(), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    this.marker.renderOrder = 4; this.marker.visible = false; this.hud.add(this.marker);
    scene.add(camera);
    this.buildPick();
    dom.addEventListener('pointermove', this.onMove); dom.addEventListener('pointerdown', this.onDown); dom.addEventListener('pointerleave', this.onLeave);
    this.setupComposer();
    if (import.meta.env.DEV) (window as unknown as { __arena: CaveArena }).__arena = this;
  }
  dispose(): void {
    this.dom.removeEventListener('pointermove', this.onMove); this.dom.removeEventListener('pointerdown', this.onDown); this.dom.removeEventListener('pointerleave', this.onLeave); this.dom.style.cursor = '';
    this.camera.fov = this.fov0; this.camera.updateProjectionMatrix();
    this.hud.clear(); this.scene.clear(); this.scene.background = null; this.scene.fog = null;
    this.composer?.dispose(); this.trayEl.remove();
  }
  /* ---------------- 고르기 화살표 ---------------- */
  private buildPick(): void {
    const fwd = arrow3D('#ffd36a'), exit = arrow3D('#9fe3ff'); exit.rotation.y = Math.PI;
    fwd.userData.pick = 'stay'; exit.userData.pick = 'leave';
    const fwdLbl = textSprite('전진'), exitLbl = textSprite('나가기');
    for (const o of [fwd, exit, fwdLbl, exitLbl]) { o.visible = false; this.scene.add(o); }
    this.pick = { fwd, exit, fwdLbl, exitLbl };
  }
  private pickAt(): 'stay' | 'leave' | null {
    const p = this.pick; if (!p.fwd.visible) return null;
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects([p.fwd, p.exit], true)[0]; if (!hit) return null;
    let o: THREE.Object3D | null = hit.object; while (o && !o.userData.pick) o = o.parent; return (o?.userData.pick as 'stay' | 'leave') ?? null;
  }
  private setNdc(e: PointerEvent): void { const r = this.dom.getBoundingClientRect(); this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  private onMove = (e: PointerEvent) => { this.setNdc(e); this.hover = this.pickAt(); this.dom.style.cursor = this.hover ? 'pointer' : ''; };
  private onLeave = () => { this.hover = null; this.dom.style.cursor = ''; };
  private onDown = (e: PointerEvent) => { if (e.button > 0) return; this.setNdc(e); const h = this.pickAt(); if (h) cmd('csel', { s: h }); };
  private drawPick(m: CaveMg, t: number, hide = false): void {
    const st = useStore.getState(); const p = this.pick;
    const mine = !hide && m.step === 'decide' && st.ctl != null && caveDecider(m) === st.ctl;
    for (const o of [p.fwd, p.exit, p.fwdLbl, p.exitLbl]) o.visible = mine;
    if (!mine) { if (this.hover) { this.hover = null; this.dom.style.cursor = ''; } return; }
    const sel = st.ui.cave;
    const look = (g: THREE.Group, key: 'stay' | 'leave') => {
      const on = sel === key, hv = this.hover === key;
      g.scale.setScalar((on ? 1.18 : sel ? 0.85 : 1) * (hv ? 1.08 : 1));
      g.traverse(c => { const mt = (c as THREE.Mesh).material as THREE.MeshToonMaterial; if (mt && 'emissiveIntensity' in mt && c.name !== 'ink') mt.emissiveIntensity = on ? 1.1 : sel ? 0.15 : 0.45 + Math.sin(t * 4) * 0.15; });
    };
    // 전진: 무리 오른쪽(앞길 쪽), 나가기와 같은 높이(사용자 2026-10-15). 고르면 오른쪽으로 살짝 밀었다 당겼다
    const fx = CX + 2.7, fy = 2.4;
    p.fwd.position.set(fx + (sel === 'stay' ? Math.sin(t * 5) * 0.08 : 0), fy, 0.9); look(p.fwd, 'stay');
    p.fwdLbl.position.set(fx, fy + 0.55, 1.0);
    // 나가기: 출구(왼쪽) 쪽
    p.exit.position.set(-3.5 - (sel === 'leave' ? Math.sin(t * 5) * 0.08 : 0), 2.4, 0.9); look(p.exit, 'leave');
    setText(p.exitLbl, `나가기 +${m.turn}`); p.exitLbl.position.set(-3.5, 2.95, 1.0);
    // 화살표에는 단축키(←/→)를 붙이지 않는다(사용자 2026-10-15). 키보드로 고르기는 그대로
  }

  private mg(): CaveMg | null { const S = useStore.getState().S; return S?.phase === 'mg' && S.mg?.id === 'cave' ? S.mg : null; }

  /* ---------------- 카메라 심도(가까운 바위가 흐려진다). 낮은 품질에서는 끈다 ---------------- */
  private setupComposer(): void {
    const c = new EffectComposer(this.gl);
    // 새 마법사 미리보기: 맨 앞 그리기에 안쪽 주름 선을 더한다(심도·색 단계 효과는 그 위에 그대로)
    if (NEW_WIZ) { this.crease = new CreasePass(this.gl); c.addPass(new CreaseRenderPass(this.crease, this.scene, this.camera)); } else c.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 22, aperture: 0.0008, maxblur: 0.012 });
    // 심도 효과의 깊이 그리기에서는 빛무리·글자 같은 투명 평면을 뺀다: 깊이 재질로 덮어 그리면 사각형 전체가 깊이에 찍혀
    // 그 사각형만 흐림이 달라져 굴절처럼 보인다(사용자 2026-10-15: 빛 정령 주변 사각형)
    const bk = this.bokeh, draw = bk.render.bind(bk), hid: THREE.Object3D[] = [];
    bk.render = (...args: Parameters<BokehPass['render']>) => {
      this.scene.traverseVisible(o => { const mt = (o as THREE.Mesh).material as THREE.Material | undefined; if ((o as THREE.Sprite).isSprite || (mt && !Array.isArray(mt) && mt.transparent && !mt.depthWrite)) hid.push(o); });
      hid.forEach(o => o.visible = false);
      try { draw(...args); } finally { hid.forEach(o => o.visible = true); hid.length = 0; }
    };
    c.addPass(this.bokeh); c.addPass(new OutputPass());
    // 색 단계 줄이기: 색조는 두고 밝기만 몇 단계로 끊는다(그러데이션이 판화처럼)
    c.addPass(new ShaderPass(POSTER));
    this.composer = c;
  }
  /** 직접 그린다(심도 효과를 거쳐서) */
  render(): void {
    const low = usePrefs.getState().quality === 'low';
    if (!this.composer || low) { if (this.crease) this.crease.render(this.scene, this.camera); else this.gl.render(this.scene, this.camera); this.drawTrayLayer(); this.drawHud(); return; }
    this.gl.getSize(this.size);
    const c = this.composer as unknown as { _width: number; _height: number };
    if (c._width !== this.size.x || c._height !== this.size.y) { this.composer.setPixelRatio(this.gl.getPixelRatio()); this.composer.setSize(this.size.x, this.size.y); }
    // 초점: 무리가 서는 깊이
    (this.bokeh!.uniforms as Record<string, { value: number }>).focus.value = this.camD;
    this.composer.render();
    this.drawTrayLayer();
    this.drawHud();
  }
  /** 칸으로 날아가는 1 주사위: 장면 효과(색 단계·심도) 밖에서, 천장에 가리지 않게 맨 앞에 */
  private drawTrayLayer(): void { const ac = this.gl.autoClear; this.gl.autoClear = false; this.gl.clearDepth(); this.gl.render(this.trayScene, this.camera); this.gl.autoClear = ac; }
  private drawHud(): void { const ac = this.gl.autoClear; this.gl.autoClear = false; this.gl.render(this.hud, this.hudCam); this.gl.autoClear = ac; }

  /* ---------------- 동굴 짓기 ---------------- */
  private buildCave(): void {
    let caveRoom: (st: RoomState, t: number, cam: THREE.Vector3, party: THREE.Vector3[]) => void = () => {};
    const caveRoot = new THREE.Group(), caveFg = new THREE.Group(); this.scene.add(caveRoot); this.fg.add(caveFg);
    const sc = caveRoot; const r = rng(7);
    const rock = (geo: THREE.BufferGeometry, c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => { const m = new THREE.Mesh(geo, rockMat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(r() * 0.4, ry || r() * 6, r() * 0.4); sc.add(m); return m; };
    const shades = ['#5b3b26', '#4c311f', '#6a4630', '#3f2819'];
    // 바닥: 거의 평평하게, 위에 작은 돌멩이
    const fg = new THREE.BoxGeometry(34, 1, 22, 34, 1, 22); const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) if (fp.getY(i) > 0) fp.setY(i, 0.5 + (r() - 0.5) * 0.08);
    fg.computeVertexNormals();
    const floor = new THREE.Mesh(fg, rockMat('#4a2f1f')); floor.position.set(1, -0.5, -5); floor.userData.noInk = true; sc.add(floor);
    for (let k = 0; k < 46; k++) { const s = 0.06 + r() * r() * 0.32; rock(rockGeo(k, 0, 0.35), shades[k % 4], -10 + r() * 22, s * 0.3, -12 + r() * 15, s * 1.4, s, s * 1.2); }
    // 뒤쪽 바위 벽과 중간 덩어리(멀수록 안개에 묻혀 밝아진다)
    for (let k = 0; k < 18; k++) { const s = 2 + r() * 2.5; rock(rockGeo(100 + k, 1, 0.4), shades[k % 4], -14 + k * 1.7 + r(), s * 0.6, -15 - r() * 3, s, s * 1.4, s); }
    for (let k = 0; k < 12; k++) { const s = 0.8 + r() * 1.4; rock(rockGeo(140 + k, 1, 0.4), shades[k % 4], -11 + r() * 22, s * 0.45, -6 - r() * 6, s * 1.3, s, s); }
    // 석순(아래에서 솟은 것) 몇 개
    for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(stalGeo(160 + k, 0.35 + r() * 0.4, 1.2 + r() * 2.2), rockMat(shades[k % 4])); m.rotation.x = Math.PI; m.position.set(-10 + r() * 20, 0, -4 - r() * 8); sc.add(m); }
    // 천장: 납작한 큰 바위로 덮고, 아래로 크고 작은 종유석(몇 개씩 붙은 덩어리도)
    sc.add(this.ceil);
    const toCeil = (m: THREE.Object3D) => { if (m.position.z > -7) this.ceil.attach(m); };
    for (let k = 0; k < 34; k++) { const s = 2 + r() * 2; toCeil(rock(rockGeo(200 + k, 1, 0.35), shades[k % 4], -13 + (k % 12) * 2.4 + r(), CEIL + 0.9 + r() * 0.6, -14 + Math.floor(k / 12) * 6 + r() * 3, s, 0.9 + r() * 0.6, s)); }
    for (let k = 0; k < 70; k++) {
      const z = -13 + r() * 15.5, x = -12 + r() * 24;
      // 놀이 깊이 바로 앞뒤에는 길게 늘어진 것을 피해 무리를 가리지 않게
      const near = z > -1.5 && z < 1.5 && x > -3 && x < 5;
      const len = near ? 0.3 + r() * 0.6 : 0.4 + r() * r() * 2.6, rad = 0.12 + r() * 0.42;
      const m = new THREE.Mesh(stalGeo(300 + k, rad, len), rockMat(shades[k % 4])); m.position.set(x, CEIL + 0.3, z); m.rotation.y = r() * 6; sc.add(m); toCeil(m);
      if (r() < 0.3) { const m2 = new THREE.Mesh(stalGeo(400 + k, rad * 0.6, len * (0.4 + r() * 0.5)), rockMat(shades[(k + 1) % 4])); m2.position.set(x + rad * 1.3, CEIL + 0.3, z + (r() - 0.5) * 0.3); sc.add(m2); toCeil(m2); }
    }
    // 앞(카메라 가까이, 초점이 흐려진다): 양옆 큰 바위와 늘어진 종유석
    // (망원 카메라라 장면 속에 두면 작아져서, 카메라 앞 일정 거리에 붙여 화면을 감싸게 한다: drawCamera)
    const fgRock = (seed: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => { const m = new THREE.Mesh(rockGeo(seed, 1, 0.4), rockMat('#2c1b10')); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(r() * 0.4, r() * 6, r() * 0.4); m.userData.fg = true; caveFg.add(m); };
    fgRock(700, -4.9, -0.9, 0, 1.6, 2.4, 1.2);
    fgRock(701, 5.1, -1.8, 0.2, 1.8, 1.4, 1.2);
    fgRock(702, 0.7, -2.7, 0.5, 2.4, 0.9, 1.0);
    for (const [x, len, rad, z] of [[2.3, 2.6, 0.5, -0.3], [-1.9, 1.6, 0.35, 0.1], [0.3, 1.0, 0.28, -0.7]]) { const m = new THREE.Mesh(stalGeo(800 + x * 10, rad, len), rockMat('#2a190f')); m.position.set(x, 2.6, z); m.userData.fg = true; caveFg.add(m); }
    // 부러진 나무 울타리
    const wood = rockMat('#3a2416');
    for (const x0 of [-5.2, 5.6]) for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9 + r() * 0.5, 0.09), wood); st.position.set(x0 + k * 0.32, 0.45, -1.4); st.rotation.z = (r() - 0.5) * 0.4; sc.add(st); }
    // 입구(깊이 0에서만): 왼쪽 멀리서 들어오는 햇빛
    this.entrance = new THREE.Group(); sc.add(this.entrance);
    const day = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshBasicMaterial({ color: '#fff1d2', map: softTex(), transparent: true, depthWrite: false, fog: false })); day.position.set(-12, 2.2, -10); this.entrance.add(day);
    const sun = new THREE.PointLight('#ffe6b8', 60, 18, 1.3); sun.position.set(-9, 3, -6); this.entrance.add(sun);
    // 깊이 표지(나무 말뚝 + 판)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), wood); post.position.set(CX - 2.6, 0.75, -0.6); this.scene.add(post);
    this.sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.08), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: signTex(0), roughness: 1 }), wood]);
    this.sign.position.set(CX - 2.6, 1.55, -0.55); this.sign.rotation.z = -0.05; this.scene.add(this.sign);
    // 앞을 막은 바위벽(사용자 2026-10-15: 동굴은 막는 벽을 폭파해 나아간다). 크리스탈은 벽이 아니라 다음 방에서 모은다
    this.block = new THREE.Group(); this.block.position.set(ROCK_X + 0.6, 0, -0.2); sc.add(this.block);
    // 크고 작은 얼룩 바위를 쌓은 더미(사용자 2026-10-15: 한 덩이는 너무 밋밋하다)
    this.block.add(rockWall(900, ['#6a4630', '#5b3b26', '#7a5236', '#4c311f'], CEIL));
    // 벽이 어둠에 묻히지 않게 앞에서 따뜻하게 비춘다
    this.blockLight = new THREE.PointLight('#ffcf9a', 5, 5, 1.5); this.blockLight.position.set(-1.6, 1.8, 1.4); this.block.add(this.blockLight);
    // 다음 방의 크리스탈 군집(사용자 2026-10-15): 벽에 박힌 것을 깨는 대신, 새 방에 들어와 바닥·벽에서 떼어 내 모은다
    const cc = ['#8ff3ff', '#d2b6ff', '#8ff7cf'];
    const clusters: { g: THREE.Group; p: THREE.Vector3; s: number }[] = [];
    const cps: [number, number, number, number, number][] = [[CX + 2.0, 0, 0.8, 1.3, 0.1], [CX + 2.85, 0, 0.15, 1.05, -0.2], [CX + 1.2, 0, -0.9, 0.9, 0.25]];
    cps.forEach(([x, y, z, sc_, rz], k) => { const g = crystal(cc[k], k + 1); g.position.set(x, y, z); g.rotation.set(0, k * 1.3, rz); g.scale.setScalar(sc_); g.visible = false; sc.add(g); clusters.push({ g, p: new THREE.Vector3(x, y, z), s: sc_ }); });
    const cLight = new THREE.PointLight('#9fe8ff', 0, 5, 1.5); cLight.position.set(CX + 2.6, 1.2, 0.9); sc.add(cLight);
    caveRoom = (st: RoomState, t: number, _cam: THREE.Vector3, party: THREE.Vector3[]) => {
      clusters.forEach((c, k) => {
        const g = c.g;
        if (st === 'hidden' || st === 'done') { g.visible = false; return; }
        g.visible = true;
        if (st === 'idle') { g.position.copy(c.p); g.scale.setScalar(c.s); g.rotation.x = 0; return; }
        // 떼어 내기: 빛나며 떨리다가(0~0.5) 떠올라 무리에게 날아간다
        const shake = st < 0.5 ? Math.sin(t * 40 + k) * 0.03 * (st / 0.5) : 0;
        const u = clamp01((st - 0.5 - k * 0.1) / 0.7);
        if (u <= 0) { g.position.set(c.p.x + shake, c.p.y, c.p.z); g.scale.setScalar(c.s * (1 + 0.08 * Math.sin(t * 12))); return; }
        flyTo(g, new THREE.Vector3(c.p.x, c.p.y + 0.3, c.p.z), (party[k % Math.max(1, party.length)] ?? c.p).clone().setY(1.3), u, c.s);
        g.visible = u < 1;
      });
      cLight.intensity = st === 'idle' ? 5 : typeof st === 'number' ? 5 + 6 * Math.sin(clamp01(st / GATHER_T) * Math.PI) : 0;
    };
    for (let k = 0; k < 8; k++) { const m = new THREE.Mesh(rockGeo(950 + k, 0, 0.35), rockMat('#4e331f')); m.scale.setScalar(0.25 + (k % 3) * 0.12); m.visible = false; this.scene.add(m); this.chunks.push({ m, v: new THREE.Vector3(), p0: new THREE.Vector3() }); }
    this.themes.cave = { root: caveRoot, fg: caveFg, block: this.block, blockLight: this.blockLight, gems: [], hazard: null, room: caveRoom, blast: true };
    this.flash = new THREE.PointLight('#ffd9a0', 0, 10, 1.4); this.flash.position.set(ROCK_X, 1.8, 1.2); this.scene.add(this.flash);
    this.burst = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), glow('#ffc070', 1)); (this.burst.material as THREE.MeshBasicMaterial).map = softTex(); this.burst.visible = false; this.scene.add(this.burst);
    // 앞 바위면: 무리 바로 위 천장 앞쪽에 걸린 넓은 바위(앞면이 평평해 균열이 새겨진다)
    const lipG = new THREE.BoxGeometry(9, 1.1, 1.2, 18, 3, 2); const lp = lipG.attributes.position;
    for (let i = 0; i < lp.count; i++) { const z = lp.getZ(i); lp.setXYZ(i, lp.getX(i) + (r() - 0.5) * 0.15, lp.getY(i) + (lp.getY(i) < 0 ? (r() - 0.5) * 0.35 : 0), z + (z > 0 ? (r() - 0.5) * 0.04 : (r() - 0.5) * 0.2)); }
    lipG.computeVertexNormals();
    // 앞면을 아래로 기울여(카메라·정령 쪽을 보게) 빛을 받고 균열이 잘 보이게
    const lip = new THREE.Mesh(lipG, rockMat('#6a4630')); lip.position.set(CX + 0.5, CEIL + 0.15, 1.0); lip.rotation.x = 0.95; this.ceil.add(lip);
    // 앞 바위면 아래로 짧은 종유석 몇 개
    for (let i = 0; i < 7; i++) { const st = new THREE.Mesh(stalGeo(1200 + i, 0.14 + r() * 0.2, 0.25 + r() * 0.5), rockMat(shades[i % 4])); st.position.set(CX - 3.5 + i * 1.25 + r() * 0.4, CEIL - 0.35, 0.9 + r() * 0.5); this.ceil.add(st); }
    // 균열 3줄기(앞면에, 단계마다 하나씩 자란다)
    for (let k = 0; k < 3; k++) {
      const { core, edge } = crackMeshes(1300 + k * 17, k);
      core.position.set(0, 0, 0.63); edge.position.set(0, 0, 0.62);
      core.visible = edge.visible = false; lip.add(edge, core);
      this.cracks.push({ core, edge, n: (core.geometry.index?.count ?? 0), at: -9 });
    }
    // 내려앉을 때 천장 선에서 쏟아지는 돌가루
    for (let k = 0; k < 14; k++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: '#cfae86', map: softTex(), transparent: true, opacity: 0, depthWrite: false })); d.visible = false; sc.add(d); this.ceilDust.push({ m: d, v: new THREE.Vector3(), life: 0 }); }
  }
  /** 균열 단계: 늘어난 줄기는 짧게 자라난다(앞 바위면을 따라). 새 판이면 모두 사라진다 */
  private setCrack(stage: number, t: number): void {
    if (stage !== this.crackN) { this.cracks.forEach((c, k) => { if (k < stage && k >= this.crackN) c.at = t; }); this.crackN = stage; }
    this.cracks.forEach((c, k) => {
      const on = k < stage; c.core.visible = c.edge.visible = on; if (!on) return;
      const u = clamp01((t - c.at) / 0.4); const cnt = Math.floor(c.n * ease(u) / 3) * 3;
      c.core.geometry.setDrawRange(0, cnt); c.edge.geometry.setDrawRange(0, cnt);
    });
  }
  /** 천장 내려앉기: 단계마다 아래로 쿵(살짝 튕기며), 새 판이면 천천히 올라간다 */
  private drawCeil(stage: number, t: number, dt: number): void {
    const to = -0.42 * Math.min(2, stage);
    if (to !== this.ceilTo) {
      const down = to < this.ceilTo; this.ceilFrom = this.ceilY; this.ceilTo = to; this.ceilAt = t;
      if (down) { this.kick(0.14); this.dropPebbles(); this.spillDust(); }
    }
    const u = t - this.ceilAt; const span = this.ceilTo - this.ceilFrom;
    if (span < 0) {
      // 쿵: 빠르게 떨어져 조금 지나쳤다가 제자리
      const f = u < 0.16 ? Math.pow(u / 0.16, 2) * 1.12 : u < 0.4 ? 1.12 - 0.12 * ease((u - 0.16) / 0.24) : 1;
      this.ceilY = this.ceilFrom + span * f;
    } else this.ceilY = this.ceilTo;
    this.ceil.position.y = this.ceilY;
    for (const d of this.ceilDust) {
      if (d.life <= 0) { d.m.visible = false; continue; }
      d.life -= dt; d.m.visible = true; d.v.y -= 1.2 * dt; d.m.position.addScaledVector(d.v, dt);
      d.m.scale.setScalar(0.6 + (1.4 - d.life) * 0.9); (d.m.material as THREE.MeshBasicMaterial).opacity = 0.7 * clamp01(d.life / 1.4); d.m.lookAt(this.camera.position);
    }
  }
  private spillDust(): void {
    this.ceilDust.forEach((d, k) => { d.life = 1.0 + Math.random() * 0.5; d.m.position.set(CX - 4 + k * 0.62 + (Math.random() - 0.5) * 0.3, CEIL - 0.4 + this.ceilTo, 1.2 + Math.random() * 0.4); d.v.set((Math.random() - 0.5) * 0.3, -0.4 - Math.random() * 0.6, 0); });
  }
  /** 잉크 테두리: 무리 근처(뒤로 깊이 6 안쪽)와 근경의 바위·벽·나무에만(먼 배경은 안개 원근이 깨지지 않게 테두리 없이) */
  private inkStage(): void {
    const v = new THREE.Vector3(); const list: THREE.Mesh[] = [];
    const walk = (o: THREE.Object3D, near: boolean) => o.traverse(c => {
      const m = c as THREE.Mesh; if (!m.isMesh || m.name === 'ink' || m.userData.noInk) return;
      const mt = m.material as THREE.Material; if (Array.isArray(mt) || !mt?.userData?.rock) return;
      if (near || m.getWorldPosition(v).z > -6.5) list.push(m);
    });
    for (const T of Object.values(this.themes)) { walk(T.root, false); walk(T.fg, true); }
    walk(this.ceil, false);
    for (const m of list) addInk(m, m.parent && this.isFg(m) ? 0.06 : 0.045);
  }
  private isFg(o: THREE.Object3D): boolean { let p: THREE.Object3D | null = o; while (p) { if (p === this.fg) return true; p = p.parent; } return false; }
  /** 장소 바꾸기: 무대·근경·막힌 것·재료·하늘색·안개색·빛 */
  private applyTheme(key: ThemeKey): void {
    this.themeKey = key; const th = THEMES.find(x => x.key === key)!;
    for (const k of Object.keys(this.themes) as ThemeKey[]) { const T = this.themes[k]; T.root.visible = T.fg.visible = k === key; T.hazard?.reset(); }
    const T = this.themes[key]; this.block = T.block; this.blockLight = T.blockLight; this.gems = T.gems;
    (this.scene.background as THREE.Color).set(th.bg); (this.scene.fog as THREE.Fog).color.set(th.bg);
    this.hemi.color.set(th.sky); this.hemi.groundColor.set(th.ground);
    this.sign.visible = true;
  }
  private setDepth(n: number): void {
    if (this.signN === n) return; this.signN = n;
    const mats = this.sign.material as THREE.MeshStandardMaterial[]; mats[4].map = signTex(n); mats[4].needsUpdate = true;
    this.entrance.visible = n === 0 && this.themeKey === 'cave';
  }

  /* ---------------- 마법사 ---------------- */
  private makeWiz(j: number): CW {
    const w = NEW_WIZ ? buildMeshyWizard(col(j)) : buildWizard(col(j)); this.scene.add(w.root);
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
    const badge = arrow3D('#ffd36a'); badge.scale.setScalar(0.34); badge.position.y = 0.18; badge.visible = false; w.above.add(badge);
    const band = buildBandage(); w.head.add(band);
    const z: CW = { w, spirit, light, dots, pos: new THREE.Vector3(CX, 0, 0), born: this.t, leaveAt: 0, gone: false, got: 0, scroll, portal, column, pop, badge, stayAt: -9, band, hurt: 0 };
    this.wiz.set(j, z); return z;
  }

  /* ---------------- 매 프레임 ---------------- */
  frame(dt: number): void {
    dt = Math.min(dt, 0.05); this.t += dt; const t = this.t;
    INK_U.res.value.set(this.dom.width, this.dom.height); INK_U.px.value = 3.2 * Math.max(1, this.dom.width / Math.max(1, this.dom.clientWidth));
    const m = this.mg(); if (!m) return;
    const L = m.last;
    const dur = L?.collapse ? CAVE_SHOW_FALL : CAVE_SHOW;
    const showS = m.step === 'show' && L ? (now() - (m.until - dur)) / 1000 : -1;
    this.sync(m, t);
    const inTrans = this.drawTrans(t); const fadingOut = t >= this.trans.start && t < this.trans.black;
    const collapse = !!L?.collapse && m.step === 'show';
    const moving = m.step === 'show' && !!L && !L.collapse;
    this.setDepth(moving && showS < RT.swap ? Math.max(0, m.turn - 1) : m.turn);
    const lost = L ? L.faces.filter(v => v === 1).length - L.kept : 0;
    const crackN = m.step === 'show' && L ? (showS >= RT.hit ? L.ones : L.ones - lost) : m.ones;
    this.drawTray(m, crackN, t, inTrans);
    const stage = Math.max(0, Math.min(3, crackN)); const hz = this.themes[this.themeKey].hazard;
    if (!fadingOut) {
      if (!hz) { this.setCrack(stage, t); this.drawCeil(stage, t, dt); }
      else { const was = (hz as unknown as { _s?: number })._s ?? 0; hz.set(stage, t); if (stage > was) { this.kick(0.12); } (hz as unknown as { _s?: number })._s = stage; }
    }
    if (hz) { hz.frame(t, dt); if (collapse) hz.collapse?.(showS); }
    // 무너짐에 깔린 사람: 다음 판부터 붕대
    if (collapse && showS >= RT.buried) { const key = `${m.pan}`; if (this.hurtKey !== key) { this.hurtKey = key; m.inside.forEach(j => this.hurtNext.add(j)); } }
    if (m.step === 'show' && L?.collapse && showS >= RT.hit && showS < RT.hit + dt * 1.5) { this.kick(0.16); this.dropPebbles(); }
    // 다음 장면으로 넘어가는 순간(어두운 동안) 남은 사람끼리 자리를 다시 정한다
    if (moving && showS >= RT.swap) { const key = `${m.pan}:${m.turn}`; if (this.slotKey !== key) { this.slotKey = key; this.layoutSlots(m.inside); } }
    this.drawWizards(m, t, dt, showS, collapse, moving);
    this.drawPick(m, t, inTrans);
    if (inTrans) this.dice.forEach(d => d.visible = false); else this.drawDice(m, t, showS, moving);
    this.drawBlast(showS, moving, dt, m);
    this.drawCollapse(showS, collapse, dt);
    this.drawPebbles(dt);
    // 장면 전환: 어두워졌다가 밝아진다
    const fo = moving && showS >= RT.fadeOut && showS < RT.swap ? ease((showS - RT.fadeOut) / (RT.swap - RT.fadeOut)) : 0;
    const fi = moving && showS >= RT.swap && showS < RT.fadeIn + 0.45 ? 1 - ease((showS - RT.fadeIn) / 0.45) : 0;
    (this.fade.material as THREE.MeshBasicMaterial).opacity = Math.max(fo, fi, this.transOp);
    // 걸어 나갈 때 카메라도 오른쪽으로 흐르고, 새 장면에서는 왼쪽에서 따라 들어온다(실제 시차)
    if (!inTrans) this.camX = moving && showS >= RT.out && showS < RT.swap ? ease((showS - RT.out) / 1.0) * 2.2 : moving && showS >= RT.swap && showS < RT.inEnd ? -2.2 * (1 - ease((showS - RT.fadeIn) / 1.0)) : 0;
    this.drawCamera(t);
  }

  /** 상태 변화: 새 판(판 사이 장면 뒤 왼쪽에서 걸어 들어온다), 나간 사람(귀환 스크롤), 전진을 고른 사람 */
  private sync(m: CaveMg, t: number): void {
    const p = this.prev;
    for (const j of m.ord) if (!this.wiz.has(j)) { const z = this.makeWiz(j); z.gone = !m.inside.includes(j); }
    if (!p) {
      // 처음: 첫 판 시작이면 "1판" 장면부터(이미 어두운 상태로)
      if (m.pan === 1 && m.turn === 0 && m.step === 'decide' && m.di === 0) this.startTrans(t - 0.45, m.pan);
      else this.panAt = t - 9;
    } else {
      const left = p.step === 'decide' ? p.inside.filter(j => !m.inside.includes(j) || m.pan !== p.pan) : [];
      const leavers = m.pan !== p.pan ? left.slice(-1) : left;
      for (const j of leavers) { const z = this.wiz.get(j)!; if (!z.gone && !z.leaveAt) { z.leaveAt = t; z.got = m.pan === p.pan ? m.got[j] ?? 0 : m.score[j][p.pan - 1] ?? 0; } }
      // 전진을 고른 사람: 같은 판에서 차례가 지나갔는데 아직 안에 있다
      if (m.pan === p.pan && p.step === 'decide') {
        for (let q = p.di; q < p.inside.length; q++) {
          const j = p.inside[q]; const now_ = m.inside.indexOf(j);
          if (now_ >= 0 && (m.step !== 'decide' || now_ < m.di)) { const z = this.wiz.get(j); if (z && z.stayAt < t - 0.5) z.stayAt = t; }
        }
      }
      // 새 판: 마지막 사람이 귀환 중이면 그 뒤에 판 사이 장면
      if (m.pan !== p.pan) this.startTrans(t + (leavers.length ? LEAVE_T : 0.2), m.pan);
    }
    this.prev = { pan: m.pan, inside: m.inside.slice(), step: m.step, di: m.di };
  }
  private startTrans(start: number, pan: number): void {
    const tr = this.trans; tr.start = start; tr.black = start + 0.45; tr.end = tr.black + 2.6; tr.pan = pan; tr.reset = false;
    this.panAt = tr.end + 0.15;
    // 모두 다음 판에 다시 나타난다(귀환 중인 사람은 귀환을 마친 뒤에도 사라짐으로 두지 않는다)
    for (const z of this.wiz.values()) { z.born = this.panAt; z.gone = false; z.stayAt = -9; }
  }
  /** 어두운 동안 무대 정리: 천장·균열은 한 번에 원래대로, 파편·돌가루·주사위·카메라 흐름도 */
  private layoutSlots(ord: number[]): void { this.slots.clear(); ord.forEach((j, q) => this.slots.set(j, q)); }
  private resetStage(t: number): void {
    { const m = this.mg(); if (m) this.layoutSlots(m.inside.length ? m.inside : m.ord); }
    this.ceilY = this.ceilFrom = this.ceilTo = 0; this.ceilAt = t - 9; this.ceil.position.y = 0;
    this.setCrack(0, t);
    for (const d of this.ceilDust) { d.life = 0; d.m.visible = false; }
    for (const r of this.pebbles) { r.on = false; r.m.visible = false; }
    this.boulders.forEach(b => b.visible = false); this.dust.forEach(d => d.visible = false);
    this.chunks.forEach(c => c.m.visible = false); this.gems.forEach(g => g.visible = false);
    this.applyTheme(themeOf(this.trans.pan).key);
    this.block.visible = true; this.camX = 0;
    for (const j of this.hurtNext) { const z = this.wiz.get(j); if (z) { z.hurt++; z.band.visible = true; (z.band.getObjectByName('w2') as THREE.Object3D).visible = z.hurt >= 2; } }
    this.hurtNext.clear();
    for (const z of this.wiz.values()) { z.pos.set(-HALF - 3, 0, 0); z.scroll.visible = z.portal.visible = z.column.visible = z.pop.visible = false; }
  }
  private drawTrans(t: number): boolean {
    const tr = this.trans; const on = t >= tr.start && t < tr.end + 0.45;
    if (t >= tr.black && !tr.reset) { tr.reset = true; this.resetStage(t); }
    const op = !on ? 0 : t < tr.black ? ease((t - tr.start) / 0.45) : t < tr.end ? 1 : 1 - ease((t - tr.end) / 0.45);
    // 지도: 지난 장소에서 다음 장소로 길을 따라 무리 표시(모자)가 움직인다
    const tm = this.title.material as THREE.MeshBasicMaterial;
    const ta = t >= tr.black && t < tr.end + 0.3 ? Math.min(clamp01((t - tr.black) / 0.25), 1 - clamp01((t - tr.end) / 0.3)) : 0;
    this.title.visible = this.marker.visible = ta > 0.01; tm.opacity = ta; (this.marker.material as THREE.MeshBasicMaterial).opacity = ta;
    if (this.title.visible && this.titlePan !== tr.pan) { this.titlePan = tr.pan; tm.map?.dispose(); tm.map = mapTex(tr.pan); tm.needsUpdate = true; }
    if (this.title.visible) {
      const a = this.camera.aspect || 1.6; const h = Math.min(1.25, 1.8 * a / (1024 / 576)), w = h * (1024 / 576) / a;
      this.title.scale.set(w, h, 1); this.title.position.y = -0.05;
      const k1 = Math.max(1, Math.min(3, tr.pan)), [x0, y0] = MAP_NODES[k1 - 1], [x1, y1] = MAP_NODES[k1];
      const u = ease(clamp01((t - tr.black - 0.35) / (tr.end - tr.black - 0.9)));
      const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 70;
      const mx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1, my = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1;
      this.marker.position.set((mx / 1024 - 0.5) * w, (0.5 - my / 576) * h - 0.05 + 0.06 * h + Math.abs(Math.sin(u * Math.PI * 4)) * 0.015, 0);
      this.marker.scale.set(0.11 * h / a * 1.0 * (1024 / 576) / 1.0 * 0.6, 0.11 * h, 1);
    }
    this.transOp = op;
    return on && t < tr.end;
  }
  private transOp = 0;

  private drawWizards(m: CaveMg, t: number, dt: number, showS: number, collapse: boolean, moving: boolean): void {
    const dec = caveDecider(m); const n = m.inside.length; const inP = t - this.panAt;
    for (const [j, z] of this.wiz) {
      const w = z.w; const k = m.inside.indexOf(j);
      if (z.leaveAt) {
        const l = t - z.leaveAt;
        if (l >= LEAVE_T) { z.gone = !(z.born > z.leaveAt); z.leaveAt = 0; }
        else { this.drawLeave(z, l); continue; }
      }
      const vis = !z.gone && t >= z.born && (k >= 0 || m.step !== 'decide' || inP < 2);
      w.root.visible = vis; z.spirit.visible = vis; z.scroll.visible = false; z.pop.visible = false; z.portal.visible = z.column.visible = false;
      if (!vis) { z.light.intensity = 0; continue; }
      if (!this.slots.size) this.layoutSlots(m.inside.length ? m.inside : m.ord);
      const si = this.slots.get(j) ?? (k >= 0 ? k : 0);
      const slot = CX + (si - (this.slots.size - 1) / 2) * 0.95;
      let x = slot, walking = false;
      if (moving && showS >= RT.out && showS < RT.swap) { const u = clamp01((showS - RT.out) / 1.0); x = slot + u * (HALF + 3 - slot); walking = u < 1; }
      else if (moving && showS >= RT.swap && showS < RT.inEnd) { const u = clamp01((showS - RT.fadeIn) / 0.95); x = -HALF - 3 + u * (slot + HALF + 3); walking = u < 1; }
      else if (inP >= 0 && inP < 1.2) { const u = clamp01(inP / 1.1); x = -HALF - 3 + ease(u) * (slot + HALF + 3); walking = u < 1; }
      else z.pos.x += (slot - z.pos.x) * Math.min(1, dt * 6);
      if (walking || inP < 1.2 || (moving && showS >= RT.out && showS < RT.inEnd)) z.pos.x = x;
      z.pos.z = si % 2 ? -0.35 : 0.2;
      const thrower = m.inside.includes(m.ord[0]) ? m.ord[0] : m.inside[0];
      const cast = (moving && showS >= RT.blast - 0.15 && showS < RT.out) || (m.step === 'show' && j === thrower && showS >= 0 && showS < RT.land) || (this.t - this.gT >= 0 && this.t - this.gT < 0.9);
      const down = collapse && k >= 0 && showS >= RT.buried;
      w.root.position.set(z.pos.x, walking ? Math.abs(Math.sin(t * 10 + j)) * 0.1 : 0, z.pos.z);
      const fogged = down && this.themeKey === 'fog';
      w.root.scale.set(1, down && !fogged ? 0.2 : 1, 1); w.root.visible = !down || (!fogged && showS < RT.buried + 0.3);
      w.root.rotation.y = walking ? 1.1 : cast ? 0.9 : 0.35;
      w.body.rotation.set(cast ? -0.15 : 0, 0, walking ? Math.sin(t * 10 + j) * 0.06 : 0);
      // 앞사람 선택이 보이게: 전진을 고른 사람은 머리 위에 작은 전진 화살표, 고른 순간 "전진!"
      z.badge.visible = k >= 0 && ((m.step === 'decide' && k < m.di) || m.step === 'pre');
      if (z.badge.visible) z.badge.position.x = Math.sin(t * 4 + j) * 0.04;
      const sa = t - z.stayAt; z.pop.visible = sa >= 0 && sa < 1.3;
      if (z.pop.visible) { setText(z.pop, '전진!'); z.pop.position.set(z.pos.x, 3.0 + sa * 0.35, z.pos.z + 0.4); (z.pop.material as THREE.SpriteMaterial).opacity = 1 - clamp01((sa - 0.9) / 0.4); }
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
    this.dice.forEach(d => { d.visible = false; if (d.parent !== this.scene) this.scene.add(d); }); this.diceGlow.forEach(g => g.visible = false); this.shields.forEach(s => s.visible = false);
    // 굴릴 주사위가 떠 있는 자리: 무리 오른쪽 빈 곳(마법사에 가리지 않게)
    const hand = new THREE.Vector3(CX + 2.3, 1.5, 0.9);
    // 나온 눈이 카메라를 보게: 윗면(+y)을 앞(+z)으로
    const faceFront = (d: THREE.Group, k: number) => d.rotation.set(Math.PI / 2, 0, (k - 1) * 0.12);
    // 고르는 동안·굴리기 직전: 다음에 굴릴 주사위(최대 3개)를 굴릴 사람 손 위에 띄워 둔다(몇 개 굴리는지 보이게, 사용자 2026-10-14)
    if (m.step === 'pre' || m.step === 'decide') {
      const nd = Math.min(3, m.pool + 1);
      for (let k = 0; k < nd; k++) { const d = this.dice[k]; d.visible = true; d.scale.setScalar(0.45); d.position.copy(hand).add(new THREE.Vector3((k - (nd - 1) / 2) * 0.62, Math.sin(t * 2.4 + k * 1.3) * 0.08, 0)); d.rotation.set(t * 0.7 + k, t * 0.9 + k, 0); }
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
        // 빠진 1: 위쪽 가운데 칸(빈 칸부터 차례로)으로 날아가 꽂힌다(사용자 2026-10-15)
        const u = ease(clamp01((showS - RT.up) / (RT.hit - RT.up)));
        const lost = L.faces.filter(v => v === 1).length - L.kept; const si = Math.max(0, Math.min(2, L.ones - lost + (oneK - 1 - L.kept))); const at = this.traySlot(si);
        d.position.lerpVectors(to, at, u); d.position.y += Math.sin(u * Math.PI) * 0.8;
        d.scale.setScalar(0.5 + (this.trayK * TRAY_DIE - 0.5) * u);
        if (u < 0.8) d.rotation.set(u * 9, u * 6, 0); else d.quaternion.copy(this.camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
        d.visible = showS < RT.hit;
        // 날아가는 동안은 칸과 같은 층에(천장 바위에 가리지 않게)
        if (u > 0.05 && d.parent !== this.trayScene) this.trayScene.add(d);
      }
    });
  }

  /* ---------------- 폭파: 바위가 깨지고 크리스탈을 캔다 ---------------- */
  /** 나아가는 마법 + 다음 방 채집(사용자 2026-10-15: 벽을 깨서 얻는 대신). 장소에 room이 없으면(안개 숲, 임시) 예전처럼 폭파 */
  private drawBlast(showS: number, moving: boolean, dt: number, m?: CaveMg): void {
    const T = this.themes[this.themeKey];
    if (T.room && m) {
      this.gems.forEach(g => g.visible = false);
      // 동굴: 막은 벽을 폭파해 나아간다 / 다른 장소: 장소마다의 나아가는 마법
      if (T.blast) this.drawWall(showS, moving, dt);
      else { this.burst.visible = false; this.flash.intensity = 0; this.chunks.forEach(c => c.m.visible = false); }
      T.advance?.(moving && showS >= RT.blast && showS < RT.swap ? showS - RT.blast : -1, this.t, this.camera.position);
      // 지금 보이는 방: 장면이 바뀌기 전에는 지난 방(이미 채집), 바뀐 뒤에는 새 방
      const here = moving && showS < RT.swap ? m.turn - 1 : m.turn; const key = `${m.pan}:${here}`;
      if (moving && showS >= RT.gather && this.gKey !== key) { this.gKey = key; this.gT = this.t; }
      let st: RoomState;
      if (here <= 0) st = 'hidden';
      else if (this.gKey === key && this.t - this.gT < GATHER_T) st = this.t - this.gT;
      else if (this.gKey === key || !(moving && showS >= RT.swap)) st = 'done';
      else st = 'idle';
      const party = m.inside.map(j => this.wiz.get(j)?.pos.clone() ?? new THREE.Vector3(CX, 0, 0));
      T.room(st, this.t, this.camera.position, party);
      return;
    }
    const b = this.drawWall(showS, moving, dt);
    this.drawGems(b, new THREE.Vector3(ROCK_X + 0.2, 1.4, 0.8), 0.1);
  }
  /** 막은 벽 폭파: 섬광·파편, 벽은 장면이 바뀌기 전까지 사라졌다가 새 방의 벽으로 돌아온다 */
  private drawWall(showS: number, moving: boolean, dt: number): number {
    const open = moving && showS >= RT.blast + 0.1 && showS < RT.swap;
    this.block.visible = !open; this.blockLight.intensity = 5;
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
    return b;
  }
  /** 얻은 재료: 튀어 올랐다가 무리에게 날아간다 */
  private drawGems(b: number, from: THREE.Vector3, at: number): void {
    this.gems.forEach((g, k) => {
      const u = b >= at ? (b - at) / 0.6 : -1; g.visible = u >= 0 && u < 1;
      if (!g.visible) return;
      const fx = from.x + k * 0.2, tx = CX + (k - 1) * 0.95;
      g.position.set(fx + (tx - fx) * ease(u), from.y + k * 0.3 + Math.sin(u * Math.PI) * 1.4 - u * 0.4, from.z); g.rotation.set(u * 6, u * 4, 0); g.scale.setScalar(0.6 * (1 - u * 0.5));
    });
  }

  /* ---------------- 무너짐·돌가루 ---------------- */
  private drawCollapse(showS: number, collapse0: boolean, dt: number): void {
    if (collapse0 && showS >= RT.shake && showS < RT.shake + dt * 1.5) this.kick(0.25);
    // 바위가 떨어지는 건 동굴만(미궁은 가시가 찌르고, 안개 숲은 안개가 삼킨다)
    const collapse = collapse0 && this.themeKey === 'cave';
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
    if (this.themeKey === 'fog') { const th = (this.themes.fog.hazard as unknown as { thick(): number }).thick(); fog.near = d - 1 - th * 1.6; fog.far = d + 22 - th * 6.5; }

    const s = t - this.shakeT; const sh = s < 0.5 ? this.shakeK * (1 - s / 0.5) : 0;
    const px = 0.3 + this.camX;
    this.camera.position.set(px + Math.sin(t * 61) * sh, this.camY + Math.sin(t * 47) * sh, d);
    this.camera.lookAt(px, this.lookY, 0);
    // 근경: 카메라 앞 FG_D 거리에, 원래 화각 40°에서 거리 4.3에 둔 것과 같은 크기로 보이게
    const FG_D = 4.5, sc = (FG_D * th) / (4.3 * Math.tan(THREE.MathUtils.degToRad(20)));
    this.fg.position.set(px, this.lookY + (this.camY - this.lookY) * (FG_D / d), d - FG_D); this.fg.scale.setScalar(sc);
    // 1 주사위 칸: 석판과 "지금 할 일" 글자 바로 아래, 화면 가운데에 늘 같은 크기로(놀이 깊이 앞 z = TRAY_Z)
    this.camera.updateMatrixWorld();
    const P = Math.max(40, Math.round(54 * k)), cpx = slabH(k).h2 + 8 + Math.round(34 * k) + 8 + P / 2;
    const v = new THREE.Vector3(0, 1 - 2 * cpx / H, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const D = (TRAY_Z - this.camera.position.z) / v.z;
    this.tray.position.copy(this.camera.position).addScaledVector(v, D);
    this.tray.quaternion.copy(this.camera.quaternion);
    this.trayK = (P * (2 * D * th / H)) / TRAY_H; this.tray.scale.setScalar(this.trayK);
    const es = this.trayEl.style; es.top = `${Math.round(cpx - P / 2)}px`; es.height = `${P}px`; es.width = `${Math.round(P * TRAY_W / TRAY_H)}px`; es.setProperty('--p', `${P}px`);
  }
  /** 1 주사위 칸 돌판: 위쪽 석판과 같은 돌빛, 오목한 칸 3개 */
  private buildTray(): void {
    for (let k = 0; k < 3; k++) {
      // 목적지 자리만(보이지 않음)
      const d = new THREE.Group(); d.position.set((k - 1) * TRAY_GAP, 0, 0.32); this.tray.add(d); this.trayDie.push(d);
      const sl = document.createElement('i'); sl.className = 'ct-slot'; sl.innerHTML = '<b class="ct-die"><span></span></b>'; this.trayEl.appendChild(sl); this.traySlots.push(sl);
    }
    this.trayEl.className = 'cave-tray'; this.trayEl.setAttribute('aria-label', '빠진 1 주사위');
    (this.dom.parentElement ?? document.body).appendChild(this.trayEl);
  }
  /** 칸 채우기: 굴림에서 빠진 1이 날아와 꽂힌 만큼(천장 단계와 같은 수). 판이 바뀌어도 어두워지기 전까지는 지난 판 그대로 */
  private drawTray(m: CaveMg, n: number, t: number, hide: boolean): void {
    this.trayEl.style.visibility = hide ? 'hidden' : '';
    if (m.pan !== this.trayPan) { if (this.trans.pan !== m.pan || t >= this.trans.black) this.trayPan = m.pan; else n = this.trayN; }
    n = Math.max(0, Math.min(3, n));
    for (let k = 0; k < 3; k++) {
      if (k < n && k >= this.trayN) this.trayAt[k] = t;
      const sl = this.traySlots[k]; sl.classList.toggle('on', k < n);
      const u = clamp01((t - this.trayAt[k]) / 0.35); sl.style.setProperty('--pop', (1 + 0.3 * Math.sin(u * Math.PI)).toFixed(3));
    }
    this.trayN = n;
  }
  /** 칸 k의 주사위 자리(세계 좌표) */
  private traySlot(k: number): THREE.Vector3 { return this.trayDie[k].getWorldPosition(new THREE.Vector3()); }
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
function textSprite(s: string): THREE.Sprite { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false })); sp.renderOrder = 30; setText(sp, s); return sp; }
function setText(sp: THREE.Sprite, s: string): void {
  if (sp.userData.s === s) return; sp.userData.s = s;
  const mt = sp.material as THREE.SpriteMaterial; mt.map?.dispose();
  // 글 길이에 맞춰 판 너비를 늘린다(긴 글이 잘리지 않게)
  const font = "bold 92px 'Black Han Sans', sans-serif"; const mc = document.createElement('canvas').getContext('2d')!; mc.font = font;
  const w = Math.max(256, Math.ceil(mc.measureText(s).width) + 40);
  mt.map = canvasTex(w, 128, g => { g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = INK; g.strokeText(s, w / 2, 68); g.fillStyle = '#ffe28a'; g.fillText(s, w / 2, 68); });
  mt.needsUpdate = true; sp.scale.set(0.5 * w / 128, 0.5, 1);
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
/** 3D 균열 한 줄기: 지그재그 본줄기 + 곁가지. 어두운 틈(core) 아래 깨진 밝은 가장자리(edge)가 조금 넓게 깔린다.
    삼각형은 줄기를 따라 순서대로 쌓아서, drawRange로 자라나는 모습을 보여 줄 수 있다 */
function crackMeshes(seed: number, k: number): { core: THREE.Mesh; edge: THREE.Mesh } {
  const r = rng(seed);
  const paths: { pts: THREE.Vector2[]; w: number }[] = [];
  // 본줄기: 앞면 위쪽에서 시작해 옆·아래로 갈라져 내려간다
  // 전진 화살표(무리 머리 위)를 피해 오른쪽에서 갈라진다
  const sx = [0.6, 2.9, 0.4][k], dir = [1, -1, -1][k];
  const main: THREE.Vector2[] = [new THREE.Vector2(sx, 0.48)]; let x = sx, y = 0.48;
  for (let i = 0; i < 9; i++) { x += dir * (0.18 + r() * 0.26); y -= 0.07 + r() * 0.08; x += (r() - 0.5) * 0.12; main.push(new THREE.Vector2(x, y)); }
  paths.push({ pts: main, w: 0.1 });
  for (const at of [3, 6]) {
    const b: THREE.Vector2[] = [main[at].clone()]; let bx = b[0].x, by = b[0].y; const bd = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < 4; i++) { bx += bd * (0.06 + r() * 0.12); by -= 0.05 + r() * 0.07; b.push(new THREE.Vector2(bx, by)); }
    paths.push({ pts: b, w: 0.06 });
  }
  const ribbon = (scale: number) => {
    const pos: number[] = [], idx: number[] = []; let base = 0;
    for (const { pts, w } of paths) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; const d = b.clone().sub(a).normalize(); const nrm = new THREE.Vector2(-d.y, d.x);
        // 끝으로 갈수록 가늘게
        const wa = w * scale * (1 - i / pts.length * 0.7), wb = w * scale * (1 - (i + 1) / pts.length * 0.7);
        pos.push(a.x + nrm.x * wa, a.y + nrm.y * wa, 0, a.x - nrm.x * wa, a.y - nrm.y * wa, 0, b.x + nrm.x * wb, b.y + nrm.y * wb, 0, b.x - nrm.x * wb, b.y - nrm.y * wb, 0);
        idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); base += 4;
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  };
  const core = new THREE.Mesh(ribbon(1), new THREE.MeshBasicMaterial({ color: '#0b0503' }));
  // 깨져 드러난 밝은 속살(빛을 덜 타게 스스로 조금 밝다)
  const edge = new THREE.Mesh(ribbon(2.3), new THREE.MeshBasicMaterial({ color: '#c99d6e' }));
  return { core, edge };
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
