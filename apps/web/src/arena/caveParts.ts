/* 동굴 탐험 아레나 공통 부품: 각진 바위·종유석·크리스탈 클러스터·고르기 화살표 */
import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { clamp01, gradientMap, ink, toon } from './toon';

/* ---------------- 바위·종유석·크리스탈 ---------------- */
export function rng(seed: number) { let s = Math.floor(seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const matC = new Map<string, THREE.MeshToonMaterial>();
/** 각진 면(평면 음영) 바위 재료 */
/** (사용자 2026-10-14) 동굴 아레나도 잉크 그림체: 3단 명암 툰 재료 + 각진 면. 테두리는 아레나가 가까운 것에만 붙인다 */
export function rockMat(c: string): THREE.MeshToonMaterial { let m = matC.get(c); if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap() }); (m as unknown as { flatShading: boolean }).flatShading = true; m.userData.rock = true; matC.set(c, m); } return m; }
/** 얼룩진 바위: 꼭짓점마다 색이 조금씩 달라 번지는 얼룩 + 부드러운 음영(각진 면이 도드라지지 않게, 사용자 2026-10-15) */
export function mottledRock(seed: number, c: string, detail = 2, rough = 0.3, spread = 0.16): THREE.Mesh {
  const g = rockGeo(seed, detail, rough);
  const r = rng(seed + 7), base = new THREE.Color(c), hsl = { h: 0, s: 0, l: 0 }; base.getHSL(hsl);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    // 위쪽은 조금 밝게, 아래쪽은 어둡게 + 무작위 얼룩
    tmp.setHSL(hsl.h + (r() - 0.5) * 0.03, hsl.s * (0.8 + r() * 0.4), Math.max(0.04, hsl.l * (1 + (r() - 0.5) * 2 * spread + p.getY(i) * 0.12)));
    tmp.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: gradientMap() }); m.userData.rock = true;
  return new THREE.Mesh(g, m);
}
/** 바위 더미 벽: 크고 작은 얼룩 바위를 쌓아 위로 갈수록 좁게(앞을 막은 벽) */
export function rockWall(seed: number, shades: string[], h: number): THREE.Group {
  const g = new THREE.Group(), r = rng(seed);
  const put = (x: number, y: number, z: number, s: number, k: number) => { const m = mottledRock(seed + k * 13, shades[k % shades.length]); m.position.set(x, y, z); m.scale.set(s * (1 + r() * 0.3), s * (0.75 + r() * 0.3), s * (0.9 + r() * 0.3)); m.rotation.set(r() * 0.6, r() * 6, r() * 0.6); g.add(m); };
  let k = 0;
  // 아래 큰 바위들 → 위로 작은 바위
  for (let row = 0; row * 0.85 < h; row++) {
    const s = 0.95 - row * 0.09, n = row < 2 ? 3 : 2;
    for (let q = 0; q < n; q++) put((q - (n - 1) / 2) * s * 1.15 + (r() - 0.5) * 0.25, 0.35 + row * 0.85, (r() - 0.5) * 0.5 + (q % 2) * 0.3, s, k++);
  }
  // 앞에 굴러 나온 작은 돌
  for (let q = 0; q < 4; q++) put(-1.2 + r() * 1.6, 0.1, 0.9 + r() * 0.5, 0.18 + r() * 0.15, k++);
  return g;
}
/** 각진 바위: 다면체 꼭짓점을 들쭉날쭉 밀고 당긴다 */
export function rockGeo(seed: number, detail = 1, rough = 0.35): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const r = rng(seed + 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 1 + (r() - 0.5) * 2 * rough; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * (0.85 + r() * 0.3), p.getZ(i) * f); }
  g.computeVertexNormals(); return g;
}
/** 종유석: 위가 넓고 아래로 들쭉날쭉 좁아지며 끝이 살짝 휜다(위 = 0, 아래 끝 = -len) */
export function stalGeo(seed: number, rad: number, len: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.ConeGeometry(rad, len, 7, 5, false); g.rotateX(Math.PI); g.translate(0, -len / 2, 0);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const r = rng(seed + 3); const p = g.attributes.position; const bend = (r() - 0.5) * rad * 1.6, bendZ = (r() - 0.5) * rad;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); const tt = clamp01(-y / len); const f = 1 + (r() - 0.5) * 0.7;
    p.setXYZ(i, p.getX(i) * f + bend * tt * tt, y + (tt > 0 && tt < 1 ? (r() - 0.5) * len * 0.08 : 0), p.getZ(i) * f + bendZ * tt * tt);
  }
  g.computeVertexNormals(); return g;
}
/** 크리스탈 클러스터(사용자 2026-10-14): 바위 밑동에서 육각기둥 결정 여러 개가 사방으로 뻗는다.
    곧은 기둥으로 솟다가 끝만 둔각으로 뾰족(너무 뾰족한 건 싫다). 가운데가 가장 길고 바깥은 짧고 기운다. 스스로 빛난다 */
const prismGeo = (() => {
  const body = new THREE.CylinderGeometry(1, 1, 1, 6); body.translate(0, 0.5, 0);
  // 끝만 낮게 뾰족한 둔각(반지름에 비해 높이를 낮게)
  const tip = new THREE.ConeGeometry(1, 0.38, 6); tip.translate(0, 1.19, 0);
  const g = mergeGeos([body, tip]); return g;
})();
export function crystal(c: string, seed = 1): THREE.Group {
  const r = rng(seed * 7 + c.length);
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, flatShading: true, roughness: 0.25, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.55), emissive: c, emissiveIntensity: 0.5, flatShading: true, roughness: 0.4 });
  const n = 8;
  for (let k = 0; k < n; k++) {
    const center = k === 0; const a = (k / (n - 1)) * Math.PI * 2 + r() * 0.6;
    const tilt = center ? r() * 0.12 : 0.22 + r() * 0.45;
    const len = center ? 0.5 : 0.22 + r() * 0.24, rad = center ? 0.14 : 0.075 + r() * 0.05;
    const m = new THREE.Mesh(prismGeo, k % 3 === 2 ? dark : mat);
    m.scale.set(rad, len, rad);
    // 밑동에서 기울여 바깥으로
    m.rotation.set(Math.sin(a) * tilt, r() * 6, -Math.cos(a) * tilt, 'YXZ');
    m.position.set(Math.cos(a) * (center ? 0 : 0.09), 0, Math.sin(a) * (center ? 0 : 0.09));
    g.add(m);
  }
  // 밑동 바위
  const base = new THREE.Mesh(rockGeo(seed + 77, 0, 0.3), rockMat('#3f2819')); base.scale.set(0.28, 0.1, 0.24); g.add(base);
  return g;
}
/** 기하 몇 개를 하나로(위치만 쓰는 평면 음영용) */
export function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const g of gs) { const ng = g.index ? g.toNonIndexed() : g; const p = ng.attributes.position; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.computeVertexNormals(); return out;
}

/** 고르기 화살표: 두툼한 납작 화살표(+x 방향), 잉크 테두리 · 스스로 빛남 */
export function arrow3D(color: string): THREE.Group {
  const sh = new THREE.Shape(); sh.moveTo(-0.62, -0.15); sh.lineTo(0.12, -0.15); sh.lineTo(0.12, -0.38); sh.lineTo(0.66, 0); sh.lineTo(0.12, 0.38); sh.lineTo(0.12, 0.15); sh.lineTo(-0.62, 0.15); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }); geo.translate(0, 0, -0.07);
  const g = new THREE.Group(); g.add(ink(geo, toon(color, { fresh: true, emissive: color, ei: 0.5 }), 0.04)); return g;
}

