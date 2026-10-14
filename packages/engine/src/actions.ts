/* 행동 판정: 플레이어가 보낸 행동이 지금 가능한지 확인하고 상태에 적용한다.
   방장(P2P) 또는 서버가 이 함수 하나로 판정한다. 화면은 같은 함수로 미리 가능 여부를 볼 수 있다. */
import { R, U, cname, isItem, now } from './cards';
import { MG } from './mginfo';
import {
  canMakeToken, clubChoices, clubPick, defend, discardCard, endTurn, log, makeToken, newLobby, pickDJ, pickup, pickupDiscard,
  readyUp, resolveAttack, rewardPick, rollBoard, startAttack, startGame, startSolo, stealPick, useClub, useDJ, useHQ,
} from './core';
import {
  auctionBid, auctionItem, auctionReady, balloonPlay, bombArm, bombFlip, countAnswer, countArm, countOpenAt, holdRoll, holdStop,
  ovnSave, raceBet, raceFlip, raceSwap, rpsArm, rpsPass, rpsPick, vaultArm, vaultGuard, vaultHide,
} from './minigames';
import {
  chainAim, chainFingers, chainPass, chainTwo, curlNoWall, curlShot, curlTurn, duelFake, duelHit, foldAnswer, foldIsDup, foldSafe, foldSay,
  lineGo, linePeek, linePlay, midCrit, midPick, speedFits, speedPile, speedPlay, udCall, udCaller, udGrip, udRegrip, udShout, udShouter,
} from './minigames2';
import {
  CHG_PIECES, GESTURES, STACK_ROWS, balancePick, balanceSay, balanceThree, caveDecider, caveGo, caveGuard, changeGuess, changeMore, changeMove,
  gestSkip, gestTurn, gesture, stackReport, stackWide, tenAll, tenGrab, tenPlace, tenTurn,
  foreAct, foreAsk, foreTurn, forkPick, forkRev, liarAdd, liarBid, liarCall, liarTurn,
} from './minigames3';
import { dodgeAtk, dodgeBlock, dodgeCanBlock, dodgeCanGo, dodgeGo, dodgeLock, dodgeMove, dodgePeek, dodgeShot, dodgeValid } from './minigames4';
import type { Card, CurlShot, GameState, Hand, MgId, MidCrit, Suit } from './types';

export const MAX_SEATS = 5;
export const HAND_LIMIT = 6;

export type Action =
  | { type: 'sit'; name?: string; chair?: number }
  | { type: 'move'; seat: number; chair: number }
  | { type: 'leave'; seat: number }
  | { type: 'start' }
  | { type: 'restart' }
  /** 미니게임만 하기 */
  | { type: 'startSolo'; id: MgId }
  | { type: 'toLobby' }
  | { type: 'reset' }
  | { type: 'roll'; seat: number }
  | { type: 'ready' }
  | { type: 'club'; seat: number; card: Card; arg?: number }
  | { type: 'clubPick'; seat: number; k: number }
  | { type: 'defend'; seat: number; card: Card }
  | { type: 'noDefend'; seat: number }
  | { type: 'pickDeck'; seat: number }
  | { type: 'pickRow'; seat: number; card: Card }
  | { type: 'discard'; seat: number; card: Card }
  | { type: 'token'; seat: number; cards: Card[]; color?: Suit }
  | { type: 'attack'; seat: number; card: Card; target: number; arg?: Suit | null }
  | { type: 'heartQ'; seat: number; card: Card; picks: Card[] }
  | { type: 'diamondJ'; seat: number; card: Card }
  | { type: 'diamondJPick'; seat: number; card: Card }
  | { type: 'endTurn'; seat: number }
  | { type: 'trim'; seat: number; cards: Card[] }
  | { type: 'trimOne'; seat: number; card: Card }
  | { type: 'reward'; seat: number; card: Card }
  | { type: 'holdRoll'; seat: number; item?: Card | null }
  | { type: 'holdStop'; seat: number }
  | { type: 'bombArm'; seat: number; item: Card }
  | { type: 'bombFlip'; seat: number; k: number }
  | { type: 'auctionItem'; seat: number; item: Card }
  | { type: 'auctionReady'; seat: number }
  | { type: 'auctionBid'; seat: number; card: Card }
  | { type: 'balloon'; seat: number; card: Card; item?: Card | null }
  | { type: 'rps'; seat: number; hand: Hand }
  | { type: 'rpsArm'; seat: number; item: Card }
  | { type: 'rpsPass'; seat: number; item: Card }
  | { type: 'stealPick'; seat: number; k: number }
  | { type: 'ovnSave'; seat: number; item: Card | null }
  | { type: 'vaultHide'; seat: number; zone: number }
  | { type: 'vaultArm'; seat: number; item: Card }
  | { type: 'vaultGuard'; seat: number; zones: number[] }
  | { type: 'countAnswer'; seat: number; n: number }
  | { type: 'countArm'; seat: number; item: Card }
  | { type: 'raceBet'; seat: number; suit: Suit }
  | { type: 'raceSwap'; seat: number; item: Card; suit: Suit }
  | { type: 'raceFlip'; seat: number }
  | { type: 'duelHit'; seat: number; ms: number | null }
  | { type: 'duelFake'; seat: number; item: Card }
  | { type: 'udGrip'; seat: number; n: number }
  | { type: 'udCall'; seat: number; n: number }
  | { type: 'udRegrip'; seat: number; item: Card; n: number }
  | { type: 'udShout'; seat: number; up: boolean }
  | { type: 'curlShot'; seat: number; shot: CurlShot }
  | { type: 'curlNoWall'; seat: number; item: Card }
  | { type: 'linePlay'; seat: number }
  | { type: 'linePeek'; seat: number; item: Card }
  | { type: 'lineGo'; seat: number }
  | { type: 'speedPlay'; seat: number; card: Card; pile: number }
  | { type: 'speedPile'; seat: number; item: Card; card: Card }
  | { type: 'foldSay'; seat: number; text: string }
  | { type: 'foldAnswer'; seat: number; yes: boolean }
  | { type: 'foldSafe'; seat: number; item: Card }
  | { type: 'chainTwo'; seat: number; item: Card }
  | { type: 'chainAim'; seat: number; targets: number[] }
  | { type: 'chainPass'; seat: number; k: number }
  | { type: 'midCrit'; seat: number; item: Card; crit: MidCrit }
  | { type: 'midPick'; seat: number; card: Card }
  | { type: 'gesture'; seat: number; g: number }
  | { type: 'gestSkip'; seat: number; item: Card }
  | { type: 'stack'; seat: number; h: number; ms?: number | null; done?: boolean; cols?: number[] }
  | { type: 'stackWide'; seat: number; item: Card }
  | { type: 'chgMove'; seat: number; piece: number; cell: number }
  | { type: 'chgMore'; seat: number; item: Card }
  | { type: 'chgGuess'; seat: number; pieces: number[] }
  | { type: 'caveGo'; seat: number; stay: boolean }
  | { type: 'caveGuard'; seat: number; item: Card }
  | { type: 'tenPlace'; seat: number; slot: number }
  | { type: 'tenGrab'; seat: number; n: number; ms: number }
  | { type: 'tenAll'; seat: number; item: Card }
  | { type: 'balSay'; seat: number; opts: string[] }
  | { type: 'balThree'; seat: number; item: Card }
  | { type: 'balPick'; seat: number; k: number }
  | { type: 'liarBid'; seat: number; suit: Suit; n: number }
  | { type: 'liarCall'; seat: number }
  | { type: 'liarAdd'; seat: number; item: Card }
  | { type: 'foreAct'; seat: number; go: boolean }
  | { type: 'foreAsk'; seat: number; item: Card; to: number; v: number }
  | { type: 'forkPick'; seat: number; k: number }
  | { type: 'forkRev'; seat: number; item: Card }
  | { type: 'dodgeBlock'; seat: number; item: Card; cell: number }
  | { type: 'dodgeGo'; seat: number }
  | { type: 'dodgeMove'; seat: number; cell: number }
  | { type: 'dodgeLock'; seat: number }
  | { type: 'dodgeShot'; seat: number; k: number; cells: number[] }
  | { type: 'dodgePeek'; seat: number; item: Card };

