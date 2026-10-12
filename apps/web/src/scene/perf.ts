/* 그래픽 성능 지키기
   1) 소프트웨어 렌더링 감지: 크롬 "그래픽 가속"이 꺼져 있으면 그래픽 카드 대신 CPU로 그려 계속 끊긴다. 감지하면 품질을 낮추고 안내한다
   2) 자동 품질 조절: 프레임이 계속 낮으면 그리는 해상도 배율을 한 단계씩 낮추고, 넉넉해지면 다시 올린다(설정의 품질이 상한) */
import { create } from 'zustand';
import type * as THREE from 'three';

/** 이 기기에서의 성능 상태(내 화면에만) */
export const usePerf = create<{ software: boolean; warnClosed: boolean; dpr: number }>(() => ({ software: false, warnClosed: false, dpr: 1 }));

const SOFT = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;
/** 소프트웨어로 그리고 있는지: 그래픽 장치 이름, 또는 "성능 저하가 큰 환경이면 실패" 옵션으로 확인 */
export function detectSoftware(gl: THREE.WebGLRenderer): boolean {
  try {
    const ctx = gl.getContext(); const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
    if (SOFT.test(name)) return true;
    const c = document.createElement('canvas');
    const probe = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || c.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!probe) return true;
    (probe as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* 확인하지 못하면 하드웨어로 본다 */ }
  return false;
}

/** 해상도 배율 단계(높은 쪽부터) */
const LEVELS = [2, 1.5, 1.25, 1, 0.8, 0.6];
const WIN = 2; // 초: 이만큼씩 묶어 평균 FPS를 본다

/** 프레임마다 부른다. 바꿔야 할 배율을 돌려준다(그대로면 null) */
export class AutoDpr {
  private t = 0; private n = 0; private low = 0; private high = 0; private since = 0; private warm = 4;
  private cur: number;
  constructor(private cap: number) { this.cur = this.snap(cap); }
  private snap(v: number): number { return LEVELS.find(l => l <= v + 1e-6) ?? LEVELS[LEVELS.length - 1]; }
  /** 설정 품질이 바뀌면 상한부터 다시 */
  reset(cap: number): number { this.cap = cap; this.cur = this.snap(cap); this.t = this.n = this.low = this.high = 0; this.warm = 3; return this.cur; }
  get value(): number { return this.cur; }
  tick(dt: number): number | null {
    // 탭을 떠났다 오는 등 긴 공백은 세지 않는다. 처음 몇 초(장면 준비)도 넘긴다
    if (dt > .5 || document.hidden) { this.t = this.n = 0; return null; }
    if (this.warm > 0) { this.warm -= dt; return null; }
    this.t += dt; this.n++; this.since += dt;
    if (this.t < WIN) return null;
    const fps = this.n / this.t; this.t = this.n = 0;
    if (fps < 45) { this.low++; this.high = 0; } else if (fps >= 57) { this.high++; this.low = 0; } else { this.low = this.high = 0; }
    const k = LEVELS.indexOf(this.cur);
    // 4초 넘게 낮으면 한 단계 내리고, 10초 넘게 넉넉하면(내린 지 15초 지난 뒤) 한 단계 올린다
    if (this.low >= 2 && k < LEVELS.length - 1) { this.cur = LEVELS[k + 1]; this.low = 0; this.since = 0; return this.cur; }
    if (this.high >= 5 && this.since > 15 && k > 0 && LEVELS[k - 1] <= this.cap + 1e-6) { this.cur = LEVELS[k - 1]; this.high = 0; this.since = 0; return this.cur; }
    return null;
  }
}
