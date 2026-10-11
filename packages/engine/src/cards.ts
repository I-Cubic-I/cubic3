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
