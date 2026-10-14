/* 흐름: 상태·연출 이벤트 → 3D 연출과 화면. 버튼·테이블 조작을 행동으로 바꾼다. */
import {
  type Action, type Card, type Fx, type GameState, type Hand, type MgId, type MidCrit, R, SNAME, type Suit, U, canMakeToken, chainFingers, clubChoices, cname, costFor, isItem,
} from '@cubic3/engine';
import { mine, mySeats, seatName, whoActs } from './game';
import { useStore, viewSeat } from './store';
import type { Pick, World } from './scene/World';
import { forgetHosting } from './net/room';
import { dodgeNudge, dodgePlaceAt, dodgeRotate, preview } from './ui/MgPanel4';

let world: World | null = null;
export const getWorld = () => world;
export function setWorld(w: World | null): void { world = w; }

const st = () => useStore.getState();
const S = () => st().S;
const toast = (m: string) => st().showToast(m);
const act = (a: Action) => st().act(a);

/* ---------------- 연출 이벤트 큐 ---------------- */
let fxq: Fx[] = [], fxBusy = false;
function queueFx(f: Fx): void { fxq.push(f); while (fxq.length > 4) fxq.shift(); if (!fxBusy) nextFx(); }
function nextFx(): void {
  const f = fxq.shift();
  if (!f) { fxBusy = false; st().set({ fxShow: null }); return; }
  fxBusy = true;
  const dur = fxDuration(f);
  st().set({ fxShow: { f, out: false } });
  if (shakes(f)) setTimeout(shake, f.t === 'rps' ? 500 : f.t === 'vault' ? 600 : 0);
  setTimeout(() => { st().set({ fxShow: { f, out: true } }); setTimeout(nextFx, 260); }, dur);
}
function fxDuration(f: Fx): number {
  return ({ dice: 1300, title: 1600, pop: f.small ? 1100 : 1400, rps: 2200, vault: 2300, count: 2000, bids: 1800, token: 1300, attack: 1300, rank: 1900, win: 3200, item: 2100, change: 2600, cave: 1600, balance: 2400, liar: 3000, fore: 2800, fork: 2600, duel: 2600, updown: 2600, curl: 2200, fold: 2200, chainAim: 1500, mid: 2600, line: 1700, dodge: 2000 } as Record<string, number>)[f.t] || 1300;
}
function shakes(f: Fx): boolean {
  if (f.t === 'dice') return !!f.bust;
  if (f.t === 'pop' || f.t === 'attack' || (f.t === 'item' && f.kind === 'attack')) return true;
  if (f.t === 'rps' || f.t === 'vault') return !!(f.losers as number[])?.length;
  return false;
}
export function shake(): void { st().set({ shakeN: st().shakeN + 1 }); }

/* ---------------- 상태가 바뀌면 ---------------- */
let lastMgId: MgId | null = null;
let lastFx: number | null = null, choosing = false, clubBusy = false, prevPhase: string | null = null, introKey = '', lastActor: string | null = null;
const clubQ: Fx[] = [];
export function rulesReady(): void { choosing = false; st().set({ rulesShown: true }); }
async function runClub(f: Fx): Promise<void> {
  clubBusy = true;
  try {
    // ♣: 모니터가 빨간 X → 모니터와 별개인 컷신. 규칙 화면이 꺼졌다 켜지지 않게 한 번에 바꾼다
    st().set({ clubPlaying: true, screenAlert: true });
    await new Promise(r => setTimeout(r, 900));
    st().set({ cutin: f });
    await new Promise(r => setTimeout(r, 1900));
    st().set({ cutin: null, screenAlert: false, rulesShown: false });
    choosing = true;
    // ♣Q·♣K: 쓰고 나면 미니게임 선택 화면(디스크가 늘어선 테이블)으로. 고르면 pick 연출이 이어진다
    if (S()?.phase === 'mg') { /* 즉시 시작 미니게임으로 바뀌었다: 고르기 연출 없이 바로 */ }
    else if (f.choose) world?.playSelect();
    else await world?.playChoose(f.v as number, { restore: true, roll: R(f.club as Card) === 11 });
  } finally { clubBusy = false; st().set({ clubPlaying: false }); }
  const nx = clubQ.shift(); if (nx) { if (nx.t === 'pick') runPick(nx); else runClub(nx); }
}
function runPick(f: Fx): void { if (S()?.phase === 'mg') return; choosing = true; st().set({ rulesShown: false }); void world?.playChoose(f.v as number, {}); }
function pumpFx(s: GameState): Fx[] {
  const list = s.fx || [];
  if (lastFx === null) { lastFx = s.fxn || 0; return []; }
  const nw = list.filter(f => f.id > lastFx!); if (nw.length) lastFx = nw[nw.length - 1].id; return nw;
}

