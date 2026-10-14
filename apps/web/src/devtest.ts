/* 개발 서버 전용 자동 진행: 판정이 허용한 행동을 무작위로 골라 내 자리들로 진행한다.
   화면 시험에서 원하는 단계(미니게임 등)까지 빨리 가기 위한 것. */
import { type Action, DODGE_SHAPES, type GameState, canAct, countOpenAt, isItem, now } from '@cubic3/engine';
import { useStore } from './store';

function candidates(S: GameState, seat: number): Action[] {
  const p = S.seats[seat]; const hand = p.hand; const its = hand.filter(isItem);
  const c: Action[] = [
    { type: 'roll', seat }, { type: 'ready' }, { type: 'noDefend', seat }, { type: 'pickDeck', seat }, { type: 'endTurn', seat },
    { type: 'holdStop', seat }, { type: 'auctionReady', seat }, { type: 'raceFlip', seat },
  ];
  for (const card of hand) c.push({ type: 'discard', seat, card }, { type: 'defend', seat, card });
  for (const card of S.row) c.push({ type: 'pickRow', seat, card });
  if (S.steal) S.seats[S.steal.to].hand.forEach((_, k) => c.push({ type: 'stealPick', seat, k }));
  for (const card of S.turn?.peek || []) c.push({ type: 'diamondJPick', seat, card });
  for (const card of S.reward?.disp || []) c.push({ type: 'reward', seat, card });
  for (const su of ['S', 'H', 'D', 'C'] as const) { const nums = hand.filter(x => x[0] === su && !isItem(x)); for (const n of [3, 4, 5]) c.push({ type: 'token', seat, cards: nums.slice(0, n) }); }
  if (hand.length > 6) c.push({ type: 'trim', seat, cards: hand.slice(0, hand.length - 6) });
  const m = S.mg;
  for (const it of [...its, null]) { c.push({ type: 'holdRoll', seat, item: it }, { type: 'ovnSave', seat, item: it }); }
  for (const it of its) c.push({ type: 'rpsPass', seat, item: it });
  if (m?.id === 'bomb') m.lay.forEach((_, k) => c.push({ type: 'bombFlip', seat, k }));
  if (m?.id === 'auction') (m.hands[seat] || []).forEach(card => c.push({ type: 'auctionBid', seat, card }));
  if (m?.id === 'balloon') (m.hands[seat] || []).forEach(card => c.push({ type: 'balloon', seat, card }));
  for (const hnd of ['R', 'P', 'S'] as const) c.push({ type: 'rps', seat, hand: hnd });
  for (const z of [1, 2, 3]) c.push({ type: 'vaultHide', seat, zone: z }, { type: 'vaultGuard', seat, zones: [z] });
  for (let n = 0; n <= 6; n++) c.push({ type: 'countAnswer', seat, n });
  for (const su of ['S', 'H', 'D', 'C'] as const) c.push({ type: 'raceBet', seat, suit: su });
  // 2026-10-12 추가 미니게임 (남은 자리 자동 진행용)
  if (m?.id === 'nunchi') c.push({ type: 'duelHit', seat, ms: 150 + Math.floor(Math.random() * 400) });
  for (let n = 0; n <= 3; n++) c.push({ type: 'udGrip', seat, n });
  for (let n = 0; n <= 15; n++) c.push({ type: 'udCall', seat, n });
  c.push({ type: 'udShout', seat, up: Math.random() < .5 }, { type: 'linePlay', seat }, { type: 'lineGo', seat }, { type: 'foldAnswer', seat, yes: Math.random() < .5 });
  if (m?.id === 'curling') c.push({ type: 'curlShot', seat, shot: { x: Math.random() * 10 - 5, angle: Math.random() * .6 - .3, power: .5 + Math.random() * .25 } });
  if (m?.id === 'speed') (m.hands[seat] || []).forEach(card => m.piles.forEach((_, k) => c.push({ type: 'speedPlay', seat, card, pile: k })));
  if (m?.id === 'fold') c.push({ type: 'foldSay', seat, text: '테스트 조건 ' + Math.floor(Math.random() * 1e5) });
  if (m?.id === 'chain') { const o = m.ord.filter(x => x !== seat); c.push({ type: 'chainAim', seat, targets: o.slice(0, 2) }, { type: 'chainAim', seat, targets: o.slice(0, 1) }, { type: 'chainPass', seat, k: 0 }, { type: 'chainPass', seat, k: 1 }); }
  if (m?.id === 'mid') (m.hands[seat] || []).forEach(card => c.push({ type: 'midPick', seat, card }));
  // 2026-10-13 추가
  if (m?.id === 'gesture') c.push({ type: 'gesture', seat, g: m.pos < m.seq.length ? m.seq[m.pos] : Math.floor(Math.random() * 8) });
  if (m?.id === 'stack') c.push({ type: 'stack', seat, h: Math.min(8, (m.h[seat] || 0) + 1), ms: 8000 + Math.floor(Math.random() * 15000) });
  if (m?.id === 'change') { for (let p = 0; p < 8; p++) c.push({ type: 'chgMove', seat, piece: p, cell: Math.floor(Math.random() * 50) }); c.push({ type: 'chgGuess', seat, pieces: [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - .5).slice(0, m.need) }); }
  c.push({ type: 'caveGo', seat, stay: Math.random() < .7 });
  if (m?.id === 'ten') { for (let k = 0; k < 3; k++) c.push({ type: 'tenPlace', seat, slot: k }); c.push({ type: 'tenGrab', seat, n: m.flipN, ms: 200 + Math.floor(Math.random() * 400) }); }
  if (m?.id === 'liar') { const n = (m.bid?.n || 0) + 1; c.push({ type: 'liarBid', seat, suit: (['S', 'H', 'D', 'C'] as const)[Math.floor(Math.random() * 4)], n }); if (Math.random() < .4) c.push({ type: 'liarCall', seat }); }
  if (m?.id === 'fore') c.push({ type: 'foreAct', seat, go: Math.random() < .6 });
  if (m?.id === 'fork') for (let k = 0; k < m.row.length; k++) c.push({ type: 'forkPick', seat, k });
  if (m?.id === 'dodge') { for (let x = 0; x < 9; x++) c.push({ type: 'dodgeMove', seat, cell: x }); c.push({ type: 'dodgeLock', seat }, { type: 'dodgeGo', seat }); m.dice.forEach((d, k) => { const all = DODGE_SHAPES[d].flat(); c.push({ type: 'dodgeShot', seat, k, cells: all[Math.floor(Math.random() * all.length)] }); }); }
  if (m?.id === 'balance') { c.push({ type: 'balSay', seat, opts: m.three ? ['산', '바다', '강'] : ['산', '바다'] }); for (let k = 0; k < 3; k++) c.push({ type: 'balPick', seat, k }); }
  return c;
}

