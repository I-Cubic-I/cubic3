/* 미니게임 3 (2026-10-13 디지털판 추가: 몸짓 잇기·주사위 쌓기·뭐가 바뀌었지·동굴 탐험·합이 10·밸런스 게임). 순수 함수: 상태를 받아 고친다 */
import { R, cname, d6, now, rnd, shuffle } from './cards';
import { buildBundle, endMinigame, fx, hasItem, log, N, outGroups, rankBy, useItem } from './core';
import type { BalanceMg, Card, CaveMg, ChangeMg, ForeMg, ForkMg, GameState, GestureMg, LiarMg, StackMg, Suit, TenMg } from './types';
import { SYM, U } from './cards';

const mgOf = <T>(S: GameState) => S.mg as unknown as T;
const seatOrd = (S: GameState): number[] => { const n = N(S), o: number[] = []; for (let k = 0; k < n; k++) o.push((S.first + k) % n); return o; };
const nm = (i: number) => `자리 ${i + 1}`;

/* ================= 몸짓 잇기 =================
   디지털판: 몸짓 8개(손·팔 4개, 머리·몸 4개)를 버튼으로. 판정은 자동. 입력과 입력 사이에 시간 안에 못 누르면 막힌 것(탈락) */
export const GESTURES = ['손 들기', '박수', '팔짱', '손 흔들기', '고개 끄덕', '고개 젓기', '어깨 으쓱', '제자리 돌기'];
export const GEST_FIRST = 5000, GEST_STEP = 3000, GEST_SHOW = 1500;
export function gestureStart(S: GameState): void {
  S.mg = { id: 'gesture', alive: seatOrd(S), ci: 0, out: [], seq: [], pos: 0, until: now() + GEST_FIRST + GEST_SHOW, recent: [], n: 0 };
}
export const gestTurn = (m: GestureMg): number => m.alive[m.ci];
export function gesture(S: GameState, i: number, g: number): false | undefined {
  const m = mgOf<GestureMg>(S); if (gestTurn(m) !== i || !(g >= 0 && g < GESTURES.length)) return false;
  m.n++; m.recent = [...m.recent, { seat: i, g, n: m.n }].slice(-2);
  if (m.pos < m.seq.length) {
    // 따라 하는 중: 틀리면 탈락
    if (m.seq[m.pos] !== g) { gestOut(S, i, '틀렸다!'); return; }
    m.pos++; m.until = now() + GEST_STEP; return;
  }
  // 다 따라 했으면 새 몸짓 1개를 붙이고 다음 사람에게
  m.seq.push(g); m.pos = 0; m.ci = (m.ci + 1) % m.alive.length; m.until = now() + GEST_FIRST;
  log(S, `몸짓 잇기: ${nm(i)}이 새 몸짓을 붙였다 (${m.seq.length}개).`);
}
/** 아이템(건너뛰기): 내 차례에 따라 하기 전에. 몸짓 줄은 그대로 다음 사람에게 */
export function gestSkip(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<GestureMg>(S); if (gestTurn(m) !== i || m.pos !== 0 || !m.seq.length) return false;
  if (!useItem(S, i, item)) return false;
  m.ci = (m.ci + 1) % m.alive.length; m.until = now() + GEST_FIRST;
  log(S, `몸짓 잇기: ${nm(i)} 아이템 → 이번 차례를 건너뛴다.`); fx(S, { t: 'banner', text: '건너뛰기!', seats: [i] });
}
export function gestOut(S: GameState, i: number, why: string): void {
  const m = mgOf<GestureMg>(S); const idx = m.alive.indexOf(i);
  m.out.push([i]); m.alive.splice(idx, 1);
  log(S, `몸짓 잇기: ${nm(i)} 탈락 (${why}, 몸짓 ${m.seq.length}개).`); fx(S, { t: 'banner', text: why, seats: [i], tone: 'bad' });
  if (m.alive.length <= 1) { endMinigame(S, outGroups(m, m.alive)); return; }
  // 몸짓 줄을 비우고 탈락한 사람의 왼쪽부터 처음부터 다시
  m.seq = []; m.pos = 0; m.ci = idx % m.alive.length; m.until = now() + GEST_FIRST + GEST_SHOW; m.recent = [];
}

/* ================= 주사위 쌓기 (디지털판: 스태커) =================
   8행 5열. 좌우로 움직이는 네모를 멈춰 아래 칸 위에 쌓는다. 어긋나면 그 층부터 다시. 모두 동시에, 8층까지 걸린 시간으로 순위 */
