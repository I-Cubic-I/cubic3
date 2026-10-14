/* 미니게임 아이템 공통(사용자 2026-10-14): 위로 끌어 올려 쓰면 모두에게 컷신(효과 문구).
   대상이 필요한 아이템은 먼저 쓰고(선언·컷신) 10초 안에 대상을 고른다. 시간이 지나면 고를 수 있는 대상 중 무작위.
   쓴 사람은 대상을 고르기 전까지 그 미니게임의 다른 행동을 못 한다(다른 사람은 그대로 진행) */
import { SUITS, isItem, now, rnd } from './cards';
import { fx } from './core';
import { dodgeAtk, dodgeCanBlock, DODGE_ITEM_MS } from './minigames4';
import { udShouter } from './minigames2';
import { foreTurn } from './minigames3';
import type { Card, GameState, MgId, MidCrit } from './types';
import type { Action } from './actions';

/** 대상을 고를 시간 */
export const MG_ITEM_MS = 10000;

/** 컷신에 띄울 효과 문구(짧게) */
export function itemEff(S: GameState, i: number): string {
  const m = S.mg as unknown as Record<string, unknown> & { id: MgId }; if (!m) return '';
  switch (m.id) {
    case 'hold': return '두 번 굴려 높은 쪽';
    case 'bomb': return '내 카드는 3을 뺀 숫자';
    case 'auction': return '다음 상품도 함께 걸기';
    case 'balloon': return '이번 카드는 합에서 빼기';
    case 'rps': return m.lead === i ? '비긴 사람도 탈락' : '선을 이기면 바로 통과';
    case 'vault': return m.lead === i ? '금고 2곳 고르기' : '잡혀도 빠지지 않기';
    case 'count': return '1 차이도 정답';
    case 'race': return '고른 문양 바꾸기';
    case 'updown': return '동전 다시 쥐기';
    case 'curling': return '박스를 치우고 튕기기';
    case 'line': return '잠깐! 손패 엿보기';
    case 'speed': return '내 손패로 새 더미';
    case 'fold': return '이번엔 접지 않기';
    case 'chain': return '나만 손가락 2개';
    case 'mid': return '이번 판 기준 정하기';
    case 'gesture': return '이번 차례 건너뛰기';
    case 'stack': return '두 손으로 들기';
    case 'change': return '말 3개 옮기기';
    case 'cave': return '1 하나 빼지 않기';
    case 'ten': return '세 자리 더미 모두 가져가기';
    case 'balance': return '세 가지 중 고르기 · 3점';
    case 'liar': return '아이템도 그 문양 1장';
    case 'fore': return '1명에게 물어보기';
    case 'fork': return '겹치면 나 혼자';
    case 'dodge': return dodgeAtk(S.mg as never) === i ? '칸 봉쇄' : '엿보기';
    default: return '';
  }
}

interface Target {
  /** 대상을 고르는 행동 */
  types: Action['type'][];
  /** 지금 쓸 수 있는지 */
  can: (S: GameState, i: number) => boolean;
  /** 시간이 지났을 때 무작위 대상 */
  random: (S: GameState, i: number, item: Card) => Action | null;
  /** 쓰는 순간 덧붙는 효과(예: 시간 늘리기) */
  onUse?: (S: GameState, i: number) => void;
}
const pickOne = <T>(a: T[]): T | null => (a.length ? a[rnd(a.length)] : null);
type AnyMg = Record<string, never> & { [k: string]: never };
const mgOf = (S: GameState) => S.mg as unknown as AnyMg;

const TARGET: Partial<Record<MgId, Target>> = {
  balloon: {
    types: ['balloon'],
    can: (S, i) => { const m = mgOf(S) as unknown as { alive: number[]; ci: number; hands: Record<number, Card[]> }; return m.alive[m.ci] === i && !!m.hands[i]?.length; },
    random: (S, i, item) => { const m = S.mg as unknown as { hands: Record<number, Card[]> }; const c = pickOne(m.hands[i] || []); return c ? { type: 'balloon', seat: i, card: c, item } : null; },
  },
  race: {
    types: ['raceSwap'],
    can: (S, i) => { const m = S.mg as unknown as { step: string; bet: Record<number, string> }; return m.step === 'race' && i in m.bet; },
    random: (S, i, item) => { const m = S.mg as unknown as { bet: Record<number, string> }; const s = pickOne(SUITS.filter(x => x !== m.bet[i])); return s ? { type: 'raceSwap', seat: i, item, suit: s } : null; },
  },
  updown: {
    types: ['udRegrip'],
    can: (S, i) => { const m = S.mg as never as Parameters<typeof udShouter>[0] & { step: string; regrip: boolean }; return m.step === 'shout' && udShouter(m) === i && !m.regrip; },
    random: (S, i, item) => { const m = S.mg as unknown as { coins: number }; return { type: 'udRegrip', seat: i, item, n: rnd(m.coins + 1) }; },
  },
  speed: {
    types: ['speedPile'],
    can: (S, i) => { const m = S.mg as unknown as { step: string; hands: Record<number, Card[]> }; return m.step === 'pre' && !!m.hands[i]?.length; },
    random: (S, i, item) => { const m = S.mg as unknown as { hands: Record<number, Card[]> }; const c = pickOne(m.hands[i] || []); return c ? { type: 'speedPile', seat: i, item, card: c } : null; },
  },
  mid: {
    types: ['midCrit'],
    can: (S, i) => { const m = S.mg as unknown as { step: string; hands: Record<number, Card[]> }; return m.step === 'pre' && i in m.hands; },
    random: (S, i, item) => { const m = S.mg as unknown as { crit: MidCrit }; const c = pickOne((['mid', 'hi', 'lo'] as MidCrit[]).filter(x => x !== m.crit)); return c ? { type: 'midCrit', seat: i, item, crit: c } : null; },
  },
  fore: {
    types: ['foreAsk'],
    can: (S, i) => { const m = S.mg as never as Parameters<typeof foreTurn>[0] & { asks: Record<number, unknown> }; return foreTurn(m) === i && !(i in m.asks); },
    random: (S, i, item) => { const m = S.mg as unknown as { fore: Record<number, Card> }; const to = pickOne(Object.keys(m.fore).map(Number).filter(j => j !== i)); return to == null ? null : { type: 'foreAsk', seat: i, item, to, v: 1 + rnd(13) }; },
  },
  dodge: {
    types: ['dodgeBlock'],
    can: (S, i) => { const m = S.mg as never as Parameters<typeof dodgeAtk>[0]; return m.step === 'pick' && !m.shot && dodgeAtk(m) === i && [...Array(9).keys()].some(c => dodgeCanBlock(m, c)); },
    random: (S, i, item) => { const m = S.mg as never as Parameters<typeof dodgeAtk>[0]; const c = pickOne([...Array(9).keys()].filter(x => dodgeCanBlock(m, x))); return c == null ? null : { type: 'dodgeBlock', seat: i, item, cell: c }; },
    // 쓰는 순간 남은 시간을 모두 늘린다(대상 고를 시간)
    onUse: S => { const m = S.mg as unknown as { until: number; dUntil: number }; m.until += DODGE_ITEM_MS; m.dUntil += DODGE_ITEM_MS; },
  },
};

