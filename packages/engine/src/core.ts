/* 메인 게임 (순수 함수: 상태를 받아 고친다) */
import { DEF_MS, R, SNAME, U, bindSeed, cname, d6, fullDeck, hashSeed, isItem, now, rnd, shuffle } from './cards';
import { MG } from './mginfo';
import {
  auctionOpen, balloonStart, bombLay, countStart, ovnStart, raceStart, rpsAfterShow,
} from './minigames';
import {
  advanceMg3, balanceStart, caveStart, changeStart, foreStart, forkStart, gestureStart, liarStart, stackStart, tenStart,
} from './minigames3';
import {
  advanceMg2, chainStart, curlingStart, duelStart, foldStart, lineStart, midStart, speedStart, updownStart,
} from './minigames2';
import { advanceMg4, dodgeStart } from './minigames4';
import type { Card, Fx, GameState, MgId, MgScore, Suit } from './types';

export function log(S: GameState, msg: string): void {
  S.log.unshift(msg);
  if (S.log.length > 80) S.log.length = 80;
}
export function N(S: GameState): number { return S.seats.length; }
export function tokCount(S: GameState, i: number): number { return S.seats[i].tokens.length; }
export function costFor(S: GameState, i: number): number { const n = tokCount(S, i); return n >= 3 ? 3 : [3, 4, 5][n]; }

/** 연출 이벤트 (화면이 받아서 효과로 보여 준다) */
export function fx(S: GameState, o: Omit<Fx, 'id'>): void {
  S.fxn = (S.fxn || 0) + 1;
  const e = o as Fx;
  e.id = S.fxn;
  (S.fx = S.fx || []).push(e);
  if (S.fx.length > 12) S.fx.shift();
}

export function draw(S: GameState): Card | null {
  if (!S.deck.length) {
    const pool = S.row.splice(0);
    S.seats.forEach(p => pool.push(...p.front.splice(0)));
    if (pool.length) { S.deck = shuffle(pool); log(S, '덱이 바닥나 버림 줄과 앞에 놓인 아이템을 섞어 새 덱을 만들었다.'); }
  }
  return S.deck.pop() || null;
}
export function discardCard(S: GameState, i: number, c: Card): void {
  if (isItem(c)) S.seats[i].front.push(c); else S.row.push(c);
}
export function useItem(S: GameState, i: number, item: Card | null | undefined): boolean {
  const p = S.seats[i];
  if (!item || !isItem(item) || !p.hand.includes(item)) return false;
  p.hand.splice(p.hand.indexOf(item), 1);
  p.front.push(item);
  return true;
}
export function hasItem(S: GameState, i: number): boolean { return S.seats[i].hand.some(isItem); }

export function newLobby(): GameState {
  return {
    v: 1, phase: 'lobby', seats: [], log: ['테이블이 열렸다. 자리에 앉아 주세요.'],
    decks: 1, qPile: [], kPile: [], deck: [], row: [], qIn: false, kIn: false,
    supply: { S: 3, H: 3, D: 3, C: 3 }, board: null, first: 0, round: 0, ot: false, goal: 3,
    die: null, winners: null, pending: null, mg: null, reward: null, turn: null, order: [], ti: 0, deadline: null,
  };
}

export function startGame(S: GameState): void {
  const n = N(S);
  S.decks = n >= 4 ? 2 : 1;
  const deck = fullDeck(S.decks);
  S.qPile = deck.filter(c => R(c) === 12); S.kPile = deck.filter(c => R(c) === 13);
  S.deck = shuffle(deck.filter(c => R(c) < 12)); S.row = []; S.qIn = false; S.kIn = false;
  S.seats.forEach(p => { p.hand = []; p.tokens = []; p.front = []; });
  S.seats.forEach(p => { p.hand.push(draw(S)!, draw(S)!); });
  S.supply = { S: 3, H: 3, D: 3, C: 3 };
  S.board = null; S.recentMg = [];
  // 첫 선: 모두 주사위, 같은 최고 눈끼리 다시
  let cand = S.seats.map((_, i) => i);
  while (cand.length > 1) { const rolls = cand.map(() => d6()); const m = Math.max(...rolls); cand = cand.filter((_, k) => rolls[k] === m); }
  S.first = cand[0]; S.round = 1; S.ot = false; S.goal = 3; S.die = null; S.winners = null;
  S.pending = null; S.mg = null; S.reward = null; S.turn = null;
  S.log = []; log(S, `게임 시작. 주사위로 정한 첫 선: 자리 ${S.first + 1}.`);
  startMain(S);
}

