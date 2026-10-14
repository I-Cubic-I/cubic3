/* 카드·문양 기본값과 무작위 */
import type { Card, Suit } from './types';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SYM: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SNAME: Record<Suit, string> = { S: '스페이드', H: '하트', D: '다이아', C: '클럽' };

/** 카드 숫자 (A=1, J·Q·K=11·12·13). 두 번째 덱 카드는 끝에 'b'가 붙는다 */
export const R = (c: Card): number => parseInt(c.slice(1), 10);
export const U = (c: Card): Suit => c[0] as Suit;
export const isItem = (c: Card): boolean => R(c) >= 11;
export const RL = (r: number): string => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' } as Record<number, string>)[r] || String(r);
export const cname = (c: Card): string => SYM[U(c)] + RL(R(c));

export const CLUB_MS = 5000;
export const DEF_MS = 6000;

let RNG: () => number = Math.random;
/** 시험·재현용: 무작위 함수를 바꾼다 */
export function setRng(f: () => number): void { RNG = f; }
/** 판의 시드 무작위(mulberry32). 상태 s를 테이블 상태에 두어 방장이 새로고침해도 같은 흐름이 이어진다 */
export interface SeedRng { s: number }
let bound: SeedRng | null = null; let saved: (() => number) | null = null;
/** 이 판의 시드 무작위로 바꾼다(없으면 원래 무작위로 돌아간다). 엔진 입구(applyAction·advanceTimers)마다 부른다 */
export function bindSeed(st: SeedRng | null | undefined): void {
  if (st) {
    if (bound === st) return;
    if (!bound) saved = RNG; bound = st;
    RNG = () => {
      st.s = (st.s + 0x6d2b79f5) >>> 0; let t = st.s;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  } else if (bound) { bound = null; RNG = saved || Math.random; saved = null; }
}
/** 글자 → 32비트 시드(FNV-1a) */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5; for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 0x01000193); } return h >>> 0;
}
export const rnd = (n: number): number => Math.floor(RNG() * n);
export const d6 = (): number => 1 + rnd(6);
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

let CLOCK: () => number = () => Date.now();
/** 시험·재현용: 시계를 바꾼다 */
export function setClock(f: () => number): void { CLOCK = f; }
export const now = (): number => CLOCK();

export function fullDeck(decks = 1): Card[] {
  const d: Card[] = [];
  for (let k = 0; k < decks; k++) for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push(s + r + (k ? 'b' : ''));
  return d;
}
