/* 미니게임 2 (2026-10-12 추가분). 순수 함수: 상태를 받아 고친다 */
import { R, cname, now, rnd, shuffle } from './cards';
import { buildBundle, draw, endMinigame, fx, hasItem, log, N, rankBy, useItem } from './core';
import type {
  Card, ChainMg, CurlShot, CurlingMg, DuelMg, FoldMg, GameState, LineMg, MidCrit, MidMg, SpeedMg, Stone, UpDownMg,
} from './types';

const mgOf = <T>(S: GameState) => S.mg as unknown as T;
const seatOrd = (S: GameState): number[] => { const n = N(S), o: number[] = []; for (let k = 0; k < n; k++) o.push((S.first + k) % n); return o; };
const anyItem = (S: GameState, seats: number[]) => seats.some(j => hasItem(S, j));
const nm = (i: number) => `자리 ${i + 1}`;

/* ================= 눈치 게임 (디지털판: 서부 총잡이 결투) =================
   판마다: 대치 시작 → 무작위 시점에 종소리(소리만). 각 기기가 상태를 받은 때부터 lead 뒤 대치, 그로부터 sig 뒤 종소리를 낸다.
   반응 시간은 각 기기가 재서 보낸다(통신 지연과 무관). 신호 전에 누르면 부정출발 -1점. 판마다 1등 3점·2등 2점·3등 1점, 5판 합계 */
export const DUEL_PANS = 5, DUEL_FIRST_LEAD = 5000, DUEL_LEAD = 3500, DUEL_WAIT = 3500;
export function duelStart(S: GameState): void {
  const pts: Record<number, number> = {}; seatOrd(S).forEach(i => pts[i] = 0);
  S.mg = { id: 'nunchi', pan: 0, max: DUEL_PANS, t0: 0, lead: 0, sig: 0, decoys: [], fakes: [], res: {}, pts, last: null };
  duelPan(S);
}
function duelPan(S: GameState): void {
  const m = mgOf<DuelMg>(S); m.pan++;
  // 처음 2.5초는 신호가 나오지 않는다. 그 뒤 6초 안에
  m.t0 = now(); m.lead = m.pan === 1 ? DUEL_FIRST_LEAD : DUEL_LEAD; m.sig = 2500 + rnd(3500);
  const nd = rnd(4); m.decoys = [];
  for (let k = 0; k < nd; k++) m.decoys.push({ t: 600 + rnd(Math.max(400, m.sig - 900)), k: rnd(4) });
  m.decoys.sort((a, b) => a.t - b.t); m.fakes = []; m.res = {};
}
/** 판이 끝나는 방장 시각(아무도 안 눌러도) */
export const duelDeadline = (m: DuelMg): number => m.t0 + m.lead + m.sig + DUEL_WAIT;
export function duelHit(S: GameState, i: number, ms: number | null): false | undefined {
  const m = mgOf<DuelMg>(S); if (i in m.res || !(i in m.pts)) return false;
  m.res[i] = ms == null ? 'fs' : Math.max(0, Math.round(ms));
  if (Object.keys(m.pts).every(k => +k in m.res)) duelEnd(S);
}
/** 아이템(가짜 신호): 대치 중, 종소리 전에. 판마다 한 번 */
export function duelFake(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<DuelMg>(S); const t = now();
  if (m.fakes.includes(i) || i in m.res || t > m.t0 + m.lead + m.sig - 250) return false;
  if (!useItem(S, i, item)) return false;
  m.fakes.push(i); log(S, `눈치 게임: ${nm(i)} 아이템 → 가짜 신호!`);
}
export function duelEnd(S: GameState): void {
  const m = mgOf<DuelMg>(S); const gain: Record<number, number> = {};
  const ok = Object.keys(m.res).map(Number).filter(k => m.res[k] !== 'fs').sort((a, b) => (m.res[a] as number) - (m.res[b] as number));
  // 같은 반응 시간은 같은 점수
  let place = 0; ok.forEach((k, j) => { if (j && m.res[k] !== m.res[ok[j - 1]]) place = j; gain[k] = Math.max(0, 3 - place); });
  Object.keys(m.res).map(Number).filter(k => m.res[k] === 'fs').forEach(k => gain[k] = -1);
  Object.keys(gain).forEach(k => m.pts[+k] += gain[+k]);
  m.last = { pan: m.pan, res: { ...m.res }, gain };
  log(S, `눈치 게임 ${m.pan}판: ` + Object.keys(m.pts).map(k => `${nm(+k)} ${m.res[+k] === 'fs' ? '부정출발' : m.res[+k] != null ? m.res[+k] + 'ms' : '못 쏨'}`).join(', '));
  fx(S, { t: 'duel', pan: m.pan, res: { ...m.res }, gain });
  if (m.pan >= m.max) { endMinigame(S, rankBy(m.pts)); return; }
  duelPan(S);
}

