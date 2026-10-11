/* 화면 위 UI 전체 (테이블 장면 위에 겹친다) */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type GameState, MG, R, U, cname, isItem, now } from '@cubic3/engine';
import { SEATCOL, mySeats, seatName, whoActs } from '../game';
import { cmd, getWorld } from '../flow';
import { useStore, viewSeat } from '../store';
import { Hand } from './Hand';
import { MgPanel } from './MgPanel';
import { Cutin, FxView, RulesScreen } from './Screens';
import { type TurnView, turnActs } from './Turn';
import { ICON, MCard, names } from './bits';
import { refreshTip } from './tip';

/* ---------- 이름표: 아바타 머리 위를 따라다닌다 ---------- */
function Plates({ S }: { S: GameState }) {
  const me = useStore(s => s.me); const ui = useStore(s => s.ui);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const W = getWorld(); const el = ref.current;
      if (W && el) for (const a of W.anchors()) {
        const p = el.querySelector<HTMLElement>(`[data-plate="${a.i}"]`); if (!p) continue;
        p.style.left = Math.max(70, Math.min(window.innerWidth - 70, a.x)) + 'px'; p.style.top = Math.max(60, a.y) + 'px'; p.style.display = a.vis ? 'flex' : 'none';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, []);
  if (S.phase === 'lobby') return <div id="plates" ref={ref} />;
  const actor = whoActs(S, me); const vs = viewSeat(); const tgt = ui.mode === 'target';
  const outs = (S.mg as { out?: number[][] } | null)?.out?.flat() || [];
  return (
    <div id="plates" ref={ref}>
      {S.seats.map((p, i) => i === vs ? null : (
        <div key={i} className={`plate${actor === i ? ' turn' : ''}${outs.includes(i) ? ' out' : ''}${tgt ? ' target' : ''}`} data-plate={i} {...(tgt ? { 'data-a': 'tgt' } : {})}
          onClick={tgt ? () => { if (R(ui.card!) === 11) cmd('atk', { t: i }); } : undefined}>
          <span className="dot" style={{ background: SEATCOL[i % 5] }} /><strong>{seatName(S, i)}</strong>
          {i === S.first && <span style={{ color: 'var(--brass)' }}>선</span>}
          <span style={{ color: 'var(--muted)' }}>{p.hand.length}장</span>
          <span className="toks">{(p.tokens || []).map((t, k) => <span key={k} className={`tok ${t}`} />)}</span>
        </div>
      ))}
    </div>
  );
}

function Lobby({ S }: { S: GameState }) {
  const me = useStore(s => s.me); const room = useStore(s => s.room); const flash = useStore(s => s.flash);
  const sitting = S.seats.some(p => p.uid === me);
  return (
    <div className="panel lobby">
      <h1>Cubic³</h1>
      <p>방 코드 <strong style={{ color: 'var(--brass)', fontSize: 18 }}>{room?.code}</strong>{room?.role === 'host' ? ' · 내가 방장' : ''} · 개인전 2~5인. 친구에게 링크를 보내면 같은 테이블에 앉을 수 있어요.</p>
      <div className="btnrow" style={{ marginBottom: 6 }}><button className="btn sm" onClick={() => cmd('copylink')}>링크 복사</button></div>
      {flash && <div className="notice" style={{ position: 'static', transform: 'none', margin: '8px 0' }}>{flash}</div>}
      <div className="seatlist">
        {S.seats.length ? S.seats.map((p, k) => (
          <div key={k} className="seatrow">
            <span className="who"><span className="cube" style={{ width: 18, height: 18, background: SEATCOL[k % 5] }} />{seatName(S, k)}</span>
            {p.uid === me && <button className="btn sm" onClick={() => cmd('leave', { i: k })}>일어나기</button>}
          </div>
        )) : <div className="seatrow" style={{ justifyContent: 'center', color: 'var(--muted)' }}>아직 아무도 앉지 않았어요</div>}
      </div>
      <div className="btnrow">
        {!sitting && <button className="btn primary" onClick={() => cmd('sit')}>자리에 앉기</button>}
        {sitting && S.seats.length < 5 && <button className="btn" onClick={() => cmd('sit')}>내 자리 하나 더</button>}
        <button className="btn primary" disabled={!(S.seats.length >= 2 && S.seats.length <= 5 && sitting)} onClick={() => cmd('start')}>게임 시작 ({S.seats.length}명)</button>
      </div>
      <p style={{ marginTop: 14, fontSize: 12 }}>끌어서 둘러보고, 테이블의 물건은 눌러서 고를 수 있어요.</p>
    </div>
  );
}

