/* 미니게임 (순수 함수: 상태를 받아 고친다) */
import { R, SYM, SUITS, U, cname, d6, now, shuffle } from './cards';
import { buildBundle, draw, endMinigame, fx, hasItem, log, N, outGroups, rankBy, scoreOf, useItem } from './core';
import type {
  AuctionMg, BalloonMg, BombMg, Card, CountMg, GameState, Hand, HoldMg, OvnMg, RaceMg, Suit,
} from './types';

const mgOf = <T>(S: GameState) => S.mg as unknown as T;

/* ---- 버티기 ---- */
export function holdRoll(S: GameState, i: number, item: Card | null): void {
  const m = mgOf<HoldMg>(S); const p = S.seats[i];
  if (item) { p.hand.splice(p.hand.indexOf(item), 1); p.front.push(item); }
  // 디지털판 보정(몰래): 매 판 첫 굴림에는 1이 나오지 않는다
  m.k++; let a = d6(); while (m.k === 1 && a === 1) a = d6();
  const b = item ? d6() : null; const d = item ? Math.max(a, b!) : a;
  m.last = { i, a, b, d, th: m.k }; fx(S, { t: 'dice', v: d, both: b != null ? [a, b] : null, bust: d <= m.k, th: m.k, seats: [i] });
  if (d <= m.k) { log(S, `버티기: 자리 ${i + 1} ${item ? `[${a},${b}]→` : ''}${d} (기준 ${m.k} 이하) 이번 판 ${m.s}점을 잃었다.`); m.s = 0; holdNext(S); }
  else { m.s += d; log(S, `버티기: 자리 ${i + 1} ${item ? `[${a},${b}]→` : ''}${d}. 이번 판 ${m.s}점.`); }
}
export function holdStop(S: GameState, i: number): void {
  const m = mgOf<HoldMg>(S); m.tot[i] += m.s; log(S, `버티기: 자리 ${i + 1} 멈춤, ${m.s}점 확정 (합계 ${m.tot[i]}).`); holdNext(S);
}
function holdNext(S: GameState): void {
  const m = mgOf<HoldMg>(S); m.k = 0; m.s = 0; m.ci++;
  if (m.ci >= m.ord.length) {
    m.ci = 0; m.pan++;
    if (m.pan > 3) { const sc: Record<number, number> = {}; m.ord.forEach(i => sc[i] = m.tot[i]); endMinigame(S, rankBy(sc), scoreOf(sc, '점')); return; }
    log(S, `버티기 ${m.pan}판.`);
  }
}

/* ---- 폭탄 버튼 ---- */
export function bombLay(S: GameState): void {
  const m = mgOf<BombMg>(S);
  // 깐 카드를 덱에 섞고 남은 인원 + 1장을 새로 뽑는다
  S.deck.push(...(m.lay.filter(Boolean) as Card[])); Object.values(m.flip).forEach(f => S.deck.push(f.c)); shuffle(S.deck);
  m.lay = buildBundle(S, m.alive.length + 1); m.flip = {}; m.arm = {}; m.ci = 0;
  const n = N(S);
  m.alive = m.alive.slice().sort((a, b) => ((a - S.first + n) % n) - ((b - S.first + n) % n));
}
export function bombArm(S: GameState, i: number, item: Card): void {
  const p = S.seats[i]; p.hand.splice(p.hand.indexOf(item), 1); p.front.push(item); mgOf<BombMg>(S).arm[i] = true;
  log(S, `폭탄 버튼: 자리 ${i + 1} 아이템(-3)`);
}
export function bombFlip(S: GameState, i: number, k: number): void {
  const m = mgOf<BombMg>(S); const c = m.lay[k]; if (!c) return; m.lay[k] = null;
  const v = R(c) - (m.arm[i] ? 3 : 0); m.flip[i] = { c, v }; log(S, `폭탄 버튼: 자리 ${i + 1} → ${cname(c)}${m.arm[i] ? ` (-3 → ${v})` : ''}`); m.ci++;
  if (m.ci < m.alive.length) return;
  const mx = Math.max(...m.alive.map(j => m.flip[j].v)); const out = m.alive.filter(j => m.flip[j].v === mx);
  m.lay = m.lay.filter(Boolean);
  if (m.alive.length === 2) {
    m.hits = m.hits || {}; const hits = m.hits; out.forEach(j => hits[j] = (hits[j] || 0) + 1);
    log(S, `폭탄! ${out.map(j => '자리 ' + (j + 1)).join('·')} (결승 폭탄 ${m.alive.map(j => '자리 ' + (j + 1) + ' ' + (hits[j] || 0) + '개').join(', ')})`);
    const dead = m.alive.filter(j => (hits[j] || 0) >= 2); fx(S, { t: 'pop', seats: out, bomb: true, small: !dead.length });
    if (!dead.length) { bombLay(S); return; }
    m.out.push(dead); m.alive = m.alive.filter(j => !dead.includes(j)); log(S, `탈락: ${dead.map(j => '자리 ' + (j + 1)).join('·')}`);
  } else {
    m.out.push(out); m.alive = m.alive.filter(j => !out.includes(j)); log(S, `폭탄! 탈락: ${out.map(j => '자리 ' + (j + 1)).join('·')}`);
    fx(S, { t: 'pop', seats: out, bomb: true });
  }
  if (m.alive.length <= 1) {
    const groups: number[][] = []; if (m.alive.length) groups.push(m.alive.slice());
    for (let q = m.out.length - 1; q >= 0; q--) groups.push(m.out[q]);
    endMinigame(S, groups); return;
  }
  bombLay(S);
}

