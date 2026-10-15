/* 단신 마법사(시안, 사용자 2026-10-15 레퍼런스): 몸은 작고(약 3등신) 모자가 크다. 큰 코·짙은 눈썹·뾰족 귀, 살짝 구부정.
   꾸미기(사용자 2026-10-15): 모자 · 수염 · 지팡이 · 옷 · 색을 고를 수 있다 → 부위별 선택지로 조립한다.
   연출 코드는 좌표 대신 부위 이름(armL · armR · staff · hat · head)과 치수(WIZ)로 찾는다 */
import * as THREE from 'three';
import { RoundedBoxGeometry, mergeVertices } from 'three-stdlib';
import { INK, ink, toon } from './toon';
import type { Wizard } from './props';

const V = (x: number, y: number) => new THREE.Vector2(x, y);
const SKIN = '#e9b98f', LEATHER = '#7a4f2c', SANDAL = '#4a3b52', WOOD = '#9b7348', GOLD = '#d8a94a', PANTS = '#2f3440';

/** 치수(연출이 맞춰 쓴다): 몸 키 · 머리 높이 · 모자 끝까지 · 몸 둘레 반지름 */
export const WIZ = { body: 1.05, head: 1.2, top: 2.3, radius: 0.48 };

export type HatKind = 'floppy' | 'buckle' | 'hood';
export type BeardKind = 'mustache' | 'long' | 'bushy';
export type StaffKind = 'gnarled' | 'crystal' | 'forked';
export type OutfitKind = 'cloak' | 'robe';
export type FeetKind = 'sandal' | 'boot';
/** 꾸미기: 부위 모양 + 색(주 색 = 모자·망토/로브, 보조 색 = 안쪽 옷, 수염 색) */
export interface WizLook { hat: HatKind; beard: BeardKind; staff: StaffKind; outfit: OutfitKind; feet: FeetKind; color: string; color2: string; hair: string }
export const LOOK_OPTS = {
  hat: [['floppy', '처진 챙 고깔'], ['buckle', '버클 띠 고깔'], ['hood', '뾰족 두건']] as [HatKind, string][],
  beard: [['mustache', '콧수염'], ['long', '긴 수염'], ['bushy', '덥수룩한 수염']] as [BeardKind, string][],
  staff: [['gnarled', '울퉁불퉁 나무'], ['crystal', '수정 지팡이'], ['forked', '갈래 가지']] as [StaffKind, string][],
  outfit: [['cloak', '망토 + 튜닉'], ['robe', '긴 로브']] as [OutfitKind, string][],
  feet: [['sandal', '샌들'], ['boot', '가죽 장화']] as [FeetKind, string][],
};
export const DEFAULT_LOOK = (color: string): WizLook => ({ hat: 'floppy', beard: 'long', staff: 'gnarled', outfit: 'cloak', feet: 'boot', color, color2: '#e6dcc0', hair: '#eeeae2' });

/** 부위 이름이 붙은 마법사 */
export interface Wizard2 extends Wizard { armL: THREE.Group; armR: THREE.Group; staff: THREE.Group; hat: THREE.Group }

const darker = (c: string, k: number) => new THREE.Color(c).lerp(new THREE.Color('#1b1626'), k);
/** 꼭짓점 밀기: 원통을 만든 뒤 높이에 따라 휘게(모자 끝 · 지팡이) */
function bend(g: THREE.BufferGeometry, f: (x: number, y: number, z: number, u: number) => [number, number, number], h: number): THREE.BufferGeometry {
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeVertices(g); const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) { const [x, y, z] = f(p.getX(i), p.getY(i), p.getZ(i), p.getY(i) / h); p.setXYZ(i, x, y, z); }
  m.computeVertexNormals(); return m;
}

