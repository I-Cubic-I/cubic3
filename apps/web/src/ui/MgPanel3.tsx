/* 미니게임 조작판 3 (2026-10-13 디지털판 추가: 몸짓 잇기·주사위 쌓기·뭐가 바뀌었지·동굴 탐험·합이 10·밸런스 게임) */
import { useEffect, useRef, useState } from 'react';
import {
  type Card, type GameState, GESTURES, R, SUITS, SYM, type Suit, caveDecider, cname, foreTurn, gestTurn, liarTurn, now, tenTurn,
} from '@cubic3/engine';
import { SEATCOL, SUITCOL, seatName } from '../game';
import { cmd } from '../flow';
import type { UiMode } from '../store';
import { MCard } from './bits';
import type { ItemUse } from './MgPanel';

const secs = (t: number) => Math.max(0, Math.ceil((t - now()) / 1000));
const Dot = ({ k }: { k: number }) => <i className="sdot" style={{ background: SEATCOL[k % 5] }} />;
function Pts({ S, pts, unit = '점', hi }: { S: GameState; pts: Record<number, number>; unit?: string; hi?: number | null }) {
  return <div className="chips">{Object.keys(pts).map(Number).map(k => <span key={k} className={`chip${k === hi ? ' on' : ''}`}><Dot k={k} />{seatName(S, k)} {pts[k]}{unit}</span>)}</div>;
}

/** 아이템 카드를 지금 쓸 수 있는지 (추가 미니게임 3) */
export function mgItemUse3(S: GameState, i: number, no: (w: string) => ItemUse, now_: (r: string) => ItemUse, pick: (w: string) => ItemUse): ItemUse | null {
  const m = S.mg!;
  switch (m.id) {
    case 'gesture': return gestTurn(m) === i && m.pos === 0 && m.seq.length ? now_('gskip') : no('내 차례에 따라 하기 전에 써요');
    case 'stack': return m.step === 'pre' ? (m.wide[i] ? no('이미 썼어요') : now_('swide')) : no('시작 전에 써요');
    case 'change': return m.step === 'move' && m.changer === i ? (m.need === 3 ? no('이미 썼어요') : now_('cmore')) : no('바꾸는 사람이 옮기는 동안 써요');
    case 'cave': return caveDecider(m) === i ? now_('cguard') : no('내 선택 차례에, 고르기 전에 써요');
    case 'ten': return tenTurn(m) === i ? (m.all ? no('이번 판에 이미 썼어요') : now_('tall')) : no('내 차례에 놓기 전에 써요');
    case 'balance': return m.step === 'say' && m.ord[m.ci] === i ? (m.three ? no('이미 썼어요') : now_('bthree')) : no('선일 때 주제를 내기 전에 써요');
    case 'liar': return m.step === 'judge' && m.bid ? now_('ladd') : no(`판정 때("거짓말!" 뒤) 선언한 문양의 아이템을 써요`);
    case 'fore': return foreTurn(m) === i ? (i in m.asks ? no('이미 썼어요') : pick('고른 뒤 물어볼 사람과 숫자를 누르세요')) : no('내 차례에 승부·포기 전에 써요');
    case 'fork': return m.step === 'pick' || m.step === 'wait' ? (m.rev[i] ? no('이미 썼어요') : now_('frev')) : no('공개 전에 써요');
  }
  return null;
}

