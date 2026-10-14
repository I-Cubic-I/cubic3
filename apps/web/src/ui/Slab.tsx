/* 미니게임 공통 화면 틀(사용자 2026-10-14: 미니게임마다 UI를 통일한다)
   위쪽 석판 한 장(왼쪽 위 게임 이름 · 가운데 지금 할 일·타이머·버튼 · 오른쪽 위 이번 보상) + 오른쪽 위 점수판 석판.
   미니게임은 MgBoard(새길 내용)만 만들어 넘긴다 */
import { useEffect, useState } from 'react';
import { type Card, R, RL, SYM, U } from '@cubic3/engine';
import { SEATCOL, SUITCOL, mySeats } from '../game';
import { cmd } from '../flow';
import { useStore } from '../store';
import { slabCw, slabH, uiScale } from './scale';

/** 점수판 상태: 공격자 · 공격자(준비 완료) · 생각 중 · 준비 완료 · 없음 */
export type SlabStatus = 'atk' | 'atkReady' | 'think' | 'ready' | 'out' | null;
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
  buttons: { id: string; label: string; key: string; /** 아직 누를 수 없음(예: 선택지를 고르기 전) */ off?: boolean }[];
  rows: { k: number; name: string; pts: number; st: SlabStatus; atk: boolean; me: boolean; top: boolean }[];
  /** 오른쪽 위: 이번 보상 */
  reward: Card[];
}

/** 석판 윤곽: 얇은 띠(화면 폭) + 가운데 버튼 칸(사용자 2026-10-14: 가운데는 확정 버튼 자리만).
    버튼이 없으면 칸 없이 띠만. 칸 폭은 버튼 글자 수에 맞추고, 높이가 바뀌는 두 곳만 부드러운 S자 */