/* ---------------- 모자 ---------------- */
export function buildHat(kind: HatKind, color: string): THREE.Group {
  const hat = new THREE.Group(); hat.name = 'hat'; const col = toon(color);
  if (kind === 'hood') {
    // 두건: 머리 뒤·위를 감싸는 껍데기(얼굴 쪽은 트임) + 뒤로 꺾인 뾰족한 끝 + 금색 테
    const shell = new THREE.SphereGeometry(0.32, 26, 16, Math.PI * 0.62, Math.PI * 2 - Math.PI * 1.24, 0, Math.PI * 0.62);
    const sm = col.clone(); sm.side = THREE.DoubleSide; const s = ink(shell, sm, 0.022); s.position.y = -0.1; s.scale.set(1, 1.15, 1); hat.add(s);
    const tip = ink(bend(new THREE.CylinderGeometry(0.02, 0.2, 0.55, 14, 8, true), (x, y, z, u) => [x, y, z - Math.pow(u, 1.6) * 0.32], 0.55).translate(0, 0, 0), col, 0.022); tip.position.set(0, 0.18, -0.06); hat.add(tip);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.02, 6, 30, Math.PI * 1.24), toon(GOLD)); rim.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.62 * Math.PI / 2 * 0); rim.position.set(0, -0.02, 0.12); rim.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI * 0.38 + Math.PI); hat.add(rim);
    hat.userData.hood = true;
    return hat;
  }
  // 챙: 두께 있는 고리. floppy = 넓게 처지며 물결, buckle = 조금 덜 처지고 판판
  const floppy = kind === 'floppy';
  const R = floppy ? 0.8 : 0.72;
  const prof = [V(0.25, 0.02), V(0.45, 0.0), V(0.62, -0.04), V(R - 0.02, floppy ? -0.13 : -0.07), V(R, floppy ? -0.16 : -0.09), V(R - 0.04, floppy ? -0.15 : -0.08), V(0.6, -0.07), V(0.44, -0.03), V(0.25, -0.02)];
  const bg = new THREE.LatheGeometry(prof, 44); const p = bg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(x, z), k = THREE.MathUtils.clamp((r - 0.3) / 0.5, 0, 1);
    p.setY(i, p.getY(i) + (floppy ? Math.sin(a * 3 + 0.6) * 0.07 * k + (Math.cos(a) * 0.05 - 0.04) * k : Math.sin(a * 2 + 1) * 0.02 * k + Math.cos(a) * 0.03 * k));
  }
  bg.computeVertexNormals(); hat.add(ink(bg, col, 0.025));
  // 고깔: floppy = 뒤로 꺾여 옆으로 늘어짐, buckle = 곧게 서다가 끝만 꺾임
  const H = floppy ? 0.95 : 0.85;
  const cg = bend(new THREE.CylinderGeometry(0.02, 0.28, H, 18, 10, true).translate(0, H / 2, 0), floppy
    ? (x, y, z, u) => [x + Math.pow(u, 3) * 0.32, y - Math.pow(u, 2.5) * 0.18, z - Math.pow(u, 1.8) * 0.3]
    : (x, y, z, u) => [x + Math.pow(u, 6) * 0.3, y - Math.pow(u, 6) * 0.12, z - Math.pow(u, 2) * 0.08], H);
  hat.add(ink(cg, col, 0.025));
  if (!floppy) {
    // 가죽 띠 + 금색 네모 버클
    const band = ink(new THREE.CylinderGeometry(0.262, 0.282, 0.09, 22, 1, true), toon(LEATHER), 0.015); band.position.y = 0.07; hat.add(band);
    const bk = ink(new THREE.TorusGeometry(0.05, 0.013, 4, 4), toon(GOLD), 0.008); bk.rotation.z = Math.PI / 4; bk.position.set(0, 0.07, 0.285); hat.add(bk);
  }
  return hat;
}

