/* applyAction 시험: 판정이 허용한 행동만 실행해 무작위 대국을 끝까지 돌리고, 카드가 사라지거나 생기지 않는지 본다. */
import { describe, expect, it } from 'vitest';
import {
  type Action, type Card, type GameState, applyAction, canAct, countOpenAt, isItem, newLobby, setClock, setRng,
} from '../src/index';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 테이블 위 모든 카드 */
function allCards(S: GameState): Card[] {
  const out: Card[] = [...S.deck, ...S.row, ...S.qPile, ...S.kPile];
  S.seats.forEach(p => out.push(...p.hand, ...p.front));
  if (S.turn?.peek) out.push(...S.turn.peek);
  if (S.reward) out.push(...S.reward.disp);
  if (S.rewardDisp) out.push(...S.rewardDisp);
  const m = S.mg as unknown as Record<string, unknown> | null;
  if (m) {
    const arr = (x: unknown) => (Array.isArray(x) ? x : []) as unknown[];
    out.push(...(arr(m.bundle) as Card[]), ...(arr(m.lay).filter(Boolean) as Card[]), ...(arr(m.spent) as Card[]), ...(arr(m.pile) as Card[]), ...(arr(m.seq) as Card[]));
    if (m.dec) out.push(m.dec as Card);
    if (m.bids) out.push(...Object.values(m.bids as Record<string, Card>));
    for (const k of ['hands', 'won']) if (m[k]) Object.values(m[k] as Record<string, Card[]>).forEach(h => out.push(...h));
    if (m.flip) Object.values(m.flip as Record<string, { c: Card }>).forEach(f => out.push(f.c));
    arr(m.prizes).forEach(p => p && out.push((p as { c: Card }).c));
    arr(m.pot).forEach(p => out.push((p as { c: Card }).c));
  }
  return out;
}

/** 지금 상태에서 시도해 볼 행동 후보 (판정이 걸러 낸다) */
function candidates(S: GameState, seat: number): Action[] {
  const p = S.seats[seat]; const hand = p.hand; const its = hand.filter(isItem);
  const c: Action[] = [
    { type: 'roll', seat }, { type: 'ready' }, { type: 'noDefend', seat }, { type: 'pickDeck', seat }, { type: 'endTurn', seat },
    { type: 'holdStop', seat }, { type: 'auctionReady', seat }, { type: 'raceFlip', seat },
  ];
  for (const card of hand) {
    c.push({ type: 'discard', seat, card }, { type: 'club', seat, card, arg: 1 }, { type: 'club', seat, card, arg: -1 }, { type: 'club', seat, card, arg: 3 },
      { type: 'defend', seat, card }, { type: 'diamondJ', seat, card }, { type: 'heartQ', seat, card, picks: S.row.filter(x => !isItem(x)).slice(-2) });
    for (let t = 0; t < S.seats.length; t++) c.push({ type: 'attack', seat, card, target: t, arg: 'S' }, { type: 'attack', seat, card, target: t, arg: 'H' });
  }
  for (const card of S.row) c.push({ type: 'pickRow', seat, card });
  for (const card of S.turn?.peek || []) c.push({ type: 'diamondJPick', seat, card });
  for (const card of S.reward?.disp || []) c.push({ type: 'reward', seat, card });
  for (const su of ['S', 'H', 'D', 'C'] as const) {
    const nums = hand.filter(x => x[0] === su && !isItem(x));
    for (const n of [3, 4, 5]) {
      c.push({ type: 'token', seat, cards: nums.slice(0, n) });
      for (const it of its) for (const col of ['S', 'H', 'D', 'C'] as const) c.push({ type: 'token', seat, cards: [...nums.slice(0, n), it], color: col });
    }
  }
  if (hand.length > 6) c.push({ type: 'trim', seat, cards: hand.slice(0, hand.length - 6) }, { type: 'trimOne', seat, card: hand[0] });
  const m = S.mg;
  for (const it of [...its, null]) {
    c.push({ type: 'holdRoll', seat, item: it }, { type: 'ovnSave', seat, item: it });
    if (it) c.push({ type: 'bombArm', seat, item: it }, { type: 'auctionItem', seat, item: it }, { type: 'rpsArm', seat, item: it }, { type: 'vaultArm', seat, item: it }, { type: 'countArm', seat, item: it }, { type: 'raceSwap', seat, item: it, suit: 'H' });
  }
  if (m?.id === 'bomb') m.lay.forEach((_, k) => c.push({ type: 'bombFlip', seat, k }));
  if (m?.id === 'auction') (m.hands[seat] || []).forEach(card => c.push({ type: 'auctionBid', seat, card }));
  if (m?.id === 'balloon') (m.hands[seat] || []).forEach(card => { c.push({ type: 'balloon', seat, card }); its.forEach(it => c.push({ type: 'balloon', seat, card, item: it })); });
  for (const hnd of ['R', 'P', 'S'] as const) c.push({ type: 'rps', seat, hand: hnd });
  for (const z of [1, 2, 3]) c.push({ type: 'vaultHide', seat, zone: z }, { type: 'vaultGuard', seat, zones: [z] }, { type: 'vaultGuard', seat, zones: [z, (z % 3) + 1] });
  for (let n = 0; n <= 6; n++) c.push({ type: 'countAnswer', seat, n });
  for (const su of ['S', 'H', 'D', 'C'] as const) c.push({ type: 'raceBet', seat, suit: su });
  return c;
}

