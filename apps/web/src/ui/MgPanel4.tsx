/* 미니게임 조작판 4 (2026-10-14 디지털 전용: 주사위 눈 피하기) */
import { useEffect, useState } from 'react';
import { type Card, DODGE_SHAPES, DODGE_SHOW, type DodgeMg, type GameState, R, dodgeAtk, dodgeCanBlock, dodgeCanGo, dodgeDefs, now } from '@cubic3/engine';
import { SEATCOL, seatName } from '../game';
import { cmd } from '../flow';
import type { UiMode } from '../store';
import type { ItemUse } from './MgPanel';
import type { MgBoard } from './Slab';

const secs = (t: number) => Math.max(0, Math.ceil((t - now()) / 1000));
const Dot = ({ k }: { k: number }) => <i className="sdot" style={{ background: SEATCOL[k % 5] }} />;

/** 아이템 카드를 지금 쓸 수 있는지 (추가 미니게임 4) */
export function mgItemUse4(S: GameState, i: number, no: (w: string) => ItemUse, now_: (r: string) => ItemUse, pick: (w: string) => ItemUse): ItemUse | null {
  const m = S.mg!;
  if (m.id !== 'dodge') return null;
  if (dodgeAtk(m) === i) return m.step === 'pick' && !m.shot ? pick('고른 뒤 막을 빈 칸을 누르세요') : no('발동하기 전에 써요(칸 봉쇄)');
  if (!(i in m.pos)) return no('지금은 쓸 수 없어요');
  if (m.peek[i]) return no('이미 썼어요');
  return m.step === 'pick' && m.shot && !m.done[i] ? now_('dpeek') : no('공격자 준비 완료 뒤, 내가 확정하기 전에 써요(엿보기)');
}

/** 주사위 면: 일반 주사위 눈 배치 */
const FACE: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function DieFace({ v, on, sm, onClick }: { v: number; on?: boolean; sm?: boolean; onClick?: () => void }) {
  const body = <span className={`dface${sm ? ' sm' : ''}${on ? ' on' : ''}`}>{Array.from({ length: 9 }, (_, c) => <i key={c} className={FACE[v]?.includes(c) ? 'p' : ''} />)}</span>;
  return onClick ? <button className="dfbtn" onClick={onClick} aria-label={`주사위 ${v}`}>{body}</button> : body;
}

const cen = (p: number[]) => [p.reduce((a, c) => a + Math.floor(c / 3), 0) / p.length, p.reduce((a, c) => a + (c % 3), 0) / p.length];
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** 공격자가 지금 놓으려는 모양(이 기기에서만) */
export function preview(m: DodgeMg, ui: UiMode): { k: number; die: number; groups: number[][][]; dor: number; dpl: number; cells: number[] } | null {
  const k = ui.dk ?? -1; if (!(k >= 0 && k < m.dice.length)) return null;
  const die = m.dice[k]; const groups = DODGE_SHAPES[die]; const dor = Math.min(ui.dor ?? 0, groups.length - 1);
  const ps = groups[dor]; let dpl = ui.dpl ?? -1;
  if (!(dpl >= 0 && dpl < ps.length)) { const c = ps.findIndex(p => p.includes(4)); dpl = c >= 0 ? c : Math.floor(ps.length / 2); }
  return { k, die, groups, dor, dpl, cells: ps[dpl] };
}
/** 회전: 다음 방향에서, 지금 모양의 가운데와 가장 가까운 자리 */
export function dodgeRotate(m: DodgeMg, ui: UiMode): Partial<UiMode> | null {
  const p = preview(m, ui); if (!p || p.groups.length < 2) return null;
  return dodgeOrient(m, ui, (p.dor + 1) % p.groups.length);
}
/** 방향을 바로 고르기(계기판): 그 방향에서 지금 모양의 가운데와 가장 가까운 자리 */
export function dodgeOrient(m: DodgeMg, ui: UiMode, dor: number): Partial<UiMode> | null {
  const p = preview(m, ui); if (!p || !(dor >= 0 && dor < p.groups.length)) return null;
  const c0 = cen(p.cells); const ps = p.groups[dor];
  let best = 0; ps.forEach((q, j) => { if (dist(cen(q), c0) < dist(cen(ps[best]), c0)) best = j; });
  return { dor, dpl: best };
}
/** 칸을 누르면: 지금 방향에서 그 칸을 덮는 자리 중 누른 칸에 가장 가까운 자리로 옮긴다 */
export function dodgePlaceAt(m: DodgeMg, ui: UiMode, c: number): Partial<UiMode> | null {
  const p = preview(m, ui); if (!p) return null; const ps = p.groups[p.dor]; const at = [Math.floor(c / 3), c % 3];
  const cand = ps.map((q, j) => ({ q, j })).filter(x => x.q.includes(c)); if (!cand.length) return null;
  cand.sort((a, b) => dist(cen(a.q), at) - dist(cen(b.q), at));
  return { dor: p.dor, dpl: cand[0].j };
}
/** 방향키: 같은 방향(회전)에서 그쪽으로 가장 가까운 자리 */
export function dodgeNudge(m: DodgeMg, ui: UiMode, dr: number, dc: number): Partial<UiMode> | null {
  const p = preview(m, ui); if (!p) return null; const ps = p.groups[p.dor]; const c0 = cen(p.cells);
  let best = -1, bd = Infinity;
  ps.forEach((q, j) => {
    const c = cen(q); const along = (c[0] - c0[0]) * dr + (c[1] - c0[1]) * dc; if (along <= 0.01) return;
    const side = Math.abs((c[0] - c0[0]) * dc - (c[1] - c0[1]) * dr); const d = along + side * 2;
    if (d < bd) { bd = d; best = j; }
  });
  return best < 0 ? null : { dor: p.dor, dpl: best };
}

