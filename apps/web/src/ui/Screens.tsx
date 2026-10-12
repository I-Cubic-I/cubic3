/* 규칙 화면(모니터가 페이지 전체가 된다), ♣ 컷신, 연출 오버레이 */
import { type Card, type Fx, type GameState, type Hand, MG, type MgId, R, RL, SYM, cname, isItem, U } from '@cubic3/engine';
import { SEATCOL, SUITCOL, mine, seatName } from '../game';
import { cmd } from '../flow';
import { useStore } from '../store';
import { MCard, handSort, names } from './bits';
import { useEffect, useRef, useState } from 'react';
import { mgLook } from '../scene/textures';
import { digitalRules } from './mgtext';
import { CurlPractice } from './CurlPad';
import { PIECE_COL } from './MgPanel3';

/** 미니게임 카드 앞면 도구 아이콘 → 이름 */
const TOOL: Record<string, string> = { '🂠': '카드', '🎲': '주사위', '✊': '손', '🪙': '동전', '1·2·3': '판 뒷면', '🗣': '말하기', '✋': '손가락', '🙌': '몸짓', '♟': '말·판' };

export function RulesScreen({ S }: { S: GameState }) {
  const me = useStore(s => s.me); const i = useStore(s => s.ctl); const ui = useStore(s => s.ui);
  const id = S.board![S.die! - 1], def = MG[id]; const rd = S.ready || {}; const [fld, body] = mgLook(id);
  const nm = (k: number) => seatName(S, k);
  const rows = digitalRules(id).map(([h, t], k) => <div key={k} className={`rrow${h === '아이템' ? ' it' : ''}`}><b>{h}</b><span>{t}</span></div>);
  const mineLeft = S.seats.map((_, k) => k).filter(k => mine(S, me, k) && !rd[k]);
  return (
    <>
      <div className="crt">
        <div className="scr-top"><span className="mono">MINIGAME ▸ 규칙 설명</span>
          <div className="scr-topr">
            <div className="rewardrow"><span className="lbl">이번 보상</span>{(S.rewardDisp || []).map(c => <MCard key={c} c={c} />)}</div>
            <span className="scr-chip">{S.round}라운드 · 모두 준비되면 시작</span>
          </div>
        </div>
        <div className="scr-body">
          <div className="scr-art" style={{ background: `linear-gradient(170deg,${fld},${body})` }}>
            <div className="ttl">{def.name}</div>
            <div className="tags"><span>{def.icon.split(' ').map(x => TOOL[x] || x).join(' · ')}</span><span>{def.min}~{def.max}인</span></div>
          </div>
          <div className="scr-rules">{rows}</div>
        </div>
        <div className="scr-foot">
          {/* 말 컬링: 규칙 설명 시간에 연습해 볼 수 있다(내 화면에만) */}
          {id === 'curling' && i != null ? <CurlPractice seat={i} /> : <div aria-hidden="true" />}
          <div className="scr-box readybox"><span className="lbl">준비 상태</span>
            <div className="readys">{S.seats.map((_, k) => <span key={k} className={`ready${rd[k] ? ' ok' : ''}`} aria-label={`${nm(k)}${rd[k] ? ' 준비 완료' : ''}`}><i style={{ background: SEATCOL[k % 5] }} aria-hidden="true">{rd[k] ? '✓' : ''}</i>{nm(k)}</span>)}</div>
            {mineLeft.length ? <button className="readybtn" onClick={() => cmd('ready')}>준비 완료{mineLeft.length > 1 ? ` (내 자리 ${mineLeft.length}개)` : ''}</button>
              : <div style={{ textAlign: 'center', color: 'var(--cyan-dim)' }}>다른 사람을 기다리는 중…</div>}
          </div>
        </div>
      </div>
      <div className="alert" aria-hidden="true"><div className="frame">
        <svg viewBox="0 0 200 200" fill="none" stroke="#ff4d4d" strokeWidth="10" strokeLinejoin="round"><path d="M40 30h100l20 20v120H40z" /><path d="M70 30v42h56V30" /><rect x="62" y="104" width="76" height="66" rx="6" /><path d="M106 40v22" /><path d="M28 28l144 144M172 28L28 172" strokeWidth="16" strokeLinecap="round" /></svg>
      </div></div>
    </>
  );
}

