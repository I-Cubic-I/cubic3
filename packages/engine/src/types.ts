/* 테이블 상태 타입. 상태는 JSON으로 그대로 주고받을 수 있어야 한다(P2P·저장). */

export type Suit = 'S' | 'H' | 'D' | 'C';
/** 'S1'~'C13', 두 번째 덱은 'S1b'처럼 끝에 b */
export type Card = string;
export type MgId = 'hold' | 'bomb' | 'auction' | 'balloon' | 'rps' | 'vault' | 'count' | 'race'
  | 'nunchi' | 'updown' | 'curling' | 'line' | 'speed' | 'fold' | 'chain' | 'mid'
  | 'gesture' | 'stack' | 'change' | 'cave' | 'ten' | 'balance'
  | 'liar' | 'fore' | 'fork'
  | 'dodge';
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
  /** 2·3인: 목숨(실물은 동전 1개). 자리별 남은 동전 수. 동전이 없을 때 펑 하면 탈락 */
  coins?: Record<number, number>;
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
/* ---- 2026-10-13 디지털판 추가 (실물 문서에 있던 미니게임) ---- */
/** 몸짓 잇기(디지털판: 정해진 몸짓 8개를 버튼으로). 지금까지의 몸짓 줄(seq)을 처음부터 따라 하고(pos) 새 몸짓 1개를 붙인다 */
export interface GestureMg {
  id: 'gesture';
  alive: number[]; ci: number; out: number[][];
  seq: number[]; pos: number; until: number;
  /** 최근 입력 2개(머리 위 아이콘: 방금 것과 흐려진 직전 것) */
  recent: { seat: number; g: number; n: number }[];
  n: number;
}
/** 주사위 쌓기(디지털판: 스태커). 모두 동시에 각자 화면에서 쌓고, 기기가 잰 시간을 보낸다 */
export interface StackMg {
  id: 'stack';
  ord: number[]; step: 'pre' | 'play'; until: number; limit: number;
  wide: Record<number, boolean>; h: Record<number, number>; ms: Record<number, number>; done: Record<number, boolean>;
  /** 자리별로 쌓은 칸(층마다 열 번호). 다른 사람 화면을 함께 보여 주는 데 쓴다 */
  cols: Record<number, number[]>;
}
/** 뭐가 바뀌었지: 말 8개가 점수 트랙 판(10×5칸) 위에. 바꾸는 사람이 말을 옮기고 나머지가 고른다 */
export interface ChangeMg {
  id: 'change';
  ord: number[]; pan: number; changer: number;
  step: 'look' | 'move' | 'guess'; until: number;
  pieces: number[]; before: number[]; moved: number[]; need: number;
  guesses: Record<number, number[]>; pts: Record<number, number>;
  last: { changer: number; moved: number[]; guesses: Record<number, number[]>; gain: Record<number, number> } | null;
}
/** 동굴 탐험: 공유 굴림. 남기·나가기를 선부터 차례로 정하고, 매 턴 주사위를 1개 더해(최대 3개) 굴린다 */
export interface CaveMg {
  id: 'cave';
  ord: number[]; pan: number;
  step: 'decide' | 'pre' | 'show'; until: number;
  inside: number[]; di: number; pool: number; ones: number; turn: number; protect: number;
  /** 이번 판 점수(나간 사람은 버틴 턴 수, 무너지면 남은 사람 0) */
  got: Record<number, number>; score: Record<number, number[]>;
  last: { faces: number[]; kept: number; ones: number; collapse: boolean; turn: number } | null;
}
/** 합이 10: 자기 더미(hands, 맨 위 = 끝), 가운데 자리 3개. 두 장의 합이 10이면 주사위 잡기(반응 시간은 각 기기가 잰다) */
export interface TenMg {
  id: 'ten';
  ord: number[]; pan: number; hands: Record<number, Card[]>; slots: Card[][]; ci: number;
  all: boolean; flipN: number; grabs: Record<number, number>; grabUntil: number; spent: Card[]; bundle: Card[];
  last: { seat: number; slots: number[]; got: number; all: boolean } | null;
}
/** 밸런스 게임: 선이 두 가지(아이템이면 세 가지)를 내고 모두 동시에 고른다. 가장 많은 쪽이 혼자면 그쪽 1점(세 가지면 3점) */
export interface BalanceMg {
  id: 'balance';
  ord: number[]; ci: number; step: 'say' | 'pick'; opts: string[]; three: boolean;
  picks: Record<number, number>; pts: Record<number, number>;
  last: { opts: string[]; picks: Record<number, number>; win: number | null; gain: number } | null;
}
/** 거짓말쟁이: 모두의 카드에 [문양]이 [N]장 이상이라고 선언하고, 다음 사람은 올리거나 "거짓말!" */
export interface LiarMg {
  id: 'liar';
  ord: number[]; alive: number[]; ci: number; out: number[][];
  hands: Record<number, Card[]>; bundle: Card[];
  bid: { seat: number; suit: Suit; n: number } | null; caller: number | null;
  step: 'bid' | 'judge'; until: number;
  /** 판정 때 낸 아이템(그 문양 1장으로 더한다) */
  adds: Record<number, Card[]>;
  last: { bid: { seat: number; suit: Suit; n: number }; caller: number; count: number; loser: number; hands: Record<number, Card[]>; adds: Record<number, Card[]> } | null;
}
/** 이마 위의 카드(인디언 포커): 자기 더미(hands, 보지 않음)에서 이마로 1장, 승부(1장 더 걸기) 또는 포기 */
export interface ForeMg {
  id: 'fore';
  ord: number[]; pan: number; extra: boolean;
  hands: Record<number, Card[]>; bundle: Card[];
  /** 이번 판 이마 카드(다른 사람에게만 보인다) */
  fore: Record<number, Card>;
  /** 가운데 걸린 카드(이월분 포함) */
  pile: Card[];
  seq: number[]; si: number; acts: Record<number, boolean>;
  /** 아이템(거울): 물은 사람 → {누구에게, 숫자, 답} */
  asks: Record<number, { to: number; v: number; yes: boolean }>;
  last: { fore: Record<number, Card>; acts: Record<number, boolean>; win: number | null; got: number } | null;
}
/** 갈림길: 인원수만큼 카드를 깔고 동시에 칸을 고른다. 혼자 고른 칸만 가져간다 */
export interface ForkMg {
  id: 'fork';
  ord: number[]; pan: number; row: Card[]; picks: Record<number, number>; rev: Record<number, boolean>;
  won: Record<number, Card[]>; spent: Card[]; bundle: Card[];
  step: 'pick' | 'wait'; until: number;
  last: { row: Card[]; picks: Record<number, number>; rev: Record<number, boolean>; got: Record<number, number> } | null;
}
/* ---- 2026-10-14 디지털 전용 ---- */
/** 주사위 눈 피하기: 3×3 판(칸 0~8 = 행×3+열). 공격자가 공개된 주사위 3개 중 하나를 골라 그 눈의 모양을 판 위에 놓고,
    수비자들은 상하좌우 한 칸(또는 제자리)으로 움직인다. 모양이 덮은 칸에 있으면 맞는다 */
