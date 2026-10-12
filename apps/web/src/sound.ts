/* 효과음 (Web Audio로 직접 합성. 파일 없음). 지금은 눈치 게임(서부 결투)에서만 쓴다.
   브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 처음 누를 때 소리 장치를 깨운다 */
import { usePrefs } from './prefs';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!ctx) { try { ctx = new AudioContext(); } catch { return null; } }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
if (typeof window !== 'undefined') {
  const wake = () => { ac(); };
  window.addEventListener('pointerdown', wake, { capture: true }); window.addEventListener('keydown', wake, { capture: true });
}
/** 소리를 낼 수 있는 상태인지 (막혀 있으면 화면에 "소리를 켜세요"를 띄운다) */
export const soundReady = (): boolean => !!ctx && ctx.state === 'running';
/** 출력 지연(초). 블루투스 이어폰이면 크다. 반응 시간 보정에 쓴다 */
export const outLatency = (): number => (ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0);
const vol = (): number => { const v = usePrefs.getState().vol; return (v.master / 100) * (v.sfx / 100); };

function out(c: AudioContext, gain: number): GainNode {
  const g = c.createGain(); g.gain.value = gain * vol(); g.connect(c.destination); return g;
}
function tone(c: AudioContext, dst: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak: number): void {
  const o = c.createOscillator(); const g = c.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dst); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(c: AudioContext, dst: AudioNode, t0: number, dur: number, peak: number, lo: number, hi: number): void {
  const n = Math.ceil(c.sampleRate * dur); const b = c.createBuffer(1, n, c.sampleRate); const d = b.getChannelData(0);
  for (let k = 0; k < n; k++) d[k] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.setValueAtTime(lo, t0); f.frequency.exponentialRampToValueAtTime(hi, t0 + dur); f.Q.value = 1.2;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + dur * .3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(dst); s.start(t0); s.stop(t0 + dur);
}

export type Sfx = 'bell' | 'bird' | 'creak' | 'clink' | 'tumble' | 'fake' | 'shot';
/** 소리 하나. 돌려주는 값: 실제로 귀에 들리기 시작하는 performance.now() 기준 시각(출력 지연 포함) */
export function play(k: Sfx): number {
  const c = ac(); const at = performance.now() + outLatency() * 1000;
  if (!c) return at;
  const t = c.currentTime + 0.01; const o = out(c, 1);
  if (k === 'bell') {
    // 진짜 신호: 종소리 한 번 "땡!" (맑은 금속성 배음)
    [[880, 1], [1760, .5], [2640, .28], [3960, .14]].forEach(([f, a]) => tone(c, o, 'sine', f, f * .995, t, 1.6, .5 * a));
    tone(c, o, 'triangle', 1320, 1300, t, .25, .25);
  } else if (k === 'bird') {
    // 미끼: 새가 짹짹
    for (let j = 0; j < 3; j++) tone(c, o, 'sine', 2600 + j * 200, 3800, t + j * .11, .08, .18);
  } else if (k === 'creak') {
    // 미끼: 문 삐걱
    tone(c, o, 'sawtooth', 180, 120, t, .7, .08); tone(c, o, 'square', 240, 160, t + .05, .6, .03);
  } else if (k === 'clink') {
    // 미끼: 술잔 부딪힘(종소리와 헷갈리게 조금 비슷한 금속음, 짧고 탁하다)
    tone(c, o, 'triangle', 2100, 2000, t, .18, .22); tone(c, o, 'triangle', 3150, 3000, t + .01, .14, .12);
  } else if (k === 'tumble') {
    // 미끼: 회전초가 바람에 굴러감
    noise(c, o, t, 1.1, .25, 400, 1800);
  } else if (k === 'fake') {
    // 아이템(가짜 신호): 특이한 소리 "뿌잉~"
    tone(c, o, 'square', 300, 1200, t, .35, .12); tone(c, o, 'sine', 1200, 500, t + .3, .4, .18);
  } else if (k === 'shot') {
    noise(c, o, t, .25, .5, 3000, 300); tone(c, o, 'sine', 120, 40, t, .2, .4);
  }
  return at;
}
export const DECOYS: Sfx[] = ['bird', 'creak', 'clink', 'tumble'];
