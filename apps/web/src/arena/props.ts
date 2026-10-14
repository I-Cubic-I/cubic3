/* 아레나 소품: 마법사 아바타, 늙은 손, 주사위, 화살표, 마법진·포탈·빛 기둥, 구름 말풍선·전구 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { INK, canvasTex, glow, ink, toon } from './toon';

const V = (x: number, y: number) => new THREE.Vector2(x, y);
const SKIN = '#e8c49a', BEARD = '#ece6d8';

/* ---------------- 마법사 ---------------- */
export interface Wizard {
  root: THREE.Group;
  /** 몸(흔들기·기울이기) */
  body: THREE.Group;
  head: THREE.Group;
  eyesOpen: THREE.Group;
  eyesShut: THREE.Group;
  /** 머리 위 표시를 붙일 자리 */
  above: THREE.Group;
}

/** 머리 + 모자(엿보기 때 포탈에서 얼굴만 내밀 때도 쓴다) */
export function buildHead(color: string): Pick<Wizard, 'head' | 'eyesOpen' | 'eyesShut'> {
  const head = new THREE.Group();
  const face = ink(new THREE.SphereGeometry(0.33, 24, 16), toon(SKIN), 0.03); head.add(face);
  const nose = ink(new THREE.SphereGeometry(0.1, 16, 12), toon('#dba57e'), 0.02); nose.position.set(0, -0.04, 0.32); head.add(nose);
  // 수염: 턱 아래로 늘어진 뾰족한 덩어리
  const beard = ink(new THREE.LatheGeometry([V(0, -0.62), V(0.12, -0.45), V(0.24, -0.22), V(0.27, -0.08), V(0.2, 0.02), V(0, 0.04)], 20), toon(BEARD), 0.03);
  beard.position.set(0, -0.12, 0.13); beard.rotation.x = 0.28; head.add(beard);
  const brow = ink(new THREE.CapsuleGeometry(0.035, 0.36, 4, 8), toon(BEARD), 0.018); brow.rotation.z = Math.PI / 2; brow.position.set(0, 0.11, 0.29); head.add(brow);
  // 눈: 뜬 눈(흰자+눈동자) / 감은 눈(아래로 휜 선)
  const eyesOpen = new THREE.Group(), eyesShut = new THREE.Group();
  for (const s of [-1, 1]) {
    const w = ink(new THREE.SphereGeometry(0.068, 14, 10), toon('#fbf6ea'), 0.016); w.scale.set(1, 1.25, 0.6); w.position.set(s * 0.12, 0.03, 0.29); eyesOpen.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), toon(INK)); p.position.set(s * 0.12, 0.02, 0.33); eyesOpen.add(p);
    const sh = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 14, Math.PI), toon(INK)); sh.rotation.z = Math.PI; sh.position.set(s * 0.12, 0.05, 0.315); eyesShut.add(sh);
  }
  eyesShut.visible = false; head.add(eyesOpen, eyesShut);
  // 고깔모자: 넓은 챙 + 뒤로 꺾인 끝
  const hat = new THREE.Group(); hat.position.y = 0.2; hat.rotation.x = -0.12;
  const brim = ink(new THREE.CylinderGeometry(0.6, 0.62, 0.06, 28), toon(color), 0.03); hat.add(brim);
  const band = ink(new THREE.CylinderGeometry(0.33, 0.35, 0.1, 24), toon('#e8b84a'), 0.02); band.position.y = 0.07; hat.add(band);
  const c1 = ink(new THREE.CylinderGeometry(0.2, 0.34, 0.42, 24), toon(color), 0.03); c1.position.y = 0.3; hat.add(c1);
  const tip = new THREE.Group(); tip.position.y = 0.5; tip.rotation.x = -0.55; hat.add(tip);
  const c2 = ink(new THREE.ConeGeometry(0.2, 0.5, 20), toon(color), 0.03); c2.position.y = 0.22; tip.add(c2);
  head.add(hat);
  return { head, eyesOpen, eyesShut };
}