const boardMg = (S: GameState): MgId => S.board![S.die! - 1];

/** 미니게임만 하기(디지털 멀티 전용, 사용자 2026-10-14): 메인 턴 없이 고른 미니게임 1종만 한다.
    규칙 설명 → 미니게임 → 순위 결과 → 끝('ended'). 보상·토큰은 없다.
    **손패 숫자 카드 2장이 이 판의 시드**(사용자 2026-10-14): 손패(와 미니게임)로 무작위를 정해, 같은 손패로 다시 하면 같은 판이 나온다.
    hands를 주면 그 손패로(같은 판 다시), 없으면 새로 나눈다.
    아이템은 공정하게 모두 J 1장(사용자 2026-10-14, ♣ 아님: ♣로 미니게임을 바꾸는 일은 없다) */
export function startSolo(S: GameState, id: MgId, hands?: Card[][] | null): void {
  bindSeed(null); S.rng = null;
  startGame(S); const n = N(S);
  // 덱을 정해진 순서로 되돌린 뒤 손패(시드)를 고른다
  S.seats.forEach(p => { S.deck.push(...p.hand.splice(0)); }); S.deck.sort();
  const take = (f: (c: Card) => boolean): Card | null => { const k = S.deck.findIndex(f); return k < 0 ? null : S.deck.splice(k, 1)[0]; };
  const same = !!hands && hands.length === n && hands.every(h => h.length === 2 && h.every(c => R(c) <= 10)) && hands.flat().every((c, k, a) => S.deck.includes(c) && a.indexOf(c) === k);
  if (same) hands!.forEach((h, i) => h.forEach(c => S.seats[i].hand.push(take(x => x === c)!)));
  else { shuffle(S.deck); S.seats.forEach(p => { for (let k = 0; k < 2; k++) { const c = take(c => R(c) <= 10); if (c) p.hand.push(c); } }); S.deck.sort(); }
  S.soloHands = S.seats.map(p => p.hand.slice());
  // 여기부터는 시드 무작위: 덱 섞기·첫 선·미니게임 안의 모든 무작위
  S.rng = { s: hashSeed(id + '|' + S.soloHands.map(h => h.join(',')).join('/')) }; bindSeed(S.rng);
  shuffle(S.deck); S.first = rnd(n);
  S.seats.forEach(p => { const j = take(c => R(c) === 11 && U(c) !== 'C'); if (j) p.hand.push(j); });
  S.solo = id; S.turn = null; S.order = []; S.ti = 0; S.pending = null; S.deadline = null;
  S.board = [id, id, id, id, id, id]; S.die = 1; S.round = 1; S.phase = 'clubs'; S.ready = {}; S.rewardDisp = []; S.clubChoose = null;
  S.log = []; log(S, `미니게임만 하기: ${MG[id].name} (${N(S)}명)`);
  instantStart(S);
}