/** 키보드: 확정은 Space로 통일(사용자 2026-10-14, Enter도 받는다). 공격자 = 1·2·3 주사위, 방향키 옮기기, R 회전, Space 발동 / 수비자 = 방향키 한 칸(제자리 기준), Space 확정 */
function useDodgeKeys(m: DodgeMg, i: number | null, ui: UiMode) {
  const amAtk = i === dodgeAtk(m); const amDef = i != null && i in m.pos;
  const myPos = amDef ? m.pos[i!] : -1; const canMove = amDef && m.step === 'pick' && !m.done[i!];
  void ui;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const dir: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (amAtk && m.step === 'pick' && !m.shot) {
        if (['1', '2', '3'].includes(e.key)) { e.preventDefault(); cmd('dk', { k: +e.key - 1 }); return; }
        if (dir[e.key]) { e.preventDefault(); cmd('dnudge', { r: dir[e.key][0], c: dir[e.key][1] }); return; }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); cmd('drot'); return; }
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cmd('dshot'); return; }
      }
      if (canMove) {
        if (dir[e.key]) { e.preventDefault(); const [dr, dc] = dir[e.key]; const r = Math.floor(myPos / 3) + dr, c = (myPos % 3) + dc; if (r >= 0 && r < 3 && c >= 0 && c < 3) cmd('dmove', { c: r * 3 + c }); return; }
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cmd('dlock'); }
      }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
}