export const STACK_ROWS = 8, STACK_COLS = 5, STACK_PRE = 3000, STACK_LIMIT = 60000, STACK_FAIL = 1000;
/** 네모가 한 칸 움직이는 시간(ms): 1층은 느리고, 위로 갈수록 크게 빨라진다 */
export const stackPeriod = (row: number): number => Math.max(45, Math.round(420 * Math.pow(0.72, row)));
export function stackStart(S: GameState): void {
  const ord = seatOrd(S); const h: Record<number, number> = {}; ord.forEach(i => h[i] = 0);
  const cols: Record<number, number[]> = {}; ord.forEach(i => cols[i] = []);
  S.mg = { id: 'stack', ord, step: 'pre', until: now() + STACK_PRE, limit: STACK_LIMIT, wide: {}, h, ms: {}, done: {}, cols };
}
/** 아이템: 시작 전에. 이번엔 네모가 2칸(실물의 "두 손") */
export function stackWide(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<StackMg>(S); if (m.step !== 'pre' || m.wide[i] || !(i in m.h)) return false;
  if (!useItem(S, i, item)) return false;
  m.wide[i] = true; log(S, `주사위 쌓기: ${nm(i)} 아이템 → 이번엔 네모 2칸.`); fx(S, { t: 'banner', text: '두 손으로!', seats: [i] });
}
/** 내 기기에서 쌓은 층수. 8층이면 걸린 시간(ms)도 */
export function stackReport(S: GameState, i: number, h: number, ms: number | null, done: boolean, cols?: number[]): false | undefined {
  const m = mgOf<StackMg>(S); if (m.step !== 'play' || m.done[i] || !(i in m.h)) return false;
  if (Array.isArray(cols)) m.cols[i] = cols.slice(0, STACK_ROWS).map(c => Math.max(0, Math.min(STACK_COLS - 1, Math.floor(+c) || 0)));
  m.h[i] = Math.max(m.h[i], Math.min(STACK_ROWS, Math.floor(h)));
  if (m.h[i] >= STACK_ROWS && ms != null) { m.ms[i] = Math.round(ms); m.done[i] = true; log(S, `주사위 쌓기: ${nm(i)} 8층 완성 (${(ms / 1000).toFixed(2)}초).`); fx(S, { t: 'banner', text: '8층!', seats: [i], tone: 'win' }); }
  else if (done) m.done[i] = true;
  if (m.ord.every(j => m.done[j])) stackEnd(S);
}
export function stackEnd(S: GameState): void {
  const m = mgOf<StackMg>(S);
  // 다 쌓은 사람은 빠른 순서, 못 쌓은 사람은 그 아래에서 높이 순서
  const fin = m.ord.filter(j => j in m.ms); const ms: Record<number, number> = {}; fin.forEach(j => ms[j] = m.ms[j]);
  const rest: Record<number, number> = {}; m.ord.filter(j => !(j in m.ms)).forEach(j => rest[j] = m.h[j]);
  endMinigame(S, [...(fin.length ? rankBy(ms, false) : []), ...(Object.keys(rest).length ? rankBy(rest) : [])]);
}

/* ================= 뭐가 바뀌었지 =================
   디지털판: 말 8개가 점수 트랙 판(10×5칸)에 놓인다. 모두 본 뒤 바꾸는 사람 외에는 화면이 꺼지고, 바꾸는 사람이 2개를 옮긴다. 나머지는 각자 바뀐 말을 고른다 */