export function onState(s: GameState): void {
  const W = world; if (!W) return;
  const me = st().me;
  W.sync(); const ph = s.phase; const nw = pumpFx(s);
  // 장면 전환
  if (ph !== prevPhase) {
    if (ph === 'main' || ph === 'defense') { if (prevPhase !== 'main' && prevPhase !== 'defense') { W.cut(); W.shot('seat', 2); } st().set({ rulesShown: false }); choosing = false; }
    if (ph === 'mg') { W.cut(); if (!W.goStation(s.mg!.id)) W.shot('seat', 2); st().set({ rulesShown: false }); choosing = false; st().patchUi({ showHand: false }); }
    if (ph !== 'mg' && prevPhase === 'mg') W.lightsMain();
    if (ph === 'reward') W.shot('reward', 2);
    if (ph === 'ended') W.shot('seat', 1.5);
    if (ph === 'lobby') W.shot('lobby', 2);
  }
  if (ph === 'roll') {
    const k = 'r' + s.round + s.board!.join();
    if (introKey !== k) { introKey = k; st().set({ rulesShown: false }); if (prevPhase === 'main' || prevPhase === 'defense') W.playIntro(); else { W.settleLined(); W.shot('disks'); } }
  }
  // 연출 이벤트
  if (s.mg) lastMgId = s.mg.id;
  for (const f of nw) {
    // 미니게임이 끝나면 순위 결과 화면(잠깐 뜨는 알림 대신)
    // 앞서 나온 연출(마지막 판 결과)이 다 끝난 뒤에 띄운다
    if (f.t === 'rank') { const r = { mg: lastMgId, groups: f.groups as number[][], rolls: (f.rolls || {}) as Record<number, number[]>, order: (f.order || []) as number[] }; const show = () => { if (fxBusy) setTimeout(show, 200); else st().set({ results: r }); }; show(); continue; }
    if (f.club || f.t === 'pick') { if (clubBusy) clubQ.push(f); else if (f.t === 'pick') runPick(f); else runClub(f); continue; }
    // 즉시 시작 미니게임(눈치 게임)이 뽑혔으면 디스크 고르기 연출 없이 바로 미니게임으로
    if (f.t === 'dice' && f.mg && ph === 'mg') { queueFx({ ...f, t: 'banner', text: `${f.v}번 · 바로 시작!`, tone: 'bad' }); continue; }
    if (f.t === 'dice' && f.mg) { choosing = true; st().set({ rulesShown: false }); W.playChoose(f.v as number, { roll: true }); continue; }
    queueFx(f);
  }
  // 다시 들어왔거나 연출을 놓친 경우 바로 규칙 화면
  if (ph === 'clubs' && !st().rulesShown && !choosing && !clubBusy) {
    if (s.clubChoose) { choosing = true; W.playSelect(); }
    else { W.settleLined(); W.jumpChosen(s.die!); W.shot('zoom', 8); st().set({ rulesShown: true }); }
  }
  // 내 차례 알림
  const a = whoActs(s, me); const key = a + '|' + ph + '|' + (s.mg ? s.mg.id : '');
  if (key !== lastActor) { lastActor = key; if (a != null && mine(s, me, a) && !['lobby', 'clubs', 'ended'].includes(ph)) toast(mySeats(s, me).length > 1 ? `${seatName(s, a)} 차례!` : '내 차례!'); }
  // 시점: 내 메인 턴이면 덱·버림 줄 쪽으로 확대, 남의 차례면 테이블 전체
  if (ph === 'main' || ph === 'defense') {
    const want = s.turn && mine(s, me, s.turn.seat) && ph === 'main' ? 'myturn' : 'seat';
    if (W.camShot !== want && (W.camShot === 'seat' || W.camShot === 'myturn')) { W.resetLook(); W.shot(want, 2.2); }
  }
  // FPS: 메인 턴에서 내 차례가 아닐 때만(내가 막아야 하는 공격도 제외)
  const myAct = a != null && mine(s, me, a); const fps = (ph === 'main' || ph === 'defense') && mySeats(s, me).length > 0 && !myAct;
  if (!fps && W.isLocked()) W.resetLook(); W.setFps(fps);
  prevPhase = ph;
}