export function Dodge({ S, i, ui, sel }: { S: GameState; i: number | null; ui: UiMode; sel: Card[] }) {
  const m = S.mg as DodgeMg;
  const atk = dodgeAtk(m); const amAtk = i === atk; const amDef = i != null && i in m.pos; const defs = dodgeDefs(m);
  const selItem = sel.length === 1 && R(sel[0]) >= 11 ? sel[0] : null;
  const pv = amAtk && m.step === 'pick' && !m.shot ? preview(m, ui) : null;
  const myPos = amDef ? m.pos[i!] : -1; const myMove = amDef ? (m.moves[i!] ?? myPos) : -1;
  const canMove = amDef && m.step === 'pick' && !m.done[i!];
  useDodgeKeys(m, i, ui);
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(x => x + 1), 250); return () => clearInterval(t); }, []);

  const nm = (k: number) => seatName(S, k);
  const L = m.step === 'show' ? m.last : null;
  // 수비자끼리는 서로 고르는 칸이 보인다(공격자·구경꾼에게는 숨긴다). 엿본 사람이 고르는 칸은 본인에게만
  const seeMoves = amDef;
  const click = (c: number) => {
    if (amAtk && m.step === 'pick' && !m.shot && selItem) { cmd('dblock', { c }); return; }
    if (pv) { cmd('dplace', { c }); return; }
    if (canMove && dodgeCanGo(m, i!, c)) cmd('dmove', { c });
  };
  // 마감: 내 역할 기준으로 10초 남았을 때부터 보여 준다
  const deadline = m.step === 'pick' ? (amAtk ? m.until : m.dUntil) : 0;
  const left = deadline ? secs(deadline) : 0; const showT = m.step === 'pick' && left <= 10 && (amAtk ? !m.shot : canMove);

  let head: React.ReactNode;
  if (m.step === 'pick') {
    if (amAtk) head = m.shot ? <div className="line">떨어뜨릴 준비 완료 · 수비자를 기다리는 중</div>
      : pv ? <div className="line"><strong>칸을 눌러 옮기고</strong>{pv.groups.length > 1 ? <> · <button className="btn sm" onClick={() => cmd('drot')}>⟳ 돌리기 <kbd>R</kbd></button></> : null} · <button className="btn sm primary" onClick={() => cmd('dshot')}>떨어뜨리기! <kbd>Space</kbd></button>{showT ? <> · {left}초</> : null}</div>
        : <div className="line"><strong>주사위 하나를 고르세요</strong> <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>{showT ? <> · {left}초</> : null}</div>;
    else if (amDef) head = m.done[i!] ? <div className="line">확정했어요 · 기다리는 중</div>
      : <div className="line"><strong>갈 칸을 고르세요</strong>(상하좌우 한 칸 또는 제자리) · <button className="btn sm primary" onClick={() => cmd('dlock')}>확정 <kbd>Space</kbd></button>{m.shot ? <> · <strong>공격자 준비 완료!</strong></> : null}{showT ? <> · {left}초</> : null}</div>;
    else head = <div className="line">고르는 중…</div>;
  } else head = L ? <div className="line">{L.auto ? '시간 초과! ' : ''}<DieFace v={L.die} sm /> 떨어졌다 · {L.hit.length ? <strong>{L.hit.map(nm).join(', ')} 맞음!</strong> : '모두 피했다'}</div> : null;

  const cells = Array.from({ length: 9 }, (_, c) => {
    const here = defs.filter(j => (L ? L.to[j] : m.pos[j]) === c);
    const ghost = seeMoves && m.step === 'pick' ? defs.filter(j => j in m.moves && (j === i || !m.peek[j]) && m.moves[j] !== m.pos[j] && m.moves[j] === c) : [];
    const shape = pv?.cells.includes(c) || (amAtk && m.shot?.cells.includes(c) && m.step === 'pick');
    const boom = L?.cells.includes(c);
    const reach = canMove && dodgeCanGo(m, i!, c);
    const blk = m.blocked.includes(c);
    const canBlk = amAtk && m.step === 'pick' && !m.shot && !!selItem && dodgeCanBlock(m, c);
    return <button key={c} className={`dcell${shape ? ' shape' : ''}${boom ? ' boom' : ''}${reach ? ' reach' : ''}${c === myMove && canMove ? ' mine' : ''}${blk ? ' blk' : ''}${canBlk ? ' can' : ''}`}
      onClick={() => click(c)} aria-label={`${c + 1}번 칸${blk ? ' 막힘' : ''}`}>
      {blk && <span className="lock">🔒</span>}
      {here.map(j => <i key={j} className={`pawn${L?.hit.includes(j) ? ' hit' : ''}`} style={{ background: SEATCOL[j % 5] }} title={nm(j)} />)}
      {ghost.map(j => <i key={'g' + j} className="pawn ghost" style={{ borderColor: SEATCOL[j % 5] }} title={`${nm(j)}이 고르는 칸`} />)}
    </button>;
  });

  return <>
    <div className="line">공격자 <Dot k={atk} /><strong>{nm(atk)}</strong> · {m.turn}/{m.turns}턴 · {m.ai + 1}/{m.ord.length}번째 공격자</div>
    {head}
    <div className="dodgewrap">
      <div className="ddice">{m.dice.map((v, k) => <DieFace key={k} v={v} on={pv?.k === k || (amAtk && m.shot?.k === k)} onClick={amAtk && m.step === 'pick' && !m.shot ? () => cmd('dk', { k }) : undefined} />)}</div>
      <div className="dgrid">{cells}</div>
      {amDef && m.peek[i!] && m.shot && <div className="dpeek">엿보기: 공격자가 고른 눈 <DieFace v={m.shot.die} sm /></div>}
    </div>
    <div className="chips">{m.ord.map(k => <span key={k} className={`chip${k === atk ? ' lead' : ''}`}><Dot k={k} />{nm(k)} {m.pts[k]}점{k === atk ? ' · 공격' : m.step === 'pick' && m.done[k] ? ' ✓' : ''}</span>)}</div>
  </>;
}

