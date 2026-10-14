/* 고대 탑 꼭대기: 둥근 돌 바닥 가운데 3×3 돌기둥 발판(기둥은 탑 속까지 이어진다), 무너진 성가퀴, 화로, 노을 하늘과 구름 바다 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { INK, canvasTex, glow, ink, toon, wobbleLine } from './toon';

/** 칸 간격·탑 반지름 */
export const T = 2, R = 7.4;
/** 칸 번호(0~8, 행×3+열, 0이 안쪽 왼쪽) → 바닥 위 자리 */
export const cellPos = (c: number, y = 0): THREE.Vector3 => new THREE.Vector3(((c % 3) - 1) * T, y, (Math.floor(c / 3) - 1) * T);
/** 발판 윗면 높이 */
export const TOP = 0.12;

function stoneTex(seed: number, base: string, line: string, cracks = 3): THREE.CanvasTexture {
  let s = seed; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return canvasTex(256, 256, g => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    // 얼룩
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,240,220'},${0.03 + rnd() * 0.05})`; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 6 + rnd() * 30, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = line; g.lineWidth = 3; g.lineCap = 'round';
    for (let k = 0; k < cracks; k++) { let x = rnd() * 256, y = rnd() * 256; const pts: [number, number][] = [[x, y]]; for (let j = 0; j < 4; j++) { x += (rnd() - .5) * 70; y += (rnd() - .5) * 70; pts.push([x, y]); } wobbleLine(g, pts, 3); }
    // 테두리 잉크
    g.lineWidth = 7; g.strokeStyle = INK; wobbleLine(g, [[3, 3], [253, 3], [253, 253], [3, 253], [3, 3]], 2.5);
  });
}
function brickTex(): THREE.CanvasTexture {
  const t = canvasTex(512, 512, g => {
    g.fillStyle = '#6f6455'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round';
    for (let r = 0; r < 8; r++) {
      const y = r * 64; wobbleLine(g, [[0, y], [128, y + 1], [256, y - 1], [384, y + 1], [512, y]], 2);
      for (let c = 0; c < 4; c++) { const x = c * 128 + (r % 2) * 64; wobbleLine(g, [[x, y], [x + 1, y + 64]], 2); }
      for (let c = 0; c < 4; c++) { g.fillStyle = `rgba(0,0,0,${0.05 + ((r * 7 + c * 3) % 5) * 0.03})`; g.fillRect(c * 128 + (r % 2) * 64 + 6, y + 6, 116, 52); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function floorTex(): THREE.CanvasTexture {
  return canvasTex(1024, 1024, g => {
    const c = 512; g.fillStyle = '#8f8372'; g.fillRect(0, 0, 1024, 1024);
    let s = 7; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(${rnd() < .6 ? '20,12,6' : '255,240,220'},${0.03 + rnd() * 0.05})`; g.beginPath(); g.arc(rnd() * 1024, rnd() * 1024, 10 + rnd() * 50, 0, Math.PI * 2); g.fill(); }
    // 이끼
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(70,96,48,${0.12 + rnd() * 0.15})`; const a = rnd() * Math.PI * 2, r = 380 + rnd() * 120; g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 8 + rnd() * 26, 0, Math.PI * 2); g.fill(); }
    // 동심원 줄 + 방사 줄로 나눈 판석
    g.strokeStyle = INK; g.lineCap = 'round';
    const rings = [250, 330, 420, 505];
    rings.forEach((r, k) => {
      g.lineWidth = 6; const pts: [number, number][] = []; for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2; pts.push([c + Math.cos(t) * r, c + Math.sin(t) * r]); } wobbleLine(g, pts, 3);
      if (k === 0) return; const r0 = rings[k - 1]; const n = 10 + k * 6;
      for (let j = 0; j < n; j++) { const t = (j + (k % 2) * 0.5 + rnd() * 0.2) / n * Math.PI * 2; g.lineWidth = 5; wobbleLine(g, [[c + Math.cos(t) * r0, c + Math.sin(t) * r0], [c + Math.cos(t) * r, c + Math.sin(t) * r]], 3); }
    });
    // 안쪽 네모 둘레의 판석(구멍 바깥)
    g.lineWidth = 5;
    for (let j = 0; j < 16; j++) { const t = j / 16 * Math.PI * 2; wobbleLine(g, [[c + Math.cos(t) * 180, c + Math.sin(t) * 180], [c + Math.cos(t) * 250, c + Math.sin(t) * 250]], 3); }
    // 금
    g.lineWidth = 3; for (let k = 0; k < 14; k++) { let x = rnd() * 1024, y = rnd() * 1024; const pts: [number, number][] = [[x, y]]; for (let j = 0; j < 3; j++) { x += (rnd() - .5) * 60; y += (rnd() - .5) * 60; pts.push([x, y]); } wobbleLine(g, pts, 3); }
  });
}

/** 발판 하나: 윗돌 + 탑 속까지 이어진 기둥 마디들. 무너질 때 윗돌은 네 조각으로 갈라진다 */
export class Pillar {
  root = new THREE.Group();
  slab: THREE.Mesh; quarters: THREE.Mesh[] = []; segs: THREE.Mesh[] = [];
  /** 무너짐/복구 애니메이션 */
  state: 'up' | 'falling' | 'down' | 'rising' = 'up'; t = 0;
  hint: THREE.Mesh; dust = new THREE.Group();
  private vel: { v: THREE.Vector3; w: THREE.Vector3; delay: number }[] = [];
  constructor(public c: number, mats: { top: THREE.Material; shaft: THREE.Material }) {
    this.root.position.copy(cellPos(c));
    this.slab = ink(new RoundedBoxGeometry(1.88, 0.5, 1.88, 3, 0.07), mats.top, 0.045); this.slab.position.y = TOP - 0.25; this.slab.rotation.y = (c % 4) * Math.PI / 2; this.root.add(this.slab);
    const qg = new RoundedBoxGeometry(0.92, 0.5, 0.92, 2, 0.06);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const q = ink(qg, mats.top, 0.04); q.position.set(x * 0.47, TOP - 0.25, z * 0.47); q.visible = false; this.root.add(q); this.quarters.push(q); }
    const sg = new RoundedBoxGeometry(1.8, 2.3, 1.8, 2, 0.08);
    for (let k = 0; k < 4; k++) { const s = ink(sg, mats.shaft, 0.04); s.position.y = TOP - 0.5 - 1.2 - k * 2.38; this.root.add(s); this.segs.push(s); }
    // 고를 수 있는 칸 표시(잉크 점선 고리)
    this.hint = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 40), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0, depthWrite: false }));
    this.hint.rotation.x = -Math.PI / 2; this.hint.position.y = TOP + 0.02; this.root.add(this.hint);
    // 무너질 때 피어오르는 먼지
    const dm = toon('#a89880', { fresh: true }); dm.transparent = true; dm.depthWrite = false;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const d = ink(new THREE.SphereGeometry(0.45, 12, 8), dm, 0); d.position.set(Math.cos(a) * 0.8, TOP + 0.2, Math.sin(a) * 0.8); this.dust.add(d); }
    this.dust.visible = false; this.root.add(this.dust);
  }
  private home(): void {
    this.slab.position.set(0, TOP - 0.25, 0); this.slab.rotation.set(0, (this.c % 4) * Math.PI / 2, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z], k) => { const q = this.quarters[k]; q.position.set(x * 0.47, TOP - 0.25, z * 0.47); q.rotation.set(0, 0, 0); });
    this.segs.forEach((s, k) => { s.position.set(0, TOP - 0.5 - 1.2 - k * 2.38, 0); s.rotation.set(0, 0, 0); });
  }
  /** 무너뜨리기(바로 = 애니메이션 없이) */
  collapse(now = false): void {
    if (this.state === 'down' || this.state === 'falling') return;
    this.home(); this.slab.visible = false; this.quarters.forEach(q => q.visible = true); this.hint.visible = false;
    const parts = [...this.quarters, ...this.segs];
    this.vel = parts.map((p, k) => ({
      v: new THREE.Vector3(p.position.x * 1.6 + (Math.random() - .5) * 0.6, 0.6 + Math.random() * 0.8, p.position.z * 1.6 + (Math.random() - .5) * 0.6),
      w: new THREE.Vector3((Math.random() - .5) * 4, (Math.random() - .5) * 2, (Math.random() - .5) * 4),
      // 밑둥부터 꺼지듯: 아래 마디가 먼저, 윗돌 조각이 뒤따른다
      delay: k < 4 ? 0.28 + Math.random() * 0.08 : 0.24 - (k - 4) * 0.06,
    }));
    this.state = now ? 'down' : 'falling'; this.t = 0;
    if (now) parts.forEach(p => p.visible = false);
  }
  restore(now = false): void {
    if (this.state === 'up' || this.state === 'rising') return;
    this.home(); this.slab.visible = true; this.quarters.forEach(q => q.visible = false); this.segs.forEach(s => s.visible = true); this.hint.visible = true;
    this.state = now ? 'up' : 'rising'; this.t = 0; if (now) this.root.position.y = 0;
  }
  frame(dt: number): void {
    if (this.state === 'falling') {
      this.t += dt; const parts = [...this.quarters, ...this.segs];
      // 처음 0.25초는 흔들린다
      if (this.t < 0.25) { this.root.position.x = cellPos(this.c).x + Math.sin(this.t * 90) * 0.04; return; }
      this.root.position.x = cellPos(this.c).x;
      const u = (this.t - 0.25) / 1.3; this.dust.visible = u < 1;
      if (u < 1) { this.dust.scale.setScalar(0.6 + u * 1.4); this.dust.position.y = u * 0.8; this.dust.children.forEach(d => (((d as THREE.Mesh).material) as THREE.Material).opacity = 0.85 * (1 - u)); }
      parts.forEach((p, k) => {
        const m = this.vel[k]; const tt = this.t - 0.25 - m.delay; if (tt <= 0) return;
        m.v.y -= 22 * dt; p.position.addScaledVector(m.v, dt); p.rotation.x += m.w.x * dt; p.rotation.y += m.w.y * dt; p.rotation.z += m.w.z * dt;
      });
      if (this.t > 2.2) { this.state = 'down'; parts.forEach(p => p.visible = false); }
    } else if (this.state === 'rising') {
      this.t += dt; const k = Math.min(1, this.t / 0.9); const e = 1 - Math.pow(1 - k, 3);
      this.root.position.y = -10 * (1 - e); if (k >= 1) { this.state = 'up'; this.root.position.y = 0; }
    }
  }
}