/* ---- 눈치 경매 ---- */
export function auctionOpen(S: GameState): void {
  const m = mgOf<AuctionMg>(S);
  while (m.ai < m.prizes.length && !m.prizes[m.ai]) m.ai++;
  if (m.ai >= m.prizes.length) { auctionEnd(S); return; }
  const p = m.prizes[m.ai]!; p.up = true; m.pot.push(p); m.prizes[m.ai] = null; m.ai++;
  m.step = 'pre'; m.ready = {}; m.bids = {};
  // 디지털판: '입찰하기'를 누르는 대신 시간제. 아이템을 낼 시간(AUC_PRE)이 지나면 저절로 입찰. 아이템 가진 사람이 없으면 바로 입찰
  if (!Object.keys(m.hands).some(k => hasItem(S, +k))) m.step = 'bid'; else m.until = now() + AUC_PRE;
}
export const AUC_PRE = 4000;
export function auctionItem(S: GameState, i: number, item: Card): 'no' | undefined {
  const m = mgOf<AuctionMg>(S); const p = S.seats[i];
  while (m.ai < m.prizes.length && !m.prizes[m.ai]) m.ai++;
  if (m.ai >= m.prizes.length) return 'no';
  p.hand.splice(p.hand.indexOf(item), 1); p.front.push(item);
  const x = m.prizes[m.ai]!; x.up = true; m.pot.push(x); m.prizes[m.ai] = null; m.ai++;
  log(S, `눈치 경매: 자리 ${i + 1} 아이템 → 다음 상품 ${cname(x.c)}도 이번 경매에 걸림.`);
}
export function auctionReady(S: GameState, i: number): void {
  const m = mgOf<AuctionMg>(S); m.ready[i] = true; if (Object.keys(m.ready).length >= N(S)) m.step = 'bid';
}
export function auctionBid(S: GameState, i: number, c: Card): void {
  const m = mgOf<AuctionMg>(S); m.hands[i].splice(m.hands[i].indexOf(c), 1); m.bids[i] = c;
  if (Object.keys(m.bids).length < N(S)) return;
  const b = m.bids; const vals = Object.keys(b).map(Number); const cnt: Record<number, number> = {};
  vals.forEach(j => { cnt[R(b[j])] = (cnt[R(b[j])] || 0) + 1; });
  const uniq = vals.filter(j => cnt[R(b[j])] === 1);
  const shown = vals.map(j => `자리 ${j + 1}:${cname(b[j])}`).join(', ');
  vals.forEach(j => m.spent.push(b[j]));
  if (uniq.length) {
    const w = uniq.reduce((a, j) => R(b[j]) > R(b[a]) ? j : a, uniq[0]);
    m.won[w].push(...m.pot.map(p => p.c)); log(S, `눈치 경매: ${shown} → 자리 ${w + 1}이 ${m.pot.map(p => cname(p.c)).join('+')} 획득.`);
    fx(S, { t: 'bids', bids: { ...b }, win: w, pot: m.pot.map(p => p.c) }); m.pot = [];
  } else { log(S, `눈치 경매: ${shown} → 모두 지워져 상품이 다음 경매에 얹힌다.`); fx(S, { t: 'bids', bids: { ...b }, win: null }); }
  m.lastBids = b; m.bids = {};
  if (Object.values(m.hands).every(h => !h.length)) { auctionEnd(S); return; }
  auctionOpen(S);
}
function auctionEnd(S: GameState): void {
  const m = mgOf<AuctionMg>(S); const sc: Record<number, number> = {};
  Object.keys(m.won).forEach(k => sc[+k] = m.won[+k].reduce((a, c) => a + R(c), 0));
  log(S, '눈치 경매 점수: ' + Object.keys(sc).map(k => `자리 ${+k + 1}=${sc[+k]}`).join(', ')); endMinigame(S, rankBy(sc), scoreOf(sc, '점'));
}