/* ================= 위냐 아래냐 ================= */
export function updownStart(S: GameState): void {
  const ord = seatOrd(S), n = ord.length; const pts: Record<number, number> = {}; ord.forEach(i => pts[i] = 0);
  S.mg = { id: 'updown', ord, turn: 0, turns: n * (n <= 3 ? 2 : 1), coins: n <= 3 ? 3 : 2, step: 'grip', grip: {}, call: null, regrip: false, pts, last: null };
}
export const udCaller = (m: UpDownMg) => m.ord[m.turn % m.ord.length];
export const udShouter = (m: UpDownMg) => m.ord[(m.turn + 1) % m.ord.length];
export function udGrip(S: GameState, i: number, n: number): false | undefined {
  const m = mgOf<UpDownMg>(S); if (m.step !== 'grip' || i in m.grip || !(n >= 0 && n <= m.coins)) return false;
  m.grip[i] = n; if (m.ord.every(j => j in m.grip)) m.step = 'call';
}
export function udCall(S: GameState, i: number, v: number): false | undefined {
  const m = mgOf<UpDownMg>(S); if (m.step !== 'call' || i !== udCaller(m) || !(v >= 0 && v <= m.coins * m.ord.length)) return false;
  m.call = v; m.step = 'shout'; log(S, `위냐 아래냐: ${nm(i)}이 ${v}을 불렀다.`);
}
/** 아이템: 외치는 사람이 외치기 전에 동전을 다시 쥔다 */
export function udRegrip(S: GameState, i: number, item: Card, n: number): false | undefined {
  const m = mgOf<UpDownMg>(S); if (m.step !== 'shout' || i !== udShouter(m) || m.regrip || !(n >= 0 && n <= m.coins)) return false;
  if (!useItem(S, i, item)) return false;
  m.grip[i] = n; m.regrip = true; log(S, `위냐 아래냐: ${nm(i)} 아이템 → 동전을 다시 쥐었다.`); fx(S, { t: 'banner', text: '다시 쥐기!', seats: [i] });
}
export function udShout(S: GameState, i: number, up: boolean): false | undefined {
  const m = mgOf<UpDownMg>(S); if (m.step !== 'shout' || i !== udShouter(m)) return false;
  const caller = udCaller(m), call = m.call!; const sum = m.ord.reduce((a, j) => a + (m.grip[j] || 0), 0);
  let gain: number; let who: number;
  if (sum === call) { who = caller; gain = 2; }
  else if ((up && sum > call) || (!up && sum < call)) { who = i; gain = 1; }
  else { who = caller; gain = 1; }
  m.pts[who] += gain;
  m.last = { caller, shouter: i, call, up, sum, grip: { ...m.grip }, gain };
  log(S, `위냐 아래냐: ${call}에 "${up ? '위' : '아래'}!" → 합 ${sum}. ${nm(who)} +${gain}`);
  fx(S, { t: 'updown', ...m.last, who });
  m.turn++;
  if (m.turn >= m.turns) { endMinigame(S, rankBy(m.pts)); return; }
  m.step = 'grip'; m.grip = {}; m.call = null; m.regrip = false;
}

/* ================= 말 컬링 =================
   판 위 2D 물리(엔진 순수 함수, 고정 시간 간격). 방장이 계산한 결과를 상태로 보내고, 화면은 같은 계산을 다시 돌려 굴러가는 모습을 보여 준다 */
