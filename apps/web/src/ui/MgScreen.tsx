/* 리더기 화면 미니게임: 디스크를 리더기에 넣고 게임을 "재생"하는 컨셉. 테이블 대신 화면 가운데 전체를 쓴다.
   지금은 주사위 쌓기(스태커). 내 판은 크게, 다른 사람 판도 함께 보인다 */
import { useEffect, useState } from 'react';
import { type GameState, MG, type MgId, STACK_COLS, STACK_FAIL, STACK_ROWS, type StackMg, now, stackPeriod } from '@cubic3/engine';
import { SEATCOL, seatName } from '../game';
import { cmd } from '../flow';
import { useStore } from '../store';
import { digitalRules } from './mgtext';

/** 리더기 화면으로 하는 미니게임 */
export const SCREEN_MG: MgId[] = ['stack'];

function Board({ rows, h, cur, pos, w, big, fail, gutter }: { rows: number[]; h: number; cur: boolean; pos: number; w: number; big?: boolean; fail?: boolean; gutter?: boolean }) {
  // gutter: 판 양옆의 실패 칸(-1번, STACK_COLS번 칸). 아래에 받쳐 줄 칸이 없어 여기서 멈추면 늘 실패
  const c0 = gutter ? -1 : 0, c1 = gutter ? STACK_COLS : STACK_COLS - 1;
  return <div className={`sboard${big ? ' big' : ''}${fail ? ' fail' : ''}`}>
    {Array.from({ length: STACK_ROWS }, (_, r) => STACK_ROWS - 1 - r).map(r => <div key={r} className="srow">
      {Array.from({ length: c1 - c0 + 1 }, (_, k) => k + c0).map(c => {
        const out = c < 0 || c >= STACK_COLS;
        const on = !out && r < h ? rows[r] === c : cur && r === h && c >= pos && c < pos + w;
        return <span key={c} className={`scell${out ? ' gut' : ''}${on ? ' on' : ''}${cur && r === h ? ' cur' : ''}`} />;
      })}
    </div>)}
  </div>;
}

/** 이 기기에서의 쌓기 진행(판마다 새로) */
const run: { key: string; t0: number; seats: Record<number, { rowT: number; rows: number[]; done: boolean; pen: number; lock: number }> } = { key: '', t0: 0, seats: {} };
/** 네모가 오가는 칸 수: 판 5칸 + 양옆 실패 칸 1칸씩. 네모 왼쪽 끝 위치는 -1 ~ STACK_COLS-w+1 */
const travel = (w: number) => STACK_COLS - w + 2;
/** 새 층(또는 실패 뒤 다시)은 실패 칸에서 출발한다. 층마다 왼쪽·오른쪽을 번갈아(짝수 층 왼쪽). 출발하자마자 누르면 실패 칸이라 광클로는 쌓이지 않는다 */
function rowStart(row: number, w: number, at: number): number {
  return row % 2 === 0 ? at : at - travel(w) * stackPeriod(row);
}
/** 쌓은 직후 잠깐 입력을 받지 않는다(ms) */
const STACK_LOCK = 150;