export type Result = { ok: true } | { ok: false; error: string };

const SUIT_SET = new Set(['S', 'H', 'D', 'C']);
const fail = (error: string): Result => ({ ok: false, error });

/** 행동을 판정해 적용한다. 성공하면 상태 버전(v)을 올린다. 실패하면 상태를 바꾸지 않는다. */
export function applyAction(S: GameState, uid: string, a: Action): Result {
  const r = check(S, uid, a);
  if (r) return fail(r);
  const out = run(S, uid, a);
  if (out === false) return fail('지금은 할 수 없어요.');
  S.v = (S.v || 0) + 1;
  return { ok: true };
}

/** 행동이 가능한지만 본다. 가능하면 null, 아니면 이유 */
export function canAct(S: GameState, uid: string, a: Action): string | null {
  return check(S, uid, a);
}

function check(S: GameState, uid: string, a: Action): string | null {
  const seatOk = (i: number) => Number.isInteger(i) && !!S.seats[i] && S.seats[i].uid === uid;
  const holds = (i: number, c: Card | null | undefined) => !!c && S.seats[i].hand.includes(c);
  const myTurn = (i: number) => S.phase === 'main' && !!S.turn && S.turn.seat === i;
  const mg = S.mg;
  if ('seat' in a && !seatOk(a.seat)) return '내 자리가 아니에요.';
  // 미니게임이 끝나 결과를 보여 주는 중에는 아무것도 받지 않는다
  if (S.mgEnd && !['reset', 'toLobby', 'leave'].includes(a.type)) return '미니게임 결과를 보여 주는 중이에요.';
  // ♠J로 카드를 고르는 동안에는 그것만
  if (S.steal && a.type !== 'stealPick' && !['reset', 'toLobby', 'leave', 'sit'].includes(a.type)) return '♠J로 카드를 고르는 중이에요.';
  switch (a.type) {
    case 'sit': return S.phase !== 'lobby' ? '게임 중이에요.' : S.seats.length >= MAX_SEATS ? '자리가 다 찼어요.' : a.chair != null && !chairFree(S, a.chair) ? '빈 자리가 아니에요.' : null;
    case 'move': return S.phase !== 'lobby' ? '게임 중이에요.' : !chairFree(S, a.chair) ? '빈 자리가 아니에요.' : null;
    case 'leave': return S.phase !== 'lobby' ? '게임 중이에요.' : null;
    case 'start': return S.phase !== 'lobby' ? '이미 시작했어요.' : S.seats.length < 2 ? '2명 이상 앉아야 해요.' : null;
    case 'restart': return S.phase !== 'ended' ? '게임이 끝나지 않았어요.' : null;
    case 'startSolo': {
      if (S.phase !== 'lobby') return '이미 시작했어요.';
      const g = MG[a.id]; if (!g) return '없는 미니게임이에요.';
      const n = S.seats.length; const lo = Math.max(2, g.min);
      return n < lo ? `${g.name}은 ${lo}명 이상이어야 해요.` : n > g.max ? `${g.name}은 ${g.max}명까지예요.` : null;
    }
    case 'toLobby': case 'reset': return S.seats.some(p => p.uid === uid) || S.phase === 'lobby' ? null : '자리에 앉은 사람만 할 수 있어요.';
    case 'roll': return S.phase === 'roll' && S.first === a.seat ? null : '선 플레이어가 굴릴 차례가 아니에요.';
    case 'ready': return S.phase !== 'clubs' ? '규칙 설명 시간이 아니에요.' : S.clubChoose ? '♣로 미니게임을 고르는 중이에요.' : S.seats.some((p, k) => p.uid === uid && !(S.ready || {})[k]) ? null : '이미 준비했어요.';
    case 'club': {
      if (S.phase !== 'clubs') return '규칙 설명 시간에만 쓸 수 있어요.';
      if (S.solo) return '미니게임만 하기에서는 ♣로 미니게임을 바꿀 수 없어요.';
      if (!holds(a.seat, a.card) || U(a.card) !== 'C' || !isItem(a.card)) return '♣ 아이템이 아니에요.';
      if (S.seats[a.seat].front.length) return '이번 라운드에 아이템을 써서 ♣를 쓸 수 없어요.';
      if (S.clubChoose) return '다른 ♣로 미니게임을 고르는 중이에요.';
      const r = R(a.card);
      // 값 없이 쓰면 쓰고 나서 고른다(clubPick)
      if (r === 12 && a.arg && a.arg !== 1 && a.arg !== -1) return '♣Q는 +1 또는 -1을 고르세요.';
      if (r === 13 && a.arg && !(Number.isInteger(a.arg) && a.arg >= 1 && a.arg <= 6)) return '♣K는 1~6번 칸을 고르세요.';
      return null;
    }
    case 'clubPick': return S.phase === 'clubs' && S.clubChoose?.seat === a.seat && clubChoices(S).includes(a.k) ? null : '고를 수 있는 칸이 아니에요.';
    case 'defend': {
      if (S.phase !== 'defense' || !S.pending || S.pending.target !== a.seat) return '막을 공격이 없어요.';
      if (!holds(a.seat, a.card) || U(a.card) !== 'H' || !(R(a.card) === 11 || R(a.card) === 13)) return '♥J·♥K로만 막을 수 있어요.';
      return null;
    }
    case 'noDefend': return S.phase === 'defense' && S.pending && S.pending.target === a.seat ? null : '막을 공격이 없어요.';
    case 'pickDeck': return myTurn(a.seat) && !S.turn!.picked ? (S.deck.length || S.row.length || S.seats.some(p => p.front.length) ? null : '덱이 비었어요.') : '지금은 주울 수 없어요.';
    case 'pickRow': return myTurn(a.seat) && !S.turn!.picked ? (S.row.includes(a.card) ? null : '버림 줄에 없는 카드예요.') : '지금은 주울 수 없어요.';
    case 'discard': return myTurn(a.seat) && S.turn!.mustDiscard && holds(a.seat, a.card) ? null : '지금은 버릴 수 없어요.';
    case 'token': {
      if (!myTurn(a.seat)) return '내 차례가 아니에요.';
      if (!a.cards.length || !a.cards.every(c => holds(a.seat, c)) || new Set(a.cards).size !== a.cards.length) return '손패에 없는 카드예요.';
      const it = a.cards.find(isItem);
      if (it && R(it) === 12 && !(a.color && SUIT_SET.has(a.color) && !S.seats[a.seat].tokens.includes(a.color) && S.supply[a.color] > 0)) return '공급처에 있고 내가 가지지 않은 색을 고르세요.';
      return canMakeToken(S, a.seat, a.cards);
    }
    case 'attack': {
      if (!myTurn(a.seat) || S.turn!.item) return '이번 턴에는 아이템을 쓸 수 없어요.';
      if (!holds(a.seat, a.card) || U(a.card) !== 'S' || !isItem(a.card)) return '♠ 아이템이 아니에요.';
      if (!Number.isInteger(a.target) || !S.seats[a.target] || a.target === a.seat) return '공격할 상대를 고르세요.';
      if (R(a.card) === 12 && !(a.arg && SUIT_SET.has(a.arg))) return '문양을 고르세요.';
      return null;
    }
    case 'heartQ': {
      if (!myTurn(a.seat) || S.turn!.item) return '이번 턴에는 아이템을 쓸 수 없어요.';
      if (!holds(a.seat, a.card) || U(a.card) !== 'H' || R(a.card) !== 12) return '♥Q가 아니에요.';
      if (a.picks.length > 2 || new Set(a.picks).size !== a.picks.length || !a.picks.every(c => S.row.includes(c) && !isItem(c))) return '버림 줄의 숫자 카드를 2장까지 고르세요.';
      return null;
    }
    case 'diamondJ': {
      if (!myTurn(a.seat) || S.turn!.item) return '이번 턴에는 아이템을 쓸 수 없어요.';
      return holds(a.seat, a.card) && U(a.card) === 'D' && R(a.card) === 11 ? null : '♦J가 아니에요.';
    }
    case 'diamondJPick': return myTurn(a.seat) && S.turn!.peek && S.turn!.peek.includes(a.card) ? null : '고를 카드가 아니에요.';
    case 'endTurn': {
      if (!myTurn(a.seat)) return '내 차례가 아니에요.';
      const t = S.turn!;
      if (!t.picked) return '줍기를 먼저 하세요.';
      // 버릴 카드가 없으면(손패를 모두 토큰에 쓰거나 빼앗김) 버리기를 건너뛴다 (사용자 2026-10-12)
      if (t.mustDiscard && S.seats[a.seat].hand.length) return '주운 뒤 1장을 버리세요.';
      if (t.peek) return '♦J로 본 카드에서 1장을 고르세요.';
      return null;
    }
    case 'trim': {
      if (!myTurn(a.seat)) return '내 차례가 아니에요.';
      const t = S.turn!;
      if (!t.picked || t.mustDiscard || t.peek) return '줍기와 ♦J 고르기를 먼저 마치세요.';
      const p = S.seats[a.seat];
      if (p.hand.length - HAND_LIMIT !== a.cards.length) return `${p.hand.length - HAND_LIMIT}장을 골라 버리세요.`;
      return a.cards.every(c => holds(a.seat, c)) && new Set(a.cards).size === a.cards.length ? null : '손패에 없는 카드예요.';
    }
    case 'trimOne': {
      if (!myTurn(a.seat)) return '내 차례가 아니에요.';
      const t = S.turn!;
      if (!t.picked || t.mustDiscard || t.peek) return '줍기와 ♦J 고르기를 먼저 마치세요.';
      if (S.seats[a.seat].hand.length <= HAND_LIMIT) return '손패가 6장을 넘지 않아요.';
      return holds(a.seat, a.card) ? null : '손패에 없는 카드예요.';
    }
    case 'reward': return S.phase === 'reward' && S.reward && S.reward.order[S.reward.pi] === a.seat && S.reward.disp.includes(a.card) ? null : '지금은 고를 수 없어요.';
    case 'holdRoll': return S.phase === 'mg' && mg?.id === 'hold' && mg.ord[mg.ci] === a.seat && (!a.item || (holds(a.seat, a.item) && isItem(a.item))) ? null : '지금은 굴릴 수 없어요.';
    case 'holdStop': return S.phase === 'mg' && mg?.id === 'hold' && mg.ord[mg.ci] === a.seat && mg.k ? null : '지금은 멈출 수 없어요.';
    case 'bombArm': return S.phase === 'mg' && mg?.id === 'bomb' && mg.alive[mg.ci] === a.seat && !mg.arm[a.seat] && holds(a.seat, a.item) && isItem(a.item) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'bombFlip': return S.phase === 'mg' && mg?.id === 'bomb' && mg.alive[mg.ci] === a.seat && !!mg.lay[a.k] ? null : '지금은 뒤집을 수 없어요.';
    case 'auctionItem': return S.phase === 'mg' && mg?.id === 'auction' && mg.step === 'pre' && holds(a.seat, a.item) && isItem(a.item) && mg.prizes.slice(mg.ai).some(Boolean) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'auctionReady': return S.phase === 'mg' && mg?.id === 'auction' && mg.step === 'pre' && !mg.ready[a.seat] ? null : '지금은 준비할 수 없어요.';
    case 'auctionBid': return S.phase === 'mg' && mg?.id === 'auction' && mg.step === 'bid' && !(a.seat in mg.bids) && mg.hands[a.seat]?.includes(a.card) ? null : '지금은 낼 수 없어요.';
    case 'balloon': return S.phase === 'mg' && mg?.id === 'balloon' && mg.alive[mg.ci] === a.seat && mg.hands[a.seat]?.includes(a.card) && (!a.item || (holds(a.seat, a.item) && isItem(a.item))) ? null : '지금은 낼 수 없어요.';
    case 'rps': return S.phase === 'mg' && mg?.id === 'rps' && mg.step === 'pick' && !mg.picks[a.seat] && (a.seat === mg.lead || mg.alive.includes(a.seat)) && ['R', 'P', 'S'].includes(a.hand) ? null : '지금은 낼 수 없어요.';
    case 'stealPick': return S.steal && a.seat === S.steal.from && Number.isInteger(a.k) && a.k >= 0 && a.k < S.seats[S.steal.to].hand.length ? null : '고를 카드가 없어요.';
    case 'rpsPass': return S.phase === 'mg' && mg?.id === 'rps' && mg.step === 'pick' && a.seat !== mg.lead && mg.alive.includes(a.seat) && !mg.picks[a.seat] && !mg.pass?.[a.seat] && holds(a.seat, a.item) && isItem(a.item) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'rpsArm': return S.phase === 'mg' && mg?.id === 'rps' && mg.step === 'pick' && a.seat === mg.lead && !mg.picks[mg.lead] && !mg.armL && holds(a.seat, a.item) && isItem(a.item) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'ovnSave': return S.phase === 'mg' && (mg?.id === 'rps' || mg?.id === 'vault') && mg.step === 'save' && mg.saveq.includes(a.seat) && (!a.item || (holds(a.seat, a.item) && isItem(a.item))) ? null : '지금은 쓸 수 없어요.';
    case 'vaultHide': return S.phase === 'mg' && mg?.id === 'vault' && mg.step === 'hide' && mg.alive.includes(a.seat) && !mg.picks[a.seat] && [1, 2, 3].includes(a.zone) ? null : '지금은 숨을 수 없어요.';
    case 'vaultArm': return S.phase === 'mg' && mg?.id === 'vault' && a.seat === mg.lead && !mg.armL && (mg.step === 'hide' || mg.step === 'guard') && holds(a.seat, a.item) && isItem(a.item) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'vaultGuard': {
      if (!(S.phase === 'mg' && mg?.id === 'vault' && mg.step === 'guard' && a.seat === mg.lead)) return '지금은 고를 수 없어요.';
      const zs = new Set(a.zones);
      return zs.size === a.zones.length && a.zones.every(z => [1, 2, 3].includes(z)) && zs.size === (mg.armL ? 2 : 1) ? null : `금고를 ${mg.armL ? 2 : 1}곳 고르세요.`;
    }
    case 'countAnswer': return S.phase === 'mg' && mg?.id === 'count' && (a.seat in mg.hits) && !(a.seat in mg.ans) && now() >= countOpenAt(mg) && Number.isInteger(a.n) && a.n >= 0 && a.n <= 6 ? null : '지금은 답할 수 없어요.';
    case 'countArm': return S.phase === 'mg' && mg?.id === 'count' && (a.seat in mg.hits) && !mg.arm[a.seat] && !(a.seat in mg.ans) && holds(a.seat, a.item) && isItem(a.item) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'raceBet': return S.phase === 'mg' && mg?.id === 'race' && mg.step === 'bet' && mg.order[mg.pi] === a.seat && SUIT_SET.has(a.suit) ? null : '지금은 고를 수 없어요.';
    case 'raceSwap': return S.phase === 'mg' && mg?.id === 'race' && mg.step === 'race' && (a.seat in mg.bet) && mg.bet[a.seat] !== a.suit && SUIT_SET.has(a.suit) && holds(a.seat, a.item) && isItem(a.item) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'raceFlip': return S.phase === 'mg' && mg?.id === 'race' && mg.step === 'race' && a.seat === S.first ? null : '지금은 뒤집을 수 없어요.';
  }
  // 2026-10-12 추가 미니게임
  if ('item' in a && !(holds(a.seat, a.item) && isItem(a.item))) return '아이템 카드가 아니에요.';
  if (S.phase !== 'mg' || !mg) return '지금은 할 수 없어요.';
  switch (a.type) {
    case 'duelHit': return mg.id === 'nunchi' && (a.seat in mg.pts) && !(a.seat in mg.res) && (a.ms == null || (Number.isFinite(a.ms) && a.ms >= 0)) ? null : '지금은 쏠 수 없어요.';
    case 'duelFake': return mg.id === 'nunchi' && !mg.fakes.includes(a.seat) && !(a.seat in mg.res) && now() <= mg.t0 + mg.lead + mg.sig - 250 ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'udGrip': return mg.id === 'updown' && mg.step === 'grip' && mg.ord.includes(a.seat) && !(a.seat in mg.grip) && Number.isInteger(a.n) && a.n >= 0 && a.n <= mg.coins ? null : '지금은 쥘 수 없어요.';
    case 'udCall': return mg.id === 'updown' && mg.step === 'call' && udCaller(mg) === a.seat && Number.isInteger(a.n) && a.n >= 0 && a.n <= mg.coins * mg.ord.length ? null : '지금은 부를 수 없어요.';
    case 'udRegrip': return mg.id === 'updown' && mg.step === 'shout' && udShouter(mg) === a.seat && !mg.regrip && Number.isInteger(a.n) && a.n >= 0 && a.n <= mg.coins ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'udShout': return mg.id === 'updown' && mg.step === 'shout' && udShouter(mg) === a.seat ? null : '지금은 외칠 수 없어요.';
    case 'curlShot': return mg.id === 'curling' && curlTurn(mg) === a.seat ? (now() < mg.until ? '말이 멈출 때까지 기다리세요.' : null) : '내 차례가 아니에요.';
    case 'curlNoWall': return mg.id === 'curling' && curlTurn(mg) === a.seat && !mg.noWall ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'linePlay': return mg.id === 'line' && mg.step === 'play' && (mg.hands[a.seat] || []).length > 0 ? null : '지금은 낼 수 없어요.';
    case 'linePeek': return mg.id === 'line' && mg.step === 'play' && (a.seat in mg.won) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'lineGo': return mg.id === 'line' && mg.step === 'pause' && mg.pause?.seat === a.seat ? null : '지금은 할 수 없어요.';
    case 'speedPlay': return mg.id === 'speed' && mg.step === 'play' && (mg.hands[a.seat] || []).includes(a.card) && !!mg.piles[a.pile] ? (speedFits(mg.piles[a.pile][mg.piles[a.pile].length - 1], a.card) ? null : '그 더미에는 낼 수 없어요.') : '지금은 낼 수 없어요.';
    case 'speedPile': return mg.id === 'speed' && mg.step === 'pre' && (mg.hands[a.seat] || []).includes(a.card) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'foldSay': return mg.id === 'fold' && mg.step === 'say' && mg.ord[mg.ci] === a.seat && typeof a.text === 'string' && a.text.trim().length > 0 ? (foldIsDup(mg, a.text) ? '이미 나온 조건이에요.' : null) : '지금은 말할 수 없어요.';
    case 'foldAnswer': return mg.id === 'fold' && mg.step === 'answer' && mg.ord.includes(a.seat) && !(a.seat in mg.ans) ? null : '지금은 답할 수 없어요.';
    case 'foldSafe': return mg.id === 'fold' && mg.step === 'answer' && mg.ord.includes(a.seat) && !(a.seat in mg.ans) && !mg.safe[a.seat] ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'chainTwo': return mg.id === 'chain' && mg.step === 'pre' && mg.ord.includes(a.seat) && !mg.two[a.seat] ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'chainAim': {
      if (!(mg.id === 'chain' && mg.step === 'point' && mg.ord.includes(a.seat) && !(a.seat in mg.aim))) return '지금은 가리킬 수 없어요.';
      const t = a.targets; const n = chainFingers(mg, a.seat);
      return Array.isArray(t) && t.length === n && new Set(t).size === t.length && t.every(x => x !== a.seat && mg.ord.includes(x)) ? null : `서로 다른 ${n}명을 고르세요.`;
    }
    case 'chainPass': return mg.id === 'chain' && mg.step === 'pass' && mg.cur === a.seat && mg.bent[a.seat]?.[a.k] === false ? null : '지금은 넘길 수 없어요.';
    case 'midCrit': return mg.id === 'mid' && mg.step === 'pre' && (a.seat in mg.hands) && mg.crit !== a.crit && ['mid', 'hi', 'lo'].includes(a.crit) ? null : '지금은 아이템을 쓸 수 없어요.';
    case 'midPick': return mg.id === 'mid' && mg.step === 'pick' && !(a.seat in mg.picks) && (mg.hands[a.seat] || []).includes(a.card) ? null : '지금은 낼 수 없어요.';
    // 2026-10-13 추가
    case 'gesture': return mg.id === 'gesture' && gestTurn(mg) === a.seat && Number.isInteger(a.g) && a.g >= 0 && a.g < GESTURES.length ? null : '내 차례가 아니에요.';
    case 'gestSkip': return mg.id === 'gesture' && gestTurn(mg) === a.seat && mg.pos === 0 && mg.seq.length > 0 ? null : '내 차례에 따라 하기 전에 써요.';
    case 'stack': return mg.id === 'stack' && mg.step === 'play' && (a.seat in mg.h) && !mg.done[a.seat] && Number.isFinite(a.h) && a.h >= 0 && a.h <= STACK_ROWS ? null : '지금은 할 수 없어요.';
    case 'stackWide': return mg.id === 'stack' && mg.step === 'pre' && (a.seat in mg.h) && !mg.wide[a.seat] ? null : '시작 전에 써요.';
    case 'chgMove': return mg.id === 'change' && mg.step === 'move' && mg.changer === a.seat && Number.isInteger(a.piece) && a.piece >= 0 && a.piece < CHG_PIECES && !mg.moved.includes(a.piece) && Number.isInteger(a.cell) && a.cell >= 0 && a.cell < 50 && !mg.pieces.includes(a.cell) ? null : '옮길 수 없어요.';
    case 'chgMore': return mg.id === 'change' && mg.step === 'move' && mg.changer === a.seat && mg.need === 2 ? null : '바꾸는 사람이 옮기는 동안에 써요.';
    case 'chgGuess': return mg.id === 'change' && mg.step === 'guess' && mg.changer !== a.seat && (a.seat in mg.pts) && !(a.seat in mg.guesses) && Array.isArray(a.pieces) && a.pieces.length === mg.need && new Set(a.pieces).size === a.pieces.length && a.pieces.every(p => Number.isInteger(p) && p >= 0 && p < CHG_PIECES) ? null : `말 ${mg.id === 'change' ? mg.need : 2}개를 고르세요.`;
    case 'caveGo': return mg.id === 'cave' && caveDecider(mg) === a.seat ? null : '내 차례가 아니에요.';
    case 'caveGuard': return mg.id === 'cave' && mg.step === 'pre' && mg.inside.includes(a.seat) ? null : '굴리기 전에, 동굴에 남은 사람이 써요.';
    case 'tenPlace': return mg.id === 'ten' && tenTurn(mg) === a.seat && (mg.hands[a.seat] || []).length > 0 && !mg.grabUntil && !!mg.slots[a.slot] && !(mg.slots.some(s => !s.length) && mg.slots[a.slot].length) ? null : '그 자리에는 놓을 수 없어요.';
    case 'tenGrab': return mg.id === 'ten' && (a.seat in mg.hands) && a.n === mg.flipN && !(a.seat in mg.grabs) && Number.isFinite(a.ms) ? null : '지금은 잡을 수 없어요.';
    case 'tenAll': return mg.id === 'ten' && tenTurn(mg) === a.seat && !mg.all ? null : '내 차례에 놓기 전에 써요.';
    case 'balSay': return mg.id === 'balance' && mg.step === 'say' && mg.ord[mg.ci] === a.seat && Array.isArray(a.opts) && a.opts.length === (mg.three ? 3 : 2) && a.opts.every(x => typeof x === 'string' && x.trim()) && new Set(a.opts.map(x => x.trim())).size === a.opts.length ? null : `서로 다른 ${mg.id === 'balance' && mg.three ? 3 : 2}가지를 적으세요.`;
    case 'balThree': return mg.id === 'balance' && mg.step === 'say' && mg.ord[mg.ci] === a.seat && !mg.three ? null : '선일 때 주제를 내기 전에 써요.';
    case 'liarBid': return mg.id === 'liar' && mg.step === 'bid' && liarTurn(mg) === a.seat && SUIT_SET.has(a.suit) && Number.isInteger(a.n) && a.n >= 1 && a.n > (mg.bid?.n || 0) ? null : (mg.id === 'liar' && mg.bid ? `${mg.bid.n + 1}장 이상으로 올려야 해요.` : '지금은 선언할 수 없어요.');
    case 'liarCall': return mg.id === 'liar' && mg.step === 'bid' && liarTurn(mg) === a.seat && !!mg.bid ? null : '지금은 외칠 수 없어요.';
    case 'liarAdd': return mg.id === 'liar' && mg.step === 'judge' && !!mg.bid && U(a.item) === mg.bid.suit && (a.seat in mg.hands) ? null : '선언한 문양의 아이템만 낼 수 있어요.';
    case 'foreAct': return mg.id === 'fore' && foreTurn(mg) === a.seat ? null : '내 차례가 아니에요.';
    case 'foreAsk': return mg.id === 'fore' && foreTurn(mg) === a.seat && !(a.seat in mg.asks) && a.to !== a.seat && (a.to in mg.fore) && Number.isInteger(a.v) && a.v >= 1 && a.v <= 13 ? null : '내 차례에 승부·포기 전에 써요.';
    case 'forkPick': return mg.id === 'fork' && mg.step === 'pick' && (a.seat in mg.won) && !(a.seat in mg.picks) && Number.isInteger(a.k) && a.k >= 0 && a.k < mg.row.length ? null : '지금은 고를 수 없어요.';
    case 'forkRev': return mg.id === 'fork' && (mg.step === 'pick' || mg.step === 'wait') && (a.seat in mg.won) && !mg.rev[a.seat] ? null : '공개 전에 써요.';
    case 'balPick': return mg.id === 'balance' && mg.step === 'pick' && (a.seat in mg.pts) && !(a.seat in mg.picks) && Number.isInteger(a.k) && a.k >= 0 && a.k < mg.opts.length ? null : '지금은 고를 수 없어요.';
    // 2026-10-14 디지털 전용
    case 'dodgeBlock': return mg.id === 'dodge' && mg.step === 'block' && dodgeAtk(mg) === a.seat ? (dodgeCanBlock(mg, a.cell) ? null : '아무도 없는 칸만 막을 수 있어요.') : '공격자가 고르기 전에 써요.';
    case 'dodgeGo': return mg.id === 'dodge' && mg.step === 'block' && dodgeAtk(mg) === a.seat ? null : '지금은 할 수 없어요.';
    case 'dodgeMove': return mg.id === 'dodge' && mg.step === 'pick' && dodgeAtk(mg) !== a.seat && (a.seat in mg.pos) && !mg.done[a.seat] ? (dodgeCanGo(mg, a.seat, a.cell) ? null : '상하좌우 한 칸 또는 제자리만, 막힌 칸은 못 가요.') : '지금은 움직일 수 없어요.';
    case 'dodgeLock': return mg.id === 'dodge' && mg.step === 'pick' && dodgeAtk(mg) !== a.seat && (a.seat in mg.pos) && !mg.done[a.seat] ? null : '지금은 확정할 수 없어요.';
    case 'dodgeShot': return mg.id === 'dodge' && mg.step === 'pick' && dodgeAtk(mg) === a.seat && !mg.shot && Number.isInteger(a.k) && a.k >= 0 && a.k < mg.dice.length ? (dodgeValid(mg.dice[a.k], a.cells) ? null : '그 눈으로는 놓을 수 없는 모양이에요.') : '지금은 떨어뜨릴 수 없어요.';
    case 'dodgePeek': return mg.id === 'dodge' && mg.step === 'pick' && !!mg.shot && dodgeAtk(mg) !== a.seat && (a.seat in mg.pos) && !mg.done[a.seat] && !mg.peek[a.seat] ? null : '공격자가 준비를 마친 뒤, 내가 확정하기 전에 써요.';  }
  return null;
}