export const CURL = { W: 17, L: 30, R: 1.2, F: 40, VMAX: 60, DT: 1 / 240, E_STONE: .85, E_WALL: .6 };
export function curlingStart(S: GameState): void {
  const ord = seatOrd(S); const score: Record<number, number[]> = {}; ord.forEach(i => score[i] = []);
  S.mg = { id: 'curling', ord, end: 1, ends: 3, seq: [], si: 0, stones: [], noWall: false, score, last: null, until: 0, step: 'aim' };
  curlSeq(S);
}
function curlSeq(S: GameState): void {
  const m = mgOf<CurlingMg>(S); const e = (m.end - 1) % m.ord.length;
  // 판마다 먼저 튕기는 사람을 왼쪽으로. 한 바퀴 돌면 두 번째 말
  const base = m.ord.slice(e).concat(m.ord.slice(0, e)); m.seq = base.concat(base); m.si = 0; m.stones = []; m.noWall = false; m.step = 'aim';
}
/** 출발 자리: 1번 구역 끝(판 가장자리). 말이 있으면 가장자리를 따라 옆으로 */
export function curlStartX(stones: Stone[], x: number): number {
  const { W, R: r } = CURL; const lo = -W / 2 + r, hi = W / 2 - r; x = Math.min(hi, Math.max(lo, x));
  const free = (px: number) => stones.every(s => Math.hypot(s.x - px, s.y - r) >= 2 * r);
  if (free(x)) return x;
  for (let d = .2; d < W; d += .2) { if (x + d <= hi && free(x + d)) return x + d; if (x - d >= lo && free(x - d)) return x - d; }
  return x;
}
/** 샷 하나를 끝까지 굴린다. frame(t초, 말들)으로 중간 모습을 받을 수 있다. 판 밖으로 나간 말은 뺀다 */
export function curlRun(before: Stone[], seat: number, shot: CurlShot, noWall: boolean, frame?: (t: number, st: { seat: number; x: number; y: number; out: boolean }[]) => void): { stones: Stone[]; secs: number } {
  const { W, L, R: r, F, VMAX, DT, E_STONE, E_WALL } = CURL;
  const a = Math.max(-1.2, Math.min(1.2, shot.angle)); const pw = Math.max(.05, Math.min(1, shot.power));
  const sx = curlStartX(before, shot.x);
  const b = before.map(s => ({ seat: s.seat, x: s.x, y: s.y, vx: 0, vy: 0, out: false }));
  b.push({ seat, x: sx, y: r, vx: Math.sin(a) * pw * VMAX, vy: Math.cos(a) * pw * VMAX, out: false });
  let t = 0;
  for (let step = 0; step < 240 * 15; step++) {
    let moving = false;
    for (const s of b) {
      if (s.out) continue; const v = Math.hypot(s.vx, s.vy); if (v === 0) continue;
      const nv = Math.max(0, v - F * DT); if (nv < .3) { s.vx = 0; s.vy = 0; continue; }
      s.vx *= nv / v; s.vy *= nv / v; s.x += s.vx * DT; s.y += s.vy * DT; moving = true;
    }
    // 말끼리 부딪힘(같은 무게)
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const p = b[i], q = b[j]; if (p.out || q.out) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy); if (d >= 2 * r || d === 0) continue;
      const nx = dx / d, ny = dy / d; const rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
      if (rel > 0) { const J = (1 + E_STONE) / 2 * rel; p.vx -= J * nx; p.vy -= J * ny; q.vx += J * nx; q.vy += J * ny; moving = true; }
      const push = (2 * r - d) / 2; p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push;
    }
    for (const s of b) {
      if (s.out) continue;
      // 끝 벽(게임 박스). 아이템을 쓰면 이번엔 벽이 없다
      if (!noWall && s.y + r > L) { s.y = L - r; if (s.vy > 0) s.vy = -s.vy * E_WALL; }
      // 옆·앞·(벽 없을 때) 끝으로 판 밖에 나가면 치운다
      if (Math.abs(s.x) > W / 2 || s.y < 0 || s.y > L) { s.out = true; s.vx = 0; s.vy = 0; }
    }
    t += DT;
    if (frame && step % 4 === 0) frame(t, b.map(s => ({ seat: s.seat, x: s.x, y: s.y, out: s.out })));
    if (!moving) break;
  }
  if (frame) frame(t, b.map(s => ({ seat: s.seat, x: s.x, y: s.y, out: s.out })));
  return { stones: b.filter(s => !s.out).map(s => ({ seat: s.seat, x: s.x, y: s.y })), secs: t };
}
/** 멈춘 구역의 숫자. 선에 걸치면 낮은 쪽 */
export const curlZone = (s: Stone): number => { const lo = s.y - CURL.R; return lo < 10 ? 1 : lo < 20 ? 2 : 3; };
export const curlTurn = (m: CurlingMg): number | null => m.step === 'aim' && m.si < m.seq.length ? m.seq[m.si] : null;
export function curlNoWall(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<CurlingMg>(S); if (curlTurn(m) !== i || m.noWall) return false;
  if (!useItem(S, i, item)) return false;
  m.noWall = true; log(S, `말 컬링: ${nm(i)} 아이템 → 이번엔 박스를 치우고 튕긴다.`); fx(S, { t: 'banner', text: '벽 치우기!', seats: [i], tone: 'bad' });
}
export function curlShot(S: GameState, i: number, shot: CurlShot): false | undefined {
  const m = mgOf<CurlingMg>(S); if (curlTurn(m) !== i || now() < m.until) return false;
  if (![shot.x, shot.angle, shot.power].every(Number.isFinite)) return false;
  const before = m.stones.map(s => ({ ...s })); const r = curlRun(before, i, shot, m.noWall);
  m.last = { seat: i, before, shot: { ...shot }, noWall: m.noWall, n: (m.last?.n || 0) + 1 };
  m.stones = r.stones; m.noWall = false; m.si++; m.until = now() + Math.round(r.secs * 1000) + 500;
  if (m.si >= m.seq.length) m.step = 'score';
}
/** 판 끝: 멈춘 말로 점수(판마다 주사위 1개로 앞에 둔다) */
export function curlScore(S: GameState): void {
  const m = mgOf<CurlingMg>(S); const got: Record<number, number> = {};
  m.ord.forEach(j => { got[j] = m.stones.filter(s => s.seat === j).reduce((a, s) => a + curlZone(s), 0); m.score[j].push(got[j]); });
  log(S, `말 컬링 ${m.end}판: ` + m.ord.map(j => `${nm(j)} ${got[j]}점`).join(', '));
  fx(S, { t: 'curl', end: m.end, got });
  m.end++;
  if (m.end > m.ends) { const tot: Record<number, number> = {}; m.ord.forEach(j => tot[j] = m.score[j].reduce((a, v) => a + v, 0)); endMinigame(S, rankBy(tot)); return; }
  curlSeq(S);
}

