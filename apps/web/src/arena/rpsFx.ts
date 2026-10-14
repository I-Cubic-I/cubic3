/* 선 가위바위보 결과 연출 조각(사용자 2026-10-15): 도전자의 원소 방어막, 선의 광역 공격(파도·불덩이·덩굴),
   진 사람의 탈락 모습(물 = 파도에 쓸려 감, 불 = 타서 재, 풀 = 덩굴에 감겨 땅속으로) */
import * as THREE from 'three';
import type { Hand } from '@cubic3/engine';
import { softTex } from './props';
import { gradientMap, toon } from './toon';

/** 원소 색: 불 = 바위(R), 물 = 보(P), 풀 = 가위(S) */
export const ECOL: Record<Hand, string> = { R: '#ff6a2a', P: '#3aa0ff', S: '#4cc45a' };
/** 이기는 쪽: 물 > 불, 풀 > 물, 불 > 풀 */
export const EBEATS: Record<Hand, Hand> = { R: 'S', P: 'R', S: 'P' };

/** 원소 방어막: 몸을 감싸는 반투명 구 + 바닥 고리 */
export function buildShield(): { g: THREE.Group; set(h: Hand): void; mat: THREE.MeshBasicMaterial; rim: THREE.MeshBasicMaterial } {
  const g = new THREE.Group(); g.visible = false;
  const mat = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 20), mat); ball.position.y = 1.05; g.add(ball);
  const rim = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 8, 48), rim); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 8, 48), rim); ring2.position.y = 1.05; ring2.name = 'spin'; g.add(ring2);
  return { g, mat, rim, set: (h: Hand) => { mat.color.set(ECOL[h]); rim.color.set(ECOL[h]); } };
}

/** 파도: 아래가 두껍고 위가 앞으로 말려 드는 넓은 물벽(앞 = +z) + 위쪽 흰 거품 */
export function buildWave(): THREE.Group {
  const g = new THREE.Group(); g.visible = false;
  const geo = new THREE.PlaneGeometry(46, 1, 60, 14); const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), v = p.getY(i) + 0.5; // 0(아래) ~ 1(위)
    const h = v * (2.5 + Math.sin(x * 0.35) * 0.3), z = v * v * 1.6 - (1 - v) * 1.0;
    p.setXYZ(i, x, h, z);
  }
  geo.computeVertexNormals();
  const water = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: '#2f7fd6', gradientMap: gradientMap(), side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false }));
  g.add(water);
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 46, 10), toon('#eaf6ff')); foam.rotation.z = Math.PI / 2; foam.position.set(0, 2.5, 1.6); g.add(foam);
  for (let k = 0; k < 18; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.35 + (k % 3) * 0.12, 10, 8), toon('#f4fbff')); s.position.set(-22 + k * 2.6, 2.6 + (k % 2) * 0.2, 1.6 + (k % 3) * 0.15); g.add(s); }
  return g;
}

/** 불덩이: 빛나는 공 + 꼬리 빛 */
export function buildFireball(): THREE.Group {
  const g = new THREE.Group(); g.visible = false;
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffd27a', fog: false })));
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: softTex(), color: '#ff6a2a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); halo.name = 'halo'; g.add(halo);
  return g;
}

/** 불꽃 한 무더기(타는 동안 몸 둘레에 흔들린다) */
export function buildFlames(): THREE.Group {
  const g = new THREE.Group(); g.visible = false;
  const cols = ['#ff4a1a', '#ff8a2a', '#ffd04a'];
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.22 + (k % 3) * 0.08, 0.9 + (k % 4) * 0.3, 7), new THREE.MeshBasicMaterial({ color: cols[k % 3], transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    const a = (k / 9) * Math.PI * 2; c.position.set(Math.cos(a) * 0.45, 0.4 + (k % 3) * 0.35, Math.sin(a) * 0.45); c.userData.ph = k * 1.7; g.add(c);
  }
  return g;
}

/** 재 더미 + 날리는 재 */
export function buildAsh(): { pile: THREE.Mesh; motes: THREE.Mesh[] } {
  const pile = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.42, 9), toon('#4a4440')); pile.position.y = 0.2; pile.visible = false;
  const motes: THREE.Mesh[] = [];
  for (let k = 0; k < 12; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ map: softTex(), color: '#8a837c', transparent: true, depthWrite: false })); m.visible = false; m.userData.ph = k; motes.push(m); }
  return { pile, motes };
}

/** 몸을 감아 오르는 덩굴 두 줄(자라는 정도 0~1은 drawRange로) + 땅에서 솟는 덩굴 줄기 */
export function buildVines(): { g: THREE.Group; tubes: THREE.Mesh[]; setGrow(u: number): void } {
  const g = new THREE.Group(); g.visible = false; const tubes: THREE.Mesh[] = [];
  const mat = toon('#2f8a35');
  for (let q = 0; q < 2; q++) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 60; k++) { const u = k / 60, a = u * Math.PI * 5 + q * Math.PI, r = 0.62 - u * 0.2; pts.push(new THREE.Vector3(Math.cos(a) * r, u * 2.1, Math.sin(a) * r)); }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.075, 6, false);
    const t = new THREE.Mesh(geo, mat); g.add(t); tubes.push(t);
  }
  // 잎 몇 장
  for (let k = 0; k < 8; k++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toon('#4cc45a')); lf.scale.set(1.6, 0.35, 0.8); const a = k * 2.1; lf.position.set(Math.cos(a) * 0.6, 0.2 + k * 0.24, Math.sin(a) * 0.6); lf.rotation.y = -a; lf.userData.at = k / 8; g.add(lf); }
  const setGrow = (u: number) => {
    tubes.forEach(t => { const n = (t.geometry.index?.count ?? 0); t.geometry.setDrawRange(0, Math.floor(n * Math.max(0.001, u) / 6) * 6); });
    g.children.forEach(c => { if (c.userData.at != null) c.visible = u > c.userData.at; });
  };
  return { g, tubes, setGrow };
}

/** 타는 모습: 그 마법사만 재료를 복제해 검게 그을린다(원래 재료는 되돌릴 수 있게 보관) */
export function scorch(root: THREE.Object3D, k: number, keep: Map<THREE.Mesh, THREE.Material>): void {
  root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh || o.name === 'ink' || o.name === 'shadow') return;
    const mt = m.material as THREE.MeshToonMaterial; if (!mt || !('color' in mt) || (mt as THREE.Material).type === 'ShaderMaterial') return;
    if (!keep.has(m)) { keep.set(m, mt); const c = mt.clone(); c.userData.base = mt.color.clone(); m.material = c; }
    const c = m.material as THREE.MeshToonMaterial; c.color.copy(c.userData.base as THREE.Color).lerp(new THREE.Color('#2a2522'), k);
    if ('emissive' in c) c.emissiveIntensity = 0;
  });
}
export function unscorch(keep: Map<THREE.Mesh, THREE.Material>): void { for (const [m, mt] of keep) { (m.material as THREE.Material).dispose(); m.material = mt; } keep.clear(); }