export function useSlab(labels: string[]) {
  const key = labels.join('|');
  const get = () => {
    const W = window.innerWidth, k = uiScale(), low = window.innerHeight <= 520;
    const { h1, h2: hMax } = slabH(k);
    // 버튼 칸은 늘 남겨 둔다(버튼이 없으면 빈 돌판). 폭은 화면 가로에 비례(사용자 2026-10-14: 넓은 화면에서 옹졸하지 않게)
    const has = true;
    const cw = slabCw(W), pad = Math.round(8 * k);
    const fs = Math.max(14, Math.round(20 * k)), gap = Math.round(8 * k);
    const n = Math.max(1, labels.length); const bw = labels.map(() => Math.floor((cw - pad * 2 - gap * (n - 1)) / n));
    const h2 = has ? hMax : h1, tw = Math.round(22 * k);
    const x0 = Math.round((W - cw) / 2) - tw, x1 = x0 + cw + 2 * tw;
    const edge = has ? `M0,${h1} L${x0},${h1} C${x0 + tw / 2},${h1} ${x0 + tw / 2},${h2} ${x0 + tw},${h2} L${x1 - tw},${h2} C${x1 - tw / 2},${h2} ${x1 - tw / 2},${h1} ${x1},${h1} L${W},${h1}` : `M0,${h1} L${W},${h1}`;
    const path = has ? `M0,0 L${W},0 L${W},${h1} L${x1},${h1} C${x1 - tw / 2},${h1} ${x1 - tw / 2},${h2} ${x1 - tw},${h2} L${x0 + tw},${h2} C${x0 + tw / 2},${h2} ${x0 + tw / 2},${h1} ${x0},${h1} L0,${h1} Z` : `M0,0 L${W},0 L${W},${h1} L0,${h1} Z`;
    // 띠 왼쪽 끝은 게임 아이콘(메뉴 버튼) 자리
    const logo = Math.round(38 * k);
    const tl = 8 + logo + 8, rr = 4;
    // 왼쪽(제목)·오른쪽(보상)에 쓸 수 있는 폭: 가운데 칸을 피해서
    const midL = has ? x0 : W / 2, midR = has ? x1 : W / 2;
    // 버튼 글자 크기: 버튼 높이와 폭(글자 수)에 맞춘다(사용자 2026-10-14)
    const bh = h2 - 8 - 4;
    // 버튼 폭·높이에 함께 비례(폭에 맞추되 높이를 넘지 않게)
    const bfs = labels.map((l, q) => Math.round(Math.max(11, Math.min(bh * 0.62, bw[q] * 0.5 / Math.max(1, l.length * 0.9)))));
    return { W, h1, h2, low, k, fs, bfs, gap, bw, has, cx: x0 + tw, cw, tl, rr, leftW: midL - tl - 10, rightW: W - rr - midR - 10, edge, path };
  };
  const [s, set] = useState(get);
  useEffect(() => { set(get()); }, [key]);
  useEffect(() => { const f = () => set(get()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, [key]);
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

/* 점수판 상태 아이콘: 글자·특수문자 대신 직접 그린 그림(사용자 2026-10-14: 칼·체크는 A안, 생각 중은 모래시계) */
const INKC = '#140e0a', PAPER = '#fbf7ee', GOLD = '#e0a83e', GREEN = '#5c9e5a';
// 칼: 날 · 금빛 가드 · 갈색 손잡이 · 금빛 폼멜
const SWORD = <g stroke={INKC} strokeWidth="1.5" strokeLinejoin="round">
  <path d="M19.6 2.6 21.4 4.4 10.4 15.4 8.6 13.6Z" fill="#eef1f4" /><path d="M19.6 2.6 21.4 4.4 15 10.8Z" fill="#c9d1da" stroke="none" />
  <path d="M5.6 12.4 11.6 18.4 10.4 19.6 4.4 13.6Z" fill={GOLD} /><path d="M8 17 5.4 19.6" stroke="#6b4423" strokeWidth="2.6" strokeLinecap="round" />
  <circle cx="4.3" cy="20.7" r="1.7" fill={GOLD} /></g>;
// 초록 동그라미 체크(크기·위치를 바꿔 칼 위 작은 표시로도 쓴다)
const check = (cx: number, cy: number, r: number) => <g>
  <circle cx={cx} cy={cy} r={r} fill={GREEN} stroke={INKC} strokeWidth={1.6 * Math.min(1, r / 9.6 + 0.3)} />
  <path d={`M${cx - r * 0.5} ${cy + r * 0.04}l${r * 0.35} ${r * 0.35}L${cx + r * 0.52} ${cy - r * 0.33}`} fill="none" stroke={PAPER} strokeWidth={2.6 * r / 9.6 + 0.4} strokeLinecap="round" strokeLinejoin="round" /></g>;
const ICONS: Record<NonNullable<SlabStatus>, React.ReactNode> = {
  atk: SWORD,
  // 공격자도 준비를 마치면: 칼은 그대로, 오른쪽 아래에 작은 체크
  atkReady: <g>{SWORD}{check(17.6, 17.6, 5.6)}</g>,
  // 모래시계(모래가 내려가며 가끔 뒤집힌다)
  think: <g className="hg" stroke={INKC} strokeWidth="1.5" strokeLinejoin="round">
    <path d="M6 2.8h12M6 21.2h12" strokeWidth="2" strokeLinecap="round" />
    <path d="M7 3c0 4.4 3.4 6.2 3.4 9S7 16.6 7 21h10c0-4.4-3.4-6.2-3.4-9S17 7.4 17 3Z" fill={PAPER} />
    <path d="M9.4 19.6c.6-1.7 1.7-2.7 2.6-3 .9.3 2 1.3 2.6 3Z" fill="#d8b06a" stroke="none" /><path d="M9.6 6.2h4.8c-.6 1.3-1.5 2-2.4 2.6-.9-.6-1.8-1.3-2.4-2.6Z" fill="#d8b06a" stroke="none" /></g>,
  ready: check(12, 12, 9.6),
  // 나감(동굴 탐험 등): 문 밖으로 나가는 화살표
  out: <g stroke={INKC} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
    <path d="M9 3.5h10v17H9" fill="#8a5c34" /><path d="M14 12H3.5" strokeWidth="2.6" stroke="#2f7fb0" fill="none" /><path d="M7 8.2 3.2 12 7 15.8" strokeWidth="2.6" stroke="#2f7fb0" fill="none" /></g>,
};
/** 점수판 상태 아이콘: 공격자 · 생각 중 · 준비 완료. 글자 대신 아이콘으로 점수판 폭을 줄인다 */
export function StatusIcon({ st }: { st: SlabStatus }) {
  const label = st === 'atk' ? '공격자' : st === 'atkReady' ? '공격자 · 준비 완료' : st === 'ready' ? '준비 완료' : st === 'think' ? '생각 중' : st === 'out' ? '나감' : '';
  return <span className={`st${st === 'ready' || st === 'atkReady' ? ' ok' : ''}`} title={label || undefined} aria-label={label || undefined}>
    {st && <svg width="1.3em" height="1.3em" viewBox="0 0 24 24" aria-hidden="true">{ICONS[st]}</svg>}</span>;
}

/** 이번 보상: 오른쪽 위에 세로로 긴 작은 카드(위 숫자 · 아래 문양)를 한 줄로. 남은 폭에 맞춰 카드 크기를 정한다 */
export function Reward({ cards, width, height, right }: { cards: Card[]; width: number; height: number; right: number }) {
  const [open, setOpen] = useState(false);
  const n = cards.length, gap = 3, ch0 = height - 4, cw0 = ch0 / 1.45;
  // 1) 나란히: 띠 높이를 거의 다 쓰는 크기로 다 들어가면 그대로("이번 보상" 글자는 자리가 넉넉할 때만)
  if (n * cw0 + (n - 1) * gap <= width) {
    const lbl = width > n * (cw0 + gap) + 70;
    return <div className="sh-reward" style={{ maxWidth: width, height, gap, right }}>
      {lbl && <span className="lbl">이번 보상</span>}
      {cards.map(c => <MiniCard key={c} c={c} w={cw0} h={ch0} />)}
    </div>;
  }
  // 2) 겹쳐 펼치기(사용자 2026-10-14): 손패처럼 가로로만 겹치고 왼쪽 위 모서리(숫자·문양)만 보이게. 높이는 띠 안에서(띠 아래로 늘어지지 않게)
  for (const ch of [ch0]) {
    const cw = ch / 1.45, minShow = Math.max(13, cw * 0.36);
    const show = n > 1 ? (width - cw) / (n - 1) : cw;
    if (show >= minShow) {
      const step = Math.min(show, cw + gap);
      return <div className="sh-reward ov" style={{ width: step * (n - 1) + cw, height: ch, right, top: (height - ch) / 2 }}>
        {cards.map((c, k) => <MiniCard key={c} c={c} w={cw} h={ch} ov style={{ position: 'absolute', left: k * step, zIndex: k }} />)}
      </div>;
    }
  }
  // 3) 그래도 안 담기면 칩으로 접고, 누르면 아래로 펼친다
  return <div className="sh-reward chipmode" style={{ height, right }}>
    <button className="rw-chip" onClick={() => setOpen(o => !o)} aria-expanded={open}>보상 {n}장 <span aria-hidden="true">{open ? '▴' : '▾'}</span></button>
    {open && <div className="rw-pop" onClick={() => setOpen(false)}>{cards.map(c => <MiniCard key={c} c={c} w={38} h={55} />)}</div>}
  </div>;
}
/** 작은 보상 카드: 나란히일 땐 가운데에 숫자·문양, 겹칠 땐 왼쪽 위 모서리에 */
function MiniCard({ c, w, h, ov, style }: { c: Card; w: number; h: number; ov?: boolean; style?: React.CSSProperties }) {
  return <i className={`mc${ov ? ' ov' : ''}`} style={{ color: SUITCOL[U(c)], width: w, height: h, fontSize: Math.max(9, ov ? w * 0.42 : w * 0.48), ...style }}>
    <b>{RL(R(c))}</b><span>{SYM[U(c)]}</span></i>;
}

/** 위쪽 석판 한 장 + 그 아래 내용. 가운데 칸 = 버튼만, 지금 할 일 문구와 타이머는 석판 밖 화면 위쪽 가운데에 떠 있다(사용자 2026-10-14) */
export function Slab({ b, children }: { b: MgBoard; children?: React.ReactNode }) {
  const sl = useSlab(b.buttons.map(bt => bt.label));
  return <>
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
      <div className="sh-title" style={{ left: sl.tl, maxWidth: sl.leftW, height: sl.h1 }}><strong style={{ fontSize: Math.max(12, Math.min(24 * sl.k, sl.leftW / 7)) }}>{b.title}</strong></div>
      {/* 가운데 칸: 버튼만. 칸 모양(아래가 둥근 돌판)에 맞춘 버튼 */}
      <div className="sh-btns" style={{ left: sl.cx, width: sl.cw, height: sl.h2 - 8, gap: sl.gap }}>
        {b.buttons.length ? b.buttons.map((bt, q) => <button key={bt.id} className="rune slab-btn" disabled={bt.off} style={{ width: sl.bw[q], fontSize: sl.bfs[q] }} onClick={() => cmd(bt.id)}>{bt.label}{bt.key && <kbd>{bt.key}</kbd>}</button>)
          : <div className="slab-btn idle" aria-hidden="true" style={{ width: sl.cw - Math.round(16 * sl.k) }} />}
      </div>
      {b.reward.length > 0 && <Reward cards={b.reward} width={sl.rightW} height={sl.h1} right={sl.rr} />}
    </header>
    {/* 지금 할 일: 석판 밖, 화면 위쪽 가운데 근처에 글자만 */}
    {(b.lines.length > 0 || b.timer != null) && <div className="sh-say" role="status" style={{ top: sl.h2 + Math.round(8 * sl.k) }}>
      {b.lines.map((l, k) => <span key={k} className={k ? '' : 'lead'}>{l}</span>)}
      {b.timer != null && <span className={`say-t${b.timer <= 5 ? ' hot' : ''}`}>{b.timer}</span>}
    </div>}
    {children}
  </>;
}