/* ---------------- 테이블 위 물건 ---------------- */
export function canPick(p: Pick): boolean {
  const s = S(); if (!s) return false; const i = st().ctl; const ui = st().ui;
  if (p.kind === 'deck') return s.phase === 'main' && !!s.turn && s.turn.seat === i && !s.turn.picked && !ui.mode;
  if (p.kind === 'row') return s.phase === 'main' && !!s.turn && s.turn.seat === i && ((!s.turn.picked && !ui.mode) || (ui.mode === 'HQ' && !isItem(p.c)));
  if (p.kind === 'reward') return s.phase === 'reward' && !!s.reward && s.reward.order[s.reward.pi] === i;
  if (p.kind === 'die') return s.phase === 'roll' && s.first === i;
  if (p.kind === 'seat') return ui.mode === 'target' && p.i !== i;
  if (p.kind === 'chair') return s.phase === 'lobby';
  if (p.kind === 'slot') return s.phase === 'clubs' && !!s.clubChoose && mine(s, st().me, s.clubChoose.seat) && clubChoices(s).includes(p.k);
  const m = s.mg;
  if (p.kind === 'bomb') return s.phase === 'mg' && m?.id === 'bomb' && m.alive[m.ci] === i;
  if (p.kind === 'door') return s.phase === 'mg' && m?.id === 'vault' && i != null && ((m.step === 'hide' && m.alive.includes(i) && !m.picks[i]) || (m.step === 'guard' && m.lead === i));
  return false;
}
export function pick(p: Pick): void {
  if (!canPick(p)) return; const ui = st().ui; const s = S()!;
  if (p.kind === 'deck') cmd('pdeck');
  if (p.kind === 'row') {
    if (ui.mode === 'HQ') { const hq = ui.hq || []; st().patchUi({ hq: hq.includes(p.c) ? hq.filter(x => x !== p.c) : hq.length < 2 ? [...hq, p.c] : hq }); return; }
    cmd('prow', { c: p.c });
  }
  if (p.kind === 'reward') cmd('rpick', { c: p.c });
  if (p.kind === 'die') cmd('roll');
  if (p.kind === 'bomb') cmd('bflip', { k: p.k });
  if (p.kind === 'slot') cmd('clubKgo', { k: p.k });
  if (p.kind === 'door') { if (s.mg?.id === 'vault' && s.mg.step === 'hide') cmd('vhide', { z: p.z }); else cmd('vz', { z: p.z }); }
  if (p.kind === 'chair') cmd('chair', { c: p.c });
  if (p.kind === 'seat') { const it = ui.card!; if (R(it) === 11) cmd('atk', { t: p.i }); else toast('아래 버튼에서 대상을 골라 주세요'); }
}

