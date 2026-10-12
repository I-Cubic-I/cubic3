/* 미니게임 조작판 3 (2026-10-13 디지털판 추가: 몸짓 잇기·주사위 쌓기·뭐가 바뀌었지·동굴 탐험·합이 10·밸런스 게임) */
import { useEffect, useRef, useState } from 'react';
import {
  type Card, type GameState, GESTURES, STACK_COLS, STACK_ROWS, caveDecider, gestTurn, now, tenPairs, tenTurn,
} from '@cubic3/engine';
import { SEATCOL, SUITCOL, seatName } from '../game';
import { cmd } from '../flow';
import { type UiMode, useStore } from '../store';
import { MCard } from './bits';
import type { ItemUse } from './MgPanel';

const secs = (t: number) => Math.max(0, Math.ceil((t - now()) / 1000));
const Dot = ({ k }: { k: number }) => <i className="sdot" style={{ background: SEATCOL[k % 5] }} />;
function Pts({ S, pts, unit = '점', hi }: { S: GameState; pts: Record<number, number>; unit?: string; hi?: number | null }) {
  return <div className="chips">{Object.keys(pts).map(Number).map(k => <span key={k} className={`chip${k === hi ? ' on' : ''}`}><Dot k={k} />{seatName(S, k)} {pts[k]}{unit}</span>)}</div>;
}

