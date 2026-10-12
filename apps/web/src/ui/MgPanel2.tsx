/* 미니게임 조작판 2 (2026-10-12 추가분) */
import { useEffect, useState } from 'react';
import {
  type Card, type GameState, R, chainFingers, chainTagger, cname, curlTurn, curlZone, now, speedFits, udCaller, udShouter,
} from '@cubic3/engine';
import { SEATCOL, seatName } from '../game';
import { cmd } from '../flow';
import type { UiMode } from '../store';
import { MCard } from './bits';
import { duelShoot, useDuel } from '../duel';
import { soundReady } from '../sound';
import { usePrefs } from '../prefs';
import type { ItemUse } from './MgPanel';
import { CurlPad, curlFrames } from './CurlPad';

const secs = (t: number) => Math.max(0, Math.ceil((t - now()) / 1000));
const CRIT = { mid: '가운데 숫자', hi: '가장 큰 숫자', lo: '가장 작은 숫자' } as const;

/** 아이템 카드를 지금 쓸 수 있는지 (추가 미니게임) */
export function mgItemUse2(S: GameState, i: number, no: (w: string) => ItemUse, now_: (r: string) => ItemUse, pick: (w: string) => ItemUse): ItemUse | null {
  const m = S.mg!;
  switch (m.id) {
    case 'nunchi': {
      const d = useDuel.getState();
      return i in m.res ? no('이미 쐈어요') : m.fakes.includes(i) ? no('이번 판에 이미 썼어요') : d.stage === 'standoff' && performance.now() < d.startAt + m.sig - 300 ? now_('dfake') : no('대치 중에 써요');
    }
    case 'updown': return m.step === 'shout' && udShouter(m) === i ? (m.regrip ? no('이미 썼어요') : pick('고른 뒤 다시 쥘 동전 수를 누르세요')) : no('외치는 사람일 때, 외치기 전에 써요');
    case 'curling': return curlTurn(m) === i ? (m.noWall ? no('이미 썼어요') : now_('cnowall')) : no('내 차례에 튕기기 전에 써요');
    case 'line': return m.step === 'play' ? now_('lpeek') : no('카드를 내는 중에 써요');
    case 'speed': return m.step === 'pre' && m.hands[i]?.length ? pick('고른 뒤 새 더미로 낼 손패를 누르세요') : no('"시작!" 전에 써요');
    case 'fold': return m.step === 'answer' && !(i in m.ans) ? (m.safe[i] ? no('이미 썼어요') : now_('fsafe')) : no('조건이 나온 뒤, 답하기 전에 써요');
    case 'chain': return m.step === 'pre' ? (m.two[i] ? no('이미 썼어요') : now_('ctwo')) : no('카운트다운 중에 써요');
    case 'mid': return m.step === 'pre' ? pick('고른 뒤 이번 판 기준을 누르세요') : no('카드를 고르기 전에 써요');
  }
  return null;
}

function Pts({ S, pts, unit = '점', hi }: { S: GameState; pts: Record<number, number>; unit?: string; hi?: number | null }) {
  return <div className="chips">{Object.keys(pts).map(Number).map(k => <span key={k} className={`chip${k === hi ? ' on' : ''}`}><i className="sdot" style={{ background: SEATCOL[k % 5] }} />{seatName(S, k)} {pts[k]}{unit}</span>)}</div>;
}