export function Cutin({ S, f }: { S: GameState; f: Fx }) {
  const c = f.club as Card; const i = (f.seats || [0])[0];
  const eff = ({ 11: '미니게임 다시 굴리기', 12: '주사위 눈 ±1', 13: '미니게임 직접 고르기' } as Record<number, string>)[R(c)];
  return (
    <div className="cutin show">
      <div className="shade" /><div className="band" />
      <div className="who"><span className="av" style={{ background: SEATCOL[i % 5] }} /><span className="nm">{seatName(S, i)}</span></div>
      <div className="card" style={{ color: SUITCOL.C }}><span className="rk">{RL(R(c))}</span><span className="s1">♣</span><span className="s2">♣</span></div>
      <div className="eff">{cname(c)} · {eff}</div>
    </div>
  );
}

/** 메인 턴 아이템 컷신: 누가 · 어떤 아이템을 · (누구에게) · 무슨 효과로 썼는지. ♣ 컷신과 같은 모양 */
export function ItemCutin({ S, f, out }: { S: GameState; f: Fx; out: boolean }) {
  const c = f.card as Card; const [i, tg] = f.seats || [0]; const su = U(c);
  const verb = f.kind === 'attack' ? '공격' : f.kind === 'defend' ? '방어' : '사용';
  return (
    <div className={`cutin show item${out ? ' out' : ''}`}>
      <div className="shade" /><div className="band" />
      <div className="who"><span className="av" style={{ background: SEATCOL[i % 5] }} /><span className="nm">{seatName(S, i)}</span>
        {tg != null && <><span className="arrow" aria-hidden="true">→</span><span className="av sm" style={{ background: SEATCOL[tg % 5] }} /><span className="nm sm">{seatName(S, tg)}</span></>}</div>
      <div className="card" style={{ color: SUITCOL[su] }}><span className="rk">{RL(R(c))}</span><span className="s1">{SYM[su]}</span><span className="s2">{SYM[su]}</span></div>
      <div className="eff">{cname(c)} {verb} · {String(f.eff || '')}</div>
      {Array.isArray(f.cards) && (f.cards as Card[]).length > 0 && <div className="cutcards">{(f.cards as Card[]).map(x => <MCard key={x} c={x} />)}</div>}
    </div>
  );
}

