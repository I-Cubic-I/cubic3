/* 테이블 상태 타입. 상태는 JSON으로 그대로 주고받을 수 있어야 한다(P2P·저장). */

export type Suit = 'S' | 'H' | 'D' | 'C';
/** 'S1'~'C13', 두 번째 덱은 'S1b'처럼 끝에 b */
export type Card = string;
export type MgId = 'hold' | 'bomb' | 'auction' | 'balloon' | 'rps' | 'vault' | 'count' | 'race'
  | 'nunchi' | 'updown' | 'curling' | 'line' | 'speed' | 'fold' | 'chain' | 'mid';
export type Phase = 'lobby' | 'main' | 'defense' | 'roll' | 'clubs' | 'mg' | 'reward' | 'ended';
export type Hand = 'R' | 'P' | 'S';

export interface Seat {
  uid: string;
  /** 대기실 테이블의 의자 번호(0~4). 자리 순서(차례 순서)는 의자 순서를 따른다. 예전 상태에는 없을 수 있다 */
  chair?: number;
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
  /** 디지털판: 아이템을 낼 수 있는 시간이 끝나는 때(ms). 지나면 저절로 입찰 */
  until?: number;
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
  /** 선 가위바위보: 이번 판 '이기면 즉시 통과' 아이템을 낸 사람 / 그렇게 통과해 끝까지 남은 것으로 치는 사람 */
  pass?: Record<number, boolean>; passed?: number[];
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
/* ---- 2026-10-12 추가 미니게임 ---- */
/** 눈치 게임(디지털판: 서부 총잡이 결투). 신호는 소리만. 시각은 각 기기가 상태를 받은 때부터 잰다(lead 뒤 대치 시작, 그로부터 sig 뒤 종소리) */
export interface DuelMg {
  id: 'nunchi';
  pan: number; max: number;
  /** 방장 시계로 이번 판 상태를 만든 때 */
  t0: number;
  lead: number; sig: number;
  /** 미끼 소리: 대치 시작으로부터 ms, 종류 */
  decoys: { t: number; k: number }[];
  /** 아이템(가짜 신호)을 쓴 자리. 받는 기기가 그때 특이한 소리를 낸다 */
  fakes: number[];
  /** 반응 시간(ms) 또는 부정출발 'fs' */
  res: Record<number, number | 'fs'>;
  pts: Record<number, number>;
  last: { pan: number; res: Record<number, number | 'fs'>; gain: Record<number, number> } | null;
}
/** 위냐 아래냐 */
export interface UpDownMg {
  id: 'updown';
  ord: number[]; turn: number; turns: number; coins: number;
  step: 'grip' | 'call' | 'shout';
  grip: Record<number, number>; call: number | null; regrip: boolean;
  pts: Record<number, number>;
  last: { caller: number; shouter: number; call: number; up: boolean; sum: number; grip: Record<number, number>; gain: number } | null;
}
/** 말 컬링: 판 위 좌표(cm). x는 폭(-W/2~W/2), y는 길이(0 출발 가장자리 ~ L 끝 벽) */
export interface Stone { seat: number; x: number; y: number }
export interface CurlShot { x: number; angle: number; power: number }
export interface CurlingMg {
  id: 'curling';
  ord: number[]; end: number; ends: number;
  seq: number[]; si: number;
  stones: Stone[];
  /** 이번 차례 아이템: 끝 벽 치우기 */
  noWall: boolean;
  /** 판마다 점수(주사위로 앞에 두는 값) */
  score: Record<number, number[]>;
  /** 직전 샷(화면이 같은 계산으로 다시 굴려 보여 준다) */
  last: { seat: number; before: Stone[]; shot: CurlShot; noWall: boolean; n: number } | null;
  /** 말이 다 멈출 때까지(방장 시계). 그전엔 다음 샷을 받지 않는다 */
  until: number;
  step: 'aim' | 'roll' | 'score';
}
/** 조용한 줄 서기 */
export interface LineMg {
  id: 'line';
  ord: number[]; pan: number;
  hands: Record<number, Card[]>; pile: Card[]; won: Record<number, Card[]>; spent: Card[]; bundle: Card[];
  step: 'ready' | 'play' | 'pause';
  until: number;
  pause: { seat: number; peek: Record<number, Card> } | null;
  last: { seat: number; c: Card; stop: Record<number, Card> } | null;
}
/** 스피드 */
export interface SpeedMg {
  id: 'speed';
  ord: number[]; pan: number;
  hands: Record<number, Card[]>; piles: Card[][]; won: Record<number, Card[]>; spent: Card[]; bundle: Card[];
  step: 'pre' | 'play' | 'stuck';
  until: number;
  last: { seat: number; c: Card; pile: number } | null;
}
/** 손병호 게임 */
export interface FoldMg {
  id: 'fold';
  ord: number[]; ci: number;
  fingers: Record<number, number>;
  step: 'say' | 'answer';
  text: string; said: string[];
  ans: Record<number, boolean>; safe: Record<number, boolean>;
  last: { text: string; folded: number[]; safe: number[] } | null;
}
/** 손가락 사슬 */
export interface ChainMg {
  id: 'chain';
  ord: number[]; pan: number;
  coins: Record<number, number>;
  step: 'pre' | 'point' | 'pass' | 'done';
  until: number;
  two: Record<number, boolean>;
  aim: Record<number, number[]>;
  bent: Record<number, boolean[]>;
  cur: number; path: number[];
  caught: number | null;
}
/** 가운데 숫자 */
export type MidCrit = 'mid' | 'hi' | 'lo';
export interface MidMg {
  id: 'mid';
  ord: number[]; pan: number;
  hands: Record<number, Card[]>; won: Record<number, Card[]>; spent: Card[]; bundle: Card[];
  deckCard: Card | null; crit: MidCrit; critBy: number | null;
  step: 'pre' | 'pick';
  until: number;
  picks: Record<number, Card>;
  last: { picks: Record<number, Card>; deckCard: Card | null; crit: MidCrit; target: number; win: number[]; void: boolean } | null;
}
export type MgState = HoldMg | BombMg | AuctionMg | BalloonMg | OvnMg | CountMg | RaceMg
  | DuelMg | UpDownMg | CurlingMg | LineMg | SpeedMg | FoldMg | ChainMg | MidMg;

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
  /** ♣Q·♣K를 쓰고 미니게임을 고르는 중(디지털판: 쓰고 나서 미니게임 선택 화면에서 고른다) */
  clubChoose?: { seat: number; card: Card } | null;
  /** ♠J: from이 to의 손패(뒷면으로 펼친 것)에서 1장을 고르는 중 */
  steal?: { from: number; to: number } | null;
  rewardDisp?: Card[] | null;
  lastRank?: number[][];
  fx?: Fx[];
  fxn?: number;
}

export interface MgInfo { name: string; min: number; max: number; icon: string; text: string }