/* ================= 조용한 줄 서기 ================= */
export const LINE_READY = 3000, LINE_PAUSE = 7000;
export function lineStart(S: GameState): void {
  const ord = seatOrd(S); const won: Record<number, Card[]> = {}; ord.forEach(i => won[i] = []);
  S.mg = { id: 'line', ord, pan: 0, hands: {}, pile: [], won, spent: [], bundle: [], step: 'ready', until: 0, pause: null, last: null };
  linePan(S);
}
function linePan(S: GameState): void {
  const m = mgOf<LineMg>(S); m.pan++;
  // 판마다 2·3·4장
  m.ord.forEach(i => { m.hands[i] = buildBundle(S, m.pan + 1).sort((a, b) => R(a) - R(b)); });
  m.step = 'ready'; m.until = now() + LINE_READY; m.last = null;
}
export function linePlay(S: GameState, i: number): false | undefined {
  const m = mgOf<LineMg>(S); if (m.step !== 'play' || !m.hands[i]?.length) return false;
  const h = m.hands[i]; let k = 0; h.forEach((c, j) => { if (R(c) < R(h[k])) k = j; }); const c = h.splice(k, 1)[0];
  // 더 작은 카드를 든 사람은 "멈춰!": 낸 사람(너무 빨랐다)과 멈춘 사람(너무 늦었다)이 벌점 1씩. 같은 숫자는 괜찮다
  const stop: Record<number, Card> = {};
  m.ord.forEach(j => {
    if (j === i) return; const sm = m.hands[j].filter(x => R(x) < R(c)); if (!sm.length) return;
    const keep = sm.reduce((a, x) => R(x) < R(a) ? x : a, sm[0]); stop[j] = keep; m.won[j].push(keep);
    m.hands[j] = m.hands[j].filter(x => !sm.includes(x)); m.spent.push(...sm.filter(x => x !== keep));
  });
  const caught = Object.keys(stop).length > 0;
  if (caught) m.won[i].push(c); else m.pile.push(c);
  m.last = { seat: i, c, stop };
  log(S, `조용한 줄 서기: ${nm(i)} ${cname(c)}${caught ? ` → 멈춰! ${Object.keys(stop).map(j => nm(+j) + ' ' + cname(stop[+j])).join(', ')}` : ''}`);
  if (caught) fx(S, { t: 'line', seat: i, c, stop, seats: [i, ...Object.keys(stop).map(Number)] });
  if (m.ord.every(j => !m.hands[j].length)) {
    S.deck.push(...m.pile, ...m.spent); m.pile = []; m.spent = []; shuffle(S.deck);
    if (m.pan >= 3) { const pen: Record<number, number> = {}; m.ord.forEach(j => pen[j] = m.won[j].length); endMinigame(S, rankBy(pen, false)); return; }
    linePan(S);
  }
}
/** 아이템(엿보기): 언제든. 모두 멈추고 낸 사람이 다른 사람마다 손패 1장을 몰래 본다 */
export function linePeek(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<LineMg>(S); if (m.step !== 'play' || !(i in m.won)) return false;
  if (!useItem(S, i, item)) return false;
  const peek: Record<number, Card> = {}; m.ord.forEach(j => { const h = m.hands[j]; if (j !== i && h.length) peek[j] = h[rnd(h.length)]; });
  m.pause = { seat: i, peek }; m.step = 'pause'; m.until = now() + LINE_PAUSE;
  log(S, `조용한 줄 서기: ${nm(i)} "잠깐!" (아이템 엿보기)`); fx(S, { t: 'banner', text: '잠깐!', seats: [i] });
}
export function lineGo(S: GameState, i: number): false | undefined {
  const m = mgOf<LineMg>(S); if (m.step !== 'pause' || m.pause?.seat !== i) return false;
  m.step = 'play'; m.pause = null; fx(S, { t: 'banner', text: '계속!', seats: [i] });
}