export const CHG_CELLS = 50, CHG_PIECES = 8, CHG_LOOK = 10000, CHG_MOVE = 25000, CHG_GUESS = 15000;
export function changeStart(S: GameState): void {
  const ord = seatOrd(S); const pts: Record<number, number> = {}; ord.forEach(i => pts[i] = 0);
  S.mg = { id: 'change', ord, pan: 0, changer: ord[0], step: 'look', until: 0, pieces: [], before: [], moved: [], need: 2, guesses: {}, pts, last: null };
  changePan(S);
}
function changePan(S: GameState): void {
  const m = mgOf<ChangeMg>(S); m.pan++; m.changer = m.ord[(m.pan - 1) % m.ord.length];
  const cells = shuffle([...Array(CHG_CELLS).keys()]); m.pieces = cells.slice(0, CHG_PIECES); m.before = m.pieces.slice();
  m.moved = []; m.need = 2; m.guesses = {}; m.step = 'look'; m.until = now() + CHG_LOOK;
}
const chgFree = (m: ChangeMg, c: number) => Number.isInteger(c) && c >= 0 && c < CHG_CELLS && !m.pieces.includes(c);
export function changeMove(S: GameState, i: number, p: number, c: number): false | undefined {
  const m = mgOf<ChangeMg>(S); if (m.step !== 'move' || i !== m.changer || !(p >= 0 && p < CHG_PIECES) || m.moved.includes(p) || !chgFree(m, c)) return false;
  m.pieces[p] = c; m.moved.push(p);
  if (m.moved.length >= m.need) changeGuessStep(S);
}
/** 아이템(하나 더 옮기기): 바꾸는 사람이 옮기는 동안. 아무도 3개를 다 찾지 못하면 바꾸는 사람 2점 */
export function changeMore(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<ChangeMg>(S); if (m.step !== 'move' || i !== m.changer || m.need !== 2) return false;
  if (!useItem(S, i, item)) return false;
  m.need = 3; log(S, `뭐가 바뀌었지: ${nm(i)} 아이템 → 말을 3개 옮긴다.`); fx(S, { t: 'banner', text: '하나 더 옮기기!', seats: [i] });
}
function changeGuessStep(S: GameState): void { const m = mgOf<ChangeMg>(S); m.step = 'guess'; m.until = now() + CHG_GUESS; }
/** 바꾸는 시간이 지나면 남은 만큼 무작위로 옮긴다 */
export function changeAutoMove(S: GameState): void {
  const m = mgOf<ChangeMg>(S);
  while (m.moved.length < m.need) {
    const ps = [...Array(CHG_PIECES).keys()].filter(p => !m.moved.includes(p)); const p = ps[rnd(ps.length)];
    const cs = [...Array(CHG_CELLS).keys()].filter(c => chgFree(m, c)); m.pieces[p] = cs[rnd(cs.length)]; m.moved.push(p);
  }
  changeGuessStep(S);
}
export function changeGuess(S: GameState, i: number, ps: number[]): false | undefined {
  const m = mgOf<ChangeMg>(S); if (m.step !== 'guess' || i === m.changer || !(i in m.pts) || i in m.guesses) return false;
  if (ps.length !== m.need || new Set(ps).size !== ps.length || ps.some(p => !(p >= 0 && p < CHG_PIECES))) return false;
  m.guesses[i] = ps.slice();
  if (m.ord.every(j => j === m.changer || j in m.guesses)) changeResolve(S);
}
export function changeResolve(S: GameState): void {
  const m = mgOf<ChangeMg>(S); const gain: Record<number, number> = {};
  m.ord.forEach(j => { if (j === m.changer) return; gain[j] = (m.guesses[j] || []).filter(p => m.moved.includes(p)).length; m.pts[j] += gain[j]; });
  // 하나 더 옮겼는데 아무도 3개를 다 찾지 못하면 바꾸는 사람 2점
  if (m.need === 3 && !Object.values(gain).some(v => v >= 3)) { gain[m.changer] = 2; m.pts[m.changer] += 2; }
  m.last = { changer: m.changer, moved: m.moved.slice(), guesses: { ...m.guesses }, gain };
  log(S, `뭐가 바뀌었지 ${m.pan}판: ` + Object.keys(gain).map(k => `${nm(+k)} +${gain[+k]}`).join(', '));
  fx(S, { t: 'change', ...m.last, pieces: m.pieces.slice(), before: m.before.slice() });
  if (m.pan >= m.ord.length) { endMinigame(S, rankBy(m.pts)); return; }
  changePan(S);
}

/* ================= 동굴 탐험 ================= */
export const CAVE_PRE = 3000, CAVE_SHOW = 1800, CAVE_PANS = 3;
export function caveStart(S: GameState): void {
  const ord = seatOrd(S); const score: Record<number, number[]> = {}; ord.forEach(i => score[i] = []);
  S.mg = { id: 'cave', ord, pan: 0, step: 'decide', until: 0, inside: [], di: 0, pool: 0, ones: 0, turn: 0, protect: 0, got: {}, score, last: null };
  cavePan(S);
}
function cavePan(S: GameState): void {
  const m = mgOf<CaveMg>(S); m.pan++; m.inside = m.ord.slice(); m.di = 0; m.pool = 0; m.ones = 0; m.turn = 0; m.protect = 0; m.got = {}; m.step = 'decide';
}
export const caveDecider = (m: CaveMg): number | null => (m.step === 'decide' && m.di < m.inside.length ? m.inside[m.di] : null);
/** 남기·나가기: 선부터 차례로(앞사람의 선택을 보고 정한다) */
export function caveGo(S: GameState, i: number, stay: boolean): false | undefined {
  const m = mgOf<CaveMg>(S); if (caveDecider(m) !== i) return false;
  if (stay) m.di++;
  else { m.got[i] = m.turn; m.inside.splice(m.di, 1); log(S, `동굴 탐험: ${nm(i)} 나가기 (${m.turn}턴).`); }
  if (m.di < m.inside.length) return;
  if (!m.inside.length) { caveEndPan(S); return; }
  // 굴리기 전 아이템(1 보호)을 낼 틈. 남은 사람 중 아이템 가진 사람이 없으면 바로 굴린다
  if (m.inside.some(j => hasItem(S, j))) { m.step = 'pre'; m.until = now() + CAVE_PRE; } else caveRoll(S);
}
/** 아이템(1 보호): 굴리기 전에. 이번 굴림의 1 중 1개를 빼지 않는다(1장당 1개) */
export function caveGuard(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<CaveMg>(S); if (m.step !== 'pre' || !m.inside.includes(i)) return false;
  if (!useItem(S, i, item)) return false;
  m.protect++; log(S, `동굴 탐험: ${nm(i)} 아이템 → 1 보호.`); fx(S, { t: 'banner', text: '1 보호!', seats: [i], tone: 'good' });
}
export function caveRoll(S: GameState): void {
  const m = mgOf<CaveMg>(S); m.pool = Math.min(3, m.pool + 1);
  const faces: number[] = []; for (let k = 0; k < m.pool; k++) faces.push(d6());
  const ones = faces.filter(v => v === 1).length; const kept = Math.min(m.protect, ones); const lost = ones - kept;
  m.pool -= lost; m.ones += lost; m.protect = 0;
  const collapse = m.ones >= 3; if (!collapse) m.turn++;
  m.last = { faces, kept, ones: m.ones, collapse, turn: m.turn };
  log(S, `동굴 탐험: 굴림 ${faces.join(' ')}${kept ? ` (1 보호 ${kept})` : ''} → 빼 둔 1 ${m.ones}개${collapse ? ' · 무너졌다!' : ` · ${m.turn}턴 버팀`}`);
  fx(S, { t: 'cave', ...m.last, seats: m.inside.slice() });
  if (collapse) m.inside.forEach(j => m.got[j] = 0);
  m.step = 'show'; m.until = now() + CAVE_SHOW;
}
/** 굴림을 보여 준 뒤: 무너졌으면 판 끝, 아니면 다시 남기·나가기 */
export function caveAfterShow(S: GameState): void {
  const m = mgOf<CaveMg>(S);
  if (m.last?.collapse) { m.inside = []; caveEndPan(S); return; }
  m.di = 0; m.step = 'decide';
}
function caveEndPan(S: GameState): void {
  const m = mgOf<CaveMg>(S); m.ord.forEach(j => m.score[j].push(m.got[j] ?? 0));
  log(S, `동굴 탐험 ${m.pan}판: ` + m.ord.map(j => `${nm(j)} ${m.got[j] ?? 0}점`).join(', '));
  if (m.pan >= CAVE_PANS) { const sc: Record<number, number> = {}; m.ord.forEach(j => sc[j] = m.score[j].reduce((a, v) => a + v, 0)); endMinigame(S, rankBy(sc)); return; }
  cavePan(S);
}