export function buildWizard(color: string): Wizard {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const robeCol = new THREE.Color(color).lerp(new THREE.Color('#231a2a'), 0.42);
  // 겉옷: 아래로 퍼지는 종 모양
  const robe = ink(new THREE.LatheGeometry([V(0, 0), V(0.56, 0), V(0.6, 0.06), V(0.46, 0.35), V(0.33, 0.72), V(0.36, 0.9), V(0.28, 1.0), V(0.12, 1.06), V(0, 1.07)], 28), toon(robeCol), 0.035);
  body.add(robe);
  const belt = ink(new THREE.TorusGeometry(0.345, 0.045, 8, 28), toon('#6b4a2a'), 0.015); belt.rotation.x = Math.PI / 2; belt.position.y = 0.66; body.add(belt);
  const buckle = ink(new RoundedBoxGeometry(0.12, 0.1, 0.05, 2, 0.02), toon('#e8b84a'), 0.012); buckle.position.set(0, 0.66, 0.36); body.add(buckle);
  // 소매와 손
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.3, 0.92, 0.02); arm.rotation.z = s * 0.5; arm.rotation.x = -0.35; body.add(arm);
    const sl = ink(new THREE.CylinderGeometry(0.09, 0.15, 0.48, 14), toon(robeCol), 0.03); sl.position.y = -0.22; arm.add(sl);
    const hd = ink(new THREE.SphereGeometry(0.075, 12, 10), toon(SKIN), 0.02); hd.position.y = -0.48; arm.add(hd);
  }
  // 지팡이: 오른손, 끝에 원소 보석
  const staff = new THREE.Group(); staff.position.set(0.52, 0.0, 0.18); staff.rotation.z = -0.06; body.add(staff);
  const pole = ink(new THREE.CylinderGeometry(0.035, 0.045, 1.75, 8), toon('#5a3b22'), 0.02); pole.position.y = 0.87; staff.add(pole);
  const claw = ink(new THREE.TorusGeometry(0.1, 0.03, 6, 12), toon('#5a3b22'), 0.015); claw.position.y = 1.8; staff.add(claw);
  const gem = ink(new THREE.IcosahedronGeometry(0.1, 0), toon(color, { fresh: true, emissive: color, ei: 0.9 }), 0.02); gem.position.y = 1.82; staff.add(gem);
  const h = buildHead(color); h.head.position.y = 1.32; body.add(h.head);
  // 발밑 둥근 그림자
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; shadow.name = 'shadow'; root.add(shadow);
  const above = new THREE.Group(); above.position.y = 2.75; root.add(above);
  return { root, body, head: h.head, eyesOpen: h.eyesOpen, eyesShut: h.eyesShut, above };
}

