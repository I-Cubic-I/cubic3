/* 행동 판정: 플레이어가 보낸 행동이 지금 가능한지 확인하고 상태에 적용한다.
   방장(P2P) 또는 서버가 이 함수 하나로 판정한다. 화면은 같은 함수로 미리 가능 여부를 볼 수 있다. */
import { R, U, isItem, now } from './cards';
import {
  canMakeToken, defend, discardCard, endTurn, log, makeToken, newLobby, pickDJ, pickup, pickupDiscard,
  readyUp, resolveAttack, rewardPick, rollBoard, startAttack, startGame, useClub, useDJ, useHQ,
} from './core';
import {
  auctionBid, auctionItem, auctionReady, balloonPlay, bombArm, bombFlip, countAnswer, countArm, countOpenAt, holdRoll, holdStop,
  ovnSave, raceBet, raceFlip, raceSwap, rpsArm, rpsPick, vaultArm, vaultGuard, vaultHide,
} from './minigames';
import type { Card, GameState, Hand, Suit } from './types';

export const MAX_SEATS = 5;
export const HAND_LIMIT = 6;

export type Action =
  | { type: 'sit'; name?: string }
  | { type: 'leave'; seat: number }
  | { type: 'start' }
  | { type: 'restart' }
  | { type: 'toLobby' }
  | { type: 'reset' }
  | { type: 'roll'; seat: number }
  | { type: 'ready' }
  | { type: 'club'; seat: number; card: Card; arg?: number }
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
  | { type: 'ovnSave'; seat: number; item: Card | null }
  | { type: 'vaultHide'; seat: number; zone: number }
  | { type: 'vaultArm'; seat: number; item: Card }
  | { type: 'vaultGuard'; seat: number; zones: number[] }
  | { type: 'countAnswer'; seat: number; n: number }
  | { type: 'countArm'; seat: number; item: Card }
  | { type: 'raceBet'; seat: number; suit: Suit }
  | { type: 'raceSwap'; seat: number; item: Card; suit: Suit }
  | { type: 'raceFlip'; seat: number };

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
  switch (a.type) {
    case 'sit': return S.phase !== 'lobby' ? '게임 중이에요.' : S.seats.length >= MAX_SEATS ? '자리가 다 찼어요.' : null;
    case 'leave': return S.phase !== 'lobby' ? '게임 중이에요.' : null;
    case 'start': return S.phase !== 'lobby' ? '이미 시작했어요.' : S.seats.length < 2 ? '2명 이상 앉아야 해요.' : null;
    case 'restart': return S.phase !== 'ended' ? '게임이 끝나지 않았어요.' : null;
    case 'toLobby': case 'reset': return S.seats.some(p => p.uid === uid) || S.phase === 'lobby' ? null : '자리에 앉은 사람만 할 수 있어요.';
    case 'roll': return S.phase === 'roll' && S.first === a.seat ? null : '선 플레이어가 굴릴 차례가 아니에요.';
    case 'ready': return S.phase !== 'clubs' ? '규칙 설명 시간이 아니에요.' : S.seats.some((p, k) => p.uid === uid && !(S.ready || {})[k]) ? null : '이미 준비했어요.';
    case 'club': {
      if (S.phase !== 'clubs') return '규칙 설명 시간에만 쓸 수 있어요.';
      if (!holds(a.seat, a.card) || U(a.card) !== 'C' || !isItem(a.card)) return '♣ 아이템이 아니에요.';
      if (S.seats[a.seat].front.length) return '이번 라운드에 아이템을 써서 ♣를 쓸 수 없어요.';
      const r = R(a.card);
      if (r === 12 && a.arg !== 1 && a.arg !== -1) return '♣Q는 +1 또는 -1을 고르세요.';
      if (r === 13 && !(Number.isInteger(a.arg) && a.arg! >= 1 && a.arg! <= 6)) return '♣K는 1~6번 칸을 고르세요.';
      return null;
    }
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
      // [임시] 버릴 카드가 없으면(손패를 모두 토큰에 쓰거나 빼앗김) 버리기를 건너뛴다 — 규칙 미정
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
}

function resetTo(S: GameState, keepSeats: boolean): void {
  const seats = keepSeats ? S.seats.map(p => ({ uid: p.uid, hand: [], tokens: [], front: [] })) : [];
  const nm = S.names; const v = S.v;
  for (const k of Object.keys(S)) delete (S as unknown as Record<string, unknown>)[k];
  Object.assign(S, newLobby());
  S.v = v; S.seats = seats; if (nm) S.names = nm;
}

function run(S: GameState, uid: string, a: Action): false | void {
  switch (a.type) {
    case 'sit':
      S.seats.push({ uid, hand: [], tokens: [], front: [] });
      if (a.name) { S.names = S.names || {}; S.names[uid] = a.name.slice(0, 20); }
      log(S, '자리에 한 명 앉았다.'); return;
    case 'leave': S.seats.splice(a.seat, 1); return;
    case 'start': case 'restart': startGame(S); return;
    case 'toLobby': resetTo(S, true); return;
    case 'reset': resetTo(S, false); return;
    case 'roll': rollBoard(S); return;
    case 'ready':
      for (let k = 0; k < S.seats.length; k++) {
        if (S.phase !== 'clubs') break;
        if (S.seats[k].uid === uid && !(S.ready || {})[k]) readyUp(S, k);
      }
      return;
    case 'club': useClub(S, a.seat, a.card, a.arg ?? 0); return;
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
    case 'ovnSave': return ovnSave(S, a.seat, a.item);
    case 'vaultHide': return vaultHide(S, a.seat, a.zone);
    case 'vaultArm': return vaultArm(S, a.seat, a.item);
    case 'vaultGuard': return vaultGuard(S, a.seat, a.zones);
    case 'countAnswer': return countAnswer(S, a.seat, a.n);
    case 'countArm': return countArm(S, a.seat, a.item);
    case 'raceBet': return raceBet(S, a.seat, a.suit);
    case 'raceSwap': return raceSwap(S, a.seat, a.item, a.suit);
    case 'raceFlip': return raceFlip(S, a.seat);
  }
}