/** 대상이 필요한 아이템인지(이 미니게임에서 이 사람에게) */
export function itemNeedsTarget(S: GameState, i: number): boolean {
  const t = S.mg && TARGET[S.mg.id]; return !!t && t.can(S, i);
}
/** 대상 고르기를 기다리는 아이템 */
export const pendingItem = (S: GameState, i: number) => (S.mgItems || {})[i] ?? null;

/** 판정: 대상이 필요한 아이템 쓰기 */
export function checkDeclare(S: GameState, i: number, item: Card): string | null {
  if (S.phase !== 'mg' || !S.mg) return '미니게임 중에만 쓸 수 있어요.';
  if (!S.seats[i].hand.includes(item) || !isItem(item)) return '아이템 카드가 아니에요.';
  if (pendingItem(S, i)) return '먼저 아이템 대상을 고르세요.';
  return itemNeedsTarget(S, i) ? null : '지금은 이 아이템을 쓸 수 없어요.';
}
export function declareItem(S: GameState, i: number, item: Card): void {
  (S.mgItems ||= {})[i] = { card: item, until: now() + MG_ITEM_MS };
  fx(S, { t: 'item', card: item, seats: [i], eff: itemEff(S, i) });
  TARGET[S.mg!.id]?.onUse?.(S, i);
}
/** 대상을 고르는 동안 그 사람의 다른 미니게임 행동을 막는다 */
export function blockedByPending(S: GameState, a: Action): string | null {
  if (S.phase !== 'mg' || !S.mg || !('seat' in a) || !pendingItem(S, a.seat)) return null;
  const t = TARGET[S.mg.id];
  return t && (t.types as string[]).includes(a.type) ? null : '먼저 아이템 대상을 고르세요.';
}
/** 행동 뒤: 새로 쓴 아이템에 컷신(아직 없으면), 대상을 고른 아이템은 대기에서 뺀다 */
export function afterItemAction(S: GameState, front0: number[] | null, fx0: number): void {
  if (!front0) return;
  const p = S.mgItems || {};
  S.seats.forEach((st, j) => {
    if (st.front.length <= (front0[j] ?? 0)) return;
    const c = st.front[st.front.length - 1]; if (!c || !isItem(c)) return;
    if (p[j]?.card === c) { delete p[j]; return; }                        // 쓸 때 이미 컷신
    if ((S.fx || []).some(f => f.id > fx0 && f.t === 'item' && (f.seats as number[] | undefined)?.includes(j))) return;
    fx(S, { t: 'item', card: c, seats: [j], eff: itemEff(S, j) });
  });
  // 손에서 사라진(다른 이유로 쓰인) 대기 카드도 정리
  for (const k in p) if (!S.seats[+k]?.hand.includes(p[k].card)) delete p[+k];
}
/** 시간이 지난 대기 아이템: 무작위 대상으로. 적용은 apply(행동 판정·실행)로 */
export function timeoutItems(S: GameState, apply: (uid: string, a: Action) => boolean): boolean {
  const p = S.mgItems; if (!p) return false;
  if (S.phase !== 'mg' || !S.mg) { S.mgItems = null; return true; }
  const t = now(); let any = false;
  for (const k in p) {
    const i = +k, it = p[k]; if (t < it.until) continue;
    any = true; delete p[i];
    const tg = TARGET[S.mg.id]; const a = tg && tg.can(S, i) ? tg.random(S, i, it.card) : null;
    // 대상을 고를 수 없게 됐으면 아이템만 쓴 것으로
    if (!a || !apply(S.seats[i].uid, a)) { const h = S.seats[i].hand; const x = h.indexOf(it.card); if (x >= 0) { h.splice(x, 1); S.seats[i].front.push(it.card); } }
  }
  return any;
}