/* ---------- 대기실 의자 ---------- */
/** 자리 k의 의자 번호 (의자 번호가 없던 예전 상태는 자리 순서대로) */
export function chairOf(S: GameState, k: number): number { return S.seats[k].chair ?? k; }
function chairFree(S: GameState, c: number): boolean {
  return Number.isInteger(c) && c >= 0 && c < MAX_SEATS && !S.seats.some((_, k) => chairOf(S, k) === c);
}
function firstFreeChair(S: GameState): number { for (let c = 0; c < MAX_SEATS; c++) if (chairFree(S, c)) return c; return 0; }
/** 자리 순서(= 차례 순서)를 의자 순서에 맞춘다. 대기실에서만 부르므로 손패·토큰은 아직 없다 */
function sortSeats(S: GameState): void {
  S.seats.forEach((p, k) => { p.chair = chairOf(S, k); });
  S.seats.sort((a, b) => a.chair! - b.chair!);
}

function resetTo(S: GameState, keepSeats: boolean): void {
  const seats = keepSeats ? S.seats.map((p, k) => ({ uid: p.uid, chair: chairOf(S, k), hand: [], tokens: [], front: [] })) : [];
  const nm = S.names; const v = S.v;
  for (const k of Object.keys(S)) delete (S as unknown as Record<string, unknown>)[k];
  Object.assign(S, newLobby());
  S.v = v; S.seats = seats; if (nm) S.names = nm;
}