/* ---------------- 늙은 손(손톱이 긴) ---------------- */
export interface OldHand { root: THREE.Group; joints: THREE.Group[] }
const HSKIN = '#cdbd9c', NAIL = '#d9c47c';
/** side 1 = 오른손, -1 = 왼손. 손바닥이 아래를 본다. 손가락은 -z(앞)로 뻗는다 */
export function buildHand(side: 1 | -1): OldHand {
  const root = new THREE.Group(); const joints: THREE.Group[] = [];
  const skin = toon(HSKIN);
  const palm = ink(new THREE.SphereGeometry(0.5, 20, 14), skin, 0.04); palm.scale.set(0.42, 0.17, 0.5); root.add(palm);
  // 소매
  const cuff = ink(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 16), toon('#3a2448'), 0.04); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 0.04, 0.5); root.add(cuff);
  const cuffBand = ink(new THREE.TorusGeometry(0.2, 0.035, 6, 18), toon('#e8b84a'), 0.015); cuffBand.position.set(0, 0.04, 0.22); root.add(cuffBand);
  const fingers = [[-0.14, 0.92], [-0.045, 1], [0.05, 0.96], [0.135, 0.8]];
  fingers.forEach(([x, len], f) => {
    const base = new THREE.Group(); base.position.set(x * side, 0, -0.2); base.rotation.y = -x * side * 0.6; root.add(base);
    let at: THREE.Group = base; const segs = [0.17, 0.14, 0.11].map(s => s * len);
    segs.forEach((L, k) => {
      const j = new THREE.Group(); j.rotation.x = -0.25 - k * 0.12; at.add(j); joints.push(j);
      const knuckle = ink(new THREE.SphereGeometry(0.048 - k * 0.006, 10, 8), skin, 0.016); j.add(knuckle);
      const seg = ink(new THREE.CapsuleGeometry(0.038 - k * 0.006, L, 4, 8), skin, 0.016); seg.rotation.x = Math.PI / 2; seg.position.z = -L / 2 - 0.02; j.add(seg);
      const nx = new THREE.Group(); nx.position.z = -L - 0.03; j.add(nx); at = nx;
      if (k === 2) {
        // 손톱: 길고 누렇게 휜 손톱
        const n1 = ink(new THREE.ConeGeometry(0.03, 0.2, 8), toon(NAIL), 0.012); n1.rotation.x = -Math.PI / 2 - 0.25; n1.position.set(0, 0.012, -0.08); nx.add(n1);
      }
    });
    void f;
  });
  // 엄지
  const tb = new THREE.Group(); tb.position.set(-0.2 * side, -0.01, 0.0); tb.rotation.y = 0.9 * side; root.add(tb);
  let at: THREE.Group = tb;
  [0.14, 0.11].forEach((L, k) => {
    const j = new THREE.Group(); j.rotation.x = -0.2; at.add(j); joints.push(j);
    j.add(ink(new THREE.SphereGeometry(0.05, 10, 8), skin, 0.016));
    const seg = ink(new THREE.CapsuleGeometry(0.042, L, 4, 8), skin, 0.016); seg.rotation.x = Math.PI / 2; seg.position.z = -L / 2 - 0.02; j.add(seg);
    const nx = new THREE.Group(); nx.position.z = -L - 0.03; j.add(nx); at = nx;
    if (k === 1) { const n = ink(new THREE.ConeGeometry(0.032, 0.18, 8), toon(NAIL), 0.012); n.rotation.x = -Math.PI / 2 - 0.2; n.position.z = -0.07; nx.add(n); }
  });
  // 주름·검버섯
  for (const [x, z] of [[0.12, 0.1], [-0.08, 0.18], [0.02, -0.05]]) { const sp = new THREE.Mesh(new THREE.CircleGeometry(0.025, 8), toon('#9a8466')); sp.rotation.x = -Math.PI / 2; sp.position.set(x * side, 0.086, z); root.add(sp); }
  return { root, joints };
}
/** 손가락 굽힘(0 펴짐 ~ 1 오므림) */
export function curlHand(h: OldHand, t: number): void { h.joints.forEach((j, k) => { j.rotation.x = -0.25 - (k % 3) * 0.12 - t * 0.55; }); }

/* ---------------- 주사위 ---------------- */
const FACE: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieGeo = new RoundedBoxGeometry(1, 1, 1, 4, 0.14);
const pipGeo = new THREE.SphereGeometry(0.09, 10, 6);
/** 맨 위가 v인 주사위. 쌍(1·6, 2·5, 3·4)을 지킨다 */
export function buildDie(v: number, col = '#f1e6cf'): THREE.Group {
  const g = new THREE.Group(); g.add(ink(dieGeo, toon(col), 0.04));
  const pips = new THREE.Group(); pips.name = 'pips'; g.add(pips); setDie(g, v); return g;
}
export function setDie(g: THREE.Group, v: number): void {
  const pips = g.getObjectByName('pips') as THREE.Group; pips.clear(); g.userData.v = v;
  const pairs = [[1, 6], [2, 5], [3, 4]]; const pi = pairs.findIndex(p => p.includes(v));
  const a = pairs[(pi + 1) % 3][0], b = pairs[(pi + 2) % 3][0];
  // 면마다: 법선, 면 위의 두 축
  const faces: [number, THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [v, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
    [7 - v, new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1)],
    [a, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)],
    [7 - a, new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)],
    [b, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0)],
    [7 - b, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)],
  ];
  for (const [val, n, u, w] of faces) {
    for (const idx of FACE[val]) {
      const r = Math.floor(idx / 3) - 1, c = (idx % 3) - 1;
      const p = new THREE.Mesh(pipGeo, toon(val === 1 ? '#b0261e' : INK));
      p.position.copy(n).multiplyScalar(0.5).addScaledVector(u, c * 0.27).addScaledVector(w, r * 0.27);
      p.lookAt(p.position.clone().add(n)); p.scale.set(1, 1, 0.35); pips.add(p);
    }
  }
}

