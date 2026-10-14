/* 미니게임 4 (2026-10-14 디지털 전용: 주사위 눈 피하기). 순수 함수: 상태를 받아 고친다 */
import { d6, now, rnd, shuffle } from './cards';
import { endMinigame, fx, log, N, rankBy, scoreOf, useItem } from './core';
import type { Card, DodgeMg, GameState } from './types';

const mgOf = <T>(S: GameState) => S.mg as unknown as T;
const seatOrd = (S: GameState): number[] => { const n = N(S), o: number[] = []; for (let k = 0; k < n; k++) o.push((S.first + k) % n); return o; };
const nm = (i: number) => `자리 ${i + 1}`;

/* ================= 주사위 눈 피하기 =================
   3×3 판, 칸 번호 0~8 = 행×3+열(0 왼쪽 위). 공격자는 공개된 주사위 3개 중 하나를 골라 그 눈의 모양을 옮기고 돌려 놓는다.
   1 아무 1칸 · 2 띈 2칸(● · ●) · 3 한 줄 3칸(2·3은 45도씩 돌린다) · 4 2×2 · 5 X자(고정) · 6 두 줄(90도) */
/** 봉쇄 시간은 아이템 카드를 고르고 칸을 누르는 두 번의 조작이 들어가 다른 아이템 유예(3초)보다 길게. 공격자가 [바로 시작]으로 넘길 수 있다 */
export const DODGE_ATK = 30000, DODGE_DEF = 35000, DODGE_SHOW = 3400;
/** 칸 봉쇄를 쓰면 남은 시간을 공격자·수비자 모두 이만큼 늘린다(화면에 따로 알리지 않는다) */
export const DODGE_ITEM_MS = 10000;
/** 엿보기를 쓰면 수비자 마감을 이만큼 늘린다(사용자 2026-10-14: 컷신 뒤 5초쯤) */
export const DODGE_PEEK_MS = 5000;
/** 눈마다 놓을 수 있는 자리를 회전(방향)별로 묶은 것. 회전 버튼은 이 묶음을 차례로 돈다 */
const ROWS = [[0, 1, 2], [3, 4, 5], [6, 7, 8]], COLS = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];
export const DODGE_SHAPES: Record<number, number[][][]> = {
  1: [[0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => [c])],
  // ─ ╲ │ ╱ 순서(45도씩)
  2: [ROWS.map(r => [r[0], r[2]]), [[0, 8]], COLS.map(c => [c[0], c[2]]), [[2, 6]]],
  3: [ROWS, [[0, 4, 8]], COLS, [[2, 4, 6]]],
  4: [[[0, 1, 3, 4], [1, 2, 4, 5], [3, 4, 6, 7], [4, 5, 7, 8]]],
  5: [[[0, 2, 4, 6, 8]]],
  // │(양옆 세로 두 줄) ─(위아래 가로 두 줄)
  6: [[[0, 2, 3, 5, 6, 8]], [[0, 1, 2, 6, 7, 8]]],
};
const key = (cells: number[]) => cells.slice().sort((a, b) => a - b).join(',');
/** 이 눈으로 놓을 수 있는 모양인지 */
export function dodgeValid(die: number, cells: number[]): boolean {
  if (!Array.isArray(cells) || !DODGE_SHAPES[die]) return false;
  const k = key(cells); return DODGE_SHAPES[die].some(g => g.some(p => key(p) === k));
}
/** 상하좌우 한 칸 또는 제자리 */
export const dodgeNear = (a: number, b: number): boolean => {
  if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a < 9 && b >= 0 && b < 9)) return false;
  const dr = Math.abs(Math.floor(a / 3) - Math.floor(b / 3)), dc = Math.abs((a % 3) - (b % 3));
  return dr + dc <= 1;
};
export const dodgeAtk = (m: DodgeMg): number => m.ord[m.ai];
export const dodgeDefs = (m: DodgeMg): number[] => m.ord.filter(j => j !== dodgeAtk(m));
/** 수비자가 갈 수 있는 칸인지(봉쇄된 칸은 못 간다) */
export const dodgeCanGo = (m: DodgeMg, i: number, c: number): boolean => i in m.pos && dodgeNear(m.pos[i], c) && !m.blocked.includes(c);
/** 공격자가 봉쇄할 수 있는 칸: 아무도 서 있지 않고 아직 막지 않은 칸 */
export const dodgeCanBlock = (m: DodgeMg, c: number): boolean => Number.isInteger(c) && c >= 0 && c < 9 && !m.blocked.includes(c) && !Object.values(m.pos).includes(c);