/* ---------------- 머리 · 수염 ---------------- */
/** 끝으로 갈수록 가늘어지는 관(콧수염) */
function taperTube(pts: THREE.Vector3[], r: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts), seg = 16, rad = 8;
  const g = new THREE.TubeGeometry(curve, seg, r, rad, false); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = Math.floor(i / (rad + 1)) / seg; const c = curve.getPoint(u); const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(c).multiplyScalar(1 - u * 0.75).add(c); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return ink(g, mat, 0.016);
}
function buildHead2(L: WizLook): Pick<Wizard, 'head' | 'eyesOpen' | 'eyesShut'> & { hat: THREE.Group } {
  const head = new THREE.Group(); const hair = toon(L.hair);
  const face = ink(new THREE.SphereGeometry(0.25, 22, 16), toon(SKIN), 0.025); face.scale.set(1, 1.05, 0.95); head.add(face);
  const nose = ink(new THREE.SphereGeometry(0.085, 14, 10), toon('#dd9f78'), 0.018); nose.scale.set(0.9, 1, 1.3); nose.position.set(0, -0.03, 0.25); head.add(nose);
  // 콧수염: 코 밑에서 양옆으로(콧수염형은 더 길게 뻗는다)
  const mus = L.beard === 'mustache' ? 0.32 : 0.22;
  for (const s of [-1, 1]) head.add(taperTube([new THREE.Vector3(0, -0.09, 0.27), new THREE.Vector3(s * 0.1, -0.12, 0.26), new THREE.Vector3(s * mus * 0.7, -0.17, 0.2), new THREE.Vector3(s * mus, -0.25, 0.12)], 0.06, hair));
  if (L.beard === 'mustache') { const b = ink(new THREE.SphereGeometry(0.1, 12, 8), hair, 0.016); b.scale.set(1, 0.9, 0.7); b.position.set(0, -0.23, 0.17); head.add(b); }
  else if (L.beard === 'long') {
    const b = ink(new THREE.LatheGeometry([V(0, -0.78), V(0.05, -0.74), V(0.1, -0.6), V(0.17, -0.4), V(0.22, -0.2), V(0.23, -0.06), V(0.16, 0.0), V(0, 0.01)], 20), hair, 0.022);
    b.scale.set(1, 1, 0.55); b.position.set(0, -0.1, 0.17); b.rotation.x = 0.12; head.add(b);
    const tie = ink(new THREE.TorusGeometry(0.035, 0.012, 6, 12), toon(LEATHER), 0.008); tie.rotation.x = Math.PI / 2 + 0.12; tie.position.set(0, -0.78, 0.27); head.add(tie);
  } else {
    // 덥수룩: 가슴까지 넓게 덮는 둥근 수염
    const b = ink(new THREE.LatheGeometry([V(0, -0.52), V(0.12, -0.5), V(0.24, -0.4), V(0.3, -0.22), V(0.29, -0.06), V(0.2, 0.02), V(0, 0.03)], 22), hair, 0.024);
    b.scale.set(1.05, 1, 0.65); b.position.set(0, -0.1, 0.13); b.rotation.x = 0.15; head.add(b);
  }
  // 눈썹(바깥쪽이 올라간 덥수룩한 덩어리) · 뾰족 귀 · 옆머리
  for (const s of [-1, 1]) { const b = ink(new THREE.CapsuleGeometry(0.038, 0.12, 4, 8), hair, 0.015); b.rotation.z = Math.PI / 2 + s * -0.35; b.position.set(s * 0.1, 0.1, 0.21); head.add(b); }
  for (const s of [-1, 1]) { const e = ink(new THREE.ConeGeometry(0.06, 0.2, 8), toon(SKIN), 0.015); e.rotation.z = s * -1.2; e.rotation.y = s * 0.4; e.position.set(s * 0.27, 0.0, -0.02); head.add(e); }
  for (const s of [-1, 1]) { const h = ink(new THREE.SphereGeometry(0.11, 10, 8), hair, 0.015); h.scale.set(0.8, 1, 1.1); h.position.set(s * 0.2, 0.05, -0.1); head.add(h); }
  const eyesOpen = new THREE.Group(), eyesShut = new THREE.Group();
  for (const s of [-1, 1]) {
    const w = ink(new THREE.SphereGeometry(0.045, 12, 8), toon('#fbf6ea'), 0.012); w.scale.set(1, 1.1, 0.6); w.position.set(s * 0.085, 0.04, 0.225); eyesOpen.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), toon(INK)); p.position.set(s * 0.085, 0.035, 0.25); eyesOpen.add(p);
    const sh = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), toon(INK)); sh.rotation.z = Math.PI; sh.position.set(s * 0.085, 0.05, 0.24); eyesShut.add(sh);
  }
  eyesShut.visible = false; head.add(eyesOpen, eyesShut);
  const hat = buildHat(L.hat, L.color);
  if (L.hat === 'hood') hat.position.set(0, 0.04, -0.03); else { hat.position.set(0, 0.12, -0.02); hat.rotation.set(-0.1, 0, 0.06); }
  head.add(hat);
  return { head, eyesOpen, eyesShut, hat };
}

