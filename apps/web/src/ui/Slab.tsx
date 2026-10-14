/* 미니게임 공통 화면 틀(사용자 2026-10-14: 미니게임마다 UI를 통일한다)
   위쪽 석판 한 장(왼쪽 위 게임 이름 · 가운데 지금 할 일·타이머·버튼 · 오른쪽 위 이번 보상) + 오른쪽 위 점수판 석판.
   미니게임은 MgBoard(새길 내용)만 만들어 넘긴다 */
import { useEffect, useState } from 'react';
import { type Card, R, RL, SYM, U } from '@cubic3/engine';
import { SEATCOL, SUITCOL, mySeats } from '../game';
import { cmd } from '../flow';
import { useStore } from '../store';
import { slabH, uiScale } from './scale';

/** 점수판 상태: 공격자 · 생각 중 · 준비 완료 · 없음 */
export type SlabStatus = 'atk' | 'think' | 'ready' | null;
/** 석판에 새길 내용(글자·버튼·점수표). 미니게임마다 만든다 */
export interface MgBoard {
  /** 왼쪽 위: 게임 이름만 */
  title: string;
  /** 점수판 머리: 턴 등 짧은 진행 정보 */
  sub: string;
  /** 가운데: 지금 할 일(짧은 문구 한 줄) */
  lines: string[];
  /** 가운데 타이머(초). 없으면 null */
  timer: number | null;
  /** 가운데 버튼: id는 flow의 명령 이름 */
  buttons: { id: string; label: string; key: string }[];
  rows: { k: number; name: string; pts: number; st: SlabStatus; atk: boolean; me: boolean; top: boolean }[];
  /** 오른쪽 위: 이번 보상 */
  reward: Card[];
}

