/* applyAction 시험: 판정이 허용한 행동만 실행해 무작위 대국을 끝까지 돌리고, 카드가 사라지거나 생기지 않는지 본다. */
import { describe, expect, it } from 'vitest';
import {
  type Action, type Card, type CountMg, type DodgeMg, type GameState, type HoldMg, type MgId, DODGE_SHAPES, DODGE_SHOW, MG, R, U, advanceTimers, endTurn, applyAction, canAct, countOpenAt, countStart, isItem, rpsAfterShow, startMinigame, newLobby, setClock, setRng,
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
    out.push(...(arr(m.bundle) as Card[]), ...(arr(m.lay).filter(Boolean) as Card[]), ...(arr(m.spent) as Card[]), ...(arr(m.pile) as Card[]), ...(m.id === 'count' ? arr(m.seq) as Card[] : []));
    if (m.dec) out.push(m.dec as Card);
    if (m.bids) out.push(...Object.values(m.bids as Record<string, Card>));
    for (const k of ['hands', 'won']) if (m[k]) Object.values(m[k] as Record<string, Card[]>).forEach(h => out.push(...h));
    if (m.piles) (m.piles as Card[][]).forEach(p => out.push(...p));
    if (m.slots) (m.slots as Card[][]).forEach(p => out.push(...p));
    if (m.id === 'fore') out.push(...Object.values(m.fore as Record<string, Card>));
    if (m.id === 'fork') out.push(...(m.row as Card[]));
    if (m.deckCard) out.push(m.deckCard as Card);
    if (m.id === 'mid') out.push(...Object.values(m.picks as Record<string, Card>));
    if (m.flip) Object.values(m.flip as Record<string, { c: Card }>).forEach(f => out.push(f.c));
    arr(m.prizes).forEach(p => p && out.push((p as { c: Card }).c));
    arr(m.pot).forEach(p => out.push((p as { c: Card }).c));
  }
  return out;
}

let rng: () => number = Math.random;
/** 지금 상태에서 시도해 볼 행동 후보 (판정이 걸러 낸다) */
function candidates(S: GameState, seat: number): Action[] {
  const p = S.seats[seat]; const hand = p.hand; const its = hand.filter(isItem);
  const c: Action[] = [
    { type: 'roll', seat }, { type: 'ready' }, { type: 'noDefend', seat }, { type: 'pickDeck', seat }, { type: 'endTurn', seat },
    { type: 'holdStop', seat }, { type: 'auctionReady', seat }, { type: 'raceFlip', seat },
    ...its.map(item => ({ type: 'mgItemDeclare', seat, item }) as Action),
  ];
  for (const card of hand) {
    c.push({ type: 'discard', seat, card }, { type: 'club', seat, card, arg: 1 }, { type: 'club', seat, card, arg: -1 }, { type: 'club', seat, card, arg: 3 },
      { type: 'defend', seat, card }, { type: 'diamondJ', seat, card }, { type: 'heartQ', seat, card, picks: S.row.filter(x => !isItem(x)).slice(-2) });
    for (let t = 0; t < S.seats.length; t++) c.push({ type: 'attack', seat, card, target: t, arg: 'S' }, { type: 'attack', seat, card, target: t, arg: 'H' });
  }
  for (const card of S.row) c.push({ type: 'pickRow', seat, card });
  if (S.steal) S.seats[S.steal.to].hand.forEach((_, k) => c.push({ type: 'stealPick', seat, k }));
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
  // 2026-10-12 추가 미니게임
  c.push({ type: 'duelHit', seat, ms: rng() < .2 ? null : Math.floor(rng() * 600) });
  for (let n = 0; n <= 3; n++) c.push({ type: 'udGrip', seat, n });
  for (let n = 0; n <= 15; n++) c.push({ type: 'udCall', seat, n });
  c.push({ type: 'udShout', seat, up: true }, { type: 'udShout', seat, up: false });
  c.push({ type: 'curlShot', seat, shot: { x: rng() * 16 - 8, angle: rng() * 1.6 - .8, power: rng() } });
  c.push({ type: 'linePlay', seat }, { type: 'lineGo', seat });
  if (m?.id === 'speed') (m.hands[seat] || []).forEach(card => m.piles.forEach((_, k) => c.push({ type: 'speedPlay', seat, card, pile: k })));
  c.push({ type: 'foldSay', seat, text: '조건 ' + Math.floor(rng() * 1e6) }, { type: 'foldAnswer', seat, yes: rng() < .5 });
  for (let a = 0; a < S.seats.length; a++) { c.push({ type: 'chainAim', seat, targets: [a] }); for (let b = 0; b < S.seats.length; b++) c.push({ type: 'chainAim', seat, targets: [a, b] }); }
  c.push({ type: 'chainPass', seat, k: 0 }, { type: 'chainPass', seat, k: 1 });
  if (m?.id === 'mid') (m.hands[seat] || []).forEach(card => c.push({ type: 'midPick', seat, card }));
  // 2026-10-13 추가
  if (m?.id === 'gesture') { const want = m.pos < m.seq.length && rng() < .9 ? m.seq[m.pos] : Math.floor(rng() * 8); c.push({ type: 'gesture', seat, g: want }); }
  if (m?.id === 'stack') c.push({ type: 'stack', seat, h: Math.min(8, (m.h[seat] || 0) + 1), ms: 5000 + Math.floor(rng() * 20000), done: rng() < .1 });
  if (m?.id === 'change') { for (let p = 0; p < 8; p++) c.push({ type: 'chgMove', seat, piece: p, cell: Math.floor(rng() * 50) }); c.push({ type: 'chgGuess', seat, pieces: [0, 1, 2].slice(0, m.need) }, { type: 'chgGuess', seat, pieces: [3, 5, 7].slice(0, m.need) }); }
  c.push({ type: 'caveGo', seat, stay: rng() < .7 });
  if (m?.id === 'ten') { for (let k = 0; k < 3; k++) c.push({ type: 'tenPlace', seat, slot: k }); c.push({ type: 'tenGrab', seat, n: m.flipN, ms: Math.floor(rng() * 500) }); }
  if (m?.id === 'balance') { c.push({ type: 'balSay', seat, opts: m.three ? ['가', '나', '다'] : ['가', '나'] }); for (let k = 0; k < 3; k++) c.push({ type: 'balPick', seat, k }); }
  if (m?.id === 'liar') { const n = (m.bid?.n || 0) + 1 + Math.floor(rng() * 2); for (const su of ['S', 'H', 'D', 'C'] as const) c.push({ type: 'liarBid', seat, suit: su, n }); c.push({ type: 'liarCall', seat }); }
  c.push({ type: 'foreAct', seat, go: rng() < .6 });
  if (m?.id === 'fork') for (let k = 0; k < m.row.length; k++) c.push({ type: 'forkPick', seat, k });
  // 2026-10-14 디지털 전용
  if (m?.id === 'dodge') {
    for (let x = 0; x < 9; x++) c.push({ type: 'dodgeMove', seat, cell: x });
    c.push({ type: 'dodgeLock', seat });
    m.dice.forEach((d, k) => { const all = DODGE_SHAPES[d].flat(); c.push({ type: 'dodgeShot', seat, k, cells: all[Math.floor(rng() * all.length)] }, { type: 'dodgeShot', seat, k, cells: [0, 1, 2, 3, 4, 5, 6, 7] }); });
    for (const it of its) { c.push({ type: 'dodgeBlock', seat, item: it, cell: Math.floor(rng() * 9) }, { type: 'dodgePeek', seat, item: it }); }
  }  for (const it of its) {
    c.push({ type: 'liarAdd', seat, item: it }, { type: 'forkRev', seat, item: it });
    for (let t = 0; t < S.seats.length; t++) c.push({ type: 'foreAsk', seat, item: it, to: t, v: 1 + Math.floor(rng() * 13) });
    c.push({ type: 'gestSkip', seat, item: it }, { type: 'stackWide', seat, item: it }, { type: 'chgMore', seat, item: it }, { type: 'caveGuard', seat, item: it }, { type: 'tenAll', seat, item: it }, { type: 'balThree', seat, item: it });
    c.push({ type: 'duelFake', seat, item: it }, { type: 'udRegrip', seat, item: it, n: Math.floor(rng() * 4) }, { type: 'curlNoWall', seat, item: it },
      { type: 'linePeek', seat, item: it }, { type: 'foldSafe', seat, item: it }, { type: 'chainTwo', seat, item: it },
      { type: 'midCrit', seat, item: it, crit: 'hi' }, { type: 'midCrit', seat, item: it, crit: 'lo' }, { type: 'midCrit', seat, item: it, crit: 'mid' });
    if (m?.id === 'speed') (m.hands[seat] || []).forEach(card => c.push({ type: 'speedPile', seat, item: it, card }));
  }
  return c;
}