export function rollBoard(S: GameState): void {
  S.die = d6(); S.phase = 'clubs'; S.deadline = null; S.ready = {};
  log(S, `${S.round}라운드 미니게임 주사위: ${S.die} → ${MG[boardMg(S)].name}`);
  fx(S, { t: 'dice', v: S.die, mg: boardMg(S) });
  instantStart(S);
}
/** 즉시 시작하는 미니게임(눈치 게임): 뽑히면 규칙 설명 시간 없이 바로 시작한다. ♣를 쓸 틈도 없다 */
export const INSTANT: MgId[] = ['nunchi'];
function instantStart(S: GameState): void {
  if (!INSTANT.includes(boardMg(S))) return;
  S.deadline = null; S.ready = {}; reclaim(S); log(S, `${MG[boardMg(S)].name}: 즉시 시작!`); startMinigame(S);
}
export function useClub(S: GameState, i: number, c: Card, arg?: number): void {
  const p = S.seats[i]; p.hand.splice(p.hand.indexOf(c), 1); p.front.push(c);
  const r = R(c);
  // ♣Q·♣K를 고를 값 없이 쓰면: 먼저 쓰고(컷신), 미니게임 선택 화면에서 고른다
  if ((r === 12 || r === 13) && !arg) {
    S.clubChoose = { seat: i, card: c }; S.ready = {};
    log(S, `자리 ${i + 1}: ${cname(c)} 사용 · 미니게임을 고르는 중`);
    fx(S, { t: 'banner', text: `${cname(c)} → 미니게임 고르기`, seats: [i], club: c, v: S.die, choose: true });
    return;
  }
  const v = arg ?? 0;
  if (r === 11) { S.die = d6(); log(S, `자리 ${i + 1}: ♣J로 다시 굴림 → ${S.die}`); }
  else if (r === 12) { S.die = ((S.die! - 1 + v + 6) % 6) + 1; log(S, `자리 ${i + 1}: ♣Q로 눈 ${v > 0 ? '+1' : '-1'} → ${S.die}`); }
  else { S.die = v; log(S, `자리 ${i + 1}: ♣K로 칸 ${v}을 직접 고름`); }
  log(S, `이번 미니게임: ${MG[boardMg(S)].name}`); S.ready = {};
  if (r === 11) fx(S, { t: 'dice', v: S.die, mg: boardMg(S), seats: [i], club: c });
  else fx(S, { t: 'banner', text: `${cname(c)} → ${S.die}번 ${MG[boardMg(S)].name}`, seats: [i], club: c, v: S.die });
  instantStart(S);
}
/** 한 라운드의 메인 턴 바퀴 수: 2인은 2바퀴(사용자 2026-10-13, 2인은 메인 턴이 너무 짧다), 나머지 1바퀴 */
export const mainLaps = (n: number): number => (n === 2 ? 2 : 1);
export function startMain(S: GameState): void {
  S.phase = 'main'; S.deadline = null;
  S.order = []; for (let k = 0; k < N(S); k++) S.order.push((S.first + k) % N(S));
  const one = S.order.slice(); for (let l = 1; l < mainLaps(N(S)); l++) S.order.push(...one);
  S.used = {};
  S.ti = 0; resetTurn(S);
}
export function resetTurn(S: GameState): void {
  // 토큰 만들기·아이템은 한 라운드에 1번: 앞 바퀴에서 했으면 이번 턴에도 한 것으로 친다
  const u = S.used && S.used[S.order[S.ti]];
  S.turn = { seat: S.order[S.ti], picked: false, mustDiscard: false, item: !!(u && u.item), token: !!(u && u.token), trim: false, peek: null };
}
/** 이번 라운드에 아이템·토큰을 썼다고 적는다 */
function mark(S: GameState, k: 'item' | 'token'): void {
  S.turn![k] = true; S.used = S.used || {}; const i = S.turn!.seat; (S.used[i] = S.used[i] || {})[k] = true;
}