/* ---- 풍선 불기 ---- */
export const BLIMIT = 50;
export function balloonStart(S: GameState, ord: number[]): void {
  const hands: Record<number, Card[]> = {}; ord.forEach(i => hands[i] = buildBundle(S, 3));
  S.mg = { id: 'balloon', bundle: [], hands, pile: [], total: 0, alive: ord.slice(), ci: 0, out: [], last: null, pops: 0 };
  // 2·3인은 각자 동전 1개(목숨 2개째)를 받는다(사용자 2026-10-13)
  if (ord.length <= 3) { const coins: Record<number, number> = {}; ord.forEach(i => coins[i] = 1); (S.mg as BalloonMg).coins = coins; }
}
export function balloonPlay(S: GameState, i: number, c: Card, item: Card | null): false | undefined {
  const m = mgOf<BalloonMg>(S); if (m.alive[m.ci] !== i || !m.hands[i].includes(c)) return false;
  if (item && !useItem(S, i, item)) return false;
  m.hands[i].splice(m.hands[i].indexOf(c), 1); m.pile.push(c); const v = R(c);
  m.total = item ? Math.max(0, m.total - v) : m.total + v; m.last = { i, c, sub: !!item, total: m.total };
  const x = draw(S); if (x) m.hands[i].push(x);
  log(S, `풍선 불기: 자리 ${i + 1} ${cname(c)}${item ? ' (빼기)' : ''} → 합 ${m.total}`);
  if (m.total > BLIMIT && m.coins && m.coins[i] > 0) {
    // 2·3인: 동전이 있으면 내놓고 버틴다. 손패는 그대로 들고 펑 한 사람부터 합 0에서 다시
    m.coins[i]--; fx(S, { t: 'pop', seats: [i], total: m.total, small: true, life: true }); log(S, `펑! 자리 ${i + 1} (합 ${m.total}) 동전을 내놓고 버텼다.`);
    S.deck.push(...m.pile); m.pile = []; shuffle(S.deck); m.total = 0; m.pops++; m.last = null;
    m.ci = m.alive.indexOf(i); return;
  }
  if (m.total > BLIMIT) {
    fx(S, { t: 'pop', seats: [i], total: m.total }); log(S, `펑! 자리 ${i + 1} 탈락 (합 ${m.total}).`);
    const idx = m.alive.indexOf(i); m.out.push([i]); m.alive.splice(idx, 1);
    S.deck.push(...m.pile, ...m.hands[i]); m.pile = []; m.hands[i] = []; shuffle(S.deck); m.total = 0; m.pops++; m.last = null;
    if (m.alive.length <= 1) { endMinigame(S, outGroups(m, m.alive)); return; }
    m.ci = idx % m.alive.length; return;
  }
  m.ci = (m.ci + 1) % m.alive.length;
}