function StackScreen({ S, i }: { S: GameState; i: number | null }) {
  const m = S.mg as StackMg;
  const [, force] = useState(0);
  const playing = m.step === 'play' && i != null && !m.done[i];
  const w = i != null && m.wide[i] ? 2 : 1;
  // 시작: 상태를 받은 때부터 내 기기에서 잰다. 판마다 한 번 시작 시각을 잡고, 자리별 진행은 따로 둔다(한 기기에서 자리를 바꿔도 시간·진행이 이어지게)
  const key = m.step === 'play' ? `${S.round}:${m.until}` : '';
  if (key && run.key !== key) { run.key = key; run.t0 = performance.now(); run.seats = {}; }
  if (key && i != null && !run.seats[i]) run.seats[i] = { rowT: rowStart(0, i != null && m.wide[i] ? 2 : 1, performance.now()), rows: [], done: false, pen: 0, lock: 0 };
  const seatSt = i != null ? run.seats[i] : undefined;
  useEffect(() => { let raf = 0; const f = () => { force(x => x + 1); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf); }, []);
  const s = seatSt || { rowT: 0, rows: [] as number[], done: false, pen: 0, lock: 0 }; const t0 = run.t0; const t = performance.now(); const row = s.rows.length;
  const penLeft = Math.max(0, s.pen - t);
  const span = travel(w); const period = stackPeriod(row);
  const tt = Math.floor(Math.max(0, t - s.rowT) / period) % (span * 2); const pos = (tt <= span ? tt : span * 2 - tt) - 1;
  const elapsed = t - t0; const left = Math.max(0, m.limit - elapsed);
  const stop = () => {
    if (!playing || s.done || performance.now() < Math.max(s.pen, s.lock)) return;
    const prev = s.rows[row - 1];
    // 1층은 판 안에 걸치기만 하면 된다(실패 칸에 걸친 2칸 네모는 판 안쪽 칸으로). 그 위는 바로 아래 칸 위에 걸쳐야 한다
    const inBoard = Math.max(0, pos), inEnd = Math.min(STACK_COLS - 1, pos + w - 1);
    if (row === 0 ? inBoard <= inEnd : prev >= pos && prev < pos + w) {
      s.rows.push(row === 0 ? inBoard : prev); const nowT = performance.now(); s.rowT = rowStart(row + 1, w, nowT); s.lock = nowT + STACK_LOCK;
      const h = s.rows.length; const fin = h >= STACK_ROWS; if (fin) s.done = true;
      void useStore.getState().act({ type: 'stack', seat: i!, h, ms: fin ? Math.round(performance.now() - t0) : null, cols: s.rows.slice() });
    } else {
      // 실패: 잠깐(1초) 멈췄다가 그 층부터 다시. 남은 시간은 따로 보여 주지 않는다
      s.pen = performance.now() + STACK_FAIL; s.rowT = rowStart(row, w, s.pen);
    }
  };
  useEffect(() => {
    if (!playing) return;
    const k = (e: KeyboardEvent) => { if (e.repeat || ['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return; e.preventDefault(); stop(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  // 시간이 다 되면 지금 높이로 끝
  useEffect(() => { if (playing && !s.done && elapsed > m.limit) { s.done = true; void useStore.getState().act({ type: 'stack', seat: i!, h: s.rows.length, done: true, cols: s.rows.slice() }); } });
  const nm = (k: number) => seatName(S, k);
  const others = m.ord.filter(k => k !== i);
  const mineRows = i != null && m.step === 'play' ? s.rows : [];
  let status: React.ReactNode;
  if (m.step === 'pre') status = <b className="big">{Math.max(0, Math.ceil((m.until - now()) / 1000))}</b>;
  else if (i == null) status = '구경 중';
  else if (m.done[i] || s.done) status = i in m.ms ? <b className="ok">8층 완성! {(m.ms[i] / 1000).toFixed(2)}초</b> : s.rows.length >= STACK_ROWS ? <b className="ok">8층 완성!</b> : '끝 · 기다리는 중';
  else if (penLeft > 0) status = <b className="bad">실패!</b>;
  else status = <>아무 키 · 클릭 · 터치로 멈추기 · <b>{row + 1}층</b></>;
  return <>
    <div className="mgs-top"><span className="mono">PLAY ▸ {MG.stack.name}</span><span className="mgs-time">{m.step === 'play' ? `${Math.ceil(left / 1000)}초` : '준비'}</span></div>
    <div className="mgs-body stackscreen">
      {i != null && <div className="mine">
        <div className="who"><i className="sdot" style={{ background: SEATCOL[i % 5] }} />{nm(i)}{w > 1 ? ' · 네모 2칸' : ''}</div>
        <div className="press" onPointerDown={e => { e.preventDefault(); stop(); }} role="button" aria-label="멈추기">
          <Board rows={mineRows} h={mineRows.length} cur={playing && penLeft <= 0} pos={pos} w={w} big gutter fail={penLeft > 0} />
        </div>
        <div className="status">{status}</div>
      </div>}
      <div className="others">{others.map(k => <div key={k} className={`other${m.done[k] ? ' done' : ''}`}>
        <div className="who"><i className="sdot" style={{ background: SEATCOL[k % 5] }} />{nm(k)}</div>
        <Board rows={m.cols[k] || []} h={m.h[k]} cur={false} pos={0} w={1} />
        <div className="sub">{k in m.ms ? `${(m.ms[k] / 1000).toFixed(2)}초` : `${m.h[k]}층`}</div>
      </div>)}</div>
    </div>
  </>;
}

export function MgScreen({ S, i }: { S: GameState; i: number | null }) {
  const ui = useStore(s => s.ui); const m = S.mg!;
  return <div className={`mgscreen${S.mgEnd ? ' ended' : ''}`}>
    {m.id === 'stack' && <StackScreen S={S} i={i} />}
    {S.mgEnd && <div className="endnote" role="status">끝! 잠시 후 순위를 발표해요</div>}
    <button className="btn sm mgs-rules" onClick={() => cmd('rulesagain')}>규칙</button>
    {ui.rulesAgain && <div className="mgs-rulebox">{digitalRules(m.id).map(([h, t]) => <div key={h}><b>{h}</b> {t}</div>)}</div>}
  </div>;
}