export function pickup(S: GameState, i: number, fromRow: boolean, want?: Card): 'none' | undefined {
  const p = S.seats[i]; let c: Card | null;
  if (fromRow) { const k = S.row.lastIndexOf(want!); if (k < 0) return 'none'; c = S.row.splice(k, 1)[0]; }
  else { c = draw(S); if (!c) return 'none'; }
  const t = S.turn!;
  p.hand.push(c); t.picked = true; t.mustDiscard = true; t.justTook = c;
  log(S, `자리 ${i + 1}: ${fromRow ? '버림 줄에서 ' + cname(c) : '덱에서 1장'}을 주웠다.`);
}
export function pickupDiscard(S: GameState, i: number, c: Card): void {
  const p = S.seats[i]; p.hand.splice(p.hand.indexOf(c), 1); discardCard(S, i, c); S.turn!.mustDiscard = false;
  log(S, `자리 ${i + 1}: ${cname(c)}을 버렸다.`);
}
/** 토큰을 만들 수 없으면 이유를, 만들 수 있으면 null. cards: 고른 카드들(숫자 카드 + ♦Q/♦K 0~1장) */
export function canMakeToken(S: GameState, i: number, cards: Card[]): string | null {
  const items = cards.filter(isItem), nums = cards.filter(c => !isItem(c));
  if (items.length > 1) return '아이템은 1장만 함께 낼 수 있다.';
  const it = items[0];
  if (it && !(U(it) === 'D' && (R(it) === 12 || R(it) === 13))) return '토큰 만들기에는 ♦Q·♦K만 함께 낼 수 있다.';
  if (it && S.turn!.item) return '이번 턴에 이미 아이템을 썼다.';
  if (S.turn!.token) return '이번 턴에 이미 토큰을 만들었다.';
  if (!nums.length) return '숫자 카드를 고르세요.';
  const suit = U(nums[0]); if (nums.some(c => U(c) !== suit)) return '숫자 카드는 같은 문양이어야 한다.';
  let cost = costFor(S, i);
  const n = tokCount(S, i);
  if (it && R(it) === 13) { if (n === 0 || n >= 3) return '♦K는 첫 토큰과 연장전 토큰에는 효과가 없다.'; cost = 3; }
  if (nums.length !== cost) return `숫자 카드 ${cost}장이 필요하다(지금 ${nums.length}장).`;
  if (n >= S.goal) return '이미 목표 개수만큼 토큰이 있다.';
  if (!(it && R(it) === 12)) {
    if (S.seats[i].tokens.includes(suit)) return '이미 가진 색이다.';
    if (S.supply[suit] <= 0) return '그 색 토큰이 공급처에 없다.';
  }
  return null;
}
export function makeToken(S: GameState, i: number, cards: Card[], color?: Suit): void {
  const p = S.seats[i]; const it = cards.find(isItem); const nums = cards.filter(c => !isItem(c));
  let col = U(nums[0]); if (it && R(it) === 12) col = color!;
  for (const c of cards) { p.hand.splice(p.hand.indexOf(c), 1); }
  nums.forEach(c => S.row.push(c)); if (it) { p.front.push(it); mark(S, 'item'); }
  if (it) fx(S, { t: 'item', card: it, seats: [i], eff: R(it) === 12 ? `${SNAME[col]} 토큰으로 만들기` : '이번 토큰 비용 3장' });
  p.tokens.push(col); S.supply[col]--; mark(S, 'token');
  log(S, `자리 ${i + 1}: ${SNAME[col]} 토큰을 만들었다${it ? ' (' + cname(it) + ' 사용)' : ''}. 토큰 ${p.tokens.length}개.`);
  fx(S, { t: 'token', col, seats: [i], n: p.tokens.length });
}
export function startAttack(S: GameState, i: number, c: Card, target: number, arg: Suit | null): void {
  const p = S.seats[i]; p.hand.splice(p.hand.indexOf(c), 1); p.front.push(c); mark(S, 'item');
  S.pending = { card: c, attacker: i, target, arg, deadline: now() + DEF_MS }; S.phase = 'defense';
  const what = ({ 11: '손패 1장 뺏기', 12: `${SNAME[arg as Suit]} 숫자 카드 1장 받기`, 13: `${SNAME[arg as Suit]} 토큰 뺏기` } as Record<number, string>)[R(c)];
  log(S, `자리 ${i + 1} → 자리 ${target + 1}: ${cname(c)} 공격 (${what}). 방어 기회 ${DEF_MS / 1000}초.`);
  fx(S, { t: 'item', kind: 'attack', card: c, seats: [i, target], eff: what });
}
/** from이 to에게서 가져온다 */
export function applyAttack(S: GameState, kind: number, from: number, to: number, arg: Suit | null): void {
  const A = S.seats[from], T = S.seats[to];
  if (kind === 11) {
    if (!T.hand.length) { log(S, `자리 ${to + 1}의 손패가 없어 아무것도 못 뺏었다.`); return; }
    // 대상이 손패를 뒷면으로 펼쳐 내밀고 가져가는 쪽이 1장을 고른다(디지털: 순서를 섞어 뒷면으로 보여 주고 고른 자리의 카드)
    shuffle(T.hand); S.steal = { from, to }; log(S, `자리 ${from + 1}이 자리 ${to + 1}의 손패에서 1장을 고른다.`);
  } else if (kind === 12) {
    const m = T.hand.filter(c => U(c) === arg && !isItem(c));
    if (!m.length) { log(S, `자리 ${to + 1}: "${SNAME[arg as Suit]} 숫자 카드 없다."`); return; }
    const c = m[rnd(m.length)]; T.hand.splice(T.hand.indexOf(c), 1); A.hand.push(c);
    log(S, `자리 ${to + 1}이 ${SNAME[arg as Suit]} 숫자 카드 1장을 자리 ${from + 1}에게 줬다.`);
  } else {
    let col: Suit | null = arg;
    if (!col || !T.tokens.includes(col) || A.tokens.includes(col)) { const ok = T.tokens.filter(t => !A.tokens.includes(t)); col = ok.length ? ok[rnd(ok.length)] : null; }
    if (!col) { log(S, `가져올 수 있는 토큰이 없어 막기만 한 셈이 됐다.`); return; }
    T.tokens.splice(T.tokens.indexOf(col), 1); A.tokens.push(col); log(S, `자리 ${from + 1}이 자리 ${to + 1}의 ${SNAME[col]} 토큰을 뺏었다.`);
  }
}
export function defend(S: GameState, i: number, c: Card): void {
  const P = S.pending!; const p = S.seats[i]; p.hand.splice(p.hand.indexOf(c), 1); p.front.push(c);
  const kind = R(P.card);
  if (R(c) === 11) { log(S, `자리 ${i + 1}: ♥J로 공격을 막았다.`); fx(S, { t: 'item', kind: 'defend', card: c, seats: [i, P.attacker], eff: `${cname(P.card)} 공격 막기` }); }
  else { log(S, `자리 ${i + 1}: ♥K로 공격을 되돌렸다(막을 수 없음).`); fx(S, { t: 'item', kind: 'defend', card: c, seats: [i, P.attacker], eff: `${cname(P.card)} 공격 되돌리기` }); applyAttack(S, kind, P.target, P.attacker, null); }
  S.pending = null; S.phase = 'main';
}
export function stealPick(S: GameState, i: number, k: number): void {
  const st = S.steal!; const T = S.seats[st.to]; const c = T.hand.splice(k, 1)[0]; S.seats[i].hand.push(c); S.steal = null;
  log(S, `자리 ${i + 1}이 자리 ${st.to + 1}의 손패 1장을 뺏었다.`);
}
export function resolveAttack(S: GameState): void {
  const P = S.pending!; applyAttack(S, R(P.card), P.attacker, P.target, P.arg); S.pending = null; S.phase = 'main';
}
export function useHQ(S: GameState, i: number, c: Card, picks: Card[]): void {
  const p = S.seats[i]; p.hand.splice(p.hand.indexOf(c), 1); p.front.push(c); mark(S, 'item');
  for (const x of picks) { S.row.splice(S.row.indexOf(x), 1); p.hand.push(x); }
  log(S, `자리 ${i + 1}: ♥Q로 버림 줄에서 ${picks.map(cname).join(', ') || '0장'} 가져옴.`);
  fx(S, { t: 'item', card: c, seats: [i], eff: `버림 줄에서 ${picks.length}장 가져오기`, cards: picks.slice() });
}
export function useDJ(S: GameState, i: number, c: Card): void {
  const p = S.seats[i]; p.hand.splice(p.hand.indexOf(c), 1); p.front.push(c); mark(S, 'item');
  const pk: Card[] = []; for (let k = 0; k < 3; k++) { const x = draw(S); if (x) pk.push(x); }
  S.turn!.peek = pk; log(S, `자리 ${i + 1}: ♦J로 덱 위 ${pk.length}장을 봤다.`);
  fx(S, { t: 'item', card: c, seats: [i], eff: `덱 위 ${pk.length}장 중 1장 고르기` });
}
export function pickDJ(S: GameState, i: number, c: Card): void {
  const p = S.seats[i]; const pk = S.turn!.peek!; p.hand.push(c); pk.splice(pk.indexOf(c), 1);
  pk.forEach(x => discardCard(S, i, x)); S.turn!.peek = null; log(S, `자리 ${i + 1}: 1장을 갖고 ${pk.map(cname).join(', ')}은 버렸다.`);
}
export function endTurn(S: GameState): void {
  S.ti++; if (S.ti < S.order.length) { resetTurn(S); return; }
  S.turn = null; afterMain(S);
}
export function afterMain(S: GameState): void {
  const mx = Math.max(...S.seats.map((_, i) => tokCount(S, i)));
  if (mx >= 1 && !S.qIn) { S.deck.push(...S.qPile); S.qPile = []; shuffle(S.deck); S.qIn = true; log(S, '첫 토큰이 나와 Q 묶음을 덱에 섞었다.'); }
  if (mx >= 2 && !S.kIn) { S.deck.push(...S.kPile); S.kPile = []; shuffle(S.deck); S.kIn = true; log(S, '토큰 2개가 나와 K 묶음을 덱에 섞었다.'); }
  const w = S.seats.map((_, i) => i).filter(i => new Set(S.seats[i].tokens).size >= S.goal);
  if (w.length === 1) { S.winners = w; S.phase = 'ended'; log(S, `자리 ${w[0] + 1} 우승!`); fx(S, { t: 'win', seats: w }); return; }
  if (w.length >= 2) {
    if (!S.ot) { S.ot = true; S.goal = 4; fx(S, { t: 'banner', text: '4색 연장전!', seats: w, tone: 'bad' }); log(S, `3색을 채운 사람이 ${w.length}명. 4색 연장전에 들어간다(4번째 토큰 비용 3장).`); }
    else {
      let c = w.slice(); const detail: string[] = [];
      while (c.length > 1) {
        const sums = c.map(i => S.seats[i].tokens.slice(0, 4).reduce(a => a + d6(), 0));
        detail.push(c.map((i, k) => `자리 ${i + 1}=${sums[k]}`).join(', '));
        const m = Math.max(...sums); c = c.filter((_, k) => sums[k] === m);
      }
      S.winners = c; S.phase = 'ended'; log(S, `큐빅 롤: ${detail.join(' / ')} → 자리 ${c[0] + 1} 우승!`); fx(S, { t: 'win', seats: c }); return;
    }
  }
  const n = N(S); const all = (Object.keys(MG) as MgId[]).filter(k => MG[k].min <= n && n <= MG[k].max);
  // 디지털판: 한 번 한 미니게임은 그 뒤 MG_REST라운드 동안 6장에 넣지 않는다(남는 게 6개보다 적으면 그대로)
  const rest = (S.recentMg || []).slice(-MG_REST); const fresh = all.filter(k => !rest.includes(k));
  const pool = fresh.length >= 6 ? fresh : all;
  const b: MgId[] = []; while (b.length < 6) b.push(...shuffle(pool.slice())); S.board = b.slice(0, 6);
  const disp: Card[] = []; for (let k = 0; k < 2 * N(S) + 1; k++) { const x = draw(S); if (x) disp.push(x); }
  S.rewardDisp = disp;
  S.phase = 'roll'; S.die = null;
  log(S, '메인 턴이 모두 끝났다. 미니게임 6장: ' + S.board.map(k => MG[k].name).join(', ') + ' / 보상 진열: ' + disp.map(cname).join(' '));
}