/* ---------- 몸짓 잇기 ---------- */
export const GEST_EMO = ['🙋', '👏', '🙅', '👋', '🙇', '🤨', '🤷', '🌀'];
const GEST_KEY = ['W', 'A', 'S', 'D', '↑', '←', '→', '↓'];
const KEYMAP: Record<string, number> = { w: 0, a: 1, s: 2, d: 3, arrowup: 4, arrowleft: 5, arrowright: 6, arrowdown: 7 };
function Gesture({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!; const cur = m.id === 'gesture' ? gestTurn(m) : -1; const mine = cur === i;
  useEffect(() => {
    if (!mine) return;
    const k = (e: KeyboardEvent) => { const g = KEYMAP[e.key.toLowerCase()]; if (g == null || e.repeat) return; e.preventDefault(); cmd('gest', { g }); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [mine]);
  if (m.id !== 'gesture') return null;
  const nm = (k: number) => seatName(S, k);
  const [prev, last] = m.recent.length === 2 ? m.recent : [null, m.recent[0] || null];
  const pad = (from: number, label: string) => <div className="dpad" aria-label={label}>
    {[0, 1, 2, 3].map(q => { const g = from + q; return <button key={g} className={`dbtn p${q}`} disabled={!mine} onClick={() => cmd('gest', { g })} aria-label={GESTURES[g]}><span className="e">{GEST_EMO[g]}</span><small>{GESTURES[g]}</small><kbd>{GEST_KEY[g]}</kbd></button>; })}
  </div>;
  return <>
    <div className="line"><strong>{nm(cur)}</strong> 차례 · 몸짓 {m.seq.length}개{mine ? <> · {m.pos < m.seq.length ? <strong>{m.pos + 1}번째를 따라 하세요</strong> : <strong>새 몸짓 1개를 붙이세요</strong>}</> : ''} · {secs(m.until)}초</div>
    {/* 머리 위 아이콘: 방금 몸짓과 흐려진 직전 몸짓만(지금까지의 줄은 보여 주지 않는다) */}
    <div className="gesthead" aria-live="polite">
      {prev && <span key={'p' + prev.n} className="g prev">{GEST_EMO[prev.g]}</span>}
      {last ? <span key={'l' + last.n} className="g now">{GEST_EMO[last.g]}<small>{GESTURES[last.g]}</small></span> : <span className="g none">?</span>}
    </div>
    <div className="chips">{m.alive.map(k => <span key={k} className={`chip${k === cur ? ' on' : ''}`}><Dot k={k} />{nm(k)}</span>)}{m.out.flat().map(k => <span key={'o' + k} className="chip out">{nm(k)}</span>)}</div>
    {i != null && m.alive.includes(i) && <div className="dpads">{pad(0, '손·팔')}{pad(4, '머리·몸')}</div>}
  </>;
}

/* ---------- 뭐가 바뀌었지 ---------- */
export const PIECE_COL = [SUITCOL.S, SUITCOL.H, SUITCOL.D, SUITCOL.C, '#f2efe6', '#1b1b1f', '#8a5cc8', '#6fc3ea'];
function Change({ S, i, ui }: { S: GameState; i: number | null; ui: UiMode }) {
  const m = S.mg!; if (m.id !== 'change') return null;
  const nm = (k: number) => seatName(S, k); const amCh = i === m.changer; const pick = ui.chg ?? null; const gs = ui.cg || [];
  const dark = m.step === 'move' && !amCh;
  const at = (c: number) => m.pieces.indexOf(c);
  const click = (c: number) => {
    const p = at(c);
    if (m.step === 'move' && amCh) {
      if (p >= 0 && !m.moved.includes(p)) { cmd('chgsel', { p }); return; }
      if (p < 0 && pick != null) cmd('chgmove', { p: pick, c });
    }
    if (m.step === 'guess' && !amCh && i != null && !(i in m.guesses) && p >= 0) cmd('chgtog', { p });
  };
  let head: React.ReactNode;
  if (m.step === 'look') head = <div className="line"><strong>{secs(m.until)}초</strong> 동안 잘 봐 두세요 · 바꾸는 사람 <strong>{nm(m.changer)}</strong></div>;
  else if (m.step === 'move') head = amCh ? <div className="line"><strong>말을 골라 빈 칸으로 옮기세요</strong> · {m.moved.length}/{m.need} · {secs(m.until)}초</div> : <div className="line"><strong>눈을 감으세요!</strong> · {nm(m.changer)}이 말을 옮기는 중 · {secs(m.until)}초</div>;
  else head = amCh ? <div className="line">다른 사람이 고르는 중 · {secs(m.until)}초</div>
    : i != null && i in m.guesses ? <div className="line">골랐어요 · 기다리는 중</div>
      : <div className="line"><strong>옮겨진 말 {m.need}개를 고르세요</strong> · {gs.length}/{m.need} · {secs(m.until)}초</div>;
  return <>
    {head}
    <div className={`chgboard${dark ? ' dark' : ''}`}>
      {Array.from({ length: 50 }, (_, c) => { const p = at(c); const sel = p >= 0 && (pick === p || gs.includes(p)); const mv = amCh && p >= 0 && m.moved.includes(p);
        return <button key={c} className={`ccell${sel ? ' sel' : ''}${mv ? ' mv' : ''}`} onClick={() => click(c)} tabIndex={dark ? -1 : 0} aria-label={`${c + 1}번 칸${p >= 0 ? ' 말' : ''}`}>
          <small>{c + 1}</small>{p >= 0 && !dark && <i className="piece" style={{ background: PIECE_COL[p] }} />}</button>; })}
      {dark && <div className="eyes">🙈</div>}
    </div>
    {m.step === 'guess' && !amCh && i != null && !(i in m.guesses) && <div className="bigbtns"><button className="btn primary" disabled={gs.length !== m.need} onClick={() => cmd('chgguess')}>이 말들이에요!</button></div>}
    <Pts S={S} pts={m.pts} hi={m.changer} />
  </>;
}

/* ---------- 동굴 탐험 ---------- */
const PIP = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function Cave({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!; if (m.id !== 'cave') return null;
  const nm = (k: number) => seatName(S, k); const dec = caveDecider(m);
  const tot: Record<number, number> = {}; m.ord.forEach(k => tot[k] = m.score[k].reduce((a, v) => a + v, 0));
  const L = m.last;
  return <>
    <div className="line">{m.pan}/3판 · <strong>{m.turn}턴</strong> 버팀 · 굴릴 주사위 {Math.min(3, m.pool + 1)}개 · 빼 둔 1 <strong>{m.ones}</strong>/3</div>
    <div className="cavedice">{L && !(m.step === 'decide' && m.turn === 0) ? L.faces.map((v, k) => <span key={k} className={`cdie${v === 1 ? ' one' : ''}`}>{PIP[v]}</span>) : <span className="cdie idle">🎲</span>}
      <span className="onesbox">{Array.from({ length: 3 }, (_, k) => <i key={k} className={k < m.ones ? 'on' : ''}>1</i>)}</span></div>
    {m.step === 'show' && L?.collapse && <div className="line big"><strong>무너졌다!</strong> 남은 사람 0점</div>}
    {m.step === 'decide' && (dec === i ? <><div className="line"><strong>남을까요, 나갈까요?</strong> 나가면 {m.turn}점</div>
      <div className="bigbtns"><button className="btn primary big" onClick={() => cmd('cgo', { s: 1 })}>남기</button><button className="btn big" onClick={() => cmd('cgo', { s: 0 })}>나가기 ({m.turn}점)</button></div></>
      : <div className="line">{dec != null ? `${nm(dec)}이 고르는 중` : ''}</div>)}
    <div className="chips">{m.ord.map(k => <span key={k} className={`chip${m.inside.includes(k) ? ' on' : ' out'}`} style={m.inside.includes(k) ? {} : { textDecoration: 'none' }}><Dot k={k} />{nm(k)} {tot[k]}점{m.inside.includes(k) ? ' · 동굴 안' : k in m.got ? ` · 이번 ${m.got[k]}` : ''}</span>)}</div>
  </>;
}

/* ---------- 합이 10 ---------- */
function Ten({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!;
  const seen = useRef<{ n: number; t: number }>({ n: -1, t: 0 });
  const flipN = m.id === 'ten' ? m.flipN : -1;
  // 새 카드가 뜬 순간(이 기기에서)부터 반응 시간을 잰다
  if (seen.current.n !== flipN) seen.current = { n: flipN, t: performance.now() };
  const grab = () => { if (m.id !== 'ten' || i == null || i in m.grabs) return; cmd('tgrab', { n: m.flipN, ms: Math.round(performance.now() - seen.current.t) }); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code !== 'Space' || e.repeat) return; e.preventDefault(); grab(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  if (m.id !== 'ten') return null;
  const nm = (k: number) => seatName(S, k); const turn = tenTurn(m); const mine = turn === i && (m.hands[turn] || []).length > 0 && !m.grabUntil;
  const anyEmpty = m.slots.some(s => !s.length);
  const sc: Record<number, number> = {}; m.ord.forEach(k => sc[k] = m.hands[k].length);
  return <>
    <div className="line">{Math.min(3, m.pan)}/3판 · {mine ? <strong>{anyEmpty ? '빈 자리' : '덮을 자리'}를 눌러 카드를 놓으세요</strong> : <>{nm(turn)} 차례</>}{m.all ? ' · 이번 판: 세 자리 모두' : ''}</div>
    {/* 합이 10인 자리는 표시하지 않는다(보고 계산해서 치는 게임이라) */}
    <div className="tenslots">{m.slots.map((s, k) => { const can = mine && !(anyEmpty && s.length);
      return <button key={k} className={`tslot${can ? ' can' : ''}`} disabled={!can} onClick={() => cmd('tplace', { k })} aria-label={`${k + 1}번 자리`}>
        {s.length ? <MCard c={s[s.length - 1]} /> : <span className="empty">빈 자리</span>}<small>{s.length}장</small></button>; })}</div>
    {i != null && <div className="bigbtns"><button className={`btn primary big grab${i in m.grabs ? ' done' : ''}`} disabled={i in m.grabs} onPointerDown={e => { e.preventDefault(); grab(); }}>🎲 잡기! <kbd>Space</kbd></button></div>}
    <Pts S={S} pts={sc} unit="장" hi={turn} />
  </>;
}

/* ---------- 밸런스 게임 ---------- */
const BAL_EX = [['짜장면', '짬뽕'], ['여름', '겨울'], ['산', '바다'], ['고양이', '강아지'], ['아침형', '저녁형'], ['영화관', '집에서 영화'], ['탕수육 부먹', '찍먹'], ['평생 라면 금지', '평생 치킨 금지'], ['투명 인간', '하늘 날기'], ['과거로', '미래로'], ['민트초코 좋아', '싫어'], ['카톡 답장 바로', '몰아서']];
const BAL_EX3 = [['봄', '여름', '가을'], ['떡볶이', '순대', '튀김'], ['버스', '지하철', '택시'], ['커피', '차', '주스']];
function Balance({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!; const [o, setO] = useState<string[]>(['', '', '']);
  if (m.id !== 'balance') return null;
  const nm = (k: number) => seatName(S, k); const lead = m.ord[m.ci]; const need = m.three ? 3 : 2;
  const fill = () => { const ex = m.three ? BAL_EX3 : BAL_EX; const pick = ex[Math.floor(Math.random() * ex.length)]; setO([...pick, '', ''].slice(0, 3)); };
  const ok = o.slice(0, need).every(x => x.trim()) && new Set(o.slice(0, need).map(x => x.trim())).size === need;
  let body: React.ReactNode;
  if (m.step === 'say') body = lead === i ? <>
    <div className="line"><strong>{need}가지를 적어 내세요</strong>{m.three ? ' · 이번엔 3점' : ''}</div>
    <form className="balsay" onSubmit={e => { e.preventDefault(); if (ok) { cmd('bsay', { o: JSON.stringify(o.slice(0, need).map(x => x.trim())) }); setO(['', '', '']); } }}>
      {o.slice(0, need).map((x, k) => <input key={k} value={x} maxLength={30} placeholder={['예: 짜장면', '예: 짬뽕', '예: 볶음밥'][k]} aria-label={`${k + 1}번`} onChange={e => setO(v => v.map((y, q) => (q === k ? e.target.value : y)))} />).reduce<React.ReactNode[]>((a, el, k) => (k ? [...a, <span key={'v' + k} className="vs">vs</span>, el] : [el]), [])}
      <button type="button" className="btn sm" onClick={fill}>예시</button><button className="btn primary" disabled={!ok}>내기</button>
    </form>
  </> : <div className="line">{nm(lead)}이 주제를 고르는 중…</div>;
  else body = <>
    <div className="line big">{m.opts.map((x, k) => <span key={k}>{k ? <span className="vs"> vs </span> : null}<strong>{x}</strong></span>)}</div>
    {i != null && !(i in m.picks) ? <div className="bigbtns">{m.opts.map((x, k) => <button key={k} className="btn primary big" onClick={() => cmd('bpick', { k })}>{x}</button>)}</div>
      : <div className="line">{i != null ? '골랐어요 · ' : ''}기다리는 중 ({Object.keys(m.picks).length}/{m.ord.length})</div>}
  </>;
  return <>
    <div className="line">{m.ci + 1}/{m.ord.length} · 선 <strong>{nm(lead)}</strong> · 가장 많은 쪽이 혼자면 그쪽 점수</div>
    {body}
    <Pts S={S} pts={m.pts} hi={lead} />
  </>;
}

/* ---------- 거짓말쟁이 ---------- */
function Liar({ S, i, ui }: { S: GameState; i: number | null; ui: UiMode }) {
  const m = S.mg!; if (m.id !== 'liar') return null;
  const nm = (k: number) => seatName(S, k); const cur = liarTurn(m); const mine = cur === i && m.step === 'bid';
  const minN = (m.bid?.n || 0) + 1; const su = (ui.lsu as Suit | undefined) || m.bid?.suit || 'S'; const n = Math.max(minN, ui.ln || minN);
  const h = i != null ? m.hands[i] || [] : [];
  return <>
    <div className="line">{m.bid ? <><strong>{nm(m.bid.seat)}: "{SYM[m.bid.suit]} {m.bid.n}장 이상!"</strong></> : '아직 선언이 없어요'} · {m.step === 'judge' ? <strong>공개! 아이템 낼 시간 {secs(m.until)}초</strong> : <>{nm(cur)} 차례</>}</div>
    {i != null && h.length > 0 && <div className="mini-cards">{h.map(c => <MCard key={c} c={c} />)}</div>}
    {mine && <>
      <div className="bigbtns">{SUITS.map(s => <button key={s} className={`btn${su === s ? ' primary' : ''}`} style={{ fontSize: 20, borderColor: SUITCOL[s] }} onClick={() => cmd('lsu', { s })}>{SYM[s]}</button>)}
        <button className="btn" disabled={n <= minN} onClick={() => cmd('ln', { n: n - 1 })}>−</button><span className="line big"><strong>{n}</strong>장 이상</span><button className="btn" onClick={() => cmd('ln', { n: n + 1 })}>+</button></div>
      <div className="bigbtns"><button className="btn primary big" onClick={() => cmd('lbid', { s: su, n })}>"{SYM[su]} {n}장 이상!"</button>{m.bid && <button className="btn big danger" onClick={() => cmd('lcall')}>거짓말!</button>}</div>
    </>}
    <div className="chips">{m.alive.map(k => <span key={k} className={`chip${k === cur ? ' on' : ''}`}><Dot k={k} />{nm(k)} · {m.hands[k]?.length || 0}장</span>)}{m.out.flat().map(k => <span key={'o' + k} className="chip out">{nm(k)}</span>)}</div>
  </>;
}

/* ---------- 이마 위의 카드 ---------- */
function Fore({ S, i, ui, selItem }: { S: GameState; i: number | null; ui: UiMode; selItem: Card | null }) {
  const m = S.mg!; if (m.id !== 'fore') return null;
  const nm = (k: number) => seatName(S, k); const cur = foreTurn(m); const mine = cur === i;
  const ask = i != null ? m.asks[i] : undefined; const to = ui.fto ?? null; const v = ui.fv ?? 7;
  return <>
    <div className="line">{m.pan}판{m.extra ? '(1판 더)' : ''} · 가운데 걸린 카드 <strong>{m.pile.length + Object.keys(m.fore).length}장</strong> · {cur != null ? <>{nm(cur)} 차례</> : ''}</div>
    {/* 이마 카드: 남의 것만 보이고 내 것은 ? */}
    <div className="forerow">{m.seq.map(k => <div key={k} className={`fslot${k === cur ? ' cur' : ''}`}>
      {k === i ? <MCard c={null} /> : <MCard c={m.fore[k]} />}
      <small><Dot k={k} />{nm(k)}{k in m.acts ? (m.acts[k] ? ' · 승부' : ' · 포기') : ''}</small>
      <small className="pile">더미 {m.hands[k].length}장</small>
    </div>)}</div>
    {ask && <div className="line">거울: {nm(ask.to)}에게 "내 카드가 {ask.v}보다 높아?" → <strong>{ask.yes ? '예' : '아니오'}</strong></div>}
    {mine && selItem && !ask && <>
      <div className="line"><strong>{cname(selItem)}</strong>: 누구에게, 몇보다 높은지 물을까요?</div>
      <div className="bigbtns">{m.seq.filter(k => k !== i).map(k => <button key={k} className={`btn${to === k ? ' primary' : ''}`} onClick={() => cmd('fto', { k })}>{nm(k)}</button>)}</div>
      <div className="bigbtns"><button className="btn" disabled={v <= 1} onClick={() => cmd('fv', { v: v - 1 })}>−</button><span className="line big">내 카드가 <strong>{v}</strong>보다 높아?</span><button className="btn" disabled={v >= 13} onClick={() => cmd('fv', { v: v + 1 })}>+</button>
        <button className="btn primary" disabled={to == null} onClick={() => cmd('fask', { to: to!, v })}>묻기</button></div>
    </>}
    {mine && !(selItem && !ask) && <div className="bigbtns"><button className="btn primary big" onClick={() => cmd('fgo', { g: 1 })}>승부{i != null && !m.hands[i].length ? ' (올인)' : ' · 1장 더'}</button><button className="btn big" onClick={() => cmd('fgo', { g: 0 })}>포기</button></div>}
  </>;
}

/* ---------- 갈림길 ---------- */
function Fork({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!; if (m.id !== 'fork') return null;
  const nm = (k: number) => seatName(S, k); const sc: Record<number, number> = {}; m.ord.forEach(k => sc[k] = m.won[k].reduce((a, c) => a + R(c), 0));
  const can = m.step === 'pick' && i != null && !(i in m.picks);
  return <>
    <div className="line">{m.pan}/3판 · {m.step === 'wait' ? <strong>{secs(m.until)}초 뒤 공개 · 역배를 낼 수 있어요</strong> : can ? <strong>몰래 칸을 고르세요 · 혼자 고른 칸만 가져가요</strong> : i != null && i in m.picks ? `${m.picks[i] + 1}번 칸을 골랐어요 · 기다리는 중` : '고르는 중'}</div>
    <div className="forkrow">{m.row.map((c, k) => <button key={k} className={`fork${i != null && m.picks[i] === k ? ' sel' : ''}`} disabled={!can} onClick={() => cmd('fpick', { k })}><b>{k + 1}</b><MCard c={c} /></button>)}</div>
    <div className="chips">{m.ord.map(k => <span key={k} className="chip"><Dot k={k} />{nm(k)} {sc[k]}점{k in m.picks ? ' ✓' : ''}{m.rev[k] ? ' · 역배' : ''}</span>)}</div>
  </>;
}

export function MgBody3({ S, i, sel, ui }: { S: GameState; i: number | null; sel: Card[]; ui: UiMode }) {
  const selItem = sel.length === 1 && R(sel[0]) >= 11 ? sel[0] : null;
  const [, set] = useState(0);
  // 남은 시간 표시용
  useEffect(() => { const t = setInterval(() => set(x => x + 1), 250); return () => clearInterval(t); }, []);
  switch (S.mg?.id) {
    case 'gesture': return <Gesture S={S} i={i} />;
    case 'change': return <Change S={S} i={i} ui={ui} />;
    case 'cave': return <Cave S={S} i={i} />;
    case 'ten': return <Ten S={S} i={i} />;
    case 'balance': return <Balance S={S} i={i} />;
    case 'liar': return <Liar S={S} i={i} ui={ui} />;
    case 'fore': return <Fore S={S} i={i} ui={ui} selItem={selItem} />;
    case 'fork': return <Fork S={S} i={i} />;
  }
  return null;
}