/* ---- 1 대 나머지 공통 (선 가위바위보·금고 털기) ---- */
export function ovnStart(S: GameState, id: 'rps' | 'vault'): void {
  const n = N(S), lead = S.first, others: number[] = []; for (let k = 1; k < n; k++) others.push((lead + k) % n);
  S.mg = { id, bundle: [], lead, alive: others, round: 1, max: others.length + 1, out: [], picks: {}, armL: false, saveq: [], losers: [], saved: [], last: null, step: id === 'rps' ? 'pick' : 'hide' };
}
function ovnLosers(S: GameState, losers: number[]): void {
  // 졌을 때 아이템으로 버티기는 금고 털기만(선 가위바위보의 아이템은 '이기면 즉시 통과')
  const m = mgOf<OvnMg>(S); m.losers = losers; m.saved = []; m.saveq = m.id === 'rps' ? [] : losers.filter(j => hasItem(S, j));
  if (m.saveq.length) { m.step = 'save'; return; }
  ovnApply(S);
}
export function ovnSave(S: GameState, i: number, item: Card | null): false | undefined {
  const m = mgOf<OvnMg>(S); if (m.step !== 'save' || !m.saveq.includes(i)) return false;
  if (item) { if (!useItem(S, i, item)) return false; m.saved.push(i); log(S, `자리 ${i + 1}: 아이템으로 버텼다.`); fx(S, { t: 'banner', text: '버텼다!', seats: [i], tone: 'good' }); }
  m.saveq = m.saveq.filter(j => j !== i); if (!m.saveq.length) ovnApply(S);
}
function ovnApply(S: GameState): void {
  const m = mgOf<OvnMg>(S); const dead = m.losers.filter(j => !m.saved.includes(j));
  if (dead.length) { m.out.push(dead); m.alive = m.alive.filter(j => !dead.includes(j)); log(S, `탈락: ${dead.map(j => '자리 ' + (j + 1)).join('·')}`); }
  m.losers = []; m.saved = []; m.saveq = [];
  const passed = m.passed || [];
  if (!m.alive.length && passed.length) {
    // 남은 사람이 모두 아이템으로 통과했다: 통과한 사람이 공동 1위, 선 꼴찌
    log(S, `살아남은 사람: ${passed.map(j => '자리 ' + (j + 1)).join('·')}`); fx(S, { t: 'banner', text: '살아남았다!', seats: passed.slice(), tone: 'win' });
    endMinigame(S, [...outGroups(m, passed), [m.lead]]); return;
  }
  if (!m.alive.length) {
    log(S, `자리 ${m.lead + 1}(${m.id === 'rps' ? '선' : '경비원'})이 모두 탈락시켰다!`);
    fx(S, { t: 'banner', text: m.id === 'rps' ? '선 승리!' : '경비원 승리!', seats: [m.lead], tone: 'win' });
    endMinigame(S, [[m.lead], ...outGroups(m)]); return;
  }
  m.round++;
  if (m.round > m.max) {
    const live = [...m.alive, ...passed];
    log(S, `살아남은 사람: ${live.map(j => '자리 ' + (j + 1)).join('·')}`); fx(S, { t: 'banner', text: '살아남았다!', seats: live.slice(), tone: 'win' });
    endMinigame(S, [...outGroups(m, live), [m.lead]]); return;
  }
  m.picks = {}; m.armL = false; m.zones = null; if (m.pass) m.pass = {}; m.step = m.id === 'rps' ? 'pick' : 'hide';
}