/** ♣Q·♣K로 미니게임 고르기: ♣Q는 지금 칸의 양옆, ♣K는 6칸 중 아무거나 */
export function clubChoices(S: GameState): number[] {
  const cc = S.clubChoose; if (!cc || !S.die) return [];
  if (R(cc.card) === 13) return [1, 2, 3, 4, 5, 6];
  return [((S.die - 2 + 6) % 6) + 1, (S.die % 6) + 1];
}
export function clubPick(S: GameState, k: number): void {
  const cc = S.clubChoose!; S.clubChoose = null; S.die = k; S.ready = {};
  log(S, `자리 ${cc.seat + 1}: ${cname(cc.card)}로 ${k}번 칸 → 이번 미니게임: ${MG[boardMg(S)].name}`);
  fx(S, { t: 'pick', v: k, mg: boardMg(S), seats: [cc.seat] });
  instantStart(S);
}

/* ---- 규칙 설명 시간: 모두 준비하면 시작 (♣는 그동안 언제든) ---- */
export function readyUp(S: GameState, i: number): boolean | undefined {
  if (S.phase !== 'clubs') return false;
  S.ready = S.ready || {}; S.ready[i] = true;
  if (S.seats.every((_, k) => S.ready![k])) { S.deadline = null; reclaim(S); log(S, '모두 준비 완료. 버림 줄과 앞의 아이템을 거둬 덱에 섞었다.'); startMinigame(S); }
}