/* ================= 합이 10 =================
   디지털판: 주사위 잡기 = 버튼. 반응 시간은 각 기기가 "카드가 화면에 뜬 순간부터" 재서 보내고, 방장은 잠깐 모아 가장 빠른 사람을 고른다 */
export const TEN_EACH = 6, TEN_PANS = 3, TEN_GRAB = 400;
export function tenStart(S: GameState): void {
  const ord = seatOrd(S); const hands: Record<number, Card[]> = {}; ord.forEach(i => hands[i] = buildBundle(S, TEN_EACH));
  S.mg = { id: 'ten', ord, pan: 1, hands, slots: [[], [], []], ci: 0, all: false, flipN: 0, grabs: {}, grabUntil: 0, spent: [], bundle: [], last: null };
}
const tenTop = (m: TenMg) => m.slots.map(s => s[s.length - 1] || null);
/** 지금 잡을 수 있는 것들(자리 번호): 보이는 카드로 어떻게든 합이 10이 되면(10 한 장·두 장·세 장, 사용자 2026-10-13) */
export function tenPairs(m: TenMg): number[][] {
  const t = tenTop(m); const out: number[][] = [];
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const x = t[a], y = t[b]; if (x && y && R(x) + R(y) === 10) out.push([a, b]); }
  t.forEach((x, k) => { if (x && R(x) === 10) out.push([k]); });
  if (t.every(Boolean) && t.reduce((a, x) => a + R(x!), 0) === 10) out.push([0, 1, 2]);
  return out;
}
export const tenTurn = (m: TenMg): number => m.ord[m.ci];
export function tenPlace(S: GameState, i: number, k: number): false | undefined {
  const m = mgOf<TenMg>(S); if (tenTurn(m) !== i || !m.hands[i]?.length || !m.slots[k] || m.grabUntil) return false;
  // 빈 자리가 있으면 빈 자리에
  if (m.slots.some(s => !s.length) && m.slots[k].length) return false;
  const c = m.hands[i].pop()!; m.slots[k].push(c); m.flipN++; m.grabs = {};
  tenNext(S);
}
function tenNext(S: GameState): void {
  const m = mgOf<TenMg>(S); const n = m.ord.length;
  for (let s = 1; s <= n; s++) { const j = (m.ci + s) % n; if (m.hands[m.ord[j]].length) { m.ci = j; return; } }
  // 아무도 낼 카드가 없고 10도 없으면 끝
  if (!tenPairs(m).length) tenEnd(S);
}
/** 아이템(판 키우기): 내 차례에 놓기 전에. 이번 판은 이긴 사람이 세 자리를 모두 가져간다 */
export function tenAll(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<TenMg>(S); if (tenTurn(m) !== i || m.all) return false;
  if (!useItem(S, i, item)) return false;
  m.all = true; log(S, `합이 10: ${nm(i)} 아이템 → 이번 판은 세 자리 모두.`); fx(S, { t: 'banner', text: '판 키우기!', seats: [i] });
}
export function tenGrab(S: GameState, i: number, n: number, ms: number): false | undefined {
  const m = mgOf<TenMg>(S); if (!(i in m.hands) || n !== m.flipN || i in m.grabs) return false;
  if (!tenPairs(m).length) {
    // 합이 10이 아닌데 잡으면 내 더미에서 1장을 버린다
    const c = m.hands[i].shift(); if (c) m.spent.push(c); m.grabs[i] = -1;
    log(S, `합이 10: ${nm(i)} 잘못 잡음${c ? ` (${cname(c)} 버림)` : ''}`); fx(S, { t: 'banner', text: '땡!', seats: [i], tone: 'bad' });
    // 버리다가 놓을 차례인 사람의 더미가 바닥났으면 다음 사람에게
    if (!m.hands[tenTurn(m)].length) tenNext(S);
    return;
  }
  m.grabs[i] = Math.max(0, ms); if (!m.grabUntil) m.grabUntil = now() + TEN_GRAB;
}
/** 잡기를 잠깐 모은 뒤 가장 빠른 사람이 가져간다(10이 된 두 자리, 아이템이면 세 자리 모두) */
export function tenTake(S: GameState): void {
  const m = mgOf<TenMg>(S); m.grabUntil = 0;
  const ok = Object.keys(m.grabs).map(Number).filter(j => m.grabs[j] >= 0); if (!ok.length) return;
  const w = ok.reduce((a, j) => (m.grabs[j] < m.grabs[a] ? j : a), ok[0]);
  // 잡을 것이 여럿이면 더미가 큰 쪽(10 한 장이면 그 자리만)
  const size = (x: number[]) => x.reduce((a, k) => a + m.slots[k].length, 0);
  const pr = tenPairs(m).sort((x, y) => size(y) - size(x))[0];
  const take = m.all ? [0, 1, 2] : pr; const got: Card[] = []; take.forEach(k => { got.push(...m.slots[k]); m.slots[k] = []; });
  m.hands[w].unshift(...got); m.last = { seat: w, slots: take, got: got.length, all: m.all };
  log(S, `합이 10 ${m.pan}판: ${nm(w)}이 ${got.length}장 가져감 (${m.grabs[w]}ms)`); fx(S, { t: 'banner', text: `${got.length}장 획득!`, seats: [w], tone: 'win' });
  m.grabs = {}; m.all = false; m.pan++;
  if (m.pan > TEN_PANS) { tenEnd(S); return; }
  // 이긴 사람이 다음 판의 선
  m.ci = m.ord.indexOf(w); if (!m.hands[w].length) tenNext(S);
}
function tenEnd(S: GameState): void {
  const m = mgOf<TenMg>(S); m.slots.forEach(s => m.spent.push(...s)); m.slots = [[], [], []];
  const sc: Record<number, number> = {}; m.ord.forEach(j => sc[j] = m.hands[j].length);
  log(S, '합이 10 끝: ' + m.ord.map(j => `${nm(j)} ${sc[j]}장`).join(', ')); endMinigame(S, rankBy(sc));
}

