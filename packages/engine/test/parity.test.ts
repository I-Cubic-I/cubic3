/* 대조 시험: 시험판 엔진(proto/web/index.html의 JS)과 새 TS 엔진에
   같은 무작위 대국을 돌려, 매 행동 뒤 상태가 완전히 같은지 본다. */
import { readFileSync } from 'node:fs';
import { deepStrictEqual } from 'node:assert';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import * as TS from '../src/index';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Eng = any;

function loadOld(): Eng {
  const html = readFileSync(new URL('../../../proto/web/index.html', import.meta.url), 'utf-8');
  const m = html.replace(/\r\n/g, '\n').match(/<script>\n(\/\* =+ 엔진[\s\S]*?\nif\(typeof module[^\n]*)/);
  if (!m) throw new Error('엔진 블록을 찾지 못했습니다');
  const module: { exports: Eng } = { exports: {} };
  new Function('module', m[1])(module);
  return module.exports;
}

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

let T = 1_000_000;
beforeAll(() => { vi.spyOn(Date, 'now').mockImplementation(() => T); });
afterAll(() => { vi.restoreAllMocks(); });

const OLD = loadOld();
const clone = <X>(o: X): X => JSON.parse(JSON.stringify(o));

/** 상태 A를 보고 다음 행동을 하나 고른다. 반환: [함수 이름, 인자 목록] 또는 직접 실행할 함수 */
type Step = { fn: string; args: (S: any) => unknown[] } | { raw: (E: Eng, S: any) => void };

function choose(S: any, E: Eng, pick: () => number): Step | null {
  const ri = (n: number) => Math.floor(pick() * n);
  const one = <X>(a: X[]): X => a[ri(a.length)];
  const R: (c: string) => number = E.R, U: (c: string) => string = E.U, isItem: (c: string) => boolean = E.isItem;
  const items = (i: number) => S.seats[i].hand.filter(isItem);
  const ph = S.phase;
  if (ph === 'ended') return null;
  if (ph === 'roll') return { fn: 'rollBoard', args: () => [] };
  if (ph === 'defense') {
    const P = S.pending; const def = S.seats[P.target].hand.filter((c: string) => U(c) === 'H' && (R(c) === 11 || R(c) === 13));
    if (def.length && pick() < 0.6) { const c = one(def); return { fn: 'defend', args: () => [P.target, c] }; }
    return { fn: 'resolveAttack', args: () => [] };
  }
  if (ph === 'clubs') {
    const users = S.seats.map((_: unknown, k: number) => k).filter((k: number) => !S.seats[k].front.length && S.seats[k].hand.some((c: string) => U(c) === 'C' && isItem(c)));
    if (users.length && pick() < 0.3) {
      const i = one(users as number[]); const c = one(S.seats[i].hand.filter((x: string) => U(x) === 'C' && isItem(x)) as string[]);
      const arg = R(c) === 12 ? (pick() < 0.5 ? 1 : -1) : R(c) === 13 ? 1 + ri(6) : 0;
      return { fn: 'useClub', args: () => [i, c, arg] };
    }
    const k = S.seats.findIndex((_: unknown, q: number) => !(S.ready || {})[q]);
    return { fn: 'readyUp', args: () => [k] };
  }
  if (ph === 'reward') { const i = S.reward.order[S.reward.pi]; const c = one(S.reward.disp as string[]); return { fn: 'rewardPick', args: () => [i, c] }; }
  if (ph === 'main') {
    const t = S.turn; const i = t.seat; const p = S.seats[i];
    if (t.peek) { const c = one(t.peek as string[]); return { fn: 'pickDJ', args: () => [i, c] }; }
    if (t.trim) {
      const cut = p.hand.slice().sort(() => pick() - 0.5).slice(0, p.hand.length - 6);
      return { raw: (E2, S2) => { const q = S2.seats[i]; cut.forEach((c: string) => { q.hand.splice(q.hand.indexOf(c), 1); E2.discardCard(S2, i, c); }); S2.log.unshift(`자리 ${i + 1}: 손패 정리 ${cut.length}장.`); if (S2.log.length > 80) S2.log.length = 80; E2.endTurn(S2); } };
    }
    if (t.mustDiscard) { const c = one(p.hand as string[]); return { fn: 'pickupDiscard', args: () => [i, c] }; }
    // 토큰 만들기
    if (!t.token && pick() < 0.8) {
      for (const su of ['S', 'H', 'D', 'C']) {
        const cost = E.costFor(S, i);
        const nums = p.hand.filter((c: string) => U(c) === su && !isItem(c)).slice(0, cost);
        const dq = p.hand.find((c: string) => U(c) === 'D' && R(c) === 12);
        const dk = p.hand.find((c: string) => U(c) === 'D' && R(c) === 13);
        if (dk && !t.item && pick() < 0.5) { const n3 = p.hand.filter((c: string) => U(c) === su && !isItem(c)).slice(0, 3); const cards = [...n3, dk]; if (!E.canMakeToken(S, i, cards)) return { fn: 'makeToken', args: () => [i, cards] }; }
        if (!E.canMakeToken(S, i, nums)) return { fn: 'makeToken', args: () => [i, nums] };
        if (dq && !t.item) {
          const cards = [...nums, dq];
          const cols = ['S', 'H', 'D', 'C'].filter(x => !p.tokens.includes(x) && S.supply[x] > 0);
          if (cols.length && !E.canMakeToken(S, i, cards)) { const col = one(cols); return { fn: 'makeToken', args: () => [i, cards, col] }; }
        }
      }
    }
    // 아이템
    if (!t.item && pick() < 0.4) {
      const its = items(i).filter((c: string) => U(c) === 'S' || (U(c) === 'H' && R(c) === 12) || (U(c) === 'D' && R(c) === 11));
      if (its.length) {
        const c = one(its as string[]);
        if (U(c) === 'S') {
          const tg = one(S.seats.map((_: unknown, k: number) => k).filter((k: number) => k !== i) as number[]);
          const arg = R(c) === 11 ? null : one(['S', 'H', 'D', 'C']);
          return { fn: 'startAttack', args: () => [i, c, tg, arg] };
        }
        if (R(c) === 12) { const picks = S.row.filter((x: string) => !isItem(x)).slice(-2); return { fn: 'useHQ', args: () => [i, c, picks] }; }
        if (S.deck.length >= 3) return { fn: 'useDJ', args: () => [i, c] };
      }
    }
    if (!t.picked) {
      if (S.row.length && pick() < 0.5) { const c = one(S.row as string[]); return { fn: 'pickup', args: () => [i, true, c] }; }
      return { fn: 'pickup', args: () => [i, false] };
    }
    if (p.hand.length > 6) return { raw: (_E2, S2) => { S2.turn.trim = true; } };
    return { fn: 'endTurn', args: () => [] };
  }
  if (ph === 'mg') {
    const m = S.mg;
    if (m.id === 'hold') { const i = m.ord[m.ci]; if (!m.k || pick() < 0.65) { const it = items(i).length && pick() < 0.2 ? items(i)[0] : null; return { fn: 'holdRoll', args: () => [i, it] }; } return { fn: 'holdStop', args: () => [i] }; }
    if (m.id === 'bomb') {
      const i = m.alive[m.ci];
      if (!m.arm[i] && items(i).length && pick() < 0.2) { const it = items(i)[0]; return { fn: 'bombArm', args: () => [i, it] }; }
      const ks = m.lay.map((c: string | null, k: number) => c ? k : -1).filter((k: number) => k >= 0); const k = one(ks as number[]);
      return { fn: 'bombFlip', args: () => [i, k] };
    }
    if (m.id === 'auction') {
      if (m.step === 'pre') {
        const users = S.seats.map((_: unknown, k: number) => k).filter((k: number) => items(k).length);
        if (users.length && pick() < 0.15) { const i = one(users as number[]); const it = items(i)[0]; return { fn: 'auctionItem', args: () => [i, it] }; }
        const k = S.seats.findIndex((_: unknown, q: number) => !m.ready[q]); return { fn: 'auctionReady', args: () => [k] };
      }
      const k = S.seats.findIndex((_: unknown, q: number) => !(q in m.bids)); const c = one(m.hands[k] as string[]);
      return { fn: 'auctionBid', args: () => [k, c] };
    }
    if (m.id === 'balloon') {
      const i = m.alive[m.ci]; const c = one(m.hands[i] as string[]); const it = items(i).length && m.total > 30 && pick() < 0.4 ? items(i)[0] : null;
      return { fn: 'balloonPlay', args: () => [i, c, it] };
    }
    if (m.id === 'rps' || m.id === 'vault') {
      if (m.step === 'save') { const i = m.saveq[0]; const it = pick() < 0.5 ? items(i)[0] : null; return { fn: 'ovnSave', args: () => [i, it] }; }
      if (m.id === 'rps') {
        if (!m.armL && !m.picks[m.lead] && items(m.lead).length && pick() < 0.2) { const it = items(m.lead)[0]; return { fn: 'rpsArm', args: () => [m.lead, it] }; }
        const need = [m.lead, ...m.alive].filter((j: number) => !m.picks[j]); const i = need[0]; const h = one(['R', 'P', 'S']);
        return { fn: 'rpsPick', args: () => [i, h] };
      }
      if (!m.armL && items(m.lead).length && pick() < 0.2) { const it = items(m.lead)[0]; return { fn: 'vaultArm', args: () => [m.lead, it] }; }
      if (m.step === 'hide') { const i = m.alive.find((j: number) => !m.picks[j]); const z = 1 + ri(3); return { fn: 'vaultHide', args: () => [i, z] }; }
      const zs = [1, 2, 3].sort(() => pick() - 0.5).slice(0, m.armL ? 2 : 1);
      return { fn: 'vaultGuard', args: () => [m.lead, zs] };
    }
    if (m.id === 'count') {
      T = Math.max(T, E.countOpenAt(m) + 1);
      const ks = Object.keys(m.hits).map(Number).filter(k => !(k in m.ans));
      const i = ks[0];
      if (!m.arm[i] && items(i).length && pick() < 0.2) { const it = items(i)[0]; return { fn: 'countArm', args: () => [i, it] }; }
      const a = ri(7); return { fn: 'countAnswer', args: () => [i, a] };
    }
    if (m.id === 'race') {
      if (m.step === 'bet') { const i = m.order[m.pi]; const s = one(['S', 'H', 'D', 'C']); return { fn: 'raceBet', args: () => [i, s] }; }
      const users = Object.keys(m.bet).map(Number).filter(k => items(k).length);
      if (users.length && pick() < 0.1) { const i = one(users); const it = items(i)[0]; const s = one(['S', 'H', 'D', 'C'].filter(x => x !== m.bet[i])); return { fn: 'raceSwap', args: () => [i, it, s] }; }
      return { fn: 'raceFlip', args: () => [S.first] };
    }
  }
  throw new Error('알 수 없는 상태: ' + ph + ' ' + (S.mg && S.mg.id));
}

function playOne(n: number, seed: number): { steps: number; phases: Set<string> } {
  T = 1_000_000;
  OLD.setRng(mulberry32(seed)); TS.setRng(mulberry32(seed));
  const pick = mulberry32(seed ^ 0x9e3779b9);
  const lobby = OLD.newLobby(); for (let k = 0; k < n; k++) lobby.seats.push({ uid: 'u' + k });
  const A = clone(lobby), B = clone(lobby);
  OLD.startGame(A); TS.startGame(B);
  deepStrictEqual(B, A);
  const phases = new Set<string>();
  let steps = 0;
  for (; steps < 4000; steps++) {
    phases.add(A.phase === 'mg' ? 'mg:' + A.mg.id : A.phase);
    const st = choose(A, OLD, pick);
    if (!st) break;
    if ('raw' in st) { st.raw(OLD, A); st.raw(TS, B); }
    else { const args = st.args(A); const ra = OLD[st.fn](A, ...clone(args)); const rb = (TS as any)[st.fn](B, ...clone(args)); deepStrictEqual(rb, ra, `${st.fn} 반환값`); }
    try { deepStrictEqual(B, A); } catch (e) { throw new Error(`seed ${seed}, ${n}인, ${steps}번째 행동 뒤 상태가 다름: ${(e as Error).message.slice(0, 2000)}`); }
  }
  return { steps, phases };
}

describe('시험판 엔진과 대조', () => {
  it('2~5인 무작위 대국 400판에서 매 행동 뒤 상태가 같다', () => {
    const seen = new Set<string>(); let ended = 0;
    for (let g = 0; g < 400; g++) {
      const n = 2 + (g % 4);
      const r = playOne(n, 1000 + g);
      r.phases.forEach(p => seen.add(p));
      if (r.phases.has('ended')) ended++;
    }
    // 모든 미니게임과 단계가 실제로 나왔는지
    for (const p of ['main', 'defense', 'roll', 'clubs', 'reward', 'ended', 'mg:hold', 'mg:bomb', 'mg:auction', 'mg:balloon', 'mg:rps', 'mg:vault', 'mg:count', 'mg:race']) {
      if (!seen.has(p)) throw new Error('나오지 않은 단계: ' + p);
    }
    if (ended < 300) throw new Error('끝난 판이 너무 적다: ' + ended);
  }, 300_000);
});