export function dodgeStart(S: GameState): void {
  const ord = seatOrd(S); const pts: Record<number, number> = {}; ord.forEach(i => pts[i] = 0);
  S.mg = {
    id: 'dodge', ord, ai: 0, turn: 0, turns: ord.length === 2 ? 5 : 3, dice: [], pos: {}, blocked: [],
    step: 'pick', until: 0, dUntil: 0, shot: null, moves: {}, done: {}, peek: {}, pts, last: null,
  };
  dodgeNewAttacker(S);
}
/** 시작 위치: 변 가운데(① 위 1 · ② 왼쪽 3 · ③ 오른쪽 5 · ④ 아래 7). 수비자 1명은 가운데, 2명 ②③, 3명 ①②③, 4명 모두. 누가 어디에 설지는 무작위 */
const STARTS: Record<number, number[]> = { 1: [4], 2: [3, 5], 3: [1, 3, 5], 4: [1, 3, 5, 7] };
function dodgeNewAttacker(S: GameState): void {
  const m = mgOf<DodgeMg>(S); const defs = dodgeDefs(m); const spots = shuffle(STARTS[defs.length].slice());
  m.pos = {}; defs.forEach((j, k) => m.pos[j] = spots[k]);
  m.blocked = []; m.turn = 0; m.dice = [d6(), d6(), d6()];
  log(S, `주사위 눈 피하기: 공격자 ${nm(dodgeAtk(m))}`);
  dodgeTurn(S);
}
function dodgeTurn(S: GameState): void {
  const m = mgOf<DodgeMg>(S); m.turn++; m.shot = null; m.moves = {}; m.done = {}; m.peek = {};
  dodgePickStep(S);
}
function dodgePickStep(S: GameState): void {
  const m = mgOf<DodgeMg>(S); const t = now(); m.step = 'pick'; m.until = t + DODGE_ATK; m.dUntil = t + DODGE_DEF;
}
/** 아이템(칸 봉쇄): 공격자가 확정하기 전이면 언제든(사용자 2026-10-14). 빈 칸 하나를 이 공격자의 차례가 끝날 때까지 막는다.
    쓰는 순간(선언) 남은 시간을 모두 10초 늘리고(mgitems.ts), 그 칸으로 이동을 골라 둔 수비자는(확정했어도) 이동이 취소되어 다시 고른다 */