/* ---------------- 화살표(원소 색) ---------------- */
export function buildArrow(color: string): THREE.Group {
  const s = new THREE.Shape();
  s.moveTo(-0.16, 0.9); s.lineTo(0.16, 0.9); s.lineTo(0.16, 0.38); s.lineTo(0.38, 0.38); s.lineTo(0, 0); s.lineTo(-0.38, 0.38); s.lineTo(-0.16, 0.38); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }); geo.translate(0, 0, -0.07);
  const g = new THREE.Group(); const m = ink(geo, toon(color, { fresh: true, emissive: color, ei: 0.45 }), 0.05, true); g.add(m); return g;
}

/* ---------------- 마법진·포탈·빛 ---------------- */
let magicT: THREE.Texture | null = null;
/** 마법진 무늬(흰 선, 색은 재료로 입힌다) */
export function magicTex(): THREE.Texture {
  if (magicT) return magicT;
  magicT = canvasTex(512, 512, g => {
    const c = 256; g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
    const ring = (r: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
    ring(238, 16); ring(214, 7); ring(150, 10); ring(70, 7);
    // 육각별
    g.lineWidth = 9;
    for (const off of [0, Math.PI / 3]) { g.beginPath(); for (let k = 0; k <= 3; k++) { const a = off + k * Math.PI * 2 / 3 - Math.PI / 2; const x = c + Math.cos(a) * 150, y = c + Math.sin(a) * 150; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    // 바깥 고리의 룬 글자(획 몇 개짜리 기호)
    g.lineWidth = 7;
    for (let k = 0; k < 24; k++) {
      const a = k * Math.PI * 2 / 24; g.save(); g.translate(c + Math.cos(a) * 186, c + Math.sin(a) * 186); g.rotate(a + Math.PI / 2);
      const t = k % 4; g.beginPath();
      if (t === 0) { g.moveTo(-10, -12); g.lineTo(0, 12); g.lineTo(10, -12); }
      else if (t === 1) { g.moveTo(0, -14); g.lineTo(0, 14); g.moveTo(-10, -4); g.lineTo(10, 4); }
      else if (t === 2) { g.arc(0, 0, 10, 0, Math.PI * 1.5); }
      else { g.moveTo(-10, 12); g.lineTo(-10, -12); g.lineTo(10, 0); g.lineTo(-10, 12); }
      g.stroke(); g.restore();
    }
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 - Math.PI / 2; g.beginPath(); g.arc(c + Math.cos(a) * 150, c + Math.sin(a) * 150, 14, 0, Math.PI * 2); g.fill(); }
  });
  return magicT;
}
let swirlT: THREE.Texture | null = null;
/** 포탈 소용돌이 */
export function swirlTex(): THREE.Texture {
  if (swirlT) return swirlT;
  swirlT = canvasTex(256, 256, g => {
    const c = 128; const rg = g.createRadialGradient(c, c, 4, c, c, 126);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,.55)'); rg.addColorStop(0.9, 'rgba(255,255,255,.25)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(c, c, 126, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineCap = 'round';
    for (let arm = 0; arm < 5; arm++) {
      g.lineWidth = 6; g.beginPath();
      for (let t = 0; t <= 1; t += 0.02) { const a = arm * Math.PI * 2 / 5 + t * 4.2; const r = 10 + t * 110; const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r; if (t) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
    g.lineWidth = 8; g.beginPath(); g.arc(c, c, 118, 0, Math.PI * 2); g.stroke();
  });
  return swirlT;
}
let colT: THREE.Texture | null = null;
/** 빛 기둥: 아래가 밝고 위로 갈수록 사라진다 */
export function columnTex(): THREE.Texture {
  if (colT) return colT;
  colT = canvasTex(8, 128, g => { const lg = g.createLinearGradient(0, 128, 0, 0); lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(0.5, 'rgba(255,255,255,.45)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(0, 0, 8, 128); });
  return colT;
}
let softT: THREE.Texture | null = null;
/** 둥근 빛 번짐 */
export function softTex(): THREE.Texture {
  if (softT) return softT;
  softT = canvasTex(128, 128, g => { const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.5, 'rgba(255,255,255,.4)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128); });
  return softT;
}
export function glowDisc(color: string, size = 2.4): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), glow(color, 1)); (m.material as THREE.MeshBasicMaterial).map = softTex(); m.rotation.x = -Math.PI / 2; return m;
}
export function magicCircle(color: string, size = 1.9): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), glow(color, 1, false)); (m.material as THREE.MeshBasicMaterial).map = magicTex();
  m.rotation.x = -Math.PI / 2; return m;
}
export function portalDisc(color: string, size = 1.7): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 40), glow(color, 1)); (m.material as THREE.MeshBasicMaterial).map = swirlTex(); return m;
}
export function lightColumn(color: string, r = 0.9, h = 7): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, h, 24, 1, true); geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, glow(color, 1)); (m.material as THREE.MeshBasicMaterial).map = columnTex(); (m.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide; return m;
}