/* ---------------- 손패 카드를 끌어 놓았을 때 ---------------- */
export type Drop = { kind: 'hand' } | { kind: 'table' } | { kind: 'tray' } | { kind: 'seat'; i: number };
export function dropCard(c: Card, z: Drop): void {
  const s = S(); const i = st().ctl; if (i == null || !s) return;
  if (s.phase !== 'main' || !s.turn || s.turn.seat !== i) { toast('지금은 내 차례가 아니에요'); return; }
  const t = s.turn, p = s.seats[i]; if (z.kind === 'hand') return;
  if (t.peek) { toast('먼저 ♦J로 본 카드 중 1장을 고르세요'); return; }
  if (!t.picked) { toast('먼저 덱이나 버림 줄에서 1장을 주우세요'); return; }
  // 줍고 나서 버리기 전: 테이블에 놓으면 버리기. 토큰 칸에 놓아 토큰을 먼저 만들거나 ♠로 공격해도 된다(방금 주운 카드로도)
  if (t.mustDiscard && z.kind === 'table') { act({ type: 'discard', seat: i, card: c }); return; }
  if (t.trim) { if (z.kind !== 'table') return; act({ type: 'trimOne', seat: i, card: c }); return; }
  if (z.kind === 'tray') {
    if (isItem(c) && !(U(c) === 'D' && R(c) >= 12)) { toast('토큰 칸에는 숫자 카드(또는 ♦Q·♦K)를 놓으세요'); return; }
    if (isItem(c)) { st().set({ sel: [c] }); toast(`${cname(c)}를 골랐어요 · 같은 문양 숫자 카드를 토큰 칸에 놓으세요`); return; }
    if (t.token) { toast('이번 턴에 이미 토큰을 만들었어요'); return; }
    const su = U(c), cost = costFor(s, i); const it = st().sel.find(x => isItem(x) && U(x) === 'D');
    if (it) {
      const nums = p.hand.filter(x => U(x) === su && !isItem(x)).sort((a, b) => R(a) - R(b)); const need = R(it) === 13 ? 3 : cost;
      const cards = [...[c, ...nums.filter(x => x !== c)].slice(0, need), it];
      const err = canMakeToken(s, i, cards); if (err) { toast(err); return; }
      st().clearSel(); if (R(it) === 12) { st().setUi({ mode: 'DQ', cards }); return; }
      act({ type: 'token', seat: i, cards }); return;
    }
    const nums = p.hand.filter(x => U(x) === su && !isItem(x)).sort((a, b) => R(a) - R(b));
    if (nums.length < cost) { toast(`${SNAME[su]} 숫자 카드가 ${cost}장 필요해요 (지금 ${nums.length}장)`); return; }
    const e = canMakeToken(s, i, nums.slice(0, cost)); if (e) { toast(e); return; }
    cmd('qtoken', { s: su }); return;
  }
  if (!isItem(c)) { toast('숫자 카드는 토큰 칸에 놓아 토큰을 만들어요'); return; }
  if (t.item) { toast('이번 턴에 이미 아이템을 썼어요'); return; }
  const su = U(c), r = R(c);
  if (su === 'S') {
    if (z.kind !== 'seat') { toast('♠ 공격 카드는 공격할 상대에게 끌어 놓으세요'); return; }
    if (z.i === i) return;
    if (r === 11) { act({ type: 'attack', seat: i, card: c, target: z.i }); return; }
    st().set({ ui: { mode: 'target', card: c, only: z.i }, sel: [c] }); toast(r === 12 ? '받을 문양을 고르세요' : '뺏을 토큰을 고르세요'); return;
  }
  if (su === 'H' && r === 12) { st().set({ ui: { mode: 'HQ', card: c, hq: [] }, sel: [] }); return; }
  if (su === 'D' && r === 11) { act({ type: 'diamondJ', seat: i, card: c }); return; }
  if (su === 'D') { st().set({ sel: [c] }); toast(`${cname(c)}는 토큰 칸에 숫자 카드와 함께 써요`); return; }
  toast(su === 'H' ? '♥J·♥K는 남의 공격을 막을 때 써요' : '♣는 미니게임을 정할 때 써요');
}