export function Hud() {
  const S = useStore(s => s.S); const me = useStore(s => s.me); const i = useStore(s => s.ctl); const sel = useStore(s => s.sel); const ui = useStore(s => s.ui);
  const flash = useStore(s => s.flash); const toast = useStore(s => s.toast); const fatal = useStore(s => s.fatal);
  const rulesShown = useStore(s => s.rulesShown); const clubPlaying = useStore(s => s.clubPlaying); const screenAlert = useStore(s => s.screenAlert);
  const fxShow = useStore(s => s.fxShow); const cutin = useStore(s => s.cutin); const fps = useStore(s => s.fps);
  useLayoutEffect(() => refreshTip());
  // ♠ 방어 남은 시간 표시용
  const [, setTick] = useState(0);
  useEffect(() => { if (S?.phase !== 'defense') return; const t = setInterval(() => setTick(x => x + 1), 250); return () => clearInterval(t); }, [S?.phase]);

  if (fatal) return <div id="hud"><div id="mainui"><div className="panel lobby"><h1>Cubic³</h1><p>{fatal}</p></div></div></div>;
  if (!S) return <div id="hud" />;
  const ms = mySeats(S, me);
  if (S.phase === 'lobby') return <div id="hud"><Plates S={S} /><div id="mainui"><Lobby S={S} /></div><Toast m={toast} /></div>;

  const actor = whoActs(S, me); const ph = S.phase;
  const nm = (k: number) => seatName(S, k);
  let pill = '', pillWait = false; let sub: TurnView['sub']; let acts: React.ReactNode = null; let note = ''; let center: React.ReactNode = null; let extra: React.ReactNode = null;
  let handTuck = false; let itemTray: React.ReactNode = null;
  if (ph === 'main') {
    if (i != null && S.turn!.seat === i) { const r = turnActs(S, i, sel, ui); pill = r.pill; sub = r.sub; acts = r.acts; note = r.note || ''; center = r.center; }
    else { pill = `${nm(S.turn!.seat)}의 차례`; pillWait = true; }
  } else if (ph === 'defense') {
    const P = S.pending!; const left = Math.max(0, Math.ceil((P.deadline - now()) / 1000));
    if (i === P.target) {
      const hs = S.seats[i].hand.filter(c => U(c) === 'H' && (R(c) === 11 || R(c) === 13));
      pill = `${nm(P.attacker)}의 ${cname(P.card)} 공격! · ${left}초`;
      acts = <div className="group">{hs.map(c => <button key={c} className="btn primary" onClick={() => cmd('defend', { c })}>{R(c) === 11 ? '♥J로 막기' : '♥K로 되돌리기'}</button>)}<button className="btn" onClick={() => cmd('nodef')}>막지 않기</button></div>;
    } else { pill = `${nm(P.attacker)} → ${nm(P.target)} · ${cname(P.card)} 공격 · ${left}초`; pillWait = true; }
  } else if (ph === 'roll') {
    if (i === S.first) { pill = '미니게임 주사위를 굴리세요'; acts = <button className="btn primary" onClick={() => cmd('roll')}>주사위 굴리기</button>; note = '테이블의 주사위를 눌러도 돼요'; }
    else { pill = `${nm(S.first)}이 미니게임 주사위를 굴려요`; pillWait = true; }
    handTuck = true;
  } else if (ph === 'clubs') { pill = '규칙을 읽고 준비 완료를 누르세요'; handTuck = true; }
  else if (ph === 'mg') {
    handTuck = !ui.showHand; center = <MgPanel S={S} i={i} sel={sel} ui={ui} />;
    pill = actor != null && ms.includes(actor) ? '내 차례' : actor != null ? `${nm(actor)} 차례` : MG[S.mg!.id].name; pillWait = !(actor != null && ms.includes(actor));
    if (i != null) {
      const its = S.seats[i].hand.filter(isItem);
      itemTray = <div className="itemtray"><span className="lbl">아이템 {its.length}장 · 눌러서 고르기</span>
        <div className="row">{its.length ? its.map(c => <MCard key={c} c={c} hand cls={'click' + (sel.includes(c) ? ' sel' : '')} onClick={() => useStore.getState().toggleSel(c)} />) : <span style={{ fontSize: 13, color: 'var(--dim)' }}>없음</span>}</div></div>;
    }
    acts = <button className="btn sm" onClick={() => cmd('togglehand')}>{ui.showHand ? '손패 접기' : `손패 ${i != null ? S.seats[i].hand.length : 0}장 · 미니게임 중엔 접혀 있어요`}</button>;
  } else if (ph === 'reward') {
    const Rw = S.reward!; const who = Rw.order[Rw.pi];
    pill = i === who ? '보상 1장을 고르세요 · 테이블의 카드를 누르세요' : `${nm(who)}이 보상을 고르는 중`; pillWait = i !== who;
    const narrow = window.innerWidth <= 720;
    extra = <>
      <div className="panel" style={{ position: 'absolute', left: 20, top: 74, width: 260, pointerEvents: 'auto' }}>
        <div style={{ fontSize: 13, letterSpacing: 1, color: 'var(--brass)', marginBottom: 8 }}>미니게임 결과</div>
        {(S.lastRank || []).map((g, k) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 8, alignItems: 'center', margin: '4px 0' }}>
          <span className="disp" style={{ fontSize: k ? 18 : 24, color: k ? 'var(--muted)' : 'var(--brass)' }}>{k + 1}위</span><span>{names(S, g)}</span></div>)}
      </div>
      <div style={{ position: 'absolute', left: '50%', top: narrow ? 120 : 96, transform: 'translateX(-50%)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', padding: '8px 12px', borderRadius: 999, background: 'var(--glass-strong)', border: '1px solid var(--line)', maxWidth: '94vw', pointerEvents: 'auto' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>고르는 순서</span>
        {Rw.order.map((k, j) => <span key={j} className="chip" style={{ fontSize: 12, ...(j === Rw.pi ? { background: 'var(--brass)', color: 'var(--brass-ink)', borderColor: 'var(--brass)' } : j < Rw.pi ? { opacity: .4 } : {}) }}>{nm(k)}</span>)}
      </div>
    </>;
  } else if (ph === 'ended') {
    center = <div className="panel center-panel" style={{ textAlign: 'center' }}>
      <div className="disp" style={{ fontSize: 20, color: 'var(--brass)' }}>우승</div>
      <div className="disp" style={{ fontSize: 52, margin: '6px 0 16px' }}>{names(S, S.winners || [])}</div>
      <div className="btnrow"><button className="btn primary" onClick={() => cmd('restart')}>같은 자리로 새 게임</button><button className="btn" onClick={() => cmd('tolobby')}>로비로</button></div>
    </div>;
  }
  const showRules = ph === 'clubs' && rulesShown && !clubPlaying;
  const screenOn = showRules || screenAlert;
  return (
    <div id="hud">
      <Plates S={S} />
      <div id="mainui">
        {ph === 'main' && i != null && S.turn!.seat === i && S.turn!.picked && <div className="dz" data-dz="table"><span>테이블에 놓기</span></div>}
        <div className="topl"><span className="logo">Cubic³</span><span className="chip">{S.round}라운드</span><span className="chip">{S.ot ? '연장전 · 4색' : '목표 3색'}</span>
          {ms.length > 1 && ms.map(k => <button key={k} className={`chip ${k === i ? 'on' : ''}`} onClick={() => cmd('ctl', { i: k })}>자리 {k + 1}</button>)}</div>
        <div className="topr">
          <button className="iconbtn" aria-label="기록 보기" onClick={() => cmd('log')}>{ICON.list}</button>
          <button className="iconbtn" aria-label="위에서 보기" onClick={() => cmd('viewtop')}>{ICON.top}</button>
          <button className="iconbtn" aria-label="기본 시점" onClick={() => cmd('viewseat')}>{ICON.eye}</button>
        </div>
        {ph !== 'clubs' && <div className="prompt">{pill && <div className={`pill${pillWait ? ' wait' : ''}`}>{pill}</div>}
          {sub && <div className="subchips">{sub.map(([t, on]) => <span key={t} className={`chip${on ? ' on' : ''}`}>{t}</span>)}</div>}</div>}
        {flash && <div className="notice" role="alert">{flash}</div>}
        {extra}
        {i != null && !['mg', 'clubs'].includes(ph) && <div className="tray dz" data-dz="tray"><span className="lbl">내 토큰 · {nm(i)} · 카드를 끌어 놓으면 토큰</span>
          <div className="row">{[0, 1, 2].concat(S.ot ? [3] : []).map(k => <span key={k} className={`cube ${S.seats[i].tokens[k] || 'empty'}`} />)}</div></div>}
        {itemTray}
        {i != null && !handTuck && <Hand seat={i} />}
        {(acts || note) && <div className="acts">{note && <div className="note">{note}</div>}<div className="group">{acts}</div></div>}
        {center}
        {ui.log && <div className="panel drawer">{S.log.slice(0, 60).map((l, k) => <div key={k}>{l}</div>)}
          <div style={{ marginTop: 10 }}><button className="btn sm danger" onClick={() => cmd(ui.confirmReset ? 'reset2' : 'reset1')}>{ui.confirmReset ? '정말 테이블을 비울까요? 한 번 더' : '테이블 비우기'}</button></div></div>}
      </div>
      <div className={`screen${screenOn ? ' show' : ''}${screenAlert ? ' alerting' : ''}`} aria-live="polite">{(ph === 'clubs' && S.board && S.die) ? <RulesScreen S={S} /> : null}</div>
      {cutin && <Cutin S={S} f={cutin} />}
      <div id="fxl">{fxShow && <FxView key={fxShow.f.id} S={S} f={fxShow.f} out={fxShow.out} />}</div>
      <Toast m={toast} />
      <div id="fpshint" className={fps.locked ? 'fps on' : fps.ok ? 'fps' : 'fps off'}>
        {fps.locked ? <><div className="xh" aria-hidden="true" /><div className="fpstip">Esc · 커서 꺼내기</div></> : fps.ok ? <div className="fpstip">화면을 클릭하면 1인칭 시점 (마우스로 둘러보기)</div> : null}
      </div>
    </div>
  );
}

function Toast({ m }: { m: string }) { return <div className={`toast${m ? ' show' : ''}`} role="status">{m}</div>; }