/** 석판 윤곽: 얇은 직사각형(화면 폭) + 가운데 두꺼운 직사각형. 높이가 바뀌는 두 곳만 부드러운 S자로 잇는다(픽셀 단위로 계산해 화면 폭에 따라 곡선이 늘어나지 않게) */
export function useSlab() {
  const get = () => {
    // 크기는 공통 UI 배율(k)에 비례: 화면이 작으면 석판도 함께 얇고 짧아진다
    const W = window.innerWidth, k = uiScale(), low = window.innerHeight <= 520, narrow = W / window.innerHeight <= 4 / 3;
    // 작은 화면에서도 띠가 너무 얇아지지 않게(보상 카드 높이가 띠 두께에 묶여 옆이 비지 않도록)
    const { h1, h2 } = slabH(k), tw = Math.round(26 * k);
    const cw = Math.round(narrow ? W * 0.46 : Math.min(460 * k, Math.max(300 * k, W * 0.32)));
    const x0 = Math.round((W - cw) / 2) - tw, x1 = x0 + cw + 2 * tw;
    const edge = `M0,${h1} L${x0},${h1} C${x0 + tw / 2},${h1} ${x0 + tw / 2},${h2} ${x0 + tw},${h2} L${x1 - tw},${h2} C${x1 - tw / 2},${h2} ${x1 - tw / 2},${h1} ${x1},${h1} L${W},${h1}`;
    // 띠 왼쪽 끝은 게임 아이콘(메뉴 버튼) 자리. 기록·설정은 메뉴 안에
    const logo = Math.round(38 * k), icons = 0;
    return { W, h1, h2, low, k, cx: x0 + tw, cw, tl: 8 + logo + 8, rr: 8 + icons + 8, side: x0 - 14, edge, path: `M0,0 L${W},0 L${W},${h1} L${x1},${h1} C${x1 - tw / 2},${h1} ${x1 - tw / 2},${h2} ${x1 - tw},${h2} L${x0 + tw},${h2} C${x0 + tw / 2},${h2} ${x0 + tw / 2},${h1} ${x0},${h1} L0,${h1} Z` };
  };
  const [s, set] = useState(get);
  useEffect(() => { const f = () => set(get()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return s;
}

/** 화면에 고정된 석판 모양 점수판(오른쪽 위). 점수만, 머리에 짧은 진행 정보 */
export function Scoreboard({ b }: { b: MgBoard }) {
  const S = useStore(s => s.S); const me = useStore(s => s.me);
  if (!S) return null; const ms = mySeats(S, me);
  return <aside className="slate" aria-label="점수판">
    <div className="sl-h"><span>{b.sub}</span></div>
    {/* 한 기기에 내 자리가 여럿이면 줄을 눌러 그 자리로 조종한다(자리 칩 대신) */}
    <ol className="sl-score">{b.rows.map(r => <li key={r.k} className={`${r.atk ? 'atk' : ''}${r.me ? ' me' : ''}${ms.length > 1 && ms.includes(r.k) ? ' mine' : ''}`}
      onClick={ms.length > 1 && ms.includes(r.k) ? () => cmd('ctl', { i: r.k }) : undefined} title={ms.length > 1 && ms.includes(r.k) ? '이 자리로 조종' : undefined}>
      <i className="gem" style={{ background: SEATCOL[r.k % 5] }} /><span className="nm">{r.name}</span><StatusIcon st={r.st} /><b className={r.top ? 'top' : ''}>{r.pts}</b></li>)}</ol>
  </aside>;
}

/* 점수판 상태 아이콘: 글자·특수문자 대신 직접 그린 그림(사용자 2026-10-14). 시안 A·B 비교 중(주소에 icons=b면 B안) */
const INKC = '#140e0a', PAPER = '#fbf7ee', GOLD = '#e0a83e', GREEN = '#5c9e5a';
const ICON_A: Record<'atk' | 'think' | 'ready', React.ReactNode> = {
  // 칼: 날 · 금빛 가드 · 갈색 손잡이 · 금빛 폼멜
  atk: <g stroke={INKC} strokeWidth="1.5" strokeLinejoin="round">
    <path d="M19.6 2.6 21.4 4.4 10.4 15.4 8.6 13.6Z" fill="#eef1f4" /><path d="M19.6 2.6 21.4 4.4 15 10.8Z" fill="#c9d1da" stroke="none" />
    <path d="M5.6 12.4 11.6 18.4 10.4 19.6 4.4 13.6Z" fill={GOLD} /><path d="M8 17 5.4 19.6" stroke="#6b4423" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="4.3" cy="20.7" r="1.7" fill={GOLD} /></g>,
  // 생각 말풍선 + 점 세 개
  think: <g className="think"><g stroke={INKC} strokeWidth="1.5">
    <path d="M6 15.5c-2.6 0-4-1.7-4-3.6 0-1.8 1.4-3.2 3.1-3.4C5.6 6 7.6 4.5 9.9 4.8c1.1-1.3 3.4-1.8 5.1-.7 1-.6 2.6-.5 3.6.4 2 .2 3.4 1.9 3.3 3.8 1 .8 1.3 2.4.6 3.6-.6 1.4-2 2.1-3.4 1.9-.9 1.4-2.8 2-4.4 1.4-1.2 1-3.3 1-4.6.1-.9.3-2.5.4-4.1.2Z" fill={PAPER} />
    <circle cx="4.6" cy="18.6" r="1.5" fill={PAPER} /><circle cx="2.4" cy="21.6" r="0.9" fill={PAPER} /></g>
    <g className="dots"><circle cx="8.7" cy="10.2" r="1.2" fill={INKC} /><circle cx="12.3" cy="10.2" r="1.2" fill={INKC} /><circle cx="15.9" cy="10.2" r="1.2" fill={INKC} /></g></g>,
  // 초록 동그라미 체크
  ready: <g><circle cx="12" cy="12" r="9.6" fill={GREEN} stroke={INKC} strokeWidth="1.6" />
    <path d="M7.2 12.4 10.6 15.8 17 8.8" fill="none" stroke={PAPER} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></g>,
};
const ICON_B: Record<'atk' | 'think' | 'ready', React.ReactNode> = {
  // 별 지팡이
  atk: <g stroke={INKC} strokeWidth="1.5" strokeLinejoin="round">
    <path d="M4 20 15.2 8.8" strokeWidth="3.6" strokeLinecap="round" /><path d="M4 20 15.2 8.8" stroke="#8a5a32" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M18 2.4 19.2 5.6 22.4 6 19.8 8 20.6 11.2 18 9.4 15.2 11.2 16 8 13.6 6 16.8 5.6Z" fill="#f2c84b" /></g>,
  // 모래시계
  think: <g className="think" stroke={INKC} strokeWidth="1.5" strokeLinejoin="round">
    <path d="M6 2.8h12M6 21.2h12" strokeWidth="2" strokeLinecap="round" />
    <path d="M7 3c0 4.4 3.4 6.2 3.4 9S7 16.6 7 21h10c0-4.4-3.4-6.2-3.4-9S17 7.4 17 3Z" fill={PAPER} />
    <path d="M9.4 19.6c.6-1.7 1.7-2.7 2.6-3 .9.3 2 1.3 2.6 3Z" fill="#d8b06a" stroke="none" /><path d="M9.6 6.2h4.8c-.6 1.3-1.5 2-2.4 2.6-.9-.6-1.8-1.3-2.4-2.6Z" fill="#d8b06a" stroke="none" /></g>,
  // 초록 방패 체크
  ready: <g><path d="M12 2.4 20 5.4V11.6c0 4.8-3.4 8.4-8 10-4.6-1.6-8-5.2-8-10V5.4Z" fill={GREEN} stroke={INKC} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8 12 11 15 16.4 9.2" fill="none" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></g>,
};
const ICONS = typeof location !== 'undefined' && new URLSearchParams(location.search).get('icons') === 'b' ? ICON_B : ICON_A;
/** 점수판 상태 아이콘: 공격자 · 생각 중 · 준비 완료. 글자 대신 아이콘으로 점수판 폭을 줄인다 */
export function StatusIcon({ st }: { st: SlabStatus }) {
  const label = st === 'atk' ? '공격자' : st === 'ready' ? '준비 완료' : st === 'think' ? '생각 중' : '';
  return <span className={`st${st === 'ready' ? ' ok' : ''}`} title={label || undefined} aria-label={label || undefined}>
    {st && <svg width="1.3em" height="1.3em" viewBox="0 0 24 24" aria-hidden="true">{ICONS[st]}</svg>}</span>;
}

/** 이번 보상: 오른쪽 위에 세로로 긴 작은 카드(위 숫자 · 아래 문양)를 한 줄로. 남은 폭에 맞춰 카드 크기를 정한다 */
export function Reward({ cards, width, height, right }: { cards: Card[]; width: number; height: number; right: number }) {
  // 띠 두께를 거의 다 쓴다(위아래 여백 3px)
  const n = cards.length, gap = 3, ch = height - 6;
  const lbl = width > n * (ch / 1.45 + gap) + 70; const room = width - (lbl ? 66 : 0);
  const cw = Math.max(10, Math.min(ch / 1.45, (room - (n - 1) * gap) / n));
  return <div className="sh-reward" style={{ maxWidth: width, height, gap, right }}>
    {lbl && <span className="lbl">이번 보상</span>}
    {cards.map(c => <i key={c} className="mc" style={{ color: SUITCOL[U(c)], width: cw, height: Math.min(ch, cw * 1.45), fontSize: Math.max(8, cw * 0.48) }}>
      <b>{RL(R(c))}</b><span>{SYM[U(c)]}</span></i>)}
  </div>;
}

/** 위쪽 석판 한 장 + 그 아래 내용 */
export function Slab({ b, children }: { b: MgBoard; children?: React.ReactNode }) {
  const sl = useSlab();
  return <>
    {/* 위쪽 석판 한 장: 얇은 띠 + 가운데 두꺼운 칸(높이가 바뀌는 곳만 부드럽게). 왼쪽 위 = 게임 이름·턴, 가운데 = 지금 할 일, 오른쪽 위 = 이번 보상 */}
    <header className="sh">
      <svg className="sh-stone" width={sl.W} height={sl.h2 + 4} viewBox={`0 0 ${sl.W} ${sl.h2 + 4}`} aria-hidden="true">
        <defs>
          <linearGradient id="shg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ab9c86" /><stop offset="1" stopColor="#8b7d69" /></linearGradient>
          <filter id="shn" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".9 .25" numOctaves="2" seed="4" /><feColorMatrix values="0 0 0 0 .2 0 0 0 0 .14 0 0 0 0 .08 0 0 0 .22 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
        </defs>
        <path d={sl.path} fill="url(#shg)" />
        <path d={sl.path} fill="#000" filter="url(#shn)" />
        <path d={sl.edge} fill="none" stroke="rgba(255,240,215,.28)" strokeWidth="2" transform="translate(0,-5)" />
        <path d={sl.edge} fill="none" stroke="#140e0a" strokeWidth="3" />
      </svg>
      <div className="sh-title" style={{ left: sl.tl, maxWidth: sl.side - sl.tl + 8, height: sl.h1 }}><strong style={{ fontSize: Math.max(12, Math.min(24 * sl.k, (sl.side - sl.tl) / 7)) }}>{b.title}</strong></div>
      <div className="sh-now" role="status" style={{ left: sl.cx, width: sl.cw, height: sl.h2 - 6 }}>
        <div className="pq-lines">{b.lines.map((l, k) => <span key={k} className={k ? '' : 'lead'}>{l}</span>)}</div>
        {b.timer != null && <div className={`sl-t${b.timer <= 5 ? ' hot' : ''}`}>{b.timer}</div>}
        {b.buttons.map(bt => <button key={bt.id} className="rune" onClick={() => cmd(bt.id)}>{bt.label}{bt.key && <kbd>{bt.key}</kbd>}</button>)}
      </div>
      {b.reward.length > 0 && <Reward cards={b.reward} width={sl.side - sl.rr + 8} height={sl.h1} right={sl.rr} />}
    </header>
    {children}
  </>;
}