/* ================= 밸런스 게임 ================= */
export function balanceStart(S: GameState): void {
  const ord = seatOrd(S); const pts: Record<number, number> = {}; ord.forEach(i => pts[i] = 0);
  S.mg = { id: 'balance', ord, ci: 0, step: 'say', opts: [], three: false, picks: {}, pts, last: null };
}
export function balanceSay(S: GameState, i: number, opts: string[]): false | undefined {
  const m = mgOf<BalanceMg>(S); if (m.step !== 'say' || m.ord[m.ci] !== i) return false;
  const o = opts.map(x => String(x || '').trim().slice(0, 30)); const need = m.three ? 3 : 2;
  if (o.length !== need || o.some(x => !x) || new Set(o).size !== o.length) return false;
  m.opts = o; m.picks = {}; m.step = 'pick'; log(S, `밸런스 게임: ${nm(i)} "${o.join(' vs ')}"`);
}
/** 아이템: 선일 때 주제를 말하기 전에. 세 가지 중에서 고르고 점수는 3점 */
export function balanceThree(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<BalanceMg>(S); if (m.step !== 'say' || m.ord[m.ci] !== i || m.three) return false;
  if (!useItem(S, i, item)) return false;
  m.three = true; log(S, `밸런스 게임: ${nm(i)} 아이템 → 세 가지, 3점.`); fx(S, { t: 'banner', text: '세 가지!', seats: [i] });
}
export function balancePick(S: GameState, i: number, k: number): false | undefined {
  const m = mgOf<BalanceMg>(S); if (m.step !== 'pick' || !(i in m.pts) || i in m.picks || !(k >= 0 && k < m.opts.length)) return false;
  m.picks[i] = k; if (!m.ord.every(j => j in m.picks)) return;
  const cnt = m.opts.map((_, q) => m.ord.filter(j => m.picks[j] === q).length); const mx = Math.max(...cnt);
  // 가장 많은 쪽이 혼자일 때만 점수(동점이면 아무도 없음)
  const win = cnt.filter(v => v === mx).length === 1 ? cnt.indexOf(mx) : null; const gain = m.three ? 3 : 1;
  if (win != null) m.ord.forEach(j => { if (m.picks[j] === win) m.pts[j] += gain; });
  m.last = { opts: m.opts.slice(), picks: { ...m.picks }, win, gain };
  log(S, `밸런스 게임: ${m.opts.map((x, q) => `${x} ${cnt[q]}`).join(' / ')} → ${win == null ? '동점, 점수 없음' : m.opts[win] + ' +' + gain}`);
  fx(S, { t: 'balance', ...m.last, seats: win == null ? [] : m.ord.filter(j => m.picks[j] === win) });
  m.ci++; m.three = false;
  if (m.ci >= m.ord.length) { endMinigame(S, rankBy(m.pts)); return; }
  m.step = 'say'; m.opts = []; m.picks = {};
}