function play(n: number, seed: number) {
  let T = 1_000_000; setClock(() => T); setRng(mulberry32(seed));
  const pick = mulberry32(seed + 77); rng = pick;
  const S = newLobby();
  for (let k = 0; k < n; k++) expect(applyAction(S, 'u' + k, { type: 'sit', name: 'P' + k })).toEqual({ ok: true });
  expect(applyAction(S, 'u0', { type: 'start' }).ok).toBe(true);
  const total = allCards(S).length;
  expect(total).toBe(52 * S.decks);
  let steps = 0;
  for (; steps < 6000 && S.phase !== 'ended'; steps++) {
    if (S.mg?.id === 'count') T = Math.max(T, countOpenAt(S.mg) + 1);
    if (S.phase === 'defense' && pick() < 0.3) T = S.pending!.deadline + 1;
    // 시간이 흐르는 단계(타이머)는 가끔, 할 행동이 없으면 반드시 시간을 보낸다
    if (pick() < 0.1) { T += 800; advanceTimers(S); }
    const opts: [string, Action][] = [];
    for (let k = 0; k < n; k++) for (const a of candidates(S, k)) if (!canAct(S, 'u' + k, a)) opts.push(['u' + k, a]);
    if (!opts.length && S.phase === 'mg') { T += 1000; advanceTimers(S); continue; }
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

/** 미니게임 하나만: 미니게임 판 6칸을 모두 그 게임으로 두고 굴려서 시작, 보상 단계까지 */
function playMg(id: MgId, n: number, seed: number) {
  let T = 1_000_000; setClock(() => T); setRng(mulberry32(seed));
  const pick = mulberry32(seed + 77); rng = pick;
  const S = newLobby();
  for (let k = 0; k < n; k++) applyAction(S, 'u' + k, { type: 'sit' });
  applyAction(S, 'u0', { type: 'start' });
  // 아이템도 써 보게 자리마다 J를 하나씩
  S.seats.forEach(p => { const k = S.deck.findIndex(c => R(c) === 11); if (k >= 0) p.hand.push(S.deck.splice(k, 1)[0]); });
  const ph = (): string => S.phase;
  S.phase = 'roll'; S.turn = null; S.board = Array(6).fill(id); S.rewardDisp = [];
  const total = allCards(S).length;
  applyAction(S, S.seats[S.first].uid, { type: 'roll', seat: S.first });
  for (let k = 0; k < n && ph() === 'clubs'; k++) applyAction(S, 'u' + k, { type: 'ready' });
  expect(ph()).toBe('mg');
  for (let steps = 0; steps < 8000 && ph() === 'mg'; steps++) {
    if (pick() < 0.1) { T += 800; advanceTimers(S); }
    const opts: [string, Action][] = [];
    for (let k = 0; k < n; k++) for (const a of candidates(S, k)) if (!canAct(S, 'u' + k, a)) opts.push(['u' + k, a]);
    if (!opts.length) { T += 1000; advanceTimers(S); continue; }
    const [uid, a] = opts[Math.floor(pick() * opts.length)];
    const r = applyAction(S, uid, a);
    if (!r.ok) throw new Error(`${id}: 판정은 허용했는데 실패: ${JSON.stringify(a)} ${r.error}`);
    const now_ = allCards(S).length;
    if (now_ !== total) throw new Error(`${id} ${n}인: 카드 수 ${total} → ${now_}: ${JSON.stringify(a)} (seed ${seed}, step ${steps})`);
  }
  return { done: ph() === 'reward' || ph() === 'main', S };
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

  it('대기실 의자: 빈 의자에만 앉거나 옮기고, 자리 순서는 의자 순서를 따른다', () => {
    const S = newLobby();
    expect(applyAction(S, 'a', { type: 'sit', chair: 3 }).ok).toBe(true);
    expect(applyAction(S, 'b', { type: 'sit' }).ok).toBe(true);           // 첫 빈 의자 0
    expect(S.seats.map(p => [p.uid, p.chair])).toEqual([['b', 0], ['a', 3]]);
    expect(applyAction(S, 'c', { type: 'sit', chair: 3 }).ok).toBe(false); // 이미 앉은 의자
    expect(applyAction(S, 'b', { type: 'move', seat: 0, chair: 3 }).ok).toBe(false);
    expect(applyAction(S, 'b', { type: 'move', seat: 0, chair: 4 }).ok).toBe(true);
    expect(S.seats.map(p => [p.uid, p.chair])).toEqual([['a', 3], ['b', 4]]);
    expect(applyAction(S, 'a', { type: 'move', seat: 0, chair: 5 }).ok).toBe(false); // 없는 의자
    applyAction(S, 'a', { type: 'start' });
    expect(applyAction(S, 'a', { type: 'move', seat: 0, chair: 1 }).ok).toBe(false); // 게임 중
  });

  it('♣Q·♣K는 먼저 쓰고, 고르는 동안엔 준비할 수 없으며, 고를 수 있는 칸만 고른다', () => {
    setRng(mulberry32(3));
    const S = newLobby();
    applyAction(S, 'a', { type: 'sit' }); applyAction(S, 'b', { type: 'sit' }); applyAction(S, 'a', { type: 'start' });
    S.phase = 'clubs'; S.board = ['hold', 'bomb', 'auction', 'balloon', 'rps', 'vault']; S.die = 1; S.ready = {}; S.turn = null;
    S.seats[0].hand.push('C12b');
    expect(applyAction(S, 'a', { type: 'club', seat: 0, card: 'C12b' }).ok).toBe(true);
    expect(S.clubChoose).toEqual({ seat: 0, card: 'C12b' });
    expect(applyAction(S, 'b', { type: 'ready' }).ok).toBe(false);
    expect(applyAction(S, 'a', { type: 'clubPick', seat: 0, k: 3 }).ok).toBe(false); // ♣Q는 양옆(6·2)만
    expect(applyAction(S, 'a', { type: 'clubPick', seat: 0, k: 6 }).ok).toBe(true);
    expect([S.die, S.clubChoose]).toEqual([6, null]);
  });

  it('몇 장이었지(디지털판): 정답 문양은 많아야 6장', () => {
    for (let seed = 1; seed <= 300; seed++) {
      setRng(mulberry32(seed));
      const S = newLobby();
      applyAction(S, 'a', { type: 'sit' }); applyAction(S, 'b', { type: 'sit' }); applyAction(S, 'a', { type: 'start' });
      countStart(S, [0, 1]);
      const m = S.mg as CountMg; const su = U(m.dec!);
      expect(m.seq!.filter(c => U(c) === su).length).toBeLessThanOrEqual(6);
    }
  });

  it('버티기(디지털판): 매 판 첫 굴림에는 1이 나오지 않는다', () => {
    for (let seed = 1; seed <= 300; seed++) {
      setRng(mulberry32(seed));
      const S = newLobby();
      applyAction(S, 'a', { type: 'sit' }); applyAction(S, 'b', { type: 'sit' }); applyAction(S, 'a', { type: 'start' });
      S.board = ['hold', 'hold', 'hold', 'hold', 'hold', 'hold']; S.die = 1; startMinigame(S);
      const i = (S.mg as HoldMg).ord[0];
      applyAction(S, S.seats[i].uid, { type: 'holdRoll', seat: i, item: null });
      expect((S.mg as HoldMg).last!.d).toBeGreaterThan(1);
    }
  });

  it('선 가위바위보: 선이 아닌 사람의 아이템은 이기면 즉시 통과', () => {
    setRng(mulberry32(5));
    const S = newLobby();
    ['a', 'b', 'c'].forEach(u => applyAction(S, u, { type: 'sit' })); applyAction(S, 'a', { type: 'start' });
    S.first = 0; S.board = ['rps', 'rps', 'rps', 'rps', 'rps', 'rps']; S.die = 1; startMinigame(S);
    S.seats[1].hand.push('S11b');
    expect(applyAction(S, 'a', { type: 'rpsPass', seat: 0, item: 'S11b' }).ok).toBe(false);       // 선은 못 씀
    expect(applyAction(S, 'b', { type: 'rpsPass', seat: 1, item: 'S11b' }).ok).toBe(true);
    applyAction(S, 'a', { type: 'rps', seat: 0, hand: 'R' });
    applyAction(S, 'b', { type: 'rps', seat: 1, hand: 'P' });  // 선을 이김 → 통과
    applyAction(S, 'c', { type: 'rps', seat: 2, hand: 'S' });  // 선에게 짐 → 탈락
    expect((S.mg as { step: string }).step).toBe('show'); rpsAfterShow(S); // 결과 연출 뒤 적용
    expect(S.lastRank).toEqual([[1], [2], [0]]); // 통과한 사람 1위, 탈락한 사람, 선 꼴찌
  });

  it('줍고 나서 버리기 전에 바로 토큰을 만들 수 있다', () => {
    setRng(mulberry32(7));
    const S = newLobby();
    applyAction(S, 'a', { type: 'sit' }); applyAction(S, 'b', { type: 'sit' }); applyAction(S, 'a', { type: 'start' });
    const i = S.turn!.seat; const uid = S.seats[i].uid;
    S.seats[i].hand = ['H2', 'H3', 'H4', 'S5'];
    S.turn = { ...S.turn!, picked: true, mustDiscard: true };
    expect(applyAction(S, uid, { type: 'token', seat: i, cards: ['H2', 'H3', 'H4'] }).ok).toBe(true);
    expect(S.seats[i].tokens).toEqual(['H']);
  });

  it('줍고 나서 손패를 모두 토큰에 쓰면 버리기 없이 턴을 끝낼 수 있다', () => {
    setRng(mulberry32(7));
    const S = newLobby();
    applyAction(S, 'a', { type: 'sit' }); applyAction(S, 'b', { type: 'sit' }); applyAction(S, 'a', { type: 'start' });
    const i = S.turn!.seat; const uid = S.seats[i].uid;
    S.seats[i].hand = ['H2', 'H3', 'H4'];
    S.turn = { ...S.turn!, picked: true, mustDiscard: true };
    expect(applyAction(S, uid, { type: 'token', seat: i, cards: ['H2', 'H3', 'H4'] }).ok).toBe(true);
    expect(S.turn!.mustDiscard).toBe(false); // 화면이 버리기 대기에 묶이지 않는다
    expect(applyAction(S, uid, { type: 'endTurn', seat: i }).ok).toBe(true);
  });

  it('새 미니게임 18개: 인원마다 판정이 허용한 행동만으로 끝까지 가고 카드 수가 보존된다', () => {
    const ids: MgId[] = ['nunchi', 'updown', 'curling', 'line', 'speed', 'fold', 'chain', 'mid', 'gesture', 'stack', 'change', 'cave', 'ten', 'balance', 'liar', 'fore', 'fork', 'dodge'];
    for (const id of ids) for (let n = MG[id].min; n <= MG[id].max; n++) for (let g = 0; g < 6; g++) {
      const r = playMg(id, n, 9000 + g * 31 + n);
      if (!r.done) throw new Error(`${id} ${n}인: 끝나지 않음 (seed ${9000 + g * 31 + n}) ${JSON.stringify(r.S.mg).slice(0, 900)} end=${JSON.stringify(r.S.mgEnd)}`);
    }
  }, 300_000);

  it('동굴 탐험: 아이템은 자기 선택 차례에만, 모두 고르면 잠깐(1.5초) 뒤 굴린다', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(5));
    const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.board = Array(6).fill('cave'); S.die = 1; S.phase = 'clubs'; S.turn = null; startMinigame(S);
    const m = S.mg as unknown as { step: string; inside: number[]; di: number; protect: number };
    m.step = 'decide';
    const item = (['S', 'H', 'D', 'C'] as const).flatMap(u => Array.from({ length: 13 }, (_, r) => `${u}${r + 1}` as Card)).find(isItem)!;
    S.seats.forEach(p => p.hand = [item]);
    const [a, b] = m.inside;
    expect(canAct(S, S.seats[b].uid, { type: 'caveGuard', seat: b, item })).not.toBeNull();
    expect(applyAction(S, S.seats[a].uid, { type: 'caveGuard', seat: a, item }).ok).toBe(true);
    expect(m.protect).toBe(1);
    for (const k of m.inside.slice()) applyAction(S, S.seats[k].uid, { type: 'caveGo', seat: k, stay: true });
    expect(m.step).toBe('pre');
    expect(canAct(S, S.seats[b].uid, { type: 'caveGuard', seat: b, item })).not.toBeNull();
    T += 1500; advanceTimers(S); expect(m.step).toBe('show');
  });

  it('동굴 탐험: 판마다 선이 왼쪽으로 한 칸씩 넘어간다', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(6));
    const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.board = Array(6).fill('cave'); S.die = 1; S.phase = 'clubs'; S.turn = null; startMinigame(S);
    const m = S.mg as unknown as { step: string; ord: number[]; inside: number[]; pan: number };
    m.step = 'decide'; const ord = m.ord.slice();
    expect(m.inside[0]).toBe(ord[0]);
    for (const k of m.inside.slice()) applyAction(S, S.seats[k].uid, { type: 'caveGo', seat: k, stay: false });
    expect(m.pan).toBe(2); expect(m.inside).toEqual([ord[1], ord[2], ord[0]]);
  });

  it('눈치 게임은 뽑히면 규칙 설명 없이 바로 시작한다', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(3));
    const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.phase = 'roll'; S.turn = null; S.board = Array(6).fill('nunchi'); S.rewardDisp = [];
    expect(applyAction(S, S.seats[S.first].uid, { type: 'roll', seat: S.first }).ok).toBe(true);
    expect(S.phase).toBe('mg'); expect(S.mg?.id).toBe('nunchi');
  });

  it('조용한 줄 서기: 더 작은 카드를 든 사람이 있으면 낸 사람과 멈춘 사람이 벌점, 같은 숫자는 괜찮다', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(4));
    const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.board = Array(6).fill('line'); S.die = 1; S.phase = 'clubs'; S.turn = null; startMinigame(S);
    const m = S.mg as unknown as { hands: Record<number, Card[]>; won: Record<number, Card[]>; pile: Card[]; step: string };
    m.step = 'play'; m.hands = { 0: ['S7', 'S9'], 1: ['H3', 'H12'], 2: ['D7'] };
    expect(applyAction(S, 'u0', { type: 'linePlay', seat: 0 }).ok).toBe(true);
    expect(m.won[0]).toEqual(['S7']); expect(m.won[1]).toEqual(['H3']); expect(m.won[2]).toEqual([]); expect(m.hands[2]).toEqual(['D7']);
  });

  it('가운데 숫자: 기준에 맞는 숫자를 낸 사람이 모두 1점, 4인 덱 카드가 걸리면 무산', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(5));
    const S = newLobby(); for (let k = 0; k < 4; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.board = Array(6).fill('mid'); S.die = 1; S.phase = 'clubs'; S.turn = null; startMinigame(S);
    const m = S.mg as unknown as { hands: Record<number, Card[]>; won: Record<number, Card[]>; step: string; deckCard: Card | null; crit: string };
    m.step = 'pick'; m.deckCard = 'S5'; m.hands = { 0: ['H2'], 1: ['H5'], 2: ['H9'], 3: ['D9'] };
    [0, 1, 2, 3].forEach(k => applyAction(S, 'u' + k, { type: 'midPick', seat: k, card: m.hands[k][0] }));
    // 2·5·5(덱)·9·9 → 가운데 5는 덱 카드와 같아 무산
    expect(Object.values(m.won).every(w => !w.length)).toBe(true);
  });

  it('디지털판: 한 미니게임은 그 뒤 3라운드 동안 미니게임 6장에 나오지 않는다', () => {
    setClock(() => 1_000_000); setRng(mulberry32(12));
    for (let g = 0; g < 30; g++) {
      const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
      S.recentMg = ['hold', 'bomb', 'auction']; S.turn = null; S.order = []; S.ti = 0;
      endTurn(S);
      if (S.phase !== 'roll') continue;
      expect(S.board!.some(k => ['hold', 'bomb', 'auction'].includes(k))).toBe(false);
    }
  });

  it('풍선 불기 2·3인: 동전(목숨) 1개, 손패 그대로, 펑 한 사람 먼저', () => {
    setClock(() => 1_000_000); setRng(mulberry32(21));
    const S = newLobby(); for (let k = 0; k < 2; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.board = Array(6).fill('balloon'); S.die = 1; S.phase = 'clubs'; S.turn = null; startMinigame(S);
    const m = S.mg as unknown as { alive: number[]; ci: number; total: number; hands: Record<number, Card[]>; coins?: Record<number, number> };
    const a = m.alive[m.ci], b = m.alive.find(j => j !== a)!;
    m.total = 48; m.hands[a][0] = 'S9';
    expect(applyAction(S, 'u' + a, { type: 'balloon', seat: a, card: 'S9' }).ok).toBe(true);
    expect(S.phase).toBe('mg'); expect(m.coins![a]).toBe(0); expect(m.coins![b]).toBe(1); expect(m.total).toBe(0); expect(m.hands[a].length).toBe(3);
    expect(m.alive[m.ci]).toBe(a); // 진 사람이 먼저
    m.total = 48; m.hands[a][0] = 'H9';
    applyAction(S, 'u' + a, { type: 'balloon', seat: a, card: 'H9' });
    expect(S.lastRank).toEqual([[b], [a]]);
  });

  it('합이 10: 10 한 장도 잡을 수 있고, 그 자리 더미만 가져간다', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(31));
    const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.board = Array(6).fill('ten'); S.die = 1; S.phase = 'clubs'; S.turn = null; startMinigame(S);
    const m = S.mg as unknown as { slots: Card[][]; flipN: number; hands: Record<number, Card[]> };
    m.slots = [['H3', 'S10'], ['D4'], []];
    const before = m.hands[1].length;
    expect(applyAction(S, 'u1', { type: 'tenGrab', seat: 1, n: m.flipN, ms: 200 }).ok).toBe(true);
    T += 1000; advanceTimers(S);
    expect(m.hands[1].length).toBe(before + 2); expect(m.slots[0]).toEqual([]); expect(m.slots[1]).toEqual(['D4']);
  });

  it('합이 10: 세 장의 합이 10이어도 잡고 세 자리를 모두 가져간다', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(32));
    const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.board = Array(6).fill('ten'); S.die = 1; S.phase = 'clubs'; S.turn = null; startMinigame(S);
    const m = S.mg as unknown as { slots: Card[][]; flipN: number; hands: Record<number, Card[]> };
    m.slots = [['H2'], ['S3'], ['D5']];
    const before = m.hands[2].length;
    expect(applyAction(S, 'u2', { type: 'tenGrab', seat: 2, n: m.flipN, ms: 200 }).ok).toBe(true);
    T += 1000; advanceTimers(S);
    expect(m.hands[2].length).toBe(before + 3); expect(m.slots).toEqual([[], [], []]);
  });

  it('2인은 메인 턴 2바퀴, 토큰 만들기는 한 라운드에 1번', () => {
    setClock(() => 1_000_000); setRng(mulberry32(8));
    const S = newLobby(); for (let k = 0; k < 2; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    expect(S.order.length).toBe(4);
    const i = S.turn!.seat, uid = S.seats[i].uid;
    S.seats[i].hand = ['S2', 'S3', 'S4', 'H2', 'H3', 'H4']; S.deck = S.deck.filter(c => !S.seats[i].hand.includes(c));
    expect(applyAction(S, uid, { type: 'pickDeck', seat: i }).ok).toBe(true);
    expect(applyAction(S, uid, { type: 'token', seat: i, cards: ['S2', 'S3', 'S4'] }).ok).toBe(true);
    const disc = S.seats[i].hand.find(c => c !== 'H2' && c !== 'H3' && c !== 'H4')!;
    applyAction(S, uid, { type: 'discard', seat: i, card: disc }); applyAction(S, uid, { type: 'endTurn', seat: i });
    const j = S.turn!.seat; applyAction(S, S.seats[j].uid, { type: 'pickDeck', seat: j });
    applyAction(S, S.seats[j].uid, { type: 'discard', seat: j, card: S.seats[j].hand[0] }); applyAction(S, S.seats[j].uid, { type: 'endTurn', seat: j });
    // 두 번째 바퀴: 같은 라운드라 토큰을 또 만들 수 없다
    expect(S.phase).toBe('main'); expect(S.turn!.seat).toBe(i); expect(S.turn!.token).toBe(true);
    applyAction(S, uid, { type: 'pickDeck', seat: i });
    expect(canAct(S, uid, { type: 'token', seat: i, cards: ['H2', 'H3', 'H4', 'H5'].filter(c => S.seats[i].hand.includes(c)) })).not.toBeNull();
  });

  it('주사위 눈 피하기: 눈마다 놓을 수 있는 자리 수', () => {
    const cnt = (d: number) => new Set(DODGE_SHAPES[d].flat().map(p => p.slice().sort((a, b) => a - b).join())).size;
    expect([1, 2, 3, 4, 5, 6].map(cnt)).toEqual([9, 8, 8, 4, 1, 2]);
  });

  it('주사위 눈 피하기: 맞은 수만큼 공격자 점수, 살아남은 수비자 1점, 쓴 주사위만 다시 굴린다, 못 고른 수비자는 제자리', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(41));
    const S = newLobby(); for (let k = 0; k < 4; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.first = 0; S.seats.forEach(p => { p.hand = p.hand.filter(c => !isItem(c)); });
    S.board = Array(6).fill('dodge'); S.die = 1; S.phase = 'clubs'; S.turn = null; startMinigame(S);
    const m = S.mg as DodgeMg; expect(m.turns).toBe(3); expect(m.step).toBe('pick');
    const atk = m.ord[m.ai]; const [a, b, c] = m.ord.filter(j => j !== atk);
    expect(Object.values(m.pos).sort()).toEqual([1, 3, 5]);
    m.pos = { [a]: 1, [b]: 3, [c]: 5 }; m.dice = [3, 6, 1];
    expect(applyAction(S, 'u' + a, { type: 'dodgeMove', seat: a, cell: 7 }).ok).toBe(false);   // 두 칸은 못 간다
    expect(applyAction(S, 'u' + a, { type: 'dodgeMove', seat: a, cell: 4 }).ok).toBe(true);
    expect(applyAction(S, 'u' + a, { type: 'dodgeLock', seat: a }).ok).toBe(true);
    expect(applyAction(S, 'u' + b, { type: 'dodgeLock', seat: b }).ok).toBe(true);           // 제자리 3
    expect(applyAction(S, 'u' + atk, { type: 'dodgeShot', seat: atk, k: 0, cells: [0, 1] }).ok).toBe(false); // 3은 한 줄
    expect(applyAction(S, 'u' + atk, { type: 'dodgeShot', seat: atk, k: 0, cells: [3, 4, 5] }).ok).toBe(true);
    expect(m.step).toBe('pick');                       // c가 아직
    T += 36_000; advanceTimers(S);                      // 수비자 마감: c는 제자리 5
    expect(m.last!.hit.sort()).toEqual([a, b, c].sort());
    expect(m.pts[atk]).toBe(3); expect(m.pts[a] + m.pts[b] + m.pts[c]).toBe(0);
    expect(m.dice[1]).toBe(6); expect(m.dice[2]).toBe(1);
    T += DODGE_SHOW + 100; advanceTimers(S); expect(m.turn).toBe(2);
  });

  it('주사위 눈 피하기: 봉쇄는 공격 시간 안에 언제든 빈 칸만, 쓰면 시간 +10초, 그 칸으로 가려던 수비자는 취소, 막힌 칸으로는 못 가고, 공격자가 바뀌면 풀린다. 2인은 5턴', () => {
    let T = 1_000_000; setClock(() => T); setRng(mulberry32(42));
    const S = newLobby(); for (let k = 0; k < 2; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.first = 0; S.board = Array(6).fill('dodge'); S.die = 1; S.phase = 'clubs'; S.turn = null;
    S.seats[0].hand.push('S11b', 'S12b'); startMinigame(S);
    const m = S.mg as DodgeMg; expect(m.turns).toBe(5); expect(m.step).toBe('pick'); expect(m.pos[1]).toBe(4);
    // 수비자가 1번 칸으로 가기로 하고 확정한 뒤, 공격자가 1번 칸을 막는다 → 그 이동은 취소
    applyAction(S, 'u1', { type: 'dodgeMove', seat: 1, cell: 1 }); applyAction(S, 'u1', { type: 'dodgeLock', seat: 1 });
    expect(m.done[1]).toBe(true);
    T += 20_000; const u0 = m.until, d0 = m.dUntil;
    // 아이템은 먼저 쓰고(컷신·시간 +10초) 그 뒤 대상을 고른다. 고르기 전에는 공격자의 다른 행동이 막힌다
    expect(applyAction(S, 'u0', { type: 'mgItemDeclare', seat: 0, item: 'S11b' }).ok).toBe(true);
    expect(m.until).toBe(u0 + 10_000); expect(m.dUntil).toBe(d0 + 10_000);
    expect((S.fx || []).some(f => f.t === 'item' && f.eff === '칸 봉쇄')).toBe(true);
    expect(applyAction(S, 'u0', { type: 'dodgeShot', seat: 0, k: 0, cells: DODGE_SHAPES[m.dice[0]][0][0] }).ok).toBe(false);
    expect(applyAction(S, 'u0', { type: 'dodgeBlock', seat: 0, item: 'S11b', cell: 4 }).ok).toBe(false); // 사람이 있는 칸
    expect(applyAction(S, 'u0', { type: 'dodgeBlock', seat: 0, item: 'S11b', cell: 1 }).ok).toBe(true);
    expect(S.mgItems?.[0]).toBeFalsy();
    expect((S.fx || []).filter(f => f.t === 'item').length).toBe(1);   // 컷신은 쓸 때 한 번만
    expect(m.done[1]).toBeFalsy(); expect(1 in m.moves).toBe(false);
    T += 15_000; advanceTimers(S); expect(m.shot).toBeNull();          // 늘어난 시간 덕에 아직 시간 초과가 아니다
    expect(applyAction(S, 'u1', { type: 'dodgeMove', seat: 1, cell: 1 }).ok).toBe(false);
    expect(applyAction(S, 'u1', { type: 'dodgeMove', seat: 1, cell: 3 }).ok).toBe(true);
    // 엿보기는 공격자가 확정한 뒤에만
    S.seats[1].hand.push('H11b');
    expect(applyAction(S, 'u1', { type: 'dodgePeek', seat: 1, item: 'H11b' }).ok).toBe(false);
    T += 6_000; advanceTimers(S);                       // 공격자 시간 초과 → 무작위로 떨어진다
    expect(m.shot?.auto).toBe(true);
    expect(applyAction(S, 'u0', { type: 'dodgeBlock', seat: 0, item: 'S12b', cell: 2 }).ok).toBe(false); // 확정(발동) 뒤에는 못 쓴다
    expect(applyAction(S, 'u1', { type: 'dodgePeek', seat: 1, item: 'H11b' }).ok).toBe(true);
    applyAction(S, 'u1', { type: 'dodgeLock', seat: 1 });
    expect(m.step).toBe('show');
    for (let k = 0; k < 40 && m.ai === 0; k++) { T += 40_000; advanceTimers(S); }
    expect(m.ai).toBe(1); expect(m.blocked).toEqual([]); expect(m.pos[0]).toBe(4);
  });
  it('미니게임 아이템: 대상을 10초 안에 안 고르면 무작위로, 바로 쓰는 아이템도 컷신', () => {
    let T = 5_000_000; setClock(() => T); setRng(mulberry32(9));
    const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' }); applyAction(S, 'u0', { type: 'start' });
    S.first = 0; S.board = Array(6).fill('dodge'); S.die = 1; S.phase = 'clubs'; S.turn = null;
    S.seats[0].hand.push('S11b'); S.seats[1].hand.push('H11b'); startMinigame(S);
    const m = S.mg as DodgeMg;
    expect(applyAction(S, 'u1', { type: 'mgItemDeclare', seat: 1, item: 'H11b' }).ok).toBe(false);   // 수비자 엿보기는 대상이 없다
    expect(applyAction(S, 'u0', { type: 'mgItemDeclare', seat: 0, item: 'S11b' }).ok).toBe(true);
    T += 9_000; advanceTimers(S); expect(m.blocked).toEqual([]);
    T += 1_500; advanceTimers(S);
    expect(m.blocked.length).toBe(1); expect(S.seats[0].front).toContain('S11b'); expect(S.mgItems?.[0]).toBeFalsy();
    // 바로 쓰는 아이템(엿보기)에도 컷신
    applyAction(S, 'u0', { type: 'dodgeShot', seat: 0, k: 0, cells: DODGE_SHAPES[m.dice[0]][0][0] });
    const n0 = (S.fx || []).filter(f => f.t === 'item').length, d0 = m.dUntil;
    S.seats[2].hand.push('C11b'); applyAction(S, 'u2', { type: 'dodgeLock', seat: 2 });
    expect(applyAction(S, 'u2', { type: 'dodgePeek', seat: 2, item: 'C11b' }).ok).toBe(false);   // 확정한 뒤에는 못 쓴다
    expect(applyAction(S, 'u1', { type: 'dodgePeek', seat: 1, item: 'H11b' }).ok).toBe(true);
    expect((S.fx || []).filter(f => f.t === 'item').length).toBe(n0 + 1);
    expect(m.dUntil).toBe(d0 + 5_000);                                         // 엿보기를 쓰면 수비자 시간 +5초
  });
  it('미니게임만 하기: 인원 확인, 규칙 설명 → 미니게임 → 보상 없이 끝, 한 번 더, ♣ 바꾸기 없음, 카드 수 보존', () => {
    let T = 2_000_000; setClock(() => T); setRng(mulberry32(7));
    const S = newLobby(); applyAction(S, 'u0', { type: 'sit' });
    expect(applyAction(S, 'u0', { type: 'startSolo', id: 'dodge' }).ok).toBe(false);   // 혼자는 안 된다(멀티 전용)
    for (let k = 1; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' });
    expect(applyAction(S, 'u0', { type: 'startSolo', id: 'nope' as MgId }).ok).toBe(false);
    const total = (x: GameState) => allCards(x).length;
    expect(applyAction(S, 'u0', { type: 'startSolo', id: 'dodge' }).ok).toBe(true);
    const n0 = total(S);
    expect(S.phase).toBe('clubs'); expect(S.solo).toBe('dodge'); expect(S.rewardDisp).toEqual([]);
    S.seats.forEach(p => { expect(p.hand.length).toBe(3); expect(p.hand.filter(isItem)).toHaveLength(1); expect(p.hand.some(c => U(c) === 'C' && isItem(c))).toBe(false); });
    S.seats[0].hand.push('C12b');
    expect(applyAction(S, 'u0', { type: 'club', seat: 0, card: 'C12b', arg: 1 }).ok).toBe(false);
    S.seats[0].hand.pop();
    for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'ready' });
    expect(S.phase).toBe('mg'); expect(S.mg?.id).toBe('dodge');
    for (let k = 0; k < 400 && S.phase === 'mg'; k++) { T += 40_000; advanceTimers(S); }
    expect(S.phase).toBe('ended'); expect(S.reward).toBeFalsy(); expect(S.winners!.length).toBeGreaterThan(0);
    expect(total(S)).toBe(n0);
    expect(applyAction(S, 'u0', { type: 'restart' }).ok).toBe(true);
    expect(S.phase).toBe('clubs'); expect(S.solo).toBe('dodge');
    expect(applyAction(S, 'u0', { type: 'toLobby' }).ok).toBe(true);
    expect(S.phase).toBe('lobby'); expect(S.solo).toBeFalsy(); expect(S.seats.length).toBe(3);
    // 즉시 시작 미니게임(눈치 게임)은 규칙 설명 없이 바로
    expect(applyAction(S, 'u0', { type: 'startSolo', id: 'nunchi' }).ok).toBe(true); expect(S.phase).toBe('mg');
  });
  it('미니게임만 하기: 손패가 시드 — 같은 손패면 같은 판, 방장 새로고침(상태 복사)에도 같은 흐름', () => {
    let T = 3_000_000; setClock(() => T); setRng(Math.random);
    const S = newLobby(); for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'sit' });
    applyAction(S, 'u0', { type: 'startSolo', id: 'dodge' });
    S.seats.forEach(p => expect(p.hand.filter(c => R(c) <= 10)).toHaveLength(2));
    const hands = JSON.stringify(S.soloHands), hand0 = JSON.stringify(S.seats.map(p => p.hand)), first = S.first, deck0 = S.deck.join();
    const snap = () => { const m = S.mg as DodgeMg; return JSON.stringify({ d: m.dice, p: m.pos, o: m.ord }); };
    for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'ready' });
    const m1 = snap();
    // 몇 턴 진행(시간 초과로 자동) 뒤의 상태도 같아야 한다
    const run = (X: GameState) => { for (let k = 0; k < 6; k++) { T += 40_000; advanceTimers(X); } return JSON.stringify((X.mg as DodgeMg).dice) + JSON.stringify((X.mg as DodgeMg).pts); };
    const r1 = run(S);
    for (let k = 0; k < 400 && S.phase === 'mg'; k++) { T += 40_000; advanceTimers(S); }
    expect(S.phase).toBe('ended');
    // 같은 판 다시
    applyAction(S, 'u0', { type: 'restart' });
    expect(JSON.stringify(S.soloHands)).toBe(hands); expect(JSON.stringify(S.seats.map(p => p.hand))).toBe(hand0);
    expect(S.first).toBe(first); expect(S.deck.join()).toBe(deck0);
    for (let k = 0; k < 3; k++) applyAction(S, 'u' + k, { type: 'ready' });
    expect(snap()).toBe(m1);
    // 새로고침: 상태를 복사한 새 객체로 이어 가도 같은 흐름
    const C = JSON.parse(JSON.stringify(S)) as GameState;
    const r2 = run(C);
    expect(r2).toBe(r1);
    // 새 판(fresh)은 새 손패
    for (let k = 0; k < 400 && C.phase === 'mg'; k++) { T += 40_000; advanceTimers(C); }
    let changed = false;
    for (let t = 0; t < 5 && !changed; t++) { applyAction(C, 'u0', { type: 'restart', fresh: true }); changed = JSON.stringify(C.soloHands) !== hands; C.phase = 'ended'; }
    expect(changed).toBe(true);
    applyAction(C, 'u0', { type: 'toLobby' }); expect(C.rng).toBeFalsy();
  });
  it('시작은 방장만, 방장이 아닌 사람이 모두 준비해야 시작(일반·미니게임만 하기), 로비로 돌아가면 준비가 풀린다', () => {
    setClock(() => 4_000_000); setRng(mulberry32(3));
    const S = newLobby(); S.host = 'h';
    applyAction(S, 'h', { type: 'sit' }); applyAction(S, 'a', { type: 'sit' }); applyAction(S, 'b', { type: 'sit' }); applyAction(S, 'b', { type: 'sit' });
    expect(applyAction(S, 'h', { type: 'lobbyReady', on: true }).ok).toBe(false);          // 방장은 준비 없음
    expect(applyAction(S, 'x', { type: 'lobbyReady', on: true }).ok).toBe(false);          // 안 앉은 사람
    expect(applyAction(S, 'h', { type: 'start' }).ok).toBe(false);                         // 아직 아무도 준비 안 함
    applyAction(S, 'a', { type: 'lobbyReady', on: true });
    expect(applyAction(S, 'h', { type: 'startSolo', id: 'dodge' }).ok).toBe(false);        // b가 아직
    applyAction(S, 'b', { type: 'lobbyReady', on: true });
    expect(applyAction(S, 'a', { type: 'start' }).ok).toBe(false);                         // 방장이 아님
    applyAction(S, 'b', { type: 'lobbyReady', on: false });
    expect(applyAction(S, 'h', { type: 'start' }).ok).toBe(false);
    applyAction(S, 'b', { type: 'lobbyReady', on: true });
    expect(applyAction(S, 'h', { type: 'startSolo', id: 'dodge' }).ok).toBe(true);
    S.phase = 'ended';
    expect(applyAction(S, 'a', { type: 'restart' }).ok).toBe(false);
    expect(applyAction(S, 'h', { type: 'restart' }).ok).toBe(true);
    applyAction(S, 'a', { type: 'toLobby' });
    expect(S.host).toBe('h'); expect(S.lobbyReady).toBeFalsy();
    expect(applyAction(S, 'h', { type: 'start' }).ok).toBe(false);
  });
  it('판정이 허용한 행동만으로 2~5인 대국이 오류 없이 끝나고 카드 수가 보존된다', () => {
    let ended = 0;
    for (let g = 0; g < 80; g++) if (play(2 + (g % 4), 500 + g).ended) ended++;
    expect(ended).toBeGreaterThan(60);
  }, 300_000);
});