function play(n: number, seed: number) {
  let T = 1_000_000; setClock(() => T); setRng(mulberry32(seed));
  const pick = mulberry32(seed + 77);
  const S = newLobby();
  for (let k = 0; k < n; k++) expect(applyAction(S, 'u' + k, { type: 'sit', name: 'P' + k })).toEqual({ ok: true });
  expect(applyAction(S, 'u0', { type: 'start' }).ok).toBe(true);
  const total = allCards(S).length;
  expect(total).toBe(52 * S.decks);
  let steps = 0;
  for (; steps < 6000 && S.phase !== 'ended'; steps++) {
    if (S.mg?.id === 'count') T = Math.max(T, countOpenAt(S.mg) + 1);
    if (S.phase === 'defense' && pick() < 0.3) T = S.pending!.deadline + 1;
    const opts: [string, Action][] = [];
    for (let k = 0; k < n; k++) for (const a of candidates(S, k)) if (!canAct(S, 'u' + k, a)) opts.push(['u' + k, a]);
    if (!opts.length) throw new Error(`할 수 있는 행동이 없음: ${S.phase} ${S.mg?.id ?? ''} (seed ${seed}) ${JSON.stringify({ turn: S.turn, deck: S.deck.length, row: S.row, hands: S.seats.map(p => p.hand), front: S.seats.map(p => p.front) })}`);
    // 줍기·턴 넘기기가 너무 자주 뽑히지 않게 토큰·종료를 우선
    const pref = opts.filter(([, a]) => a.type === 'token' || a.type === 'trim');
    const [uid, a] = pref.length && pick() < 0.9 ? pref[Math.floor(pick() * pref.length)] : opts[Math.floor(pick() * opts.length)];
    const r = applyAction(S, uid, a);
    if (!r.ok) throw new Error(`판정은 허용했는데 실패: ${JSON.stringify(a)} ${r.error}`);
    const now_ = allCards(S).length;
    if (now_ !== total) throw new Error(`카드 수 ${total} → ${now_}: ${JSON.stringify(a)} / ${S.phase} ${S.mg?.id ?? ''} (seed ${seed}, step ${steps})`);
  }
  return { ended: S.phase === 'ended', steps };
}

describe('applyAction', () => {
  it('남의 자리·잘못된 단계 행동은 거절하고 상태를 바꾸지 않는다', () => {
    setRng(mulberry32(1));
    const S = newLobby();
    applyAction(S, 'a', { type: 'sit' }); applyAction(S, 'b', { type: 'sit' });
    expect(applyAction(S, 'a', { type: 'leave', seat: 1 }).ok).toBe(false);
    expect(applyAction(S, 'a', { type: 'pickDeck', seat: 0 }).ok).toBe(false);
    applyAction(S, 'a', { type: 'start' });
    const seat = S.turn!.seat; const other = 1 - seat; const uidOther = S.seats[other].uid;
    const before = JSON.stringify(S);
    expect(applyAction(S, uidOther, { type: 'pickDeck', seat }).ok).toBe(false);
    expect(applyAction(S, uidOther, { type: 'pickDeck', seat: other }).ok).toBe(false);
    expect(applyAction(S, S.seats[seat].uid, { type: 'endTurn', seat }).ok).toBe(false);
    expect(JSON.stringify(S)).toBe(before);
    expect(applyAction(S, S.seats[seat].uid, { type: 'pickDeck', seat }).ok).toBe(true);
  });

  it('판정이 허용한 행동만으로 2~5인 대국이 오류 없이 끝나고 카드 수가 보존된다', () => {
    let ended = 0;
    for (let g = 0; g < 80; g++) if (play(2 + (g % 4), 500 + g).ended) ended++;
    expect(ended).toBeGreaterThan(60);
  }, 300_000);
});