export interface DodgeMg {
  id: 'dodge';
  /** 공격 순서. 지금 공격자 = ord[ai] */
  ord: number[]; ai: number;
  /** 이번 공격자의 몇 번째 턴(1부터) / 공격자 1명당 턴 수 */
  turn: number; turns: number;
  /** 공개된 주사위 3개 */
  dice: number[];
  /** 수비자 위치 */
  pos: Record<number, number>;
  /** 봉쇄된 칸(공격자 아이템). 그 공격자의 차례가 끝날 때까지 */
  blocked: number[];
  step: 'block' | 'pick' | 'show';
  /** block: 봉쇄 시간 끝 / pick: 공격자 마감 / show: 결과를 보여 주는 시간 끝 (방장 시계) */
  until: number;
  /** 수비자 마감(공격자보다 5초 늦다) */
  dUntil: number;
  /** 공격자가 확정한 공격(수비자 화면에는 숨긴다). k = 고른 주사위 */
  shot: { k: number; die: number; cells: number[]; auto?: boolean } | null;
  /** 수비자가 고르고 있는 칸(수비자끼리 공유, 공격자 화면에는 숨긴다) */
  moves: Record<number, number>;
  /** 확정한 수비자 */
  done: Record<number, boolean>;
  /** 엿보기를 쓴 수비자(공격자가 고른 눈이 그 사람에게만 보인다) */
  peek: Record<number, boolean>;
  pts: Record<number, number>;
  last: { atk: number; die: number; cells: number[]; from: Record<number, number>; to: Record<number, number>; hit: number[]; auto: boolean } | null;
}

export type MgState = HoldMg | BombMg | AuctionMg | BalloonMg | OvnMg | CountMg | RaceMg
  | DuelMg | UpDownMg | CurlingMg | LineMg | SpeedMg | FoldMg | ChainMg | MidMg
  | GestureMg | StackMg | ChangeMg | CaveMg | TenMg | BalanceMg | LiarMg | ForeMg | ForkMg
  | DodgeMg;

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
  /** 이번 라운드 메인 턴에 이미 한 것(자리별). 토큰 만들기·아이템은 한 라운드에 1번 */
  used?: Record<number, { item?: boolean; token?: boolean }>;
  /** 디지털판: 최근에 한 미니게임(오래된 것부터). 이 미니게임들은 미니게임 6장에 나오지 않는다 */
  recentMg?: MgId[];
  /** 미니게임이 끝났다: 마지막 결과를 보여 주는 동안(at까지, 방장 시계) 미니게임 화면에 머문 뒤 순위·보상으로 넘어간다 */
  mgEnd?: { groups: number[][]; at: number } | null;
  rewardDisp?: Card[] | null;
  lastRank?: number[][];
  fx?: Fx[];
  fxn?: number;
}

export interface MgInfo { name: string; min: number; max: number; icon: string; text: string }
