/* 이 브라우저의 꾸미기·설정 (내 화면에만 적용, 다른 사람에게 보내지 않는다). localStorage에 저장한다 */
import { create } from 'zustand';

export type Quality = 'low' | 'mid' | 'high';
export type Prefs = {
  name: string;
  cardBack: string;   // CARD_BACKS의 id
  felt: string;       // FELTS의 id
  vol: { master: number; sfx: number; music: number }; // 0~100 (소리는 아직 없다. 넣으면 이 값을 따른다)
  quality: Quality;
  /** 끊기면 그리는 해상도를 저절로 낮춘다 */
  autoQuality: boolean;
  reduceMotion: boolean;
};

/** 테이블 천 색 */
export const FELTS: { id: string; label: string; color: string }[] = [
  { id: 'green', label: '초록', color: '#1f4c3f' },
  { id: 'navy', label: '남색', color: '#1d3554' },
  { id: 'wine', label: '와인', color: '#4f1d27' },
  { id: 'charcoal', label: '먹색', color: '#2a2c30' },
  { id: 'plum', label: '자두', color: '#3a2752' },
];
export const feltColor = (id: string) => (FELTS.find(f => f.id === id) || FELTS[0]).color;

const KEY = 'c3-prefs';
const LS = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 진행 */ } },
};
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const osReduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULTS: Prefs = {
  name: '', cardBack: 'classic', felt: 'green',
  // 휴대폰·태블릿(손가락 화면)은 처음부터 보통 품질로
  vol: { master: 80, sfx: 100, music: 60 }, quality: touch ? 'mid' : 'high', autoQuality: true, reduceMotion: osReduce,
};
function load(): Prefs {
  let saved: Partial<Prefs> = {};
  try { saved = JSON.parse(LS.get(KEY) || '{}'); } catch { /* 깨졌으면 기본값 */ }
  // 예전에 따로 저장하던 이름을 이어받는다
  return { ...DEFAULTS, name: LS.get('c3-name') || '', ...saved, vol: { ...DEFAULTS.vol, ...saved.vol } };
}

export const usePrefs = create<Prefs & { set: (p: Partial<Prefs>) => void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p);
    const { set: _s, ...rest } = get(); void _s;
    LS.set(KEY, JSON.stringify(rest));
    if (p.name !== undefined) LS.set('c3-name', p.name);
  },
}));
export const prefs = () => usePrefs.getState();

/** 움직임 줄이기: 문서에 클래스를 달아 CSS 애니메이션도 멈춘다 */
function applyMotion(on: boolean) { document.documentElement.classList.toggle('reduce-motion', on); }
applyMotion(prefs().reduceMotion);
usePrefs.subscribe((s, p) => { if (s.reduceMotion !== p.reduceMotion) applyMotion(s.reduceMotion); });