/** 조건이 맞을 때까지(또는 steps번) 진행. 돌려주는 값: 멈춘 이유 */
export async function auto(opt: { until?: (S: GameState) => boolean; steps?: number; delay?: number } = {}): Promise<string> {
  const { steps = 3000, delay = 0 } = opt;
  for (let k = 0; k < steps; k++) {
    const st = useStore.getState(); const S = st.S; if (!S) return 'no state';
    if (opt.until?.(S)) return 'until';
    if (S.phase === 'ended' || S.phase === 'lobby') return S.phase;
    if (S.mg?.id === 'count' && now() < countOpenAt(S.mg)) { await new Promise(r => setTimeout(r, 300)); continue; }
    const opts: Action[] = [];
    S.seats.forEach((p, i) => { if (p.uid === st.me) for (const a of candidates(S, i)) if (!canAct(S, st.me, a)) opts.push(a); });
    if (!opts.length) { await new Promise(r => setTimeout(r, 200)); continue; }
    const pref = opts.filter(a => a.type === 'token' || a.type === 'trim');
    const a = pref.length && Math.random() < .9 ? pref[Math.floor(Math.random() * pref.length)] : opts[Math.floor(Math.random() * opts.length)];
    await st.act(a);
    await new Promise(r => setTimeout(r, delay));
  }
  return 'steps';
}