/* ================= 스피드 ================= */
export const SPEED_PRE = 3000, SPEED_GO = 1500, SPEED_STUCK = 1500;
export function speedStart(S: GameState): void {
  const ord = seatOrd(S); const won: Record<number, Card[]> = {}; ord.forEach(i => won[i] = []);
  S.mg = { id: 'speed', ord, pan: 0, hands: {}, piles: [], won, spent: [], bundle: [], step: 'pre', until: 0, last: null };
  speedPan(S);
}
function speedPan(S: GameState): void {
  const m = mgOf<SpeedMg>(S); m.pan++;
  m.ord.forEach(i => { m.hands[i] = buildBundle(S, 5); });
  m.piles = buildBundle(S, 3).map(c => [c]); m.last = null;
  // 가운데 카드를 공개한 뒤 아이템을 쓸 틈(3초). 아이템 가진 사람이 없으면 짧게 "시작!"
  m.step = 'pre'; m.until = now() + (anyItem(S, m.ord) ? SPEED_PRE : SPEED_GO);
}
export const speedFits = (top: Card, c: Card): boolean => { const d = Math.abs(R(top) - R(c)); return d === 1 || d === 12; };
const speedCanAny = (m: SpeedMg) => m.ord.some(j => m.hands[j].some(c => m.piles.some(p => speedFits(p[p.length - 1], c))));
export function speedPile(S: GameState, i: number, item: Card, c: Card): false | undefined {
  const m = mgOf<SpeedMg>(S); if (m.step !== 'pre' || !m.hands[i]?.includes(c)) return false;
  if (!useItem(S, i, item)) return false;
  m.hands[i].splice(m.hands[i].indexOf(c), 1); m.piles.push([c]);
  log(S, `스피드: ${nm(i)} 아이템 → ${cname(c)}로 새 더미`); fx(S, { t: 'banner', text: '새 더미!', seats: [i] });
}
export function speedGo(S: GameState): void { const m = mgOf<SpeedMg>(S); m.step = 'play'; speedCheck(S); }
function speedCheck(S: GameState): void {
  const m = mgOf<SpeedMg>(S); if (m.step !== 'play' || speedCanAny(m)) return;
  m.step = 'stuck'; m.until = now() + SPEED_STUCK; log(S, '스피드: 막혔다!'); fx(S, { t: 'banner', text: '막혔다!' });
}
export function speedUnstick(S: GameState): void {
  const m = mgOf<SpeedMg>(S); let got = 0;
  m.piles.forEach(p => { const c = draw(S); if (c) { p.push(c); got++; } });
  if (!got) { speedPanEnd(S, null); return; }
  m.step = 'play'; speedCheck(S);
}
export function speedPlay(S: GameState, i: number, c: Card, k: number): false | undefined {
  const m = mgOf<SpeedMg>(S); if (m.step !== 'play' || !m.hands[i]?.includes(c) || !m.piles[k]) return false;
  // 동시에 놓으면 먼저 놓인 카드가 우선: 그사이 맨 위가 바뀌어 맞지 않으면 받지 않는다(손으로 되돌린다)
  if (!speedFits(m.piles[k][m.piles[k].length - 1], c)) return false;
  m.hands[i].splice(m.hands[i].indexOf(c), 1); m.piles[k].push(c); m.last = { seat: i, c, pile: k };
  if (!m.hands[i].length) { speedPanEnd(S, i); return; }
  speedCheck(S);
}
function speedPanEnd(S: GameState, w: number | null): void {
  const m = mgOf<SpeedMg>(S);
  // 남은 손패는 벌점으로 자기 앞에
  m.ord.forEach(j => { m.won[j].push(...m.hands[j]); m.hands[j] = []; });
  m.piles.forEach(p => S.deck.push(...p)); m.piles = []; shuffle(S.deck);
  log(S, `스피드 ${m.pan}판: ${w != null ? nm(w) + '이 손패를 다 털었다. ' : ''}벌점 ` + m.ord.map(j => `${nm(j)} ${m.won[j].length}`).join(', '));
  fx(S, { t: 'banner', text: w != null ? '다 털었다!' : '판 끝', seats: w != null ? [w] : [], tone: 'win' });
  if (m.pan >= 3) { const pen: Record<number, number> = {}; m.ord.forEach(j => pen[j] = m.won[j].length); endMinigame(S, rankBy(pen, false)); return; }
  speedPan(S);
}