export function dodgeBlock(S: GameState, i: number, item: Card, c: number): false | undefined {
  const m = mgOf<DodgeMg>(S); if (m.step !== 'pick' || m.shot || dodgeAtk(m) !== i || !dodgeCanBlock(m, c)) return false;
  if (!useItem(S, i, item)) return false;
  m.blocked.push(c); log(S, `주사위 눈 피하기: ${nm(i)} 아이템 → ${c + 1}번 칸 봉쇄`); fx(S, { t: 'banner', text: '칸 봉쇄!', seats: [i], tone: 'bad' });
  for (const j of dodgeDefs(m)) if (m.moves[j] === c) { delete m.moves[j]; delete m.done[j]; }
  // (남은 시간 +10초는 아이템을 쓰는 순간에: mgitems.ts)
}
/** 수비자: 갈 칸을 고른다(확정 전에는 바꿀 수 있다. 수비자끼리 보인다) */
export function dodgeMove(S: GameState, i: number, c: number): false | undefined {
  const m = mgOf<DodgeMg>(S); if (m.step !== 'pick' || dodgeAtk(m) === i || m.done[i] || !dodgeCanGo(m, i, c)) return false;
  m.moves[i] = c;
}
/** 수비자: 확정 */
export function dodgeLock(S: GameState, i: number): false | undefined {
  const m = mgOf<DodgeMg>(S); if (m.step !== 'pick' || dodgeAtk(m) === i || !(i in m.pos) || m.done[i]) return false;
  if (!(i in m.moves)) m.moves[i] = m.pos[i];
  m.done[i] = true; dodgeCheck(S);
}
/** 공격자: 주사위 k의 모양을 cells에 놓는다(확정) */
export function dodgeShot(S: GameState, i: number, k: number, cells: number[]): false | undefined {
  const m = mgOf<DodgeMg>(S); if (m.step !== 'pick' || dodgeAtk(m) !== i || m.shot || !(k >= 0 && k < m.dice.length) || !dodgeValid(m.dice[k], cells)) return false;
  m.shot = { k, die: m.dice[k], cells: cells.slice().sort((a, b) => a - b) };
  dodgeCheck(S);
}
/** 아이템(엿보기): 수비자가, 공격자가 확정한 뒤 내가 확정하기 전에. 공격자가 고른 눈이 나에게만 보인다 */
export function dodgePeek(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<DodgeMg>(S); if (m.step !== 'pick' || !m.shot || dodgeAtk(m) === i || !(i in m.pos) || m.done[i] || m.peek[i]) return false;
  if (!useItem(S, i, item)) return false;
  m.peek[i] = true; m.dUntil += DODGE_PEEK_MS; log(S, `주사위 눈 피하기: ${nm(i)} 아이템 → 엿보기`); fx(S, { t: 'banner', text: '엿보기!', seats: [i] });
}
function dodgeCheck(S: GameState): void {
  const m = mgOf<DodgeMg>(S); if (m.shot && dodgeDefs(m).every(j => m.done[j])) dodgeResolve(S);
}
/** 공격자 시간 초과: 남은 주사위 중 무작위 하나가 아무 데나 떨어진다 */
function dodgeAutoShot(S: GameState): void {
  const m = mgOf<DodgeMg>(S); const k = rnd(m.dice.length); const all = DODGE_SHAPES[m.dice[k]].flat();
  m.shot = { k, die: m.dice[k], cells: all[rnd(all.length)].slice().sort((a, b) => a - b), auto: true };
  log(S, `주사위 눈 피하기: ${nm(dodgeAtk(m))} 시간 초과 → 무작위로 떨어진다`);
}
function dodgeResolve(S: GameState): void {
  const m = mgOf<DodgeMg>(S); const sh = m.shot!; const atk = dodgeAtk(m);
  // 확정하지 못한 수비자는 제자리
  const to: Record<number, number> = {}; dodgeDefs(m).forEach(j => to[j] = m.done[j] ? m.moves[j] ?? m.pos[j] : m.pos[j]);
  const hit = dodgeDefs(m).filter(j => sh.cells.includes(to[j]));
  m.pts[atk] += hit.length; dodgeDefs(m).forEach(j => { if (!hit.includes(j)) m.pts[j] += 1; });
  m.last = { atk, die: sh.die, cells: sh.cells.slice(), from: { ...m.pos }, to, hit, auto: !!sh.auto };
  m.pos = to;
  // 쓴 주사위만 다시 굴린다
  m.dice[sh.k] = d6();
  log(S, `주사위 눈 피하기: ${nm(atk)} ${sh.die} → ${hit.length ? hit.map(nm).join('·') + ' 맞음' : '헛방'}`);
  fx(S, { t: 'dodge', ...m.last, seats: hit });
  m.step = 'show'; m.until = now() + DODGE_SHOW;
}
function dodgeAfterShow(S: GameState): void {
  const m = mgOf<DodgeMg>(S);
  if (m.turn < m.turns) { dodgeTurn(S); return; }
  // 마지막 공격자였으면 끝(결과를 보여 주는 동안 화면이 마지막 공격을 그대로 보이게 ai는 그대로 둔다)
  if (m.ai + 1 >= m.ord.length) { endMinigame(S, rankBy(m.pts), scoreOf(m.pts, '점')); return; }
  m.ai++; dodgeNewAttacker(S);
}

/** 방장 시계로 넘기는 단계들 (core.ts advanceTimers에서 부른다) */
export function advanceMg4(S: GameState, t: number): boolean {
  const m = S.mg; if (S.phase !== 'mg' || !m || m.id !== 'dodge') return false;
  if (m.step === 'pick') {
    if (!m.shot && t >= m.until) { dodgeAutoShot(S); dodgeCheck(S); return true; }
    if (m.shot && t >= m.dUntil) { dodgeResolve(S); return true; }
  }
  if (m.step === 'show' && t >= m.until) { dodgeAfterShow(S); return true; }
  return false;
}