/** 아이템 카드를 지금 쓸 수 있는지 (추가 미니게임 3) */
export function mgItemUse3(S: GameState, i: number, no: (w: string) => ItemUse, now_: (r: string) => ItemUse): ItemUse | null {
  const m = S.mg!;
  switch (m.id) {
    case 'gesture': return gestTurn(m) === i && m.pos === 0 && m.seq.length ? now_('gskip') : no('내 차례에 따라 하기 전에 써요');
    case 'stack': return m.step === 'pre' ? (m.wide[i] ? no('이미 썼어요') : now_('swide')) : no('시작 전에 써요');
    case 'change': return m.step === 'move' && m.changer === i ? (m.need === 3 ? no('이미 썼어요') : now_('cmore')) : no('바꾸는 사람이 옮기는 동안 써요');
    case 'cave': return m.step === 'pre' && m.inside.includes(i) ? now_('cguard') : no('굴리기 전에, 동굴에 남은 사람이 써요');
    case 'ten': return tenTurn(m) === i ? (m.all ? no('이번 판에 이미 썼어요') : now_('tall')) : no('내 차례에 놓기 전에 써요');
    case 'balance': return m.step === 'say' && m.ord[m.ci] === i ? (m.three ? no('이미 썼어요') : now_('bthree')) : no('선일 때 주제를 내기 전에 써요');
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

/* ---------- 주사위 쌓기 (스태커) ---------- */
function Stack({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg!;
  const st = useRef<{ key: string; t0: number; rowT: number; rows: number[]; done: boolean; fail: number }>({ key: '', t0: 0, rowT: 0, rows: [], done: false, fail: 0 });
  const [, force] = useState(0);
  const playing = m.id === 'stack' && m.step === 'play' && i != null && !m.done[i];
  const wide = m.id === 'stack' && i != null && !!m.wide[i]; const w = wide ? 2 : 1;
  // 시작: 상태를 받은 때부터 내 기기에서 잰다
  const key = m.id === 'stack' && m.step === 'play' ? `${S.round}:${i}` : '';
  if (key && st.current.key !== key) st.current = { key, t0: performance.now(), rowT: performance.now(), rows: [], done: false, fail: 0 };
  useEffect(() => { if (!playing) return; let raf = 0; const f = () => { force(x => x + 1); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf); }, [playing]);
  const row = st.current.rows.length;
  const period = Math.max(55, 230 - row * 22);
  const span = STACK_COLS - w; const tt = Math.floor((performance.now() - st.current.rowT) / period) % (span * 2 || 1);
  const pos = span ? (tt <= span ? tt : span * 2 - tt) : 0;
  const elapsed = performance.now() - st.current.t0; const limit = m.id === 'stack' ? m.limit : 0;
  const stop = () => {
    const s = st.current; if (!playing || s.done) return;
    const prev = s.rows[row - 1];
    if (row === 0 || (prev >= pos && prev < pos + w)) {
      s.rows.push(row === 0 ? pos : prev); s.rowT = performance.now();
      const h = s.rows.length; const fin = h >= STACK_ROWS; if (fin) s.done = true;
      void useStore.getState().act({ type: 'stack', seat: i!, h, ms: fin ? Math.round(performance.now() - s.t0) : null });
    } else { s.fail = performance.now(); s.rowT = performance.now(); }
  };
  useEffect(() => {
    if (!playing) return;
    const k = (e: KeyboardEvent) => { if (e.repeat || ['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return; e.preventDefault(); stop(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  // 시간이 다 되면 지금 높이로 끝
  useEffect(() => { if (playing && !st.current.done && elapsed > limit) { st.current.done = true; void useStore.getState().act({ type: 'stack', seat: i!, h: st.current.rows.length, done: true }); } });
  if (m.id !== 'stack') return null;
  const nm = (k: number) => seatName(S, k);
  const failing = performance.now() - st.current.fail < 300;
  return <>
    {m.step === 'pre' ? <div className="line"><strong>{secs(m.until)}초 뒤 시작!</strong> · 아무 키·클릭·터치로 네모를 멈춰요</div>
      : <div className="line">{i != null && m.done[i] ? (i in m.ms ? <strong>8층 완성! {(m.ms[i] / 1000).toFixed(2)}초</strong> : '끝 · 기다리는 중') : <>남은 시간 <strong>{Math.max(0, Math.ceil((limit - elapsed) / 1000))}초</strong> · 바로 아래 칸 위에 멈추세요</>}</div>}
    {i != null && <div className={`stacker${failing ? ' fail' : ''}`} onPointerDown={e => { e.preventDefault(); stop(); }} role="button" aria-label="멈추기">
      {Array.from({ length: STACK_ROWS }, (_, r) => STACK_ROWS - 1 - r).map(r => <div key={r} className="srow">
        {Array.from({ length: STACK_COLS }, (_, c) => {
          const on = r < row ? st.current.rows[r] === c : r === row && playing && c >= pos && c < pos + w;
          return <span key={c} className={`scell${on ? ' on' : ''}${r === row && playing ? ' cur' : ''}`} />;
        })}
      </div>)}
    </div>}
    <div className="chips">{m.ord.map(k => <span key={k} className={`chip${m.done[k] ? ' on' : ''}`}><Dot k={k} />{nm(k)} {m.h[k]}층{k in m.ms ? ` · ${(m.ms[k] / 1000).toFixed(1)}초` : ''}</span>)}</div>
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
    {m.step === 'pre' && <div className="line"><strong>{secs(m.until)}초 뒤 굴림</strong> · 아이템으로 1을 지킬 수 있어요</div>}
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
  const anyEmpty = m.slots.some(s => !s.length); const pairs = tenPairs(m);
  const sc: Record<number, number> = {}; m.ord.forEach(k => sc[k] = m.hands[k].length);
  return <>
    <div className="line">{Math.min(3, m.pan)}/3판 · {mine ? <strong>{anyEmpty ? '빈 자리' : '덮을 자리'}를 눌러 카드를 놓으세요</strong> : <>{nm(turn)} 차례</>}{m.all ? ' · 이번 판: 세 자리 모두' : ''}</div>
    <div className="tenslots">{m.slots.map((s, k) => { const can = mine && !(anyEmpty && s.length); const hot = pairs.some(p => p.includes(k));
      return <button key={k} className={`tslot${can ? ' can' : ''}${hot ? ' hot' : ''}`} disabled={!can} onClick={() => cmd('tplace', { k })} aria-label={`${k + 1}번 자리`}>
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

export function MgBody3({ S, i, ui }: { S: GameState; i: number | null; sel: Card[]; ui: UiMode }) {
  const [, set] = useState(0);
  // 남은 시간 표시용
  useEffect(() => { const t = setInterval(() => set(x => x + 1), 250); return () => clearInterval(t); }, []);
  switch (S.mg?.id) {
    case 'gesture': return <Gesture S={S} i={i} />;
    case 'stack': return <Stack S={S} i={i} />;
    case 'change': return <Change S={S} i={i} ui={ui} />;
    case 'cave': return <Cave S={S} i={i} />;
    case 'ten': return <Ten S={S} i={i} />;
    case 'balance': return <Balance S={S} i={i} />;
  }
  return null;
}