/* ---------- 눈치 게임: 서부 결투 ---------- */
const DECOY_EMO = ['🐦', '🚪', '🍺', '🍂'];
function Duel({ S, i }: { S: GameState; i: number | null }) {
  const d = useDuel(); const vol = usePrefs(p => p.vol);
  // 아무 키나 눌러 쏜다(대치 중에만)
  useEffect(() => {
    if (d.stage !== 'standoff') return;
    const k = (e: KeyboardEvent) => { if (e.repeat || ['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return; e.preventDefault(); duelShoot(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [d.stage]);
  const m = S.mg!; if (m.id !== 'nunchi') return null;
  const muted = vol.master === 0 || vol.sfx === 0 || !soundReady();
  const me = i != null && i in m.pts;
  let big: React.ReactNode;
  if (!me) big = <div className="duel-msg">구경 중</div>;
  else if (d.stage === 'intro') big = <div className="duel-msg">{m.pan === 1 ? '결투 준비…' : '다음 결투…'}<small>종소리가 울리면 아무 키나 눌러 쏘세요</small></div>;
  else if (d.stage === 'standoff') big = <button className="duel-hit" onPointerDown={e => { e.preventDefault(); duelShoot(); }}>대치 중…<small>종소리가 울리면 아무 키나 · 클릭 · 터치</small></button>;
  else big = <div className="duel-msg">{d.mine === 'fs' ? '부정출발!' : `탕! ${((d.mine as number) / 1000).toFixed(3)}초`}<small>다른 사람을 기다리는 중</small></div>;
  return <>
    <div className="line">{m.pan}/{m.max}판 · 신호는 <strong>종소리</strong>뿐 · 미리 쏘면 -1점</div>
    {muted && <div className="line warn">🔇 소리가 꺼져 있어요. 소리를 켜야 신호를 들을 수 있어요 (설정 · 화면을 한 번 누르기)</div>}
    {m.pan === 1 && d.stage === 'intro' && <div className="line" style={{ fontSize: 13, color: 'var(--muted)' }}>블루투스 이어폰은 소리가 늦게 들려요 · 유선 이어폰이나 스피커를 권해요</div>}
    <div className="duel">{big}{d.vis.map(v => <span key={v.id} className={`decoy k${v.k}`} aria-hidden="true">{DECOY_EMO[v.k % 4]}</span>)}</div>
    <Pts S={S} pts={m.pts} />
  </>;
}

/* ---------- 위냐 아래냐 ---------- */
function UpDown({ S, i, selItem }: { S: GameState; i: number | null; selItem: Card | null }) {
  const m = S.mg!; if (m.id !== 'updown') return null;
  const nm = (k: number) => seatName(S, k); const caller = udCaller(m), sh = udShouter(m); const max = m.coins * m.ord.length;
  const myG = i != null && i in m.grip ? m.grip[i] : null;
  let me_: React.ReactNode = null;
  const nums = (n: number, c: string, lbl?: (v: number) => string) => <div className="nums">{Array.from({ length: n + 1 }, (_, v) => <button key={v} className="num" onClick={() => cmd(c, { n: v })}>{lbl ? lbl(v) : v}</button>)}</div>;
  if (m.step === 'grip') me_ = i != null && myG == null ? <><div className="line">동전을 몇 개 쥘까요? <small>(0~{m.coins}개, 아무도 모르게)</small></div>{nums(m.coins, 'udgrip', v => '🪙'.repeat(v) || '0')}</> : <div className="line">{myG}개를 쥐었어요 · 다른 사람을 기다리는 중</div>;
  if (m.step === 'call') me_ = i === caller ? <><div className="line">내 손 {myG}개 · 모두의 동전 합을 짐작해 부르세요 (0~{max})</div>{nums(max, 'udcall')}</> : <div className="line">{nm(caller)}이 숫자를 부르는 중 · 내 손 {myG}개</div>;
  if (m.step === 'shout') me_ = i === sh ? <>
    <div className="line"><strong>{nm(caller)}: {m.call}!</strong> · 내 손 {myG}개 · 합이 {m.call}보다 클까 작을까?</div>
    {selItem && !m.regrip ? <><div className="line"><strong>{cname(selItem)}</strong>: 다시 쥘 동전 수</div>{nums(m.coins, 'udre')}</> :
      <div className="bigbtns"><button className="btn primary big" onClick={() => cmd('udshout', { up: 1 })}>위! ▲</button><button className="btn primary big" onClick={() => cmd('udshout', { up: 0 })}>아래! ▼</button></div>}
  </> : <div className="line"><strong>{nm(caller)}: {m.call}!</strong> · {nm(sh)}이 외치는 중{myG != null ? ` · 내 손 ${myG}개` : ''}</div>;
  const L = m.last;
  return <>
    <div className="line">{m.turn + 1}/{m.turns} · 부르는 사람 <strong>{nm(caller)}</strong> · 외치는 사람 <strong>{nm(sh)}</strong></div>
    <Pts S={S} pts={m.pts} />
    {me_}
    {L && <div className="line" style={{ fontSize: 13, color: 'var(--muted)' }}>지난 판: {nm(L.caller)} {L.call} → {nm(L.shouter)} "{L.up ? '위' : '아래'}!" · 합 {L.sum}</div>}
  </>;
}

/* ---------- 말 컬링 ---------- */
function Curling({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!; if (m.id !== 'curling') return null;
  const nm = (k: number) => seatName(S, k); const who = curlTurn(m); const wait = now() < m.until;
  const tot: Record<number, number> = {}; m.ord.forEach(k => tot[k] = m.score[k].reduce((a, v) => a + v, 0));
  const left = (k: number) => m.seq.slice(m.si).filter(x => x === k).length;
  const live: Record<number, number> = {}; m.ord.forEach(k => live[k] = m.stones.filter(s => s.seat === k).reduce((a, s) => a + curlZone(s), 0));
  // 직전 샷이 굴러가는 모습(새 판의 첫 샷 전에는 없음)
  const fr = m.si > 0 || m.step === 'score' ? curlFrames(m) : null; const anim = fr && m.last ? { key: `${m.end}:${m.last.n}`, ...fr } : null;
  return <>
    <div className="line">{m.end}/{m.ends}판 · {m.step === 'score' ? '점수 세는 중' : wait ? '말이 멈추는 중…' : who === i ? <strong>내 차례 · 판 아래쪽 가장자리를 누른 채 뒤로 당겼다 놓으세요</strong> : <>{nm(who!)} 차례</>}</div>
    {who === i && m.noWall && <div className="line"><strong>아이템: 이번엔 끝 벽이 없어요</strong></div>}
    <CurlPad stones={m.stones} mySeat={i ?? 0} canShoot={who === i && !wait} noWall={m.noWall} anim={anim}
      onShot={s => cmd('cshot', { x: s.x, a: s.angle, p: s.power })} />
    <div className="chips">{m.ord.map(k => <span key={k} className={`chip${k === who ? ' on' : ''}`}><i className="sdot" style={{ background: SEATCOL[k % 5] }} />{nm(k)} {tot[k]}점 · 지금 {live[k]} · 남은 말 {left(k)}</span>)}</div>
  </>;
}

/* ---------- 조용한 줄 서기 ---------- */
function Line({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!; if (m.id !== 'line') return null;
  const nm = (k: number) => seatName(S, k); const h = i != null ? m.hands[i] || [] : [];
  const top = m.pile[m.pile.length - 1];
  let stage: React.ReactNode;
  if (m.step === 'ready') stage = <div className="line"><strong>{secs(m.until)}초 뒤 시작!</strong> · 말하지 않기</div>;
  else if (m.step === 'pause') stage = m.pause!.seat === i ? <>
    <div className="line"><strong>잠깐!</strong> · 다른 사람의 손패 1장씩 (나만 보여요)</div>
    <div className="mini-cards">{Object.keys(m.pause!.peek).map(Number).map(k => <div key={k} className="col"><MCard c={m.pause!.peek[k]} /><small>{nm(k)}</small></div>)}</div>
    <div className="bigbtns"><button className="btn primary" onClick={() => cmd('lgo')}>계속! ({secs(m.until)})</button></div>
  </> : <div className="line"><strong>잠깐!</strong> · {nm(m.pause!.seat)}이 엿보는 중 ({secs(m.until)})</div>;
  else stage = <div className="line">말없이 · 아무나 언제든 · {top ? <>가운데 <strong>{cname(top)}</strong></> : '아직 아무도 안 냈어요'}</div>;
  return <>
    <div className="line">{m.pan}/3판</div>
    <div className="chips">{m.ord.map(k => <span key={k} className="chip"><i className="sdot" style={{ background: SEATCOL[k % 5] }} />{nm(k)} 손 {m.hands[k].length} · 벌점 {m.won[k].length}</span>)}</div>
    {stage}
    {i != null && <>
      <div className="mini-cards">{h.map((c, k) => <MCard key={c} c={c} cls={k === 0 ? 'lit' : ''} />)}</div>
      <div className="bigbtns"><button className="btn primary big" disabled={m.step !== 'play' || !h.length} onClick={() => cmd('lplay')}>{h.length ? `${cname(h[0])} 내기` : '다 냈어요'}</button></div>
    </>}
  </>;
}

/* ---------- 스피드 ---------- */
function Speed({ S, i, ui, selItem }: { S: GameState; i: number | null; ui: UiMode; selItem: Card | null }) {
  const m = S.mg!; if (m.id !== 'speed') return null;
  const nm = (k: number) => seatName(S, k); const h = i != null ? m.hands[i] || [] : [];
  const sc = ui.spc && h.includes(ui.spc) ? ui.spc : null;
  const fits = (c: Card) => m.piles.map((p, k) => (speedFits(p[p.length - 1], c) ? k : -1)).filter(k => k >= 0);
  const playable = m.step === 'play';
  const pressCard = (c: Card) => {
    if (selItem && m.step === 'pre') { cmd('spile', { c }); return; }
    if (!playable) return;
    const f = fits(c); if (f.length === 1) { cmd('splay', { c, k: f[0] }); return; }
    cmd('spc', { c: sc === c ? '' : c });
  };
  let stage: React.ReactNode;
  if (m.step === 'pre') stage = <div className="line"><strong>{secs(m.until)}초 뒤 시작!</strong>{selItem ? ' · 새 더미로 낼 손패를 누르세요' : ''}</div>;
  else if (m.step === 'stuck') stage = <div className="line"><strong>막혔다!</strong> · 가운데마다 새 카드를 까는 중</div>;
  else stage = <div className="line">1 크거나 1 작은 카드를 내세요 (13↔1) · 낼 곳이 여럿이면 카드를 고른 뒤 더미를 누르세요</div>;
  return <>
    <div className="line">{m.pan}/3판</div>
    <div className="chips">{m.ord.map(k => <span key={k} className="chip"><i className="sdot" style={{ background: SEATCOL[k % 5] }} />{nm(k)} 손 {m.hands[k].length} · 벌점 {m.won[k].length}</span>)}</div>
    {stage}
    <div className="mini-cards piles">{m.piles.map((p, k) => { const ok = !!sc && playable && fits(sc).includes(k); return <MCard key={k} c={p[p.length - 1]} cls={ok ? 'click lit' : ''} onClick={ok ? () => cmd('splay', { c: sc!, k }) : undefined} />; })}</div>
    {i != null && <div className="mini-cards">{h.map(c => { const can = (playable && fits(c).length > 0) || (!!selItem && m.step === 'pre'); return <MCard key={c} c={c} cls={`${can ? 'click' : 'dim'}${c === sc ? ' sel' : ''}`} onClick={can ? () => pressCard(c) : undefined} />; })}</div>}
  </>;
}

/* ---------- 손병호 게임 ---------- */
function Fold({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!; const [txt, setTxt] = useState('');
  if (m.id !== 'fold') return null;
  const nm = (k: number) => seatName(S, k); const sp = m.ord[m.ci];
  let me_: React.ReactNode;
  if (m.step === 'say') me_ = sp === i ? <form className="foldsay" onSubmit={e => { e.preventDefault(); if (txt.trim()) { cmd('fsay', { t: txt.trim() }); setTxt(''); } }}>
    <input value={txt} maxLength={60} autoFocus placeholder="예: 오늘 커피 마신 사람" onChange={e => setTxt(e.target.value)} aria-label="조건" />
    <button className="btn primary" disabled={!txt.trim()}>접어!</button>
  </form> : <div className="line">{nm(sp)}이 조건을 고르는 중…</div>;
  else me_ = <>
    <div className="line big">"<strong>{m.text}</strong> 접어!"</div>
    {i != null && !(i in m.ans) ? <div className="bigbtns">
      <button className="btn primary big" onClick={() => cmd('fans', { y: 1 })}>{m.safe[i] ? '해당 (아이템: 안 접음)' : '해당 · 접기'}</button>
      <button className="btn big" onClick={() => cmd('fans', { y: 0 })}>아님</button></div>
      : <div className="line">{i != null ? '답했어요 · ' : ''}다른 사람을 기다리는 중 ({Object.keys(m.ans).length}/{m.ord.length})</div>}
  </>;
  return <>
    <div className="chips">{m.ord.map(k => <span key={k} className={`chip${k === sp ? ' on' : ''}`}><i className="sdot" style={{ background: SEATCOL[k % 5] }} />{nm(k)} {'✋'} {m.fingers[k]}</span>)}</div>
    {me_}
    {m.said.length > 0 && <div className="line" style={{ fontSize: 12, color: 'var(--muted)' }}>나온 조건: {m.said.slice(-6).join(' · ')}</div>}
  </>;
}

/* ---------- 손가락 사슬 ---------- */
function Chain({ S, i, ui }: { S: GameState; i: number | null; ui: UiMode }) {
  const m = S.mg!; if (m.id !== 'chain') return null;
  const nm = (k: number) => seatName(S, k); const tg = chainTagger(m);
  let me_: React.ReactNode = null;
  if (m.step === 'pre') me_ = <div className="line big"><strong>{['하나!', '둘!', '셋!'][Math.min(2, secs(m.until) - 1)] || '하나!'}</strong></div>;
  if (m.step === 'point') {
    const need = i != null ? chainFingers(m, i) : 0; const aim = ui.aim || [];
    me_ = i != null && !(i in m.aim) ? <>
      <div className="line">가리킬 사람 <strong>{need}명</strong>을 고르세요 · {secs(m.until)}초</div>
      <div className="bigbtns">{m.ord.filter(k => k !== i).map(k => <button key={k} className={`btn${aim.includes(k) ? ' primary' : ''}`} onClick={() => cmd('caim', { k })}>👉 {nm(k)}</button>)}</div>
      <div className="bigbtns"><button className="btn primary" disabled={aim.length !== need} onClick={() => cmd('caimgo')}>가리키기!</button></div>
    </> : <div className="line">다른 사람이 고르는 중 · {secs(m.until)}초</div>;
  }
  if (m.step === 'pass' || m.step === 'done') {
    me_ = <>
      <div className="chainmap">{m.ord.map(k => <div key={k} className={`row${k === m.cur && m.step === 'pass' ? ' cur' : ''}${k === m.caught ? ' caught' : ''}`}>
        <span className="who"><i className="sdot" style={{ background: SEATCOL[k % 5] }} />{nm(k)}</span>
        {(m.aim[k] || []).map((t, f) => <span key={f} className={`fing${m.bent[k]?.[f] ? ' bent' : ''}`}>👉 {nm(t)}</span>)}
      </div>)}</div>
      {m.step === 'pass' ? (m.cur === i ? <><div className="line"><strong>내 차례! {secs(m.until)}초</strong> · 접을 손가락을 고르세요</div>
        <div className="bigbtns">{(m.aim[i] || []).map((t, f) => <button key={f} className="btn primary big" disabled={m.bent[i]?.[f]} onClick={() => cmd('cpass', { k: f })}>👉 {nm(t)}에게</button>)}</div></>
        : <div className="line">{nm(m.cur)} 차례 · {secs(m.until)}초</div>)
        : <div className="line big"><strong>{nm(m.caught!)} 걸렸다!</strong></div>}
    </>;
  }
  return <>
    <div className="line">{m.pan}/{m.ord.length}판 · 술래 <strong>{nm(tg)}</strong>{Object.keys(m.two).length ? ` · 손가락 2개: ${Object.keys(m.two).map(k => nm(+k)).join('·')}` : ''}</div>
    <Pts S={S} pts={m.coins} unit="🪙" />
    {me_}
  </>;
}

/* ---------- 가운데 숫자 ---------- */
function Mid({ S, i, selItem }: { S: GameState; i: number | null; selItem: Card | null }) {
  const m = S.mg!; if (m.id !== 'mid') return null;
  const nm = (k: number) => seatName(S, k); const h = i != null ? m.hands[i] || [] : [];
  const can = m.step === 'pick' && i != null && !(i in m.picks);
  const sc: Record<number, number> = {}; m.ord.forEach(k => sc[k] = m.won[k].length);
  const L = m.last;
  return <>
    <div className="line">{m.pan}/5판 · 이번 판 기준 <strong>{CRIT[m.crit]}</strong>{m.critBy != null ? ` (${nm(m.critBy)} 아이템)` : ''}</div>
    {m.deckCard && <div className="line">덱 카드 <MCard c={m.deckCard} /> 도 함께 놓여요</div>}
    <Pts S={S} pts={sc} />
    {m.step === 'pre' && <div className="line"><strong>{secs(m.until)}초 뒤 고르기</strong> · 아이템으로 기준을 바꿀 수 있어요</div>}
    {m.step === 'pre' && selItem && <div className="bigbtns">{(['hi', 'mid', 'lo'] as const).map(c => <button key={c} className="btn" disabled={m.crit === c} onClick={() => cmd('mcrit', { c })}>{CRIT[c]}{m.crit === c ? ' (현재)' : ''}</button>)}</div>}
    {m.step === 'pick' && <div className="line">{can ? <strong>낼 카드 1장을 누르세요</strong> : i != null && i in m.picks ? `${cname(m.picks[i])}을 냈어요 · 기다리는 중` : '고르는 중'} ({Object.keys(m.picks).length}/{m.ord.length})</div>}
    {i != null && <div className="mini-cards">{h.map(c => <MCard key={c} c={c} cls={can ? 'click' : ''} onClick={can ? () => cmd('mpick', { c }) : undefined} />)}</div>}
    {L && <div className="line" style={{ fontSize: 13, color: 'var(--muted)' }}>지난 판({CRIT[L.crit]} {L.target}): {L.void ? '덱 카드가 걸려 무산' : L.win.length ? L.win.map(nm).join('·') + ' 1점' : '없음'}</div>}
  </>;
}

export function MgBody2({ S, i, sel, ui }: { S: GameState; i: number | null; sel: Card[]; ui: UiMode }) {
  const selItem = sel.length === 1 && R(sel[0]) >= 11 ? sel[0] : null;
  const [, set] = useState(0);
  // 남은 시간 표시용
  useEffect(() => { const t = setInterval(() => set(x => x + 1), 250); return () => clearInterval(t); }, []);
  switch (S.mg?.id) {
    case 'nunchi': return <Duel S={S} i={i} />;
    case 'updown': return <UpDown S={S} i={i} selItem={selItem} />;
    case 'curling': return <Curling S={S} i={i} />;
    case 'line': return <Line S={S} i={i} />;
    case 'speed': return <Speed S={S} i={i} ui={ui} selItem={selItem} />;
    case 'fold': return <Fold S={S} i={i} />;
    case 'chain': return <Chain S={S} i={i} ui={ui} />;
    case 'mid': return <Mid S={S} i={i} selItem={selItem} />;
  }
  return null;
}