/* ---------------- 지팡이 ---------------- */
function buildStaff(kind: StaffKind, color: string): THREE.Group {
  const staff = new THREE.Group(); staff.name = 'staff'; const wood = toon(WOOD);
  const glowGem = (s: number) => ink(new THREE.OctahedronGeometry(s, 0), toon(color, { fresh: true, emissive: color, ei: 0.9 }), 0.012);
  if (kind === 'gnarled') {
    // 울퉁불퉁 굽은 나무 + 손잡이 가죽 + 끝에 작은 수정
    staff.add(ink(bend(new THREE.CylinderGeometry(0.03, 0.045, 1.75, 7, 12).translate(0, 0.875, 0), (x, y, z, u) => { const k = 1 + Math.sin(y * 23) * 0.12 + Math.sin(y * 7.1) * 0.08; return [x * k + Math.sin(u * 5) * 0.03 + Math.pow(u, 4) * 0.08, y, z * k + Math.sin(u * 3.3) * 0.02]; }, 1.75), wood, 0.015));
    const g = glowGem(0.075); g.scale.set(0.8, 1.5, 0.8); g.position.set(0.08, 1.83, 0); staff.add(g);
  } else if (kind === 'crystal') {
    // 곧은 막대 + 가죽 감개 여러 줄 + 꼭대기 갈퀴에 물린 큰 수정
    staff.add(ink(new THREE.CylinderGeometry(0.032, 0.04, 1.7, 8).translate(0, 0.85, 0), toon('#7a4a2c'), 0.015));
    for (const y of [0.25, 0.5, 1.0, 1.3, 1.55]) { const w = ink(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 8), toon('#e2c08a'), 0.01); w.position.y = y; staff.add(w); }
    for (let k = 0; k < 3; k++) { const c = ink(bend(new THREE.CylinderGeometry(0.012, 0.025, 0.28, 5, 4).translate(0, 0.14, 0), (x, y, z, u) => [x + Math.sin(u * 2) * 0.06, y, z], 0.28), toon('#7a4a2c'), 0.01); c.position.y = 1.68; c.rotation.y = k * 2.1; c.rotation.z = 0.35; staff.add(c); }
    const g = glowGem(0.12); g.scale.set(0.75, 1.7, 0.75); g.position.y = 1.92; staff.add(g);
  } else {
    // 갈래 가지: 위에서 두 갈래로 갈라진 가지(새가 앉을 만한 곁가지)
    staff.add(ink(bend(new THREE.CylinderGeometry(0.03, 0.045, 1.6, 7, 10).translate(0, 0.8, 0), (x, y, z, u) => [x + Math.sin(u * 4) * 0.04, y, z], 1.6), wood, 0.015));
    const br = (rz: number, len: number) => { const b = ink(bend(new THREE.CylinderGeometry(0.014, 0.03, len, 6, 6).translate(0, len / 2, 0), (x, y, z, u) => [x + u * u * 0.06, y, z], len), wood, 0.012); b.position.y = 1.55; b.rotation.z = rz; staff.add(b); return b; };
    br(0.5, 0.42); br(-0.35, 0.5);
    const g = glowGem(0.06); g.position.set(0.12, 1.95, 0); staff.add(g);
  }
  return staff;
}