/* ================= 손병호 게임 ================= */
export function foldStart(S: GameState): void {
  const ord = seatOrd(S); const fingers: Record<number, number> = {}; ord.forEach(i => fingers[i] = 5);
  S.mg = { id: 'fold', ord, ci: 0, fingers, step: 'say', text: '', said: [], ans: {}, safe: {}, last: null };
}
const normSay = (t: string) => t.replace(/\s+/g, '').replace(/[!?.~]+$/g, '');
/** 이미 나온 조건인지(띄어쓰기·끝 문장부호 무시) */
export const foldIsDup = (m: FoldMg, t: string): boolean => m.said.some(x => normSay(x) === normSay((t || '').trim()));
export function foldSay(S: GameState, i: number, text: string): false | string | undefined {
  const m = mgOf<FoldMg>(S); text = (text || '').trim().slice(0, 60);
  if (m.step !== 'say' || m.ord[m.ci] !== i || !text) return false;
  // 이미 나온 조건은 다시 말할 수 없다
  if (m.said.some(x => normSay(x) === normSay(text))) return 'dup';
  m.text = text; m.said.push(text); m.step = 'answer'; m.ans = {}; m.safe = {};
  log(S, `손병호 게임: ${nm(i)} "${text} 접어!"`);
}
/** 아이템: 조건을 들은 뒤. 해당해도 이번엔 접지 않는다 */
export function foldSafe(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<FoldMg>(S); if (m.step !== 'answer' || i in m.ans || m.safe[i] || !(i in m.fingers)) return false;
  if (!useItem(S, i, item)) return false;
  m.safe[i] = true; log(S, `손병호 게임: ${nm(i)} 아이템 → 이번엔 접지 않는다.`);
}
export function foldAnswer(S: GameState, i: number, yes: boolean): false | undefined {
  const m = mgOf<FoldMg>(S); if (m.step !== 'answer' || i in m.ans || !(i in m.fingers)) return false;
  m.ans[i] = yes; if (!m.ord.every(j => j in m.ans)) return;
  const folded = m.ord.filter(j => m.ans[j] && !m.safe[j]); const safe = m.ord.filter(j => m.ans[j] && m.safe[j]);
  folded.forEach(j => m.fingers[j]--);
  m.last = { text: m.text, folded, safe };
  log(S, `손병호 게임: 접은 사람 ${folded.map(nm).join('·') || '없음'}`);
  fx(S, { t: 'fold', text: m.text, folded, safe, seats: folded });
  if (m.ord.some(j => m.fingers[j] <= 0)) { endMinigame(S, rankBy(m.fingers)); return; }
  m.ci = (m.ci + 1) % m.ord.length; m.step = 'say'; m.text = ''; m.ans = {}; m.safe = {};
}