/* ---------------- 방 나가기 ---------------- */
/** 대기실에서 방을 나가 메인 화면으로. 내 자리를 비우고 연결을 끊는다. 방장이 나가면 방이 닫힌다 */
export async function exitRoom(): Promise<void> {
  const store = st(); const room = store.room; const s = S(); if (!room) return;
  if (s?.phase === 'lobby') for (const k of mySeats(s, store.me).sort((a, b) => b - a)) await room.act({ type: 'leave', seat: k });
  if (room.role === 'host') forgetHosting(room.code);
  store.set({ room: null, S: null, ctl: null, sel: [], ui: {}, flash: '', autoSit: false });
  room.close();
  // 다음 방에서 지난 연출을 다시 틀지 않게
  lastFx = null; prevPhase = null; introKey = ''; lastActor = null; fxq = []; fxBusy = false;
  const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u);
}

/* ---------------- 버튼 → 행동 ---------------- */
type D = Record<string, string | number | undefined>;
export function cmd(a: string, d: D = {}): void {
  const store = st(); const s = S(); const i = store.ctl!; const sel = store.sel; const ui = store.ui;
  const W = world;
  switch (a) {
    case 'sit': act({ type: 'sit', name: store.name }); break;
    // 대기실 빈 의자: 앉아 있으면 옮겨 앉고, 아니면 그 의자에 앉는다
    case 'chair': if (i != null) act({ type: 'move', seat: i, chair: +d.c! }); else act({ type: 'sit', name: store.name, chair: +d.c! }); break;
    case 'leave': act({ type: 'leave', seat: +d.i! }); break;
    case 'start': act({ type: 'start' }); break;
    case 'restart': act({ type: 'restart' }); break;
    case 'tolobby': act({ type: 'toLobby' }); break;
    case 'reset1': store.patchUi({ confirmReset: true }); break;
    case 'reset2': store.patchUi({ log: false }); act({ type: 'reset' }); break;
    case 'copylink': { const u = location.href; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('링크를 복사했어요'), () => toast(u)); break; }
    case 'log': store.patchUi({ log: !ui.log }); break;
    case 'viewtop': W?.shot(W.camShot === 'top' ? 'seat' : 'top'); break;
    case 'viewseat': W?.resetLook(); W?.shot(s?.phase === 'reward' ? 'reward' : s?.phase === 'main' && s.turn && mine(s, store.me, s.turn.seat) ? 'myturn' : 'seat'); break;
    case 'ctl': store.setCtl(+d.i!); break;
    case 'togglehand': store.patchUi({ showHand: !ui.showHand }); break;
    case 'rulesagain': store.patchUi({ rulesAgain: !ui.rulesAgain }); break;
    case 'roll': act({ type: 'roll', seat: i }); break;
    case 'ready': act({ type: 'ready' }); break;
    case 'club': act({ type: 'club', seat: i, card: String(d.c), arg: d.x != null ? +d.x : undefined }); break;
    case 'clubK': store.setUi({ mode: 'clubK', card: String(d.c) }); break;
    // ♣Q·♣K를 쓴 뒤 미니게임 선택 화면(테이블의 디스크)에서 고르기
    case 'clubKgo': { const cc = s?.clubChoose; if (cc) act({ type: 'clubPick', seat: cc.seat, k: +d.k! }); break; }
    case 'defend': act({ type: 'defend', seat: i, card: String(d.c) }); break;
    case 'nodef': act({ type: 'noDefend', seat: i }); break;
    case 'pdeck': act({ type: 'pickDeck', seat: i }); break;
    case 'prow': act({ type: 'pickRow', seat: i, card: String(d.c) }); break;
    case 'pdisc': if (sel.length === 1) act({ type: 'discard', seat: i, card: sel[0] }); break;
    case 'token': {
      const it = sel.find(isItem); if (it && R(it) === 12) { store.setUi({ mode: 'DQ', cards: sel }); break; }
      act({ type: 'token', seat: i, cards: sel }); break;
    }
    case 'qtoken': {
      if (!s) break; const su = d.s as Suit; const cost = costFor(s, i);
      const nums = s.seats[i].hand.filter(c => U(c) === su && !isItem(c)).sort((x, y) => R(x) - R(y)).slice(0, cost);
      act({ type: 'token', seat: i, cards: nums }); break;
    }
    case 'dqcol': { const cards = ui.cards || []; store.setUi({}); act({ type: 'token', seat: i, cards, color: d.s as Suit }); break; }
    case 'item': {
      const c = sel[0]; const su = U(c), r = R(c);
      if (su === 'S') store.setUi({ mode: 'target', card: c });
      else if (su === 'H' && r === 12) store.set({ ui: { mode: 'HQ', card: c, hq: [] }, sel: [] });
      else if (su === 'D' && r === 11) act({ type: 'diamondJ', seat: i, card: c });
      break;
    }
    case 'tsuit': store.patchUi({ suit: d.s as Suit }); break;
    case 'atk': {
      const c = ui.card!; const tg = +d.t!; const arg = R(c) === 12 ? ui.suit : R(c) === 13 ? (d.s as Suit) : null;
      if (R(c) === 12 && !arg) return; store.setUi({});
      act({ type: 'attack', seat: i, card: c, target: tg, arg: arg ?? null }); break;
    }
    case 'hq': { const c = ui.card!; const picks = (ui.hq || []).filter(x => s?.row.includes(x)); store.setUi({}); act({ type: 'heartQ', seat: i, card: c, picks }); break; }
    case 'dj': act({ type: 'diamondJPick', seat: i, card: String(d.c) }); break;
    case 'cancel': store.set({ ui: {}, sel: [] }); break;
    case 'end': act({ type: 'endTurn', seat: i }); break;
    case 'trim': act({ type: 'trim', seat: i, cards: sel }); break;
    case 'hroll': act({ type: 'holdRoll', seat: i, item: null }); break;
    case 'hroll2': act({ type: 'holdRoll', seat: i, item: sel[0] }); break;
    case 'hstop': act({ type: 'holdStop', seat: i }); break;
    case 'barm': act({ type: 'bombArm', seat: i, item: sel[0] }); break;
    case 'bflip': act({ type: 'bombFlip', seat: i, k: +d.k! }); break;
    case 'aitem': act({ type: 'auctionItem', seat: i, item: sel[0] }); break;
    case 'aready': act({ type: 'auctionReady', seat: i }); break;
    case 'abid': act({ type: 'auctionBid', seat: i, card: String(d.c) }); break;
    case 'rpick': act({ type: 'reward', seat: i, card: String(d.c) }); break;
    case 'rps': act({ type: 'rps', seat: i, hand: d.hand as Hand }); break;
    case 'blp': {
      const it = ui.bsub ? sel.find(isItem) : null;
      if (ui.bsub && !it) { store.showFlash('빼기 모드: 왼쪽 아래 아이템 J·Q·K를 먼저 고르세요.'); break; }
      store.patchUi({ bsub: false }); act({ type: 'balloon', seat: i, card: String(d.c), item: it ?? null }); break;
    }
    case 'bsub': store.patchUi({ bsub: !ui.bsub }); break;
    case 'osave': act({ type: 'ovnSave', seat: i, item: sel[0] }); break;
    case 'onosave': act({ type: 'ovnSave', seat: i, item: null }); break;
    case 'rarm': act({ type: 'rpsArm', seat: i, item: sel[0] }); break;
    case 'rpass': act({ type: 'rpsPass', seat: i, item: sel[0] }); break;
    // ♠J: 뒷면으로 펼친 상대 손패에서 k번째를 고른다
    case 'steal': { const stl = s?.steal; if (stl) act({ type: 'stealPick', seat: stl.from, k: +d.k! }); break; }
    case 'vhide': act({ type: 'vaultHide', seat: i, zone: +d.z! }); break;
    case 'varm': act({ type: 'vaultArm', seat: i, item: sel[0] }); break;
    case 'vz': {
      if (s?.mg?.id !== 'vault') break; const need = s.mg.armL ? 2 : 1; const z = +d.z!;
      let zs = (ui.vz || []).slice(); zs = zs.includes(z) ? zs.filter(x => x !== z) : [...zs, z].slice(-need); store.patchUi({ vz: zs }); break;
    }
    case 'vgo': { const zs = (ui.vz || []).slice(); store.patchUi({ vz: [] }); act({ type: 'vaultGuard', seat: i, zones: zs }); break; }
    case 'cans': act({ type: 'countAnswer', seat: i, n: +d.n! }); break;
    case 'carm': act({ type: 'countArm', seat: i, item: sel[0] }); break;
    case 'rbet': act({ type: 'raceBet', seat: i, suit: d.s as Suit }); break;
    case 'rswap': act({ type: 'raceSwap', seat: i, item: sel[0], suit: d.s as Suit }); break;
    case 'rflip': act({ type: 'raceFlip', seat: i }); break;
    // 2026-10-12 추가 미니게임
    case 'dfake': act({ type: 'duelFake', seat: i, item: sel[0] }); break;
    case 'udgrip': act({ type: 'udGrip', seat: i, n: +d.n! }); break;
    case 'udcall': act({ type: 'udCall', seat: i, n: +d.n! }); break;
    case 'udre': act({ type: 'udRegrip', seat: i, item: sel[0], n: +d.n! }); break;
    case 'udshout': act({ type: 'udShout', seat: i, up: !!+d.up! }); break;
    case 'cnowall': act({ type: 'curlNoWall', seat: i, item: sel[0] }); break;
    case 'cshot': act({ type: 'curlShot', seat: i, shot: { x: +d.x!, angle: +d.a!, power: +d.p! } }); break;
    case 'lplay': act({ type: 'linePlay', seat: i }); break;
    case 'lpeek': act({ type: 'linePeek', seat: i, item: sel[0] }); break;
    case 'lgo': act({ type: 'lineGo', seat: i }); break;
    case 'spc': store.patchUi({ spc: d.c ? String(d.c) : undefined }); break;
    case 'splay': store.patchUi({ spc: undefined }); void store.act({ type: 'speedPlay', seat: i, card: String(d.c), pile: +d.k! }).then(ok => { if (!ok) toast('늦었어요!'); }); break;
    case 'spile': act({ type: 'speedPile', seat: i, item: sel[0], card: String(d.c) }); break;
    case 'fsay': act({ type: 'foldSay', seat: i, text: String(d.t) }); break;
    case 'fans': act({ type: 'foldAnswer', seat: i, yes: !!+d.y! }); break;
    case 'fsafe': act({ type: 'foldSafe', seat: i, item: sel[0] }); break;
    case 'ctwo': act({ type: 'chainTwo', seat: i, item: sel[0] }); break;
    case 'caim': {
      if (s?.mg?.id !== 'chain') break; const need = chainFingers(s.mg, i); const k = +d.k!;
      let a = (ui.aim || []).slice(); a = a.includes(k) ? a.filter(x => x !== k) : [...a, k].slice(-need); store.patchUi({ aim: a }); break;
    }
    case 'caimgo': { const a = (ui.aim || []).slice(); store.patchUi({ aim: [] }); act({ type: 'chainAim', seat: i, targets: a }); break; }
    case 'cpass': act({ type: 'chainPass', seat: i, k: +d.k! }); break;
    case 'mcrit': act({ type: 'midCrit', seat: i, item: sel[0], crit: d.c as MidCrit }); break;
    case 'mpick': act({ type: 'midPick', seat: i, card: String(d.c) }); break;
    // 2026-10-13 추가
    case 'gest': act({ type: 'gesture', seat: i, g: +d.g! }); break;
    case 'gskip': act({ type: 'gestSkip', seat: i, item: sel[0] }); break;
    case 'swide': act({ type: 'stackWide', seat: i, item: sel[0] }); break;
    case 'cmore': act({ type: 'chgMore', seat: i, item: sel[0] }); break;
    case 'chgsel': store.patchUi({ chg: ui.chg === +d.p! ? undefined : +d.p! }); break;
    case 'chgmove': store.patchUi({ chg: undefined }); act({ type: 'chgMove', seat: i, piece: +d.p!, cell: +d.c! }); break;
    case 'chgtog': {
      if (s?.mg?.id !== 'change') break; const need = s.mg.need; const p = +d.p!;
      let g = (ui.cg || []).slice(); g = g.includes(p) ? g.filter(x => x !== p) : [...g, p].slice(-need); store.patchUi({ cg: g }); break;
    }
    case 'chgguess': { const g = (ui.cg || []).slice(); store.patchUi({ cg: [] }); act({ type: 'chgGuess', seat: i, pieces: g }); break; }
    case 'cgo': act({ type: 'caveGo', seat: i, stay: !!+d.s! }); break;
    case 'cguard': act({ type: 'caveGuard', seat: i, item: sel[0] }); break;
    case 'tplace': act({ type: 'tenPlace', seat: i, slot: +d.k! }); break;
    case 'tgrab': act({ type: 'tenGrab', seat: i, n: +d.n!, ms: +d.ms! }); break;
    case 'tall': act({ type: 'tenAll', seat: i, item: sel[0] }); break;
    case 'bsay': act({ type: 'balSay', seat: i, opts: JSON.parse(String(d.o)) as string[] }); break;
    case 'bthree': act({ type: 'balThree', seat: i, item: sel[0] }); break;
    case 'bpick': act({ type: 'balPick', seat: i, k: +d.k! }); break;
    case 'lsu': store.patchUi({ lsu: String(d.s) }); break;
    case 'ln': store.patchUi({ ln: +d.n! }); break;
    case 'lbid': act({ type: 'liarBid', seat: i, suit: d.s as Suit, n: +d.n! }); break;
    case 'lcall': act({ type: 'liarCall', seat: i }); break;
    case 'ladd': act({ type: 'liarAdd', seat: i, item: sel[0] }); break;
    case 'fgo': act({ type: 'foreAct', seat: i, go: !!+d.g! }); break;
    case 'fto': store.patchUi({ fto: +d.k! }); break;
    case 'fv': store.patchUi({ fv: +d.v! }); break;
    case 'fask': act({ type: 'foreAsk', seat: i, item: sel[0], to: +d.to!, v: +d.v! }); break;
    case 'fpick': act({ type: 'forkPick', seat: i, k: +d.k! }); break;
    case 'frev': act({ type: 'forkRev', seat: i, item: sel[0] }); break;
    // 2026-10-14 주사위 눈 피하기
    case 'dk': store.patchUi({ dk: +d.k!, dor: undefined, dpl: undefined }); break;
    case 'drot': case 'dplace': case 'dnudge': {
      if (s?.mg?.id !== 'dodge') break; const m = s.mg;
      const p = a === 'drot' ? dodgeRotate(m, ui) : a === 'dplace' ? dodgePlaceAt(m, ui, +d.c!) : dodgeNudge(m, ui, +d.r!, +d.c!);
      if (p) store.patchUi(p); break;
    }
    case 'dshot': {
      if (s?.mg?.id !== 'dodge') break; const p = preview(s.mg, ui);
      if (!p) { toast('먼저 주사위를 고르세요'); break; }
      act({ type: 'dodgeShot', seat: i, k: p.k, cells: p.cells }); break;
    }
    case 'dmove': act({ type: 'dodgeMove', seat: i, cell: +d.c! }); break;
    case 'dlock': act({ type: 'dodgeLock', seat: i }); break;
    case 'dgo': act({ type: 'dodgeGo', seat: i }); break;
    case 'dblock': {
      const it = sel.find(isItem); if (!it) { toast('아이템 카드를 먼저 고르세요'); break; }
      // 쓴 카드는 손패에서 빠지므로 골라 둔 것도 지운다(다음 칸을 막으려면 다른 아이템을 다시 고른다)
      void store.act({ type: 'dodgeBlock', seat: i, item: it, cell: +d.c! }).then(ok => { if (ok) store.clearSel(); }); break;
    }
    case 'dpeek': act({ type: 'dodgePeek', seat: i, item: sel[0] }); break;
  }
}

export { viewSeat };