/** 아레나 석판에 새길 내용(공통 틀은 ui/Slab.tsx) */
export function dodgeBoard(S: GameState, i: number | null, ui: UiMode, sel: Card[]): MgBoard {
  const m = S.mg as DodgeMg;
  const atk = dodgeAtk(m); const amAtk = i === atk; const amDef = i != null && i in m.pos;
  const selItem = sel.length === 1 && R(sel[0]) >= 11;
  const pv = amAtk && m.step === 'pick' && !m.shot ? preview(m, ui) : null;
  const canMove = amDef && m.step === 'pick' && !m.done[i!];
  const nm = (k: number) => seatName(S, k);
  const deadline = m.step === 'pick' ? (amAtk ? m.until : m.dUntil) : 0;
  const pend = i != null ? S.mgItems?.[i] : null;
  const left = pend ? secs(pend.until) : deadline ? secs(deadline) : 0; const showT = !!pend || (m.step === 'pick' && left <= 10 && (amAtk ? !m.shot : canMove));
  // 가운데에는 상황마다 짧은 문구 한 줄만(사용자 2026-10-14). 단축키는 버튼 툴팁으로
  let line = ''; const buttons: MgBoard['buttons'] = [];
  if (m.step === 'pick') {
    if (amAtk) {
      if (m.shot) line = '수비자를 기다리는 중';
      // 아이템(칸 봉쇄)을 쓴 뒤: 막을 칸을 고른다(10초, 안 고르면 무작위)
      else if (S.mgItems?.[i!]) line = '무너뜨릴 발판을 고르세요';
      else if (pv) {
        line = '모양을 놓고 발동하세요';
        // 돌리기는 계기판(방향 표시판)과 R 키로만(위쪽 석판에는 버튼을 두지 않는다, 사용자 2026-10-14)
        // 확정 계열 버튼에는 단축키를 표시하지 않는다(사용자 2026-10-14)
        buttons.push({ id: 'dshot', label: '발동!', key: '' });
      } else line = '주사위를 하나 집으세요';
    } else if (amDef) {
      if (m.done[i!]) line = '확정했어요';
      else { line = m.shot ? '공격 준비 완료! 발판을 고르세요' : '갈 발판을 고르세요'; buttons.push({ id: 'dlock', label: '확정', key: '' }); }
    } else line = '고르는 중';
  } else if (m.last) {
    // 결과는 빛이 터진 뒤에 알린다(아레나 연출과 맞춘다)
    const L = m.last; const boom = now() - (m.until - DODGE_SHOW) > 1300;
    line = !boom ? `주사위 ${L.die} 발동!` : L.hit.length ? `${L.hit.map(nm).join(', ')} 맞음!` : '모두 피했다';
  }
  const lines = line ? [line] : [];
  const best = Math.max(...m.ord.map(k => m.pts[k]));
  return {
    title: '주사위 눈 피하기', sub: `${m.turn}/${m.turns}턴 · 공격자 ${m.ai + 1}/${m.ord.length}`, lines, timer: showT ? left : null, buttons,
    rows: m.ord.map(k => ({ k, name: nm(k), pts: m.pts[k], atk: k === atk, me: k === i, top: m.pts[k] === best && best > 0,
      st: k === atk ? 'atk' : m.step === 'pick' && m.done[k] ? 'ready' : m.step === 'pick' ? 'think' : null })),
    reward: (S.rewardDisp || []).slice(),
  };
}
/** 키보드만 붙이는 빈 컴포넌트(아레나에서는 조작판 대신) */
export function DodgeKeys({ S, i, ui }: { S: GameState; i: number | null; ui: UiMode }) {
  useDodgeKeys(S.mg as DodgeMg, i, ui); return null;
}