export interface Tower { root: THREE.Group; pillars: Pillar[]; flames: THREE.Object3D[]; clouds: THREE.Object3D[] }

export function buildTower(): Tower {
  const root = new THREE.Group();
  // 하늘: 위는 짙은 남보라, 지평선은 노을
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vp; void main(){
      float h = vp.y;
      vec3 top = vec3(0.05,0.05,0.11), mid = vec3(0.22,0.14,0.25), hor = vec3(0.78,0.43,0.27), low = vec3(0.30,0.19,0.24);
      vec3 c = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0, 0.18, h)), top, smoothstep(0.18, 0.6, h)) : mix(hor, low, smoothstep(0.0, -0.3, h));
      gl_FragColor = vec4(c, 1.); }`,
  }));
  root.add(sky);
  // 달
  const moon = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshBasicMaterial({ color: '#fff1cf', toneMapped: false }));
  moon.position.set(-90, 70, -260); moon.lookAt(0, 0, 0); root.add(moon);
  const moonGlow = new THREE.Mesh(new THREE.CircleGeometry(34, 40), glow('#ffd9a0', 0.18)); moonGlow.position.copy(moon.position).multiplyScalar(1.01); moonGlow.lookAt(0, 0, 0); root.add(moonGlow);

  // 바닥: 둥근 판에 가운데 네모 구멍(3×3 기둥이 들어간다)
  const shape = new THREE.Shape(); shape.absarc(0, 0, R, 0, Math.PI * 2, false);
  const hw = 1.5 * T + 0.02; const hole = new THREE.Path(); hole.moveTo(-hw, -hw); hole.lineTo(hw, -hw); hole.lineTo(hw, hw); hole.lineTo(-hw, hw); hole.closePath(); shape.holes.push(hole);
  const fgeo = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 64 });
  fgeo.rotateX(-Math.PI / 2); fgeo.translate(0, -1.0, 0);
  const ft = floorTex(); ft.repeat.set(1 / (2 * R), 1 / (2 * R)); ft.offset.set(0.5, 0.5);
  const floor = ink(fgeo, toon('#ffffff', { map: ft }), 0.06); floor.position.y = -0.02; root.add(floor);
  // 구멍 속: 어둠
  const pit = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 14, hw * 2), new THREE.MeshBasicMaterial({ color: '#0b0705', side: THREE.BackSide })); pit.position.y = -7.1; root.add(pit);
  // 탑 몸통
  const bt = brickTex(); bt.repeat.set(10, 5);
  const wall = ink(new THREE.CylinderGeometry(R - 0.05, R + 0.9, 30, 48, 1, true), toon('#ffffff', { map: bt }), 0.0); wall.position.y = -16.1; root.add(wall);
  const lip = ink(new THREE.TorusGeometry(R + 0.06, 0.22, 8, 64), toon('#7d7262'), 0.05); lip.rotation.x = Math.PI / 2; lip.position.y = -1.25; root.add(lip);

  // 성가퀴: 둘레의 돌 이빨. 앞쪽 몇 개는 부서져 없다
  const mer = toon('#857a69'); const mgeo = new RoundedBoxGeometry(1.15, 1.0, 0.75, 2, 0.08);
  const n = 18;
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2; const front = Math.sin(a) > 0.55;
    if (front && k % 3 !== 0) continue;
    const m = ink(mgeo, mer, 0.05); const r = R - 0.42;
    m.position.set(Math.cos(a) * r, 0.42, Math.sin(a) * r); m.rotation.y = -a + Math.PI / 2;
    // 부서진 이빨: 낮고 기울었다
    if (front || k % 5 === 2) { m.scale.y = 0.45 + (k % 3) * 0.12; m.position.y = 0.2; m.rotation.z = (k % 2 ? 1 : -1) * 0.12; }
    root.add(m);
  }
  // 바닥에 흩어진 돌 부스러기
  const rub = new THREE.IcosahedronGeometry(0.22, 0);
  for (let k = 0; k < 14; k++) { const a = k * 2.39, r = 4.8 + (k % 4) * 0.55; const s = ink(rub, mer, 0.03); s.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r); s.scale.setScalar(0.6 + (k % 3) * 0.35); s.rotation.set(k, k * 2, 0); root.add(s); }

  // 화로 4개(뒤쪽과 옆): 흔들리는 불꽃 + 따뜻한 빛
  const flames: THREE.Object3D[] = [];
  for (const [x, z] of [[-5.2, -3.6], [5.2, -3.6], [-5.9, 1.6], [5.9, 1.6]]) {
    const b = new THREE.Group(); b.position.set(x, 0, z); root.add(b);
    const stand = ink(new THREE.CylinderGeometry(0.16, 0.3, 0.9, 10), toon('#3a2e26'), 0.04); stand.position.y = 0.45; b.add(stand);
    const bowl = ink(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.45, 0.05), new THREE.Vector2(0.6, 0.35), new THREE.Vector2(0.55, 0.38), new THREE.Vector2(0, 0.3)], 20), toon('#5b4a3a'), 0.04); bowl.position.y = 0.9; b.add(bowl);
    const f = new THREE.Group(); f.position.y = 1.2; b.add(f); flames.push(f);
    const f1 = ink(new THREE.ConeGeometry(0.42, 1.0, 10), toon('#ff8a2a', { fresh: true, emissive: '#ff6a1a', ei: 1 }), 0.04); f1.position.y = 0.4; f.add(f1);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), toon('#ffe27a', { fresh: true, emissive: '#ffd040', ei: 1.2 })); f2.position.set(0, 0.28, 0.12); f.add(f2);
    const pl = new THREE.PointLight('#ff9a4a', 4, 8, 1.6); pl.position.set(0, 0.8, 0); f.add(pl);
  }

  // 기둥 발판 9개
  const top = toon('#ffffff', { map: stoneTex(3, '#a39784', '#4a3f33', 2) }), shaft = toon('#ffffff', { map: stoneTex(11, '#7a6e5e', '#3a3026', 1) });
  const pillars = Array.from({ length: 9 }, (_, c) => { const p = new Pillar(c, { top, shaft }); root.add(p.root); return p; });

  // 구름 바다와 먼 탑들
  const clouds: THREE.Object3D[] = []; const cm = toon('#a8939f'); const cm2 = toon('#8a7488');
  const puff = new THREE.SphereGeometry(1, 16, 10);
  for (let k = 0; k < 26; k++) {
    const a = k / 26 * Math.PI * 2 + (k % 3) * 0.2, r = 18 + (k % 5) * 9;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * r, -9 - (k % 4) * 2.5, Math.sin(a) * r);
    for (let j = 0; j < 4; j++) { const p = ink(puff, j % 2 ? cm : cm2, 0.06); const s = 2.2 + ((k + j) % 3) * 1.1; p.scale.set(s * 1.4, s * 0.7, s); p.position.set((j - 1.5) * 2.4, (j % 2) * 0.6, ((k + j) % 3 - 1) * 1.2); g.add(p); }
    root.add(g); clouds.push(g);
  }
  const far = toon('#4b3b5c'), roof = toon('#2f2440');
  for (const [a, r, h] of [[-2.2, 90, 26], [-1.4, 120, 34], [-0.6, 100, 22], [0.3, 140, 30], [-2.9, 130, 28]]) {
    const g = new THREE.Group(); g.position.set(Math.cos(a) * r, -18, Math.sin(a) * r);
    const body = ink(new THREE.CylinderGeometry(3, 4, h, 16), far, 0.25); body.position.y = h / 2; g.add(body);
    const cap = ink(new THREE.ConeGeometry(4.2, 7, 16), roof, 0.25); cap.position.y = h + 3.5; g.add(cap);
    root.add(g);
  }
  return { root, pillars, flames, clouds };
}