/* ---------------- 몸 ---------------- */
/** 단신 마법사 한 명(키는 모자 끝까지 약 2.3, 몸은 약 1.05) */
export function buildWizard2(look: WizLook): Wizard2 {
  const L = look; const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const main = toon(L.color), mainDark = toon(darker(L.color, 0.3)), inner = toon(L.color2);
  const robe = L.outfit === 'robe';
  // 발: 샌들(발가락이 보인다) / 가죽 장화. 로브는 땅까지 덮어 앞코만 보인다
  for (const s of [-1, 1]) {
    if (L.feet === 'sandal') {
      const sole = ink(new RoundedBoxGeometry(0.17, 0.04, 0.27, 2, 0.02), toon(SANDAL), 0.015); sole.position.set(s * 0.13, 0.02, 0.07); body.add(sole);
      const foot = ink(new THREE.SphereGeometry(0.08, 12, 8), toon(SKIN), 0.012); foot.scale.set(0.95, 0.6, 1.45); foot.position.set(s * 0.13, 0.07, 0.09); body.add(foot);
      const strap = ink(new THREE.TorusGeometry(0.075, 0.018, 6, 14, Math.PI), toon(SANDAL), 0.01); strap.position.set(s * 0.13, 0.06, 0.06); body.add(strap);
      if (!robe) { const leg = ink(new THREE.CylinderGeometry(0.075, 0.09, 0.22, 10), toon(PANTS), 0.015); leg.position.set(s * 0.12, 0.2, 0.0); body.add(leg); const cuff = ink(new THREE.TorusGeometry(0.09, 0.03, 6, 14), toon(PANTS), 0.012); cuff.rotation.x = Math.PI / 2; cuff.position.set(s * 0.12, 0.12, 0.0); body.add(cuff); }
    } else {
      const toe = ink(new THREE.SphereGeometry(0.1, 12, 8), toon(LEATHER), 0.015); toe.scale.set(0.9, 0.6, 1.5); toe.position.set(s * 0.13, 0.06, 0.09); body.add(toe);
      if (!robe) { const shaft = ink(new THREE.CylinderGeometry(0.09, 0.095, 0.2, 10), toon(LEATHER), 0.015); shaft.position.set(s * 0.12, 0.14, 0.0); body.add(shaft); const fold = ink(new THREE.CylinderGeometry(0.11, 0.1, 0.06, 10), toon('#6a4224'), 0.012); fold.position.set(s * 0.12, 0.25, 0.0); body.add(fold); }
    }
  }
  const sleeveM = (robe ? main : mainDark).clone(); sleeveM.side = THREE.DoubleSide;
  if (robe) {
    // 긴 로브: 땅까지 닿고 단에 금색 테. 앞 트임 사이로 안쪽 옷(보조 색)
    body.add(ink(new THREE.LatheGeometry([V(0, 0.2), V(0.26, 0.2), V(0.24, 0.6), V(0.2, 0.95), V(0, 1.0)], 16), inner, 0.018));
    const rm = main.clone(); rm.side = THREE.DoubleSide;
    body.add(ink(new THREE.LatheGeometry([V(0.44, 0.02), V(0.4, 0.3), V(0.33, 0.62), V(0.28, 0.86), V(0.24, 0.98), V(0.14, 1.03)], 28, 0.3, Math.PI * 2 - 0.6), rm, 0.025));
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.022, 6, 40, Math.PI * 2 - 0.6), toon(GOLD)); hem.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.3); hem.position.y = 0.03; body.add(hem);
    for (const s of [-1, 1]) { const tr = ink(new THREE.BoxGeometry(0.035, 0.98, 0.02), toon(GOLD), 0.008); tr.position.set(s * Math.sin(0.3) * 0.36, 0.52, Math.cos(0.3) * 0.36); tr.rotation.set(-0.12, 0, s * -0.07); body.add(tr); }
  } else {
    // 망토 + 튜닉(보조 색) + 어깨 깃·브로치
    body.add(ink(new THREE.LatheGeometry([V(0, 0.28), V(0.28, 0.28), V(0.25, 0.5), V(0.22, 0.75), V(0.2, 0.92), V(0.12, 1.0), V(0, 1.0)], 18), inner, 0.02));
    const cm = mainDark.clone(); cm.side = THREE.DoubleSide;
    body.add(ink(new THREE.LatheGeometry([V(0.48, 0.03), V(0.45, 0.2), V(0.42, 0.34), V(0.36, 0.6), V(0.3, 0.85), V(0.27, 0.98), V(0.2, 1.02)], 28, 0.42, Math.PI * 2 - 0.84), cm, 0.025));
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.018, 6, 40, Math.PI * 2 - 0.84), toon(GOLD)); trim.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.42); trim.position.y = 0.035; body.add(trim);
    body.add(ink(new THREE.LatheGeometry([V(0.34, 0.78), V(0.3, 0.88), V(0.22, 0.99), V(0.12, 1.03)], 24), main, 0.022));
    const brooch = ink(new THREE.TorusGeometry(0.045, 0.014, 6, 12), toon('#c8c8d0'), 0.008); brooch.position.set(0, 0.96, 0.17); body.add(brooch);
    const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), toon('#4fb3ff', { fresh: true, emissive: '#4fb3ff', ei: 0.7 })); gem.position.set(0, 0.96, 0.19); body.add(gem);
  }
  // 허리띠 · 버클 · 물약 · 어깨띠 · 주머니
  const belt = ink(new THREE.TorusGeometry(robe ? 0.255 : 0.235, 0.035, 6, 22), toon(LEATHER), 0.012); belt.rotation.x = Math.PI / 2; belt.position.y = 0.62; body.add(belt);
  const buckle = ink(new RoundedBoxGeometry(0.1, 0.08, 0.03, 2, 0.01), toon('#c9a24a'), 0.01); buckle.position.set(0.02, 0.62, robe ? 0.27 : 0.25); body.add(buckle);
  for (const [x, c] of [[0.12, '#4fa8ff'], [0.2, '#ff5a4a']] as const) { const fl = ink(new THREE.SphereGeometry(0.045, 10, 8), toon(c, { fresh: true, emissive: c, ei: 0.4 }), 0.01); fl.position.set(x, 0.53, 0.24); body.add(fl); const nk = ink(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 6), toon('#c8c8d0'), 0.006); nk.position.set(x, 0.59, 0.24); body.add(nk); }
  const sash = ink(new THREE.BoxGeometry(0.06, 0.62, 0.02), toon(LEATHER), 0.01); sash.position.set(-0.04, 0.82, 0.245); sash.rotation.z = -0.55; body.add(sash);
  const pouch = ink(new RoundedBoxGeometry(0.13, 0.15, 0.08, 2, 0.03), toon(LEATHER), 0.012); pouch.position.set(-0.22, 0.52, 0.14); pouch.rotation.y = 0.6; body.add(pouch);
  // 팔: 넓은 소매 + 손. 오른손은 앞으로 내밀어 지팡이를 쥔다
  const arm = (s: number) => {
    const a = new THREE.Group(); a.name = s > 0 ? 'armR' : 'armL'; a.position.set(s * 0.26, 0.9, 0.02); body.add(a);
    const sl = ink(new THREE.CylinderGeometry(0.07, robe ? 0.17 : 0.14, 0.4, 12, 1, true), sleeveM, 0.02); sl.position.y = -0.2; a.add(sl);
    const hd = ink(new THREE.SphereGeometry(0.065, 12, 10), toon(SKIN), 0.015); hd.position.y = -0.42; hd.name = 'hand'; a.add(hd);
    return a;
  };
  const armL = arm(-1), armR = arm(1);
  armL.rotation.set(-0.15, 0, -0.35); armR.rotation.set(-0.95, 0, 0.35);
  const staff = buildStaff(L.staff, L.color); staff.position.set(0.36, 0, 0.34); body.add(staff);
  const h = buildHead2(L); h.head.position.set(0, WIZ.head, 0.04); h.head.rotation.x = 0.08; body.add(h.head);
  body.rotation.x = 0.04; // 살짝 구부정하게
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; shadow.name = 'shadow'; root.add(shadow);
  const above = new THREE.Group(); above.position.y = WIZ.top + 0.3; root.add(above);
  return { root, body, head: h.head, eyesOpen: h.eyesOpen, eyesShut: h.eyesShut, above, armL, armR, staff, hat: h.hat };
}
