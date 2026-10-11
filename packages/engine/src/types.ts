/* 테이블 상태 타입. 상태는 JSON으로 그대로 주고받을 수 있어야 한다(P2P·저장). */

export type Suit = 'S' | 'H' | 'D' | 'C';
/** 'S1'~'C13', 두 번째 덱은 'S1b'처럼 끝에 b */
export type Card = string;
export type MgId = 'hold' | 'bomb' | 'auction' | 'balloon' | 'rps' | 'vault' | 'count' | 'race';
export type Phase = 'lobby' | 'main' | 'defense' | 'roll' | 'clubs' | 'mg' | 'reward' | 'ended';
export type Hand = 'R' | 'P' | 'S';

export interface Seat {
  uid: string;
  hand: Card[];
  tokens: Suit[];
  front: Card[];
}

export interface Turn {
  seat: number;
  picked: boolean;
  mustDiscard: boolean;
  item: boolean;
  token: boolean;
  trim: boolean;
  peek: Card[] | null;
  justTook?: Card;
}

export interface Pending {
  card: Card;
  attacker: number;
  target: number;
  arg: Suit | null;
  deadline: number;
}

export interface Reward {
  disp: Card[];
  order: number[];
  pi: number;
}

/** 연출 이벤트. 화면이 받아서 효과로 보여 준다 */
export interface Fx {
  id: number;
  t: string;
  seats?: number[];
  [k: string]: unknown;
}

export interface HoldMg {
  id: 'hold';
  pan: number; ord: number[]; ci: number; k: number; s: number; tot: number[];
  last: { i: number; a: number; b: number | null; d: number; th: number } | null;
}
export interface BombMg {
  id: 'bomb';
  bundle: Card[]; alive: number[]; ci: number; lay: (Card | null)[];
  flip: Record<number, { c: Card; v: number }>; arm: Record<number, boolean>; out: number[][];
  hits?: Record<number, number>;
}
export interface Prize { c: Card; up: boolean }
export interface AuctionMg {
  id: 'auction';
  bundle: Card[]; hands: Record<number, Card[]>; prizes: (Prize | null)[]; ai: number; pot: Prize[];
  step: 'pre' | 'bid'; ready: Record<number, boolean>; bids: Record<number, Card>;
  won: Record<number, Card[]>; spent: Card[]; lastBids?: Record<number, Card>;
}
export interface BalloonMg {
  id: 'balloon';
  bundle: Card[]; hands: Record<number, Card[]>; pile: Card[]; total: number; alive: number[]; ci: number;
  out: number[][]; last: { i: number; c: Card; sub: boolean; total: number } | null; pops: number;
}
export interface OvnMg {
  id: 'rps' | 'vault';
  bundle: Card[]; lead: number; alive: number[]; round: number; max: number; out: number[][];
  picks: Record<number, Hand | number>; armL: boolean; saveq: number[]; losers: number[]; saved: number[];
  last: unknown; step: 'pick' | 'hide' | 'guard' | 'save'; zones?: number[] | null;
}
export interface CountMg {
  id: 'count';
  bundle: Card[]; pan: number; hits: Record<number, number>; seq: Card[] | null; dec: Card | null;
  ans: Record<number, number>; arm: Record<number, boolean>; last: unknown; step: 'flip'; t0: number;
}
export interface RaceMg {
  id: 'race';
  bundle: Card[]; order: number[]; pi: number; bet: Record<number, Suit>; pos: Record<Suit, number>;
  pile: Card[]; step: 'bet' | 'race'; last: { c: Card; s: Suit; fw: boolean } | null;
}
export type MgState = HoldMg | BombMg | AuctionMg | BalloonMg | OvnMg | CountMg | RaceMg;

export interface GameState {
  v: number;
  phase: Phase;
  seats: Seat[];
  log: string[];
  names?: Record<string, string>;
  decks: number;
  qPile: Card[];
  kPile: Card[];
  deck: Card[];
  row: Card[];
  qIn: boolean;
  kIn: boolean;
  supply: Record<Suit, number>;
  board: MgId[] | null;
  first: number;
  round: number;
  ot: boolean;
  goal: number;
  die: number | null;
  winners: number[] | null;
  pending: Pending | null;
  mg: MgState | null;
  reward: Reward | null;
  turn: Turn | null;
  order: number[];
  ti: number;
  deadline: number | null;
  ready?: Record<number, boolean>;
  rewardDisp?: Card[] | null;
  lastRank?: number[][];
  fx?: Fx[];
  fxn?: number;
}

export interface MgInfo { name: string; min: number; max: number; icon: string; text: string }