/* ================= 거짓말쟁이 ================= */
export const LIAR_EACH = 4, LIAR_JUDGE = 3000;
export function liarStart(S: GameState): void {
  const ord = seatOrd(S);
  S.mg = { id: 'liar', ord, alive: ord.slice(), ci: 0, out: [], hands: {}, bundle: [], bid: null, caller: null, step: 'bid', until: 0, adds: {}, last: null };
  liarDeal(S);
}
function liarDeal(S: GameState): void {
  const m = mgOf<LiarMg>(S);
  m.ord.forEach(j => { if (m.hands[j]?.length) S.deck.push(...m.hands[j]); m.hands[j] = []; }); shuffle(S.deck);
  m.alive.forEach(j => m.hands[j] = buildBundle(S, LIAR_EACH));
  m.bid = null; m.caller = null; m.adds = {}; m.step = 'bid';
}
export const liarTurn = (m: LiarMg): number => m.alive[m.ci];
/** 선언: "[문양]이 [N]장 이상". N은 반드시 올린다(문양은 자유) */
export function liarBid(S: GameState, i: number, suit: Suit, n: number): false | undefined {
  const m = mgOf<LiarMg>(S); if (m.step !== 'bid' || liarTurn(m) !== i || !SYM[suit] || !Number.isInteger(n) || n < 1 || n <= (m.bid?.n || 0)) return false;
  m.bid = { seat: i, suit, n }; m.ci = (m.ci + 1) % m.alive.length;
  log(S, `거짓말쟁이: ${nm(i)} "${SYM[suit]} ${n}장 이상!"`);
}
const liarItemOk = (S: GameState, m: LiarMg, j: number) => !!m.bid && S.seats[j].hand.some(c => R(c) >= 11 && U(c) === m.bid!.suit);
/** "거짓말!": 모두 공개. 아이템(그 문양 J·Q·K)을 가진 사람이 있으면 낼 틈을 둔다 */
export function liarCall(S: GameState, i: number): false | undefined {
  const m = mgOf<LiarMg>(S); if (m.step !== 'bid' || liarTurn(m) !== i || !m.bid) return false;
  m.caller = i; log(S, `거짓말쟁이: ${nm(i)} "거짓말!"`); fx(S, { t: 'banner', text: '거짓말!', seats: [i], tone: 'bad' });
  if (m.ord.some(j => liarItemOk(S, m, j))) { m.step = 'judge'; m.until = now() + LIAR_JUDGE; } else liarJudge(S);
}
/** 아이템(내 아이템도 센다): 판정 때 누구나. 선언한 문양의 아이템만 1장씩 더한다 */
export function liarAdd(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<LiarMg>(S); if (m.step !== 'judge' || !m.bid || U(item) !== m.bid.suit || !(i in m.hands)) return false;
  if (!useItem(S, i, item)) return false;
  (m.adds[i] = m.adds[i] || []).push(item); log(S, `거짓말쟁이: ${nm(i)} 아이템 ${cname(item)} → ${SYM[m.bid.suit]} 1장 더`);
  fx(S, { t: 'banner', text: `${SYM[m.bid.suit]} +1!`, seats: [i] });
}
export function liarJudge(S: GameState): void {
  const m = mgOf<LiarMg>(S); const b = m.bid!; const caller = m.caller!;
  const count = m.alive.reduce((a, j) => a + m.hands[j].filter(c => U(c) === b.suit).length, 0) + Object.values(m.adds).reduce((a, v) => a + v.length, 0);
  // 선언이 맞으면(N장 이상) 외친 사람이, 틀리면 선언한 사람이 탈락
  const loser = count >= b.n ? caller : b.seat;
  m.last = { bid: { ...b }, caller, count, loser, hands: JSON.parse(JSON.stringify(m.hands)), adds: { ...m.adds } };
  log(S, `거짓말쟁이: ${SYM[b.suit]} ${count}장 (선언 ${b.n}) → ${nm(loser)} 탈락`);
  fx(S, { t: 'liar', ...m.last, seats: [loser] });
  const idx = m.alive.indexOf(loser); m.out.push([loser]); m.alive.splice(idx, 1);
  if (m.alive.length <= 1) { m.ord.forEach(j => { S.deck.push(...m.hands[j]); m.hands[j] = []; }); shuffle(S.deck); endMinigame(S, outGroups(m, m.alive)); return; }
  // 남은 사람끼리 새로 4장씩, 탈락한 사람의 왼쪽부터
  m.ci = idx % m.alive.length; liarDeal(S);
}