/* ---- 선 가위바위보 ---- */
export const RPSN: Record<Hand, string> = { R: '바위', P: '보', S: '가위' };
/** 모두 낸 뒤 결과를 적용하기까지(사용자 2026-10-15): 1.5초 뒤 도전자 방어 → 선의 광역 공격 → 진 사람 탈락 연출. 시간은 [제안] */
export const RPS_WAIT = 1500, RPS_SHOW = 5200;
const BEATS: Record<Hand, Hand> = { R: 'S', P: 'R', S: 'P' };
export function rpsPick(S: GameState, i: number, h: Hand): false | undefined {
  const m = mgOf<OvnMg>(S); if (m.step !== 'pick' || m.picks[i] || !(i === m.lead || m.alive.includes(i)) || !RPSN[h]) return false;
  m.picks[i] = h; const need = [m.lead, ...m.alive];
  if (!need.every(j => m.picks[j])) return;
  const L = m.picks[m.lead] as Hand;
  // 아이템('이기면 즉시 통과')을 낸 사람이 선을 이기면 바로 통과: 남은 판을 하지 않고 끝까지 남은 것으로 친다
  const passNow = m.alive.filter(j => m.pass?.[j] && BEATS[m.picks[j] as Hand] === L);
  if (passNow.length) { m.alive = m.alive.filter(j => !passNow.includes(j)); m.passed = [...(m.passed || []), ...passNow]; log(S, `통과: ${passNow.map(j => '자리 ' + (j + 1)).join('·')}`); fx(S, { t: 'banner', text: '선을 이겨 통과!', seats: passNow.slice(), tone: 'good' }); }
  const losers = m.alive.filter(j => BEATS[L] === m.picks[j] || (m.armL && m.picks[j] === L));
  m.last = { picks: { ...m.picks }, armL: m.armL, round: m.round, losers };
  log(S, `선 가위바위보 ${m.round}판: ${need.map(j => `자리 ${j + 1} ${RPSN[m.picks[j] as Hand]}`).join(', ')}`);
  fx(S, { t: 'rps', picks: { ...m.picks }, lead: m.lead, losers, armL: m.armL });
  // 결과 연출을 보여 준 뒤에 탈락을 적용한다(rpsAfterShow)
  m.step = 'show'; m.until = now() + RPS_SHOW;
}
export function rpsAfterShow(S: GameState): void {
  const m = mgOf<OvnMg>(S); ovnLosers(S, (m.last as { losers: number[] }).losers);
}
/** 선이 아닌 사람의 아이템: 내기 전에 낸다. 이번에 선을 이기면 바로 통과 */
export function rpsPass(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<OvnMg>(S); if (m.step !== 'pick' || i === m.lead || !m.alive.includes(i) || m.picks[i] || m.pass?.[i]) return false;
  if (!useItem(S, i, item)) return false;
  m.pass = { ...(m.pass || {}), [i]: true }; log(S, `자리 ${i + 1}: 아이템 → 이번에 선을 이기면 바로 통과.`); fx(S, { t: 'banner', text: '이기면 통과!', seats: [i], tone: 'good' });
}
export function rpsArm(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<OvnMg>(S); if (m.step !== 'pick' || i !== m.lead || m.picks[m.lead] || m.armL) return false;
  if (!useItem(S, i, item)) return false;
  m.armL = true; log(S, `자리 ${i + 1}(선): 아이템 → 이번엔 비긴 사람도 탈락.`); fx(S, { t: 'banner', text: '비겨도 탈락!', seats: [i], tone: 'bad' });
}

/* ---- 금고 털기 ---- */
export function vaultHide(S: GameState, i: number, z: number): false | undefined {
  const m = mgOf<OvnMg>(S); if (m.step !== 'hide' || !m.alive.includes(i) || m.picks[i] || ![1, 2, 3].includes(z)) return false;
  m.picks[i] = z; if (m.alive.every(j => m.picks[j])) m.step = 'guard';
}
export function vaultArm(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<OvnMg>(S); if (i !== m.lead || m.armL || !(m.step === 'hide' || m.step === 'guard')) return false;
  if (!useItem(S, i, item)) return false;
  m.armL = true; log(S, `자리 ${i + 1}(경비원): 아이템 → 이번엔 구역 2곳을 뒤진다.`); fx(S, { t: 'banner', text: '2곳 수색!', seats: [i], tone: 'bad' });
}
export function vaultGuard(S: GameState, i: number, zones: number[]): false | undefined {
  const m = mgOf<OvnMg>(S); if (m.step !== 'guard' || i !== m.lead) return false;
  zones = [...new Set(zones)].filter(z => [1, 2, 3].includes(z)); if (zones.length !== (m.armL ? 2 : 1)) return false;
  m.zones = zones; const losers = m.alive.filter(j => zones.includes(m.picks[j] as number));
  m.last = { picks: { ...m.picks }, zones, round: m.round, losers };
  log(S, `금고 털기 ${m.round}판: 경비원이 ${zones.join('·')}번을 뒤짐. 숨은 곳 ${m.alive.map(j => `자리 ${j + 1}→${m.picks[j]}`).join(', ')}`);
  fx(S, { t: 'vault', picks: { ...m.picks }, zones, lead: m.lead, losers });
  ovnLosers(S, losers);
}