/* ---- 미니게임 공통 ---- */
export function reclaim(S: GameState): void {
  S.deck.push(...S.row.splice(0)); S.seats.forEach(p => S.deck.push(...p.front.splice(0))); shuffle(S.deck);
}
/** 재료 묶음 폐지: 덱에서 필요한 만큼 뽑는다 */
export function buildBundle(S: GameState, need: number): Card[] {
  const b: Card[] = []; for (let k = 0; k < need; k++) { const x = draw(S); if (!x) break; b.push(x); } return b;
}
/** 디지털판: 한 번 한 미니게임이 다시 미니게임 6장에 나오지 않는 라운드 수(사용자 2026-10-13) */
export const MG_REST = 3;
export function startMinigame(S: GameState): void {
  const id = boardMg(S); const n = N(S);
  S.recentMg = [...(S.recentMg || []), id].slice(-MG_REST);
  const ord: number[] = []; for (let k = 0; k < n; k++) ord.push((S.first + k) % n);
  S.phase = 'mg';
  if (id === 'hold') { S.mg = { id, pan: 1, ord, ci: 0, k: 0, s: 0, tot: Array(n).fill(0), last: null }; }
  if (id === 'bomb') { S.mg = { id, bundle: [], alive: ord.slice(), ci: 0, lay: [], flip: {}, arm: {}, out: [] }; bombLay(S); }
  if (id === 'auction') {
    // 손패 6장, 상품 5장: 마지막 경매에도 고를 카드가 남는다
    const bundle = buildBundle(S, 5 + 6 * n); const hands: Record<number, Card[]> = {}; ord.forEach(i => hands[i] = bundle.splice(0, 6));
    const prizes = bundle.splice(0, 5).map((c, k) => ({ c, up: k < 3 }));
    S.mg = { id, bundle, hands, prizes, ai: 0, pot: [], step: 'pre', ready: {}, bids: {}, won: {}, spent: [] };
    ord.forEach(i => (S.mg as { won: Record<number, Card[]> }).won[i] = []); auctionOpen(S);
  }
  if (id === 'balloon') balloonStart(S, ord);
  if (id === 'rps' || id === 'vault') ovnStart(S, id);
  if (id === 'count') countStart(S, ord);
  if (id === 'race') raceStart(S, ord);
  if (id === 'nunchi') duelStart(S);
  if (id === 'updown') updownStart(S);
  if (id === 'curling') curlingStart(S);
  if (id === 'line') lineStart(S);
  if (id === 'speed') speedStart(S);
  if (id === 'fold') foldStart(S);
  if (id === 'chain') chainStart(S);
  if (id === 'mid') midStart(S);
  if (id === 'gesture') gestureStart(S);
  if (id === 'stack') stackStart(S);
  if (id === 'change') changeStart(S);
  if (id === 'cave') caveStart(S);
  if (id === 'ten') tenStart(S);
  if (id === 'balance') balanceStart(S);
  if (id === 'liar') liarStart(S);
  if (id === 'fore') foreStart(S);
  if (id === 'fork') forkStart(S);
  if (id === 'dodge') dodgeStart(S);
  log(S, `미니게임 시작: ${MG[id].name}`); fx(S, { t: 'title', mg: id });
}
/** scores: {seat:value} → 순위 그룹 [[seat..],..] */
export function rankBy(scores: Record<number, number>, desc = true): number[][] {
  const ks = Object.keys(scores).map(Number); const vals = [...new Set(ks.map(k => scores[k]))].sort((a, b) => desc ? b - a : a - b);
  return vals.map(v => ks.filter(k => scores[k] === v));
}
export function outGroups(m: { out: number[][] }, first?: number[]): number[][] {
  const g = first && first.length ? [first.slice()] : [];
  for (let k = m.out.length - 1; k >= 0; k--) g.push(m.out[k]);
  return g;
}
type AnyMg = {
  bundle?: Card[]; lay?: (Card | null)[]; flip?: Record<number, { c: Card }>; hands?: Record<number, Card[]>;
  prizes?: ({ c: Card } | null)[]; won?: Record<number, Card[]>; spent?: Card[]; pot?: ({ c: Card } | Card)[]; pile?: Card[];
};
/** 미니게임 마지막 결과를 보여 주는 시간(ms). 그동안 미니게임 화면에 머물고 행동은 받지 않는다(사용자 2026-10-13) */
export const MG_HOLD = 3500;
/** 점수 묶음을 결과판 점수로: 숫자 + 단위(pre가 있으면 앞말, 예: 벌점 3) */
export function scoreOf(pts: Record<number, number>, u: string, pre?: string): MgScore {
  const o: MgScore = {}; Object.keys(pts).forEach(k => o[+k] = { v: String(pts[+k]), ...(pre ? { pre } : { u }) }); return o;
}
export function endMinigame(S: GameState, groups: number[][], score?: MgScore): void {
  S.mgEnd = { groups, at: now() + MG_HOLD, ...(score ? { score } : {}) }; S.lastRank = groups;
}
/** 결과를 보여 준 뒤: 재료를 덱에 섞고, 동점 주사위, 순위 발표, 보상 고르기로 */
export function finishMinigame(S: GameState): void {
  const groups = S.mgEnd!.groups, score = S.mgEnd!.score; delete S.mgEnd;
  const m = S.mg as AnyMg;
  if (m.bundle) {
    const back = m.bundle.slice();
    if (m.lay) back.push(...(m.lay.filter(Boolean) as Card[]));
    Object.values(m.flip || {}).forEach(f => back.push(f.c));
    if (m.hands) Object.values(m.hands).forEach(h => back.push(...h));
    if (m.prizes) m.prizes.forEach(p => p && back.push(p.c));
    if (m.won) Object.values(m.won).forEach(w => back.push(...w));
    if (m.spent) back.push(...m.spent);
    if (m.pot) back.push(...m.pot.map(p => (typeof p === 'string' ? p : p.c)));
    if (m.pile) back.push(...m.pile);
    S.deck.push(...back); shuffle(S.deck);
  }
  // 미니게임만 하기: 보상이 없으니 동점 주사위도 없이 순위만 알리고 끝
  if (S.solo) {
    S.lastRank = groups; fx(S, { t: 'rank', groups, rolls: {}, order: groups.flat(), score });
    log(S, `${MG[S.solo].name} 결과: ` + groups.map((g, k) => `${k + 1}위 ${g.map(i => '자리 ' + (i + 1)).join('·')}`).join(' / '));
    S.mg = null; S.rewardDisp = null; S.phase = 'ended'; S.winners = groups[0] || []; return;
  }
  // 같은 순위끼리는 주사위를 굴려 높은 눈부터 보상을 고른다(같은 눈끼리만 다시). 굴린 눈은 결과 화면에서 보여 준다
  const rolls: Record<number, number[]> = {}; const order: number[] = [];
  const tie = (c: number[]): void => {
    if (c.length < 2) { order.push(...c); return; }
    const r = c.map(() => d6()); c.forEach((j, k) => (rolls[j] = rolls[j] || []).push(r[k]));
    [...new Set(r)].sort((a, b) => b - a).forEach(v => tie(c.filter((_, k) => r[k] === v)));
  };
  groups.forEach(g => tie(g.slice()));
  S.lastRank = groups; fx(S, { t: 'rank', groups, rolls, order, score });
  log(S, '미니게임 순위: ' + groups.map((g, k) => `${k + 1}위 ${g.map(i => '자리 ' + (i + 1)).join('·')}`).join(' / '));
  const disp = S.rewardDisp || []; S.rewardDisp = null;
  S.mg = null; S.phase = 'reward'; S.reward = { disp, order: order.concat(order), pi: 0 };
  if (!disp.length) finishReward(S);
}
export function rewardPick(S: GameState, i: number, c: Card): void {
  const Rw = S.reward!; Rw.disp.splice(Rw.disp.indexOf(c), 1); S.seats[i].hand.push(c); Rw.pi++;
  log(S, `자리 ${i + 1}: 보상 ${cname(c)}`);
  if (Rw.pi >= Rw.order.length || !Rw.disp.length) finishReward(S);
}
export function finishReward(S: GameState): void {
  S.reward!.disp.forEach(c => S.row.push(c)); S.reward = null;
  S.first = (S.first + 1) % N(S); S.round++; S.die = null; S.board = null;
  log(S, `${S.round}라운드. 선: 자리 ${S.first + 1}.`); startMain(S);
}