/* ================= 이마 위의 카드 ================= */
export const FORE_EACH = 5, FORE_PANS = 3;
export function foreStart(S: GameState): void {
  const ord = seatOrd(S); const hands: Record<number, Card[]> = {}; ord.forEach(i => hands[i] = buildBundle(S, FORE_EACH));
  S.mg = { id: 'fore', ord, pan: 0, extra: false, hands, bundle: [], fore: {}, pile: [], seq: [], si: 0, acts: {}, asks: {}, last: null };
  forePan(S);
}
function forePan(S: GameState): void {
  const m = mgOf<ForeMg>(S); m.pan++;
  const live = m.ord.filter(j => m.hands[j].length);
  if (live.length <= 1) { foreEnd(S); return; }
  // 시작 사람을 판마다 왼쪽으로. 더미가 있는 사람만, 맨 위 1장을 보지 않고 이마로(참가비)
  const st = (m.pan - 1) % m.ord.length; const rot = m.ord.slice(st).concat(m.ord.slice(0, st));
  m.seq = rot.filter(j => m.hands[j].length); m.si = 0; m.acts = {}; m.asks = {}; m.fore = {};
  m.seq.forEach(j => { m.fore[j] = m.hands[j].pop()!; });
}
export const foreTurn = (m: ForeMg): number | null => (m.si < m.seq.length ? m.seq[m.si] : null);
/** 승부(더미에서 1장 더 걸기, 카드가 없어도 승부할 수 있다) 또는 포기 */
export function foreAct(S: GameState, i: number, go: boolean): false | undefined {
  const m = mgOf<ForeMg>(S); if (foreTurn(m) !== i) return false;
  m.acts[i] = go; if (go && m.hands[i].length) m.pile.push(m.hands[i].pop()!);
  log(S, `이마 위의 카드: ${nm(i)} ${go ? '승부' : '포기'}`);
  m.si++; if (m.si >= m.seq.length) foreResolve(S);
}
/** 아이템(거울): 내 차례에 승부·포기 전에. 1명에게 "내 카드가 v보다 높아?" — 사실대로 답한다(디지털은 자동) */
export function foreAsk(S: GameState, i: number, item: Card, to: number, v: number): false | undefined {
  const m = mgOf<ForeMg>(S); if (foreTurn(m) !== i || i in m.asks || to === i || !(to in m.fore) || !(v >= 1 && v <= 13)) return false;
  if (!useItem(S, i, item)) return false;
  m.asks[i] = { to, v, yes: R(m.fore[i]) > v };
  log(S, `이마 위의 카드: ${nm(i)} 아이템 → ${nm(to)}에게 물었다`); fx(S, { t: 'banner', text: '거울!', seats: [i] });
}
function foreResolve(S: GameState): void {
  const m = mgOf<ForeMg>(S); const goers = m.seq.filter(j => m.acts[j]);
  m.pile.push(...m.seq.map(j => m.fore[j]));
  const mx = goers.length ? Math.max(...goers.map(j => R(m.fore[j]))) : 0; const top = goers.filter(j => R(m.fore[j]) === mx);
  // 승부한 사람 중 가장 높은 사람이 걸린 카드를 모두 가져가 더미에 섞는다. 동점이거나 모두 포기하면 다음 판으로
  const win = top.length === 1 ? top[0] : null; const got = win != null ? m.pile.length : 0;
  m.last = { fore: { ...m.fore }, acts: { ...m.acts }, win, got };
  if (win != null) { m.hands[win].push(...m.pile); shuffle(m.hands[win]); m.pile = []; }
  log(S, `이마 위의 카드 ${m.pan}판: ${m.seq.map(j => `${nm(j)} ${cname(m.fore[j])}${m.acts[j] ? '' : '(포기)'}`).join(', ')} → ${win != null ? `${nm(win)} ${got}장` : '다음 판으로'}`);
  fx(S, { t: 'fore', ...m.last, seats: win != null ? [win] : [] });
  m.fore = {};
  // 3판(3판째에 걸린 카드가 남으면 1판 더)
  if (m.pan >= FORE_PANS && !(m.pile.length && !m.extra)) { foreEnd(S); return; }
  if (m.pan >= FORE_PANS) m.extra = true;
  forePan(S);
}
function foreEnd(S: GameState): void {
  const m = mgOf<ForeMg>(S); S.deck.push(...m.pile, ...Object.values(m.fore)); m.pile = []; m.fore = {}; shuffle(S.deck);
  const sc: Record<number, number> = {}; m.ord.forEach(j => sc[j] = m.hands[j].length);
  endMinigame(S, rankBy(sc));
}