/* ---- 몇 장이었지 ---- */
export const CFLIP = 1000, CLEAD = 4500;
export function countStart(S: GameState, ord: number[]): void {
  const hits: Record<number, number> = {}; ord.forEach(i => hits[i] = 0);
  S.mg = { id: 'count', bundle: [], pan: 1, hits, seq: null, dec: null, ans: {}, arm: {}, last: null, step: 'flip', t0: 0 };
  countPan(S);
}
function countPan(S: GameState): void {
  const m = mgOf<CountMg>(S);
  if (m.seq) { S.deck.push(...m.seq); if (m.dec) S.deck.push(m.dec); shuffle(S.deck); }
  m.seq = buildBundle(S, 12); m.dec = draw(S); m.t0 = now() + CLEAD; m.ans = {}; m.arm = {}; m.step = 'flip';
  // 디지털판 보정: 정답 문양이 7장 이상 나오지 않게 한다(답은 0~6). 넘치는 만큼 그 문양 카드를 덱의 다른 문양 카드와 바꾼다
  if (m.dec) {
    const su = U(m.dec); let extra = m.seq.filter(c => U(c) === su).length - 6; let swapped = false;
    while (extra > 0) {
      const k = m.seq.findIndex(c => U(c) === su), j = S.deck.findIndex(c => U(c) !== su); if (k < 0 || j < 0) break;
      const out = m.seq[k]; m.seq[k] = S.deck.splice(j, 1)[0]; S.deck.push(out); extra--; swapped = true;
    }
    if (swapped) shuffle(S.deck);
  }
}
export function countOpenAt(m: CountMg): number { return m.t0 + (m.seq ? m.seq.length : 0) * CFLIP; }
export function countArm(S: GameState, i: number, item: Card): false | undefined {
  const m = mgOf<CountMg>(S); if (m.arm[i] || (i in m.ans)) return false; if (!useItem(S, i, item)) return false;
  m.arm[i] = true; log(S, `몇 장이었지: 자리 ${i + 1} 아이템(±1)`);
}
export function countAnswer(S: GameState, i: number, a: number): false | undefined {
  const m = mgOf<CountMg>(S); if ((i in m.ans) || !(i in m.hits) || now() < countOpenAt(m) || !(a >= 0 && a <= 6)) return false;
  m.ans[i] = a;
  if (!Object.keys(m.hits).every(k => k in m.ans)) return;
  const suit: Suit = m.dec ? U(m.dec) : 'S'; const cnt = m.seq!.filter(c => U(c) === suit).length; const tgt = Math.min(cnt, 6);
  const hit = Object.keys(m.ans).map(Number).filter(k => m.ans[k] === tgt || (m.arm[k] && Math.abs(m.ans[k] - tgt) <= 1));
  hit.forEach(k => m.hits[k]++);
  m.last = { pan: m.pan, suit, cnt, ans: { ...m.ans }, arm: { ...m.arm }, hit };
  log(S, `몇 장이었지 ${m.pan}판: ${SYM[suit]} ${cnt}장. 맞힘 ${hit.map(k => '자리 ' + (k + 1)).join('·') || '없음'}`);
  fx(S, { t: 'count', suit, cnt, ans: { ...m.ans }, hit });
  m.pan++;
  if (m.pan > 3) {
    S.deck.push(...m.seq!); if (m.dec) S.deck.push(m.dec); shuffle(S.deck); m.seq = null; m.dec = null;
    endMinigame(S, rankBy(m.hits), scoreOf(m.hits, '점')); return;
  }
  countPan(S);
}