const EMO: Record<Hand, string> ={ S: '✌️', R: '✊', P: '✋' };
export function FxView({ S, f, out }: { S: GameState; f: Fx; out: boolean }) {
  const nm = (k: number) => seatName(S, k);
  const who = f.seats && f.seats.length ? <div className="s">{names(S, f.seats)}</div> : null;
  let cls = 'fx ' + ((f.tone as string) || ''); let inner: React.ReactNode;
  if (f.t === 'dice') {
    const both = f.both as [number, number] | null;
    if (f.bust) cls += ' bad';
    inner = <><div className="k">{f.bust ? '와르르' : '굴림'}</div><div className="b">{both ? `${both[0]} · ${both[1]} → ${f.v}` : String(f.v)}</div>{f.bust ? <div className="s">기준 {String(f.th)} 이하!</div> : null}{who}</>;
  } else if (f.t === 'title') inner = <><div className="k">미니게임 시작</div><div className="b">{MG[f.mg as keyof typeof MG].name}</div></>;
  else if (f.t === 'pop') { cls += ' bad'; inner = <><div className="b">{f.bomb ? '펑!' : '빵!'}</div>{who}<div className="s">{f.small ? (f.bomb ? '폭탄 1개' : '동전을 내놓고 버텼다') : '탈락'}</div></>; }
  else if (f.t === 'rps') {
    const picks = f.picks as Record<number, Hand>; const lead = f.lead as number; const losers = f.losers as number[];
    inner = <><div className="k">하나 둘 셋!</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>{[lead, ...Object.keys(picks).map(Number).filter(k => k !== lead)].map(k =>
        <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: losers.includes(k) ? .5 : 1 }}><span style={{ fontSize: 44 }}>{EMO[picks[k]]}</span><small>{nm(k)}{k === lead ? ' (선)' : ''}</small></div>)}</div>
      <div className="s">{losers.length ? names(S, losers) + ' 걸림!' : '아무도 안 걸렸다'}</div></>;
  } else if (f.t === 'vault') {
    const picks = f.picks as Record<number, number>; const zones = f.zones as number[]; const losers = f.losers as number[];
    inner = <><div className="k">수색!</div>
      <div className="doors">{[1, 2, 3].map(z => <div key={z} className={`door ${zones.includes(z) ? 'on' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>{z}
        <small style={{ fontFamily: "'IBM Plex Sans KR'", fontSize: 11 }}>{Object.keys(picks).filter(k => picks[+k] === z).map(k => <span key={k}>{nm(+k)}<br /></span>)}</small></div>)}</div>
      <div className="s">{losers.length ? names(S, losers) + ' 잡혔다!' : '헛탕!'}</div></>;
  } else if (f.t === 'count') {
    const ans = f.ans as Record<number, number>; const hit = f.hit as number[]; const su = f.suit as string;
    inner = <><div className="k">정답</div><div className="b" style={{ color: SUITCOL[su] }}>{SYM[su as 'S']} {String(f.cnt)}장</div>
      <div className="s">{Object.keys(ans).map(k => `${nm(+k)} ${ans[+k]}${hit.includes(+k) ? ' ⭕' : ' ❌'}`).join(' · ')}</div></>;
  } else if (f.t === 'bids') {
    const bids = f.bids as Record<number, Card>;
    inner = <><div className="k">공개!</div>
      <div className="mini-cards">{Object.keys(bids).map(k => <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}><MCard c={bids[+k]} /><small>{nm(+k)}</small></div>)}</div>
      <div className="s">{f.win != null ? nm(f.win as number) + ' 낙찰!' : '모두 지워졌다'}</div></>;
  } else if (f.t === 'token') { cls += ' good'; inner = <><span className={`cube ${f.col}`} style={{ width: 56, height: 56, borderRadius: 12 }} /><div className="b">토큰 {String(f.n)}개째!</div>{who}</>; }
  else if (f.t === 'attack') { cls += ' bad'; inner = <><div className="b">{cname(f.card as Card)} 공격!</div><div className="s">{nm(f.seats![0])} → {nm(f.seats![1])}</div></>; }
  else if (f.t === 'duel') {
    const res = f.res as Record<number, number | 'fs'>; const gain = f.gain as Record<number, number>;
    const ks = Object.keys(gain).map(Number).sort((a, b) => gain[b] - gain[a]);
    inner = <><div className="k">{String(f.pan)}판 결과</div>
      <div className="s" style={{ display: 'grid', gap: 4 }}>{ks.map(k => <span key={k}>{nm(k)} · {res[k] === 'fs' ? '부정출발' : `${((res[k] as number) / 1000).toFixed(3)}초`} · {gain[k] > 0 ? '+' : ''}{gain[k]}점</span>)}</div>
      {!ks.length && <div className="s">아무도 쏘지 않았다</div>}</>;
  } else if (f.t === 'updown') {
    const grip = f.grip as Record<number, number>;
    inner = <><div className="k">{nm(f.caller as number)} {String(f.call)} · {nm(f.shouter as number)} "{f.up ? '위' : '아래'}!"</div>
      <div className="b">합 {String(f.sum)}</div>
      <div className="s">{Object.keys(grip).map(k => `${nm(+k)} 동전 ${grip[+k]}개`).join(' · ')}</div>
      <div className="s">{nm(f.who as number)} +{String(f.gain)}점</div></>;
  } else if (f.t === 'curl') {
    const got = f.got as Record<number, number>;
    inner = <><div className="k">{String(f.end)}판 점수</div><div className="s">{Object.keys(got).map(k => `${nm(+k)} ${got[+k]}점`).join(' · ')}</div></>;
  } else if (f.t === 'fold') {
    const folded = f.folded as number[]; const safe = f.safe as number[];
    inner = <><div className="k">"{String(f.text)} 접어!"</div><div className="b">{folded.length ? `${folded.length}명 접음` : '아무도 안 접음'}</div>
      {folded.length > 0 && <div className="s">{names(S, folded)}</div>}{safe.length > 0 && <div className="s">아이템으로 버팀: {names(S, safe)}</div>}</>;
  } else if (f.t === 'chainAim') {
    const aim = f.aim as Record<number, number[]>;
    inner = <><div className="k">가리켰다!</div><div className="s" style={{ display: 'grid', gap: 3 }}>{Object.keys(aim).map(k => <span key={k}>{nm(+k)} 👉 {aim[+k].map(nm).join(', ')}</span>)}</div></>;
  } else if (f.t === 'mid') {
    const picks = f.picks as Record<number, Card>; const win = f.win as number[]; const dc = f.deckCard as Card | null;
    const ks = Object.keys(picks).map(Number).sort((a, b) => R(picks[a]) - R(picks[b]));
    inner = <><div className="k">공개! · {({ mid: '가운데', hi: '가장 큰', lo: '가장 작은' } as Record<string, string>)[f.crit as string]} 숫자 {String(f.target)}</div>
      <div className="mini-cards">{ks.map(k => <div key={k} className="col" style={{ opacity: win.includes(k) ? 1 : .55 }}><MCard c={picks[k]} /><small>{nm(k)}</small></div>)}{dc && <div className="col"><MCard c={dc} /><small>덱</small></div>}</div>
      <div className="s">{f.void ? '덱 카드가 걸려 무산!' : win.length ? names(S, win) + ' 1점' : '아무도 없음'}</div></>;
  } else if (f.t === 'change') {
    const gain = f.gain as Record<number, number>; const moved = f.moved as number[];
    inner = <><div className="k">옮겨진 말</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>{moved.map(p => <i key={p} className="piece big" style={{ background: PIECE_COL[p] }} />)}</div>
      <div className="s">{Object.keys(gain).map(k => `${nm(+k)} +${gain[+k]}`).join(' · ')}</div></>;
  } else if (f.t === 'cave') {
    const faces = f.faces as number[];
    if (f.collapse) cls += ' bad';
    inner = <><div className="k">굴림</div><div className="b">{faces.map(v => ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][v]).join(' ')}</div>
      <div className="s">{f.collapse ? '무너졌다!' : `${String(f.turn)}턴 버팀 · 빼 둔 1 ${String(f.ones)}개`}{f.kept ? ` · 1 보호 ${String(f.kept)}` : ''}</div></>;
  } else if (f.t === 'balance') {
    const opts = f.opts as string[]; const picks = f.picks as Record<number, number>; const win = f.win as number | null;
    inner = <><div className="k">공개!</div>
      <div className="s" style={{ display: 'grid', gap: 4 }}>{opts.map((o, k) => <span key={k} style={{ fontWeight: k === win ? 700 : 400, color: k === win ? 'var(--brass)' : undefined }}>{o} · {Object.keys(picks).filter(j => picks[+j] === k).map(j => nm(+j)).join(', ') || '없음'}</span>)}</div>
      <div className="s">{win == null ? '동점! 아무도 점수 없음' : `${opts[win]} +${String(f.gain)}점`}</div></>;
  } else if (f.t === 'line') {
    const stop = f.stop as Record<number, Card>;
    inner = <><div className="b">멈춰!</div><div className="s">{nm(f.seat as number)} {cname(f.c as Card)} · 더 작은 카드: {Object.keys(stop).map(k => `${nm(+k)} ${cname(stop[+k])}`).join(', ')}</div></>;
    cls += ' bad';
  } else if (f.t === 'rank') inner = <><div className="k">미니게임 결과</div>{(f.groups as number[][]).map((g, k) => <div key={k} className="rk"><b>{k + 1}위</b>{names(S, g)}</div>)}</>;
  else if (f.t === 'win') { cls += ' win'; inner = <><div className="k">우승</div><div className="b">{names(S, f.seats!)}</div></>; }
  else inner = <><div className="b">{String(f.text || '')}</div>{who}</>;
  return <div className={cls + (out ? ' out' : '')}>{inner}</div>;
}

/** 규칙 설명 중 내 숫자 손패: 화면 아래에 살짝 나와 있다가, 커서를 가까이 가져가면(또는 누르면) 위로 올라와 펼쳐진다. 보기만 한다 */
export function HandPeek({ S, seat }: { S: GameState; seat: number }) {
  // 숫자(자원) 카드만. 아이템은 왼쪽 아래 아이템 손패에
  const h = handSort(S.seats[seat].hand).filter(c => !isItem(c));
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 손패가 있는 자리에만 반응: 내려가 있을 땐 화면에 나와 있는 손패 줄(맨 아래)에 닿아야 올라오고,
    // 올라온 뒤에는 손패 위에 있는 동안만 머문다
    const move = (e: PointerEvent) => {
      const el = ref.current; if (!el || e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect(); const inX = e.clientX >= r.left && e.clientX <= r.right;
      const near = up ? inX && e.clientY >= r.top - 8 : inX && e.clientY >= window.innerHeight - 40;
      if (near !== up) setUp(near);
    };
    window.addEventListener('pointermove', move); return () => window.removeEventListener('pointermove', move);
  }, [up]);
  if (!h.length) return null;
  return (
    <div ref={ref} className={`peek${up ? ' up' : ''}`} onClick={() => setUp(u => !u)}>
      <div className="peeklbl">내 손패 {h.length}장</div>
      <div className="peekrow">
        {h.map(c => <div key={c} className={`hcard pcard ${U(c)}${isItem(c) ? ' item' : ''}`} data-h={c} aria-label={cname(c)}>
          <span className="rk">{RL(R(c))}</span><span className="su">{SYM[U(c)]}</span>{isItem(c) && <span className="tg">아이템</span>}
        </div>)}
      </div>
    </div>
  );
}

/** 미니게임 결과: 미니게임이 끝나면 순위를 한 줄씩 보여 준다. 누르거나 잠시 뒤 닫히고 보상 고르기로 */
/* 주사위 눈: 3×3 칸 중 켜는 칸(0~8, 왼쪽 위부터) */
const PIP_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
/** 동점끼리 보상 순서를 가리는 작은 주사위: 잠깐 굴러가다가 나온 눈에서 멈춘다(같은 눈이라 다시 굴렸으면 차례로) */
function TieDie({ vals, delay }: { vals: number[]; delay: number }) {
  const [face, setFace] = useState<number | null>(null); const [done, setDone] = useState(false);
  useEffect(() => {
    let t = 0; const t0 = performance.now() + delay; let raf = 0;
    const tick = () => {
      const el = performance.now() - t0;
      if (el < 0) { raf = requestAnimationFrame(tick); return; }
      if (el < 1100) { if (++t % 4 === 0) setFace(1 + Math.floor(Math.random() * 6)); raf = requestAnimationFrame(tick); return; }
      setFace(vals[vals.length - 1]); setDone(true);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [vals, delay]);
  return <span className={`tdie${done ? ' done' : ''}`} title={vals.join(' → ')} aria-label={`주사위 ${vals[vals.length - 1]}`}>
    {done && vals.length > 1 ? <small>{vals.slice(0, -1).join('·')}→</small> : null}
    <span className="dface">{PIP_CELLS.map(c => <i key={c} className={(PIPS[face ?? 1] || []).includes(c) ? 'on' : ''} />)}</span>
  </span>;
}

export function ResultsView({ S, r }: { S: GameState; r: { mg: MgId | null; groups: number[][]; rolls: Record<number, number[]>; order: number[] } }) {
  const me = useStore(s => s.me);
  const close = () => useStore.getState().set({ results: null });
  const tied = Object.keys(r.rolls).length > 0;
  useEffect(() => { const t = setTimeout(close, tied ? 9000 : 6500); return () => clearTimeout(t); }, [r]);
  let n = 0;
  return (
    <div className="results" role="dialog" aria-label="미니게임 결과" onClick={close}>
      <div className="rcard" onClick={e => e.stopPropagation()}>
        <div className="rk-k">미니게임 결과</div>
        <div className="rk-t disp">{r.mg ? MG[r.mg].name : '미니게임'}</div>
        <div className="rk-rows">
          {/* 한 사람에 한 줄. 같은 순위끼리는 같은 순위 표시에 주사위가 굴러 보상 고르는 순서대로 놓인다 */}
          {(r.order.length ? r.order : r.groups.flat()).map(i => {
            const k = r.groups.findIndex(g => g.includes(i)); const shared = r.groups[k].length > 1;
            return <div key={i} className={`rk-row${k === 0 ? ' first' : ''}`} style={{ animationDelay: `${.25 + (n++) * .28}s` }}>
              <b className="disp">{k + 1}위</b>
              <span className="who"><span className={`p${S.seats[i]?.uid === me ? ' me' : ''}`}><i style={{ background: SEATCOL[i % 5] }} />{seatName(S, i)}</span>{shared && <span className="tie">공동</span>}</span>
              {r.rolls[i] && <TieDie vals={r.rolls[i]} delay={400 + n * 280} />}
            </div>;
          })}
        </div>
        <p className="rk-sub">{tied ? '같은 순위끼리는 주사위 눈이 높은 사람부터 · ' : ''}1위부터 차례로 보상 카드를 1장씩 골라요</p>
        <button className="btn primary" onClick={close}>보상 고르러 가기</button>
      </div>
    </div>
  );
}