/* ---------------- 말풍선·전구 ---------------- */
/** 구름 말풍선(꼬리가 아래 왼쪽) */
export function buildCloud(w = 1.1): THREE.Group {
  const g = new THREE.Group(); const mat = toon('#fbf6ea');
  const puffs: [number, number, number][] = [[-0.4, 0, 0.32], [0, 0.12, 0.4], [0.4, 0, 0.32], [-0.2, -0.16, 0.3], [0.22, -0.16, 0.3]];
  for (const [x, y, r] of puffs) { const p = ink(new THREE.SphereGeometry(r, 18, 12), mat, 0.035); p.position.set(x * w, y * w, 0); p.scale.set(w, w, w * 0.45); g.add(p); }
  for (const [x, y, r] of [[-0.5, -0.5, 0.1], [-0.68, -0.72, 0.06]] as [number, number, number][]) { const p = ink(new THREE.SphereGeometry(r, 12, 8), mat, 0.025); p.position.set(x * w, y * w, 0); g.add(p); }
  return g;
}
/** 생각 중 점 세 개 */
export function buildDots(): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) { const d = ink(new THREE.SphereGeometry(0.11, 12, 8), toon('#fbf6ea'), 0.03); d.position.set((k - 1) * 0.32, 0, 0); g.add(d); }
  return g;
}
/** 전구(알아차림) */
export function buildBulb(): THREE.Group {
  const g = new THREE.Group();
  const glass = ink(new THREE.SphereGeometry(0.3, 20, 14), toon('#ffe27a', { fresh: true, emissive: '#ffcf3a', ei: 0.8 }), 0.035); glass.position.y = 0.12; g.add(glass);
  const neck = ink(new THREE.CylinderGeometry(0.13, 0.18, 0.16, 16), toon('#ffe27a', { fresh: true, emissive: '#ffcf3a', ei: 0.8 }), 0.025); neck.position.y = -0.16; g.add(neck);
  const base = ink(new THREE.CylinderGeometry(0.13, 0.12, 0.2, 16), toon('#8a8f96'), 0.025); base.position.y = -0.32; g.add(base);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), glow('#ffd84a', 0.35)); halo.position.set(0, 0.1, -0.05); halo.name = 'halo'; g.add(halo);
  // 반짝이는 빗살
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 5 + Math.PI * 0.0; const r = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.22), glow('#fff3b0', 1)); r.position.set(Math.cos(a) * 0.55, 0.12 + Math.sin(a) * 0.55, 0); r.rotation.z = a - Math.PI / 2; g.add(r); }
  return g;
}