/* ---- 문양 경주 ---- */
export const RGOAL = 4, RLIMIT = 15;
export function raceStart(S: GameState, ord: number[]): void {
  S.mg = { id: 'race', bundle: [], order: ord.slice(), pi: 0, bet: {}, pos: { S: 0, H: 0, D: 0, C: 0 }, pile: [], step: 'bet', last: null };
}
export function raceBet(S: GameState, i: number, s: Suit): false | undefined {
  const m = mgOf<RaceMg>(S); if (m.step !== 'bet' || m.order[m.pi] !== i || !SYM[s]) return false;
  m.bet[i] = s; m.pi++; log(S, `문양 경주: 자리 ${i + 1} → ${SYM[s]}`); if (m.pi >= m.order.length) m.step = 'race';
}
export function raceSwap(S: GameState, i: number, item: Card, s: Suit): false | undefined {
  const m = mgOf<RaceMg>(S); if (m.step !== 'race' || !(i in m.bet) || m.bet[i] === s || !SYM[s]) return false;
  if (!useItem(S, i, item)) return false;
  m.bet[i] = s; log(S, `문양 경주: 자리 ${i + 1} 아이템 → ${SYM[s]}로 바꿈`); fx(S, { t: 'banner', text: `${SYM[s]}로 갈아탔다!`, seats: [i] });
}
function raceEnd(S: GameState, win: Suit): void {
  const m = mgOf<RaceMg>(S); const first = m.order.filter(j => m.bet[j] === win); const sc: Record<number, number> = {};
  m.order.filter(j => m.bet[j] !== win).forEach(j => sc[j] = m.pos[m.bet[j]]);
  // 결과판: 고른 문양이 간 칸 수(우승 문양 포함)
  const at: Record<number, number> = {}; m.order.forEach(j => at[j] = m.pos[m.bet[j]]);
  endMinigame(S, (first.length ? [first] : []).concat(rankBy(sc)), scoreOf(at, '칸'));
}
function raceLimit(S: GameState): void {
  const m = mgOf<RaceMg>(S); const mx = Math.max(...SUITS.map(s => m.pos[s])); const lead = SUITS.filter(s => m.pos[s] === mx);
  log(S, `${m.pile.length}장을 다 뒤집었다. 가장 앞선 문양: ${lead.map(s => SYM[s]).join('·')}`);
  fx(S, { t: 'banner', text: `${lead.map(s => SYM[s]).join('·')} 우승!`, tone: 'win' });
  const first = m.order.filter(j => lead.includes(m.bet[j])); const sc: Record<number, number> = {};
  m.order.filter(j => !lead.includes(m.bet[j])).forEach(j => sc[j] = m.pos[m.bet[j]]);
  // 결과판: 고른 문양이 간 칸 수(우승 문양 포함)
  const at: Record<number, number> = {}; m.order.forEach(j => at[j] = m.pos[m.bet[j]]);
  endMinigame(S, (first.length ? [first] : []).concat(rankBy(sc)), scoreOf(at, '칸'));
}
export function raceFlip(S: GameState, i: number): false | undefined {
  const m = mgOf<RaceMg>(S); if (m.step !== 'race' || i !== S.first) return false; const c = draw(S);
  if (!c) { raceLimit(S); return; }
  m.pile.push(c); const s = U(c), fw = R(c) <= 10; m.pos[s] = fw ? m.pos[s] + 1 : Math.max(0, m.pos[s] - 1); m.last = { c, s, fw };
  log(S, `문양 경주: ${cname(c)} → ${SYM[s]} ${fw ? '앞으로' : '뒤로'} (${m.pos[s]}칸)`);
  if (m.pos[s] >= RGOAL) { log(S, `${SYM[s]} 판 밖으로! 우승!`); fx(S, { t: 'banner', text: `${SYM[s]} 우승!`, suit: s, tone: 'win' }); raceEnd(S, s); return; }
  if (m.pile.length >= RLIMIT) raceLimit(S);
}