/* ================= 손가락 사슬 ================= */
export const CHAIN_PRE = 3000, CHAIN_POINT = 6000, CHAIN_PASS = 3000, CHAIN_SHOW = 1500, CHAIN_DONE = 2500;
export function chainStart(S: GameState): void {
  const ord = seatOrd(S); const coins: Record<number, number> = {}; ord.forEach(i => coins[i] = 0);
  S.mg = { id: 'chain', ord, pan: 0, coins, step: 'pre', until: 0, two: {}, aim: {}, bent: {}, cur: ord[0], path: [], caught: null };
  chainPan(S);
}
function chainPan(S: GameState): void {
  const m = mgOf<ChainMg>(S); m.pan++;
  m.two = {}; m.aim = {}; m.bent = {}; m.path = []; m.caught = null; m.cur = m.ord[(m.pan - 1) % m.ord.length];
  // 카운트다운(셋, 둘, 하나) 동안 아이템을 낼 수 있다
  m.step = 'pre'; m.until = now() + CHAIN_PRE;
}
export const chainTagger = (m: ChainMg) => m.ord[(m.pan - 1) % m.ord.length];
/** 이번 판 이 자리의 손가락 수: 아이템을 쓴 사람이 있으면 쓴 사람만 2개, 나머지 1개 */
export const chainFingers = (m: ChainMg, i: number): number => (Object.keys(m.two).length ? (m.two[i] ? 2 : 1) : 2);
export function chainTwo(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<ChainMg>(S); if (m.step !== 'pre' || m.two[i] || !(i in m.coins)) return false;
  if (!useItem(S, i, item)) return false;
  m.two[i] = true; log(S, `손가락 사슬: ${nm(i)} 아이템 → 이번 판은 나만 손가락 2개.`); fx(S, { t: 'banner', text: '나만 두 손가락!', seats: [i], tone: 'bad' });
}
export function chainPoint(S: GameState): void { const m = mgOf<ChainMg>(S); m.step = 'point'; m.until = now() + CHAIN_POINT; }
export function chainAim(S: GameState, i: number, tg: number[]): false | undefined {
  const m = mgOf<ChainMg>(S); if (m.step !== 'point' || i in m.aim || !(i in m.coins)) return false;
  if (tg.length !== chainFingers(m, i) || new Set(tg).size !== tg.length || tg.some(t => t === i || !(t in m.coins))) return false;
  m.aim[i] = tg.slice(); if (m.ord.every(j => j in m.aim)) chainReveal(S);
}
/** 가리키기 시간이 지나면 못 고른 사람은 무작위로 */
export function chainReveal(S: GameState): void {
  const m = mgOf<ChainMg>(S);
  m.ord.forEach(j => { if (!(j in m.aim)) m.aim[j] = shuffle(m.ord.filter(x => x !== j)).slice(0, chainFingers(m, j)); m.bent[j] = m.aim[j].map(() => false); });
  m.cur = chainTagger(m); m.path = [m.cur]; m.step = 'pass'; m.until = now() + CHAIN_SHOW + CHAIN_PASS;
  fx(S, { t: 'chainAim', aim: { ...m.aim } });
}
export function chainPass(S: GameState, i: number, k: number): false | undefined {
  const m = mgOf<ChainMg>(S); if (m.step !== 'pass' || m.cur !== i || !m.bent[i] || m.bent[i][k] !== false) return false;
  m.bent[i][k] = true; const nx = m.aim[i][k]; m.path.push(nx);
  // 손가락을 둘 다 접은 사람에게 차례가 오면 넘길 수 없어 걸린다
  if (m.bent[nx].every(Boolean)) { chainCaught(S, nx); return; }
  m.cur = nx; m.until = now() + CHAIN_PASS;
}
export function chainCaught(S: GameState, j: number): void {
  const m = mgOf<ChainMg>(S); m.coins[j]++; m.caught = j; m.step = 'done'; m.until = now() + CHAIN_DONE;
  log(S, `손가락 사슬 ${m.pan}판: ${nm(j)} 걸림! (동전 ${m.coins[j]}개)`); fx(S, { t: 'banner', text: '걸렸다!', seats: [j], tone: 'bad' });
}
export function chainNext(S: GameState): void {
  const m = mgOf<ChainMg>(S);
  if (m.pan >= m.ord.length) { endMinigame(S, rankBy(m.coins, false)); return; }
  chainPan(S);
}