/** 시간 지난 단계 넘기기 (방장 기기에서) */
/** 미니게임 아이템 대상 고르기 시간 초과(actions.ts가 넣는다: 행동 판정을 거쳐야 해서) */
let itemTick: ((S: GameState) => boolean) | null = null;
export function setItemTick(f: (S: GameState) => boolean): void { itemTick = f; }
export function advanceTimers(S: GameState): boolean {
  bindSeed(S.rng);
  const t = now();
  // 미니게임이 끝나 결과를 보여 주는 중: 시간이 되면 순위로. 그동안 미니게임 타이머는 멈춘다
  if (S.mgEnd) { if (t < S.mgEnd.at) return false; finishMinigame(S); return true; }
  if (S.mgItems && itemTick && itemTick(S)) return true;
  if (S.phase === 'clubs' && S.deadline && t >= S.deadline && !S.clubChoose) {
    S.deadline = null; reclaim(S); log(S, '버림 줄과 앞의 아이템을 거둬 덱에 섞었다.');
    startMinigame(S); return true;
  }
  if (S.phase === 'defense' && S.pending && t >= S.pending.deadline) { resolveAttack(S); return true; }
  // 선 가위바위보: 결과 연출이 끝나면 탈락 적용
  if (S.phase === 'mg' && S.mg?.id === 'rps' && S.mg.step === 'show' && S.mg.until && t >= S.mg.until) { rpsAfterShow(S); return true; }
  // 눈치 경매(디지털판): 아이템 낼 시간이 지나면 입찰로
  if (S.phase === 'mg' && S.mg?.id === 'auction' && S.mg.step === 'pre' && S.mg.until && t >= S.mg.until) { S.mg.step = 'bid'; return true; }
  return advanceMg2(S, t) || advanceMg3(S, t) || advanceMg4(S, t);
}