/* ================= 갈림길 ================= */
export const FORK_PANS = 3, FORK_WAIT = 3000;
export function forkStart(S: GameState): void {
  const ord = seatOrd(S); const won: Record<number, Card[]> = {}; ord.forEach(i => won[i] = []);
  S.mg = { id: 'fork', ord, pan: 0, row: [], picks: {}, rev: {}, won, spent: [], bundle: [], step: 'pick', until: 0, last: null };
  forkPan(S);
}
function forkPan(S: GameState): void {
  const m = mgOf<ForkMg>(S); m.pan++; m.row = buildBundle(S, m.ord.length); m.picks = {}; m.rev = {}; m.step = 'pick';
  if (m.row.length < 2) forkEnd(S);
}
export function forkPick(S: GameState, i: number, k: number): false | undefined {
  const m = mgOf<ForkMg>(S); if (m.step !== 'pick' || !(i in m.won) || i in m.picks || !(k >= 0 && k < m.row.length)) return false;
  m.picks[i] = k; if (!m.ord.every(j => j in m.picks)) return;
  // 공개 전에 아이템(역배)을 낼 틈. 아이템 가진 사람이 없으면 바로 공개
  if (m.ord.some(j => hasItem(S, j) && !m.rev[j])) { m.step = 'wait'; m.until = now() + FORK_WAIT; } else forkReveal(S);
}
/** 아이템(역배): 공개 전에. 내 칸이 겹치면 나 혼자 가져가고, 안 겹치면 아무것도 못 가져간다 */
export function forkRev(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<ForkMg>(S); if (!(m.step === 'pick' || m.step === 'wait') || !(i in m.won) || m.rev[i]) return false;
  if (!useItem(S, i, item)) return false;
  m.rev[i] = true; log(S, `갈림길: ${nm(i)} 아이템 → 역배`); fx(S, { t: 'banner', text: '역배!', seats: [i] });
}
export function forkReveal(S: GameState): void {
  const m = mgOf<ForkMg>(S); const got: Record<number, number> = {};
  m.row.forEach((c, k) => {
    const who = m.ord.filter(j => m.picks[j] === k); const revs = who.filter(j => m.rev[j]);
    let w: number | null = null;
    if (revs.length === 1 && who.length >= 2) w = revs[0];                 // 역배: 겹쳤으면 나 혼자
    else if (who.length === 1 && !m.rev[who[0]]) w = who[0];               // 혼자 고른 칸(역배를 썼으면 못 가져감)
    if (w != null) { m.won[w].push(c); got[w] = R(c); } else m.spent.push(c);
  });
  m.last = { row: m.row.slice(), picks: { ...m.picks }, rev: { ...m.rev }, got };
  log(S, `갈림길 ${m.pan}판: ` + m.ord.map(j => `${nm(j)} ${m.picks[j] + 1}번${m.rev[j] ? '(역배)' : ''}${got[j] ? ` +${got[j]}` : ''}`).join(', '));
  fx(S, { t: 'fork', ...m.last, seats: Object.keys(got).map(Number) });
  m.row = [];
  if (m.pan >= FORK_PANS) { forkEnd(S); return; }
  forkPan(S);
}
function forkEnd(S: GameState): void {
  const m = mgOf<ForkMg>(S); m.spent.push(...m.row); m.row = [];
  const sc: Record<number, number> = {}; m.ord.forEach(j => sc[j] = m.won[j].reduce((a, c) => a + R(c), 0));
  endMinigame(S, rankBy(sc));
}

/** 방장 시계로 넘기는 단계들 (core.ts advanceTimers에서 부른다) */
export function advanceMg3(S: GameState, t: number): boolean {
  const m = S.mg; if (S.phase !== 'mg' || !m) return false;
  if (m.id === 'gesture' && t >= m.until) { gestOut(S, gestTurn(m), '시간 초과!'); return true; }
  if (m.id === 'stack') {
    if (m.step === 'pre' && t >= m.until) { m.step = 'play'; m.until = t + m.limit; return true; }
    // 제한 시간(+기기 지연 여유)이 지나면 끝
    if (m.step === 'play' && t >= m.until + 1500) { stackEnd(S); return true; }
  }
  if (m.id === 'change' && t >= m.until) {
    if (m.step === 'look') { m.step = 'move'; m.until = t + CHG_MOVE; return true; }
    if (m.step === 'move') { changeAutoMove(S); return true; }
    if (m.step === 'guess') { changeResolve(S); return true; }
  }
  if (m.id === 'cave' && t >= m.until) {
    if (m.step === 'pre') { caveRoll(S); return true; }
    if (m.step === 'show') { caveAfterShow(S); return true; }
  }
  if (m.id === 'ten' && m.grabUntil && t >= m.grabUntil) { tenTake(S); return true; }
  if (m.id === 'liar' && m.step === 'judge' && t >= m.until) { liarJudge(S); return true; }
  if (m.id === 'fork' && m.step === 'wait' && t >= m.until) { forkReveal(S); return true; }
  return false;
}