function run(S: GameState, uid: string, a: Action): false | void {
  switch (a.type) {
    case 'sit':
      S.seats.push({ uid, chair: a.chair ?? firstFreeChair(S), hand: [], tokens: [], front: [] }); sortSeats(S);
      if (a.name) { S.names = S.names || {}; S.names[uid] = a.name.slice(0, 20); }
      log(S, '자리에 한 명 앉았다.'); return;
    case 'leave': S.seats.splice(a.seat, 1); return;
    case 'move': S.seats[a.seat].chair = a.chair; sortSeats(S); return;
    case 'start': startGame(S); return;
    case 'restart': if (S.solo) startSolo(S, S.solo); else startGame(S); return;
    case 'startSolo': startSolo(S, a.id); return;
    case 'toLobby': resetTo(S, true); return;
    case 'reset': resetTo(S, false); return;
    case 'roll': rollBoard(S); return;
    case 'ready':
      for (let k = 0; k < S.seats.length; k++) {
        if (S.phase !== 'clubs') break;
        if (S.seats[k].uid === uid && !(S.ready || {})[k]) readyUp(S, k);
      }
      return;
    case 'club': useClub(S, a.seat, a.card, a.arg); return;
    case 'clubPick': clubPick(S, a.k); return;
    case 'defend': defend(S, a.seat, a.card); return;
    case 'noDefend': resolveAttack(S); return;
    case 'pickDeck': return pickup(S, a.seat, false) === 'none' ? false : undefined;
    case 'pickRow': return pickup(S, a.seat, true, a.card) === 'none' ? false : undefined;
    case 'discard': pickupDiscard(S, a.seat, a.card); return;
    case 'token': makeToken(S, a.seat, a.cards, a.color); return;
    case 'attack': startAttack(S, a.seat, a.card, a.target, R(a.card) === 11 ? null : (a.arg ?? null)); return;
    case 'heartQ': useHQ(S, a.seat, a.card, a.picks); return;
    case 'diamondJ': useDJ(S, a.seat, a.card); return;
    case 'diamondJPick': pickDJ(S, a.seat, a.card); return;
    case 'endTurn':
      if (S.seats[a.seat].hand.length > HAND_LIMIT) { S.turn!.trim = true; return; }
      endTurn(S); return;
    case 'trim': {
      const p = S.seats[a.seat];
      a.cards.forEach(c => { p.hand.splice(p.hand.indexOf(c), 1); discardCard(S, a.seat, c); });
      log(S, `자리 ${a.seat + 1}: 손패 정리 ${a.cards.length}장.`); endTurn(S); return;
    }
    case 'trimOne': {
      const p = S.seats[a.seat];
      p.hand.splice(p.hand.indexOf(a.card), 1); discardCard(S, a.seat, a.card);
      log(S, `자리 ${a.seat + 1}: 손패 정리 ${cname(a.card)}.`);
      if (p.hand.length <= HAND_LIMIT) endTurn(S);
      return;
    }
    case 'reward': rewardPick(S, a.seat, a.card); return;
    case 'holdRoll': holdRoll(S, a.seat, a.item ?? null); return;
    case 'holdStop': holdStop(S, a.seat); return;
    case 'bombArm': bombArm(S, a.seat, a.item); return;
    case 'bombFlip': bombFlip(S, a.seat, a.k); return;
    case 'auctionItem': return auctionItem(S, a.seat, a.item) === 'no' ? false : undefined;
    case 'auctionReady': auctionReady(S, a.seat); return;
    case 'auctionBid': auctionBid(S, a.seat, a.card); return;
    case 'balloon': return balloonPlay(S, a.seat, a.card, a.item ?? null);
    case 'rps': return rpsPick(S, a.seat, a.hand);
    case 'rpsArm': return rpsArm(S, a.seat, a.item);
    case 'rpsPass': return rpsPass(S, a.seat, a.item);
    case 'stealPick': stealPick(S, a.seat, a.k); return;
    case 'ovnSave': return ovnSave(S, a.seat, a.item);
    case 'vaultHide': return vaultHide(S, a.seat, a.zone);
    case 'vaultArm': return vaultArm(S, a.seat, a.item);
    case 'vaultGuard': return vaultGuard(S, a.seat, a.zones);
    case 'countAnswer': return countAnswer(S, a.seat, a.n);
    case 'countArm': return countArm(S, a.seat, a.item);
    case 'raceBet': return raceBet(S, a.seat, a.suit);
    case 'raceSwap': return raceSwap(S, a.seat, a.item, a.suit);
    case 'raceFlip': return raceFlip(S, a.seat);
    case 'duelHit': return duelHit(S, a.seat, a.ms);
    case 'duelFake': return duelFake(S, a.seat, a.item);
    case 'udGrip': return udGrip(S, a.seat, a.n);
    case 'udCall': return udCall(S, a.seat, a.n);
    case 'udRegrip': return udRegrip(S, a.seat, a.item, a.n);
    case 'udShout': return udShout(S, a.seat, !!a.up);
    case 'curlShot': return curlShot(S, a.seat, a.shot);
    case 'curlNoWall': return curlNoWall(S, a.seat, a.item);
    case 'linePlay': return linePlay(S, a.seat);
    case 'linePeek': return linePeek(S, a.seat, a.item);
    case 'lineGo': return lineGo(S, a.seat);
    case 'speedPlay': return speedPlay(S, a.seat, a.card, a.pile);
    case 'speedPile': return speedPile(S, a.seat, a.item, a.card);
    case 'foldSay': { const r = foldSay(S, a.seat, a.text); return r === false || r === 'dup' ? false : undefined; }
    case 'foldAnswer': return foldAnswer(S, a.seat, !!a.yes);
    case 'foldSafe': return foldSafe(S, a.seat, a.item);
    case 'chainTwo': return chainTwo(S, a.seat, a.item);
    case 'chainAim': return chainAim(S, a.seat, a.targets);
    case 'chainPass': return chainPass(S, a.seat, a.k);
    case 'midCrit': return midCrit(S, a.seat, a.item, a.crit);
    case 'midPick': return midPick(S, a.seat, a.card);
    case 'gesture': return gesture(S, a.seat, a.g);
    case 'gestSkip': return gestSkip(S, a.seat, a.item);
    case 'stack': return stackReport(S, a.seat, a.h, a.ms ?? null, !!a.done, a.cols);
    case 'stackWide': return stackWide(S, a.seat, a.item);
    case 'chgMove': return changeMove(S, a.seat, a.piece, a.cell);
    case 'chgMore': return changeMore(S, a.seat, a.item);
    case 'chgGuess': return changeGuess(S, a.seat, a.pieces);
    case 'caveGo': return caveGo(S, a.seat, !!a.stay);
    case 'caveGuard': return caveGuard(S, a.seat, a.item);
    case 'tenPlace': return tenPlace(S, a.seat, a.slot);
    case 'tenGrab': return tenGrab(S, a.seat, a.n, a.ms);
    case 'tenAll': return tenAll(S, a.seat, a.item);
    case 'balSay': return balanceSay(S, a.seat, a.opts);
    case 'balThree': return balanceThree(S, a.seat, a.item);
    case 'balPick': return balancePick(S, a.seat, a.k);
    case 'liarBid': return liarBid(S, a.seat, a.suit, a.n);
    case 'liarCall': return liarCall(S, a.seat);
    case 'liarAdd': return liarAdd(S, a.seat, a.item);
    case 'foreAct': return foreAct(S, a.seat, !!a.go);
    case 'foreAsk': return foreAsk(S, a.seat, a.item, a.to, a.v);
    case 'forkPick': return forkPick(S, a.seat, a.k);
    case 'forkRev': return forkRev(S, a.seat, a.item);
    case 'dodgeBlock': return dodgeBlock(S, a.seat, a.item, a.cell);
    case 'dodgeGo': return dodgeGo(S, a.seat);
    case 'dodgeMove': return dodgeMove(S, a.seat, a.cell);
    case 'dodgeLock': return dodgeLock(S, a.seat);
    case 'dodgeShot': return dodgeShot(S, a.seat, a.k, a.cells);
    case 'dodgePeek': return dodgePeek(S, a.seat, a.item);  }
}