/* ================= 가운데 숫자 ================= */
export const MID_PRE = 3000, MID_PANS = 5;
export function midStart(S: GameState): void {
  const ord = seatOrd(S); const hands: Record<number, Card[]> = {}, won: Record<number, Card[]> = {};
  ord.forEach(i => { hands[i] = buildBundle(S, 6).sort((a, b) => R(a) - R(b)); won[i] = []; });
  S.mg = { id: 'mid', ord, pan: 0, hands, won, spent: [], bundle: [], deckCard: null, crit: 'mid', critBy: null, step: 'pre', until: 0, picks: {}, last: null };
  midPan(S);
}
function midPan(S: GameState): void {
  const m = mgOf<MidMg>(S); m.pan++; m.picks = {}; m.crit = 'mid'; m.critBy = null;
  // 4인은 가운데가 2장이 되므로 판마다 덱에서 1장을 공개해 함께 놓는다
  m.deckCard = m.ord.length === 4 ? draw(S) : null;
  if (anyItem(S, m.ord)) { m.step = 'pre'; m.until = now() + MID_PRE; } else m.step = 'pick';
}
/** 아이템(기준 바꾸기): 고르기 전에. 여럿이 내면 마지막 것. 나올 때마다 3초를 다시 센다 */
export function midCrit(S: GameState, i: number, item: Card, crit: MidCrit): false | undefined {
  const m = mgOf<MidMg>(S); if (m.step !== 'pre' || !(i in m.hands) || m.crit === crit || !['mid', 'hi', 'lo'].includes(crit)) return false;
  if (!useItem(S, i, item)) return false;
  m.crit = crit; m.critBy = i; m.until = now() + MID_PRE;
  const w = { mid: '가운데', hi: '가장 큰', lo: '가장 작은' }[crit];
  log(S, `가운데 숫자: ${nm(i)} 아이템 → 이번 판은 ${w} 숫자`); fx(S, { t: 'banner', text: `이번 판: ${w} 숫자!`, seats: [i] });
}
export function midGo(S: GameState): void { mgOf<MidMg>(S).step = 'pick'; }
export function midPick(S: GameState, i: number, c: Card): false | undefined {
  const m = mgOf<MidMg>(S); if (m.step !== 'pick' || i in m.picks || !m.hands[i]?.includes(c)) return false;
  m.hands[i].splice(m.hands[i].indexOf(c), 1); m.picks[i] = c;
  if (!m.ord.every(j => j in m.picks)) return;
  const vals = m.ord.map(j => R(m.picks[j])); if (m.deckCard) vals.push(R(m.deckCard)); vals.sort((a, b) => a - b);
  const target = m.crit === 'hi' ? vals[vals.length - 1] : m.crit === 'lo' ? vals[0] : vals[Math.floor(vals.length / 2)];
  // 덱 카드가 기준에 걸리면 그 판은 무산
  const vd = !!m.deckCard && R(m.deckCard) === target;
  const win = vd ? [] : m.ord.filter(j => R(m.picks[j]) === target);
  m.ord.forEach(j => (win.includes(j) ? m.won[j] : m.spent).push(m.picks[j])); if (m.deckCard) m.spent.push(m.deckCard);
  m.last = { picks: { ...m.picks }, deckCard: m.deckCard, crit: m.crit, target, win, void: vd };
  log(S, `가운데 숫자 ${m.pan}판: ${m.ord.map(j => nm(j) + ' ' + cname(m.picks[j])).join(', ')}${m.deckCard ? ' / 덱 ' + cname(m.deckCard) : ''} → ${vd ? '무산' : win.map(nm).join('·') + ' 1점'}`);
  fx(S, { t: 'mid', ...m.last, seats: win });
  m.deckCard = null; m.picks = {};
  if (m.pan >= MID_PANS) { const sc: Record<number, number> = {}; m.ord.forEach(j => sc[j] = m.won[j].length); endMinigame(S, rankBy(sc)); return; }
  midPan(S);
}

/** 방장 시계로 넘기는 단계들 (core.ts advanceTimers에서 부른다) */
export function advanceMg2(S: GameState, t: number): boolean {
  const m = S.mg; if (S.phase !== 'mg' || !m) return false;
  if (m.id === 'nunchi' && t >= duelDeadline(m)) { duelEnd(S); return true; }
  if (m.id === 'curling' && m.step === 'score' && t >= m.until) { curlScore(S); return true; }
  if (m.id === 'line' && (m.step === 'ready' || m.step === 'pause') && t >= m.until) { m.step = 'play'; m.pause = null; return true; }
  if (m.id === 'speed' && m.step === 'pre' && t >= m.until) { speedGo(S); return true; }
  if (m.id === 'speed' && m.step === 'stuck' && t >= m.until) { speedUnstick(S); return true; }
  if (m.id === 'chain' && t >= m.until) {
    if (m.step === 'pre') { chainPoint(S); return true; }
    if (m.step === 'point') { chainReveal(S); return true; }
    if (m.step === 'pass') { chainCaught(S, m.cur); return true; }
    if (m.step === 'done') { chainNext(S); return true; }
  }
  if (m.id === 'mid' && m.step === 'pre' && t >= m.until) { midGo(S); return true; }
  return false;
}
