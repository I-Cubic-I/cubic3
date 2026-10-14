/* 화면 위 UI 전체 (테이블 장면 위에 겹친다) */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type GameState, MAX_SEATS, MG, type MgId, R, lobbyWaiting, U, chairOf, cname, isItem, now } from '@cubic3/engine';
import { SEATCOL, mySeats, seatName, whoActs } from '../game';
import { cmd, exitRoom, getWorld } from '../flow';
import { useStore, viewSeat } from '../store';
import { Hand } from './Hand';
import { MgPanel } from './MgPanel';
import { MgScreen, SCREEN_MG } from './MgScreen';
import { useArenaOn } from '../arena/on';
import { Cutin, FxView, HandPeek, ItemCutin, ResultsView, RulesScreen } from './Screens';
import { type TurnView, turnActs } from './Turn';
import { ICON, MCard, names } from './bits';
import { refreshTip } from './tip';
import { MI, SettingsPanel } from './Options';

/* ---------- 이름표: 아바타 머리 위를 따라다닌다 (대기실에서는 빈 의자 위에 "빈 자리"도) ---------- */
/** 핑 표시: 방장은 "방장", 소식이 없으면 "끊김?", 아니면 ms(색으로 좋음·보통·나쁨) */
function Ping({ uid }: { uid: string }) {
  const pings = useStore(s => s.pings); const room = useStore(s => s.room); const host = useStore(s => s.S?.host);
  if (!room || !Object.keys(pings).length) return null;
  const ms = pings[uid];
  // 방장은 테이블 상태의 방장 uid로 가린다(같은 기기 시험에서는 모두 0ms라 핑으로는 못 가린다)
  const isHost = host ? uid === host : ms === 0;
  if (isHost) return <span className="ping host" title="방장(판정하는 기기)">방장</span>;
  if (ms == null) return <span className="ping bad" title="방장과 연결이 끊긴 것 같아요">끊김?</span>;
  return <span className={`ping ${ms < 80 ? 'good' : ms < 200 ? 'mid' : 'bad'}`} title="방장과의 왕복 시간">{ms}ms</span>;
}

function Plates({ S }: { S: GameState }) {
  const me = useStore(s => s.me); const ui = useStore(s => s.ui); const ctl = useStore(s => s.ctl);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const place = (p: HTMLElement | null, a: { x: number; y: number; vis: boolean }) => {
      if (!p) return;
      p.style.left = Math.max(70, Math.min(window.innerWidth - 70, a.x)) + 'px'; p.style.top = Math.max(60, a.y) + 'px'; p.style.display = a.vis ? 'flex' : 'none';
    };
    const loop = () => {
      const W = getWorld(); const el = ref.current;
      if (W && el) {
        for (const a of W.anchors()) place(el.querySelector<HTMLElement>(`[data-plate="${a.i}"]`), a);
        for (const a of W.chairAnchors()) place(el.querySelector<HTMLElement>(`[data-chair="${a.c}"]`), a);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, []);
  const vs = viewSeat();
  if (S.phase === 'lobby') {
    const taken = S.seats.map((_, k) => chairOf(S, k));
    return (
      <div id="plates" ref={ref}>
        {S.seats.map((p, i) => (
          <div key={'s' + i} className={`plate${p.uid === me ? ' me' : ''}`} data-plate={i}>
            <span className="dot" style={{ background: SEATCOL[i % 5] }} /><strong>{seatName(S, i)}</strong>
            {p.uid === me && <span style={{ color: 'var(--brass)' }}>나</span>}
            <Ping uid={p.uid} />
          </div>
        ))}
        {Array.from({ length: MAX_SEATS }, (_, c) => c).filter(c => !taken.includes(c)).map(c => (
          <button key={'c' + c} className="plate empty" data-chair={c} onClick={() => cmd('chair', { c })}>
            {ctl != null ? '빈 자리 · 옮겨 앉기' : '빈 자리 · 앉기'}
          </button>
        ))}
      </div>
    );
  }
  const actor = whoActs(S, me); const tgt = ui.mode === 'target';
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
          <Ping uid={p.uid} />
        </div>
      ))}
    </div>
  );
}

/** 대기실: 창 없이 테이블에 앉은 모습 그대로. 위에는 방 정보와 나가기, 아래에는 시작 버튼 */
/** 미니게임만 하기(멀티 전용): 메인 턴 없이 고른 미니게임 1종만. 지금 인원으로 할 수 있는 것만 누를 수 있다 */
function SoloPick({ n, close }: { n: number; close: () => void }) {
  const ids = Object.keys(MG) as MgId[];
  return <div className="panel solopick" role="dialog" aria-label="미니게임만 하기">
    <div className="sphead"><strong>미니게임만 하기</strong><span>메인 턴 없이 미니게임 하나만 · 지금 {n}명</span><button className="btn sm" onClick={close}>닫기</button></div>
    <div className="splist">{ids.map(id => { const g = MG[id]; const ok = n >= Math.max(2, g.min) && n <= g.max;
      return <button key={id} className="spbtn" disabled={!ok} onClick={() => { close(); cmd('solo', { id }); }} title={ok ? undefined : `${Math.max(2, g.min)}~${g.max}명`}>
        <span className="ic" aria-hidden="true">{g.icon}</span><span className="nm">{g.name}</span><span className="ct">{Math.max(2, g.min)}~{g.max}인</span></button>; })}</div>
  </div>;
}

function Lobby({ S, gear }: { S: GameState; gear: React.ReactNode }) {
  const me = useStore(s => s.me); const room = useStore(s => s.room); const flash = useStore(s => s.flash); const ctl = useStore(s => s.ctl);
  const [sure, setSure] = useState(false); const [solo, setSolo] = useState(false);
  const ms = mySeats(S, me); const sitting = ms.length > 0; const n = S.seats.length;
  const host = room?.role === 'host';
  const rd = S.lobbyReady || {}; const iReady = !!rd[me]; const waiting = lobbyWaiting(S); const uids = [...new Set(S.seats.map(p => p.uid))];
  const exit = () => { if (host && n > ms.length && !sure) { setSure(true); return; } void exitRoom(); };
  return <>
    <div className="topl">
      <span className="logo" role="img" aria-label="Cubic³"><span className="sq" aria-hidden="true">■</span><span aria-hidden="true">³</span></span>
      <span className="chip">방 코드 <strong style={{ color: 'var(--brass)', letterSpacing: 1 }}>{room?.code}</strong>{host ? ' · 내가 방장' : ''}</span>
      <button className="btn sm" onClick={() => cmd('copylink')}>링크 복사</button>
    </div>
    <div className="topr">
      <button className={`btn sm${sure ? ' danger' : ''}`} onClick={exit} onBlur={() => setSure(false)}>{MI.door}{sure ? '방이 닫혀요 · 그래도 나가기' : '나가기'}</button>
      {gear}
    </div>
    {flash && <div className="notice" role="alert">{flash}</div>}
    <div className="lobbybar">
      <div className="lobbyinfo">
        {sitting ? <><span className="dot" style={{ background: SEATCOL[(ctl ?? ms[0]) % 5] }} /><strong>{seatName(S, ctl ?? ms[0])}</strong> · {n}명 앉음 · 2~5명이면 시작할 수 있어요</>
          : n >= MAX_SEATS ? <>자리가 다 차서 구경하고 있어요</> : <>빈 의자를 눌러 앉으세요</>}
      </div>
      <div className="btnrow">
        {sitting && n < MAX_SEATS && <button className="btn sm" onClick={() => cmd('sit')}>이 기기로 한 자리 더</button>}
        {sitting && ms.length > 1 && <button className="btn sm" onClick={() => cmd('leave', { i: ctl ?? ms[ms.length - 1] })}>이 자리 비우기</button>}
        {host ? <>
          <button className="btn primary" disabled={!(n >= 2 && n <= MAX_SEATS && !waiting.length)} onClick={() => cmd('start')}>게임 시작 ({n}명)</button>
          <button className="btn" disabled={!(n >= 2 && !waiting.length)} aria-expanded={solo} onClick={() => setSolo(v => !v)}>미니게임만 하기</button>
        </> : sitting && <button className={`btn${iReady ? '' : ' primary'}`} onClick={() => cmd('lready', { on: iReady ? 0 : 1 })}>{iReady ? '준비 취소' : '준비'}</button>}
      </div>
      {/* 준비 상태: 방장이 아닌 사람이 모두 준비하면 방장이 시작할 수 있다 */}
      {uids.length > 1 && <div className="readyrow">{uids.map(u => { const k = S.seats.findIndex(p => p.uid === u); const st = u === S.host ? 'host' : rd[u] ? 'on' : 'off';
        return <span key={u} className={`rchip ${st}`}><i style={{ background: SEATCOL[k % 5] }} />{seatName(S, k)}<b>{st === 'host' ? '방장' : st === 'on' ? '준비' : '대기'}</b></span>; })}</div>}
      {host ? (waiting.length > 0 && <p className="lobbytip">모두 준비하면 시작할 수 있어요</p>) : sitting && <p className="lobbytip">{iReady ? '방장이 시작하면 시작돼요' : '준비를 누르면 방장이 시작할 수 있어요'}</p>}
      {sitting && n < MAX_SEATS && <p className="lobbytip">빈 의자를 누르면 옮겨 앉아요</p>}
    </div>
    {solo && sitting && <SoloPick n={n} close={() => setSolo(false)} />}
  </>;
}

export function Hud() {
  const S = useStore(s => s.S); const me = useStore(s => s.me); const i = useStore(s => s.ctl); const sel = useStore(s => s.sel); const ui = useStore(s => s.ui);
  const flash = useStore(s => s.flash); const toast = useStore(s => s.toast); const fatal = useStore(s => s.fatal);
  const rulesShown = useStore(s => s.rulesShown); const clubPlaying = useStore(s => s.clubPlaying); const screenAlert = useStore(s => s.screenAlert);
  const fxShow = useStore(s => s.fxShow); const cutin = useStore(s => s.cutin); const results = useStore(s => s.results); const fps = useStore(s => s.fps);
  const [opts, setOpts] = useState(false);
  // 게임 중 메뉴(기록·설정): Esc 또는 왼쪽 위 게임 아이콘으로 연다(사용자 2026-10-14). 열린 창이 있으면 Esc는 그것부터 닫는다
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.pointerLockElement) return;
      const st = useStore.getState(); if (!st.S || st.S.phase === 'lobby') return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      if (opts) setOpts(false); else if (st.ui.log) cmd('log'); else setMenu(m => !m);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [opts]);
  const arenaOn = useArenaOn();
  // 아이템을 쓴 뒤 대상 고르기: 그 카드를 골라 둔 상태로(기존 대상 고르기 화면이 그대로 쓴다)
  const pend = S?.phase === 'mg' && i != null ? S.mgItems?.[i] ?? null : null;
  const pendCard = useRef<string | null>(null);
  useEffect(() => {
    const st = useStore.getState();
    // 대상을 고르거나 시간이 지나 끝났으면 골라 둔 카드도 푼다
    if (!pend) { if (pendCard.current && st.sel.includes(pendCard.current)) st.set({ sel: [] }); pendCard.current = null; return; }
    pendCard.current = pend.card;
    if (!(st.sel.length === 1 && st.sel[0] === pend.card)) st.set({ sel: [pend.card], ui: { ...st.ui, bsub: S?.mg?.id === 'balloon' } });
  }, [pend?.card, pend?.until]);
  const amHost = useStore(s => s.room?.role === 'host');
  useLayoutEffect(() => refreshTip());
  // 설정은 로비·게임 중 모두 오른쪽 위 톱니로 연다
  const gear = <button className="iconbtn" aria-label="설정" aria-expanded={opts} onClick={() => setOpts(o => !o)}>{MI.gear}</button>;
  const optsheet = opts && <div className="optsheet"><SettingsPanel close onBack={() => setOpts(false)} /></div>;
  // ♠ 방어 남은 시간 표시용
  const [, setTick] = useState(0);
  // (몇 장이었지는 시간이 지나야 답할 수 있어, 아이템 카드 상태도 다시 그린다)
  const ticking = S?.phase === 'defense' || (S?.phase === 'mg' && (S.mg?.id === 'count' || !!S.mgItems && Object.keys(S.mgItems).length > 0));
  useEffect(() => { if (!ticking) return; const t = setInterval(() => setTick(x => x + 1), 250); return () => clearInterval(t); }, [ticking]);

  if (fatal) return <div id="hud"><div id="mainui"><div className="panel lobby"><h1 className="logo3d" role="img" aria-label="Cubic³"><span className="sq" aria-hidden="true">■</span><sup aria-hidden="true">3</sup></h1><p>{fatal}</p></div></div></div>;
  if (!S) return <div id="hud" />;
  const ms = mySeats(S, me);
  if (S.phase === 'lobby') return <div id="hud"><Plates S={S} /><div id="mainui"><Lobby S={S} gear={gear} />{optsheet}</div><Toast m={toast} /></div>;

  const actor = whoActs(S, me); const ph = S.phase;
  const nm = (k: number) => seatName(S, k);
  let pill = '', pillWait = false; let sub: TurnView['sub']; let acts: React.ReactNode = null; let note = ''; let center: React.ReactNode = null; let extra: React.ReactNode = null;
  let handTuck = false;
  if (S.steal) {
    // ♠J: 가져가는 쪽이 상대 손패(뒷면)에서 1장을 고른다
    const stl = S.steal; const n = S.seats[stl.to].hand.length;
    if (ms.includes(stl.from)) {
      pill = `${nm(stl.to)}의 손패에서 1장을 고르세요`;
      center = <div className="panel center-panel steal"><div className="line">뒷면으로 펼친 {nm(stl.to)}의 손패 {n}장 · 1장을 누르세요</div>
        <div className="stealfan">{Array.from({ length: n }, (_, k) => <button key={k} className="stealcard" aria-label={`${k + 1}번째 카드`} onClick={() => cmd('steal', { k })} style={{ transform: `rotate(${(k - (n - 1) / 2) * 6}deg)` }} />)}</div></div>;
    } else { pill = `${nm(stl.from)}이 ${nm(stl.to)}의 손패에서 1장을 고르는 중`; pillWait = true; }
  } else if (ph === 'main') {
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
    // 굴리기는 테이블의 주사위를 눌러서(금빛 테두리로 빛난다)
    if (i === S.first) { pill = '테이블의 미니게임 주사위를 눌러 굴리세요'; }
    else { pill = `${nm(S.first)}이 미니게임 주사위를 굴려요`; pillWait = true; }
    handTuck = true;
  } else if (ph === 'clubs') {
    pill = '규칙을 읽고 준비 완료를 누르세요'; handTuck = true;
    // ♣Q·♣K를 쓴 뒤 미니게임 고르기
    const cc = S.clubChoose;
    if (cc) { pillWait = !ms.includes(cc.seat); pill = !pillWait ? (R(cc.card) === 13 ? `${cname(cc.card)}: 테이블의 디스크 중 하나를 고르세요` : `${cname(cc.card)}: 양옆 디스크 중 하나를 고르세요`) : `${nm(cc.seat)}이 ${cname(cc.card)}로 미니게임을 고르는 중`; }
  }
  else if (ph === 'mg') {
    // 리더기 화면 미니게임은 테이블 대신 화면 가운데 전체를 쓴다
    handTuck = !ui.showHand; center = arenaOn ? null : SCREEN_MG.includes(S.mg!.id) ? <MgScreen S={S} i={i} /> : <MgPanel S={S} i={i} sel={sel} ui={ui} />;
    // 미니게임 중에도 이번 보상을 볼 수 있게
    if ((S.rewardDisp || []).length) extra = <div className="rewardstrip"><span className="lbl">이번 보상</span><div className="row">{S.rewardDisp!.map(c => <MCard key={c} c={c} />)}</div></div>;
    pill = actor != null && ms.includes(actor) ? '내 차례' : actor != null ? `${nm(actor)} 차례` : MG[S.mg!.id].name; pillWait = !(actor != null && ms.includes(actor));
    if (pend) { pill = `아이템 대상을 고르세요 · ${Math.max(0, Math.ceil((pend.until - now()) / 1000))}초`; pillWait = false; }
    acts = <button className="btn sm" onClick={() => cmd('togglehand')}>{ui.showHand ? '손패 접기' : arenaOn ? `손패 ${i != null ? S.seats[i].hand.length : 0}장 보기` : `손패 ${i != null ? S.seats[i].hand.length : 0}장 · 미니게임 중엔 접혀 있어요`}</button>;
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
  } else if (ph === 'ended' && S.solo) {
    // (순위 결과 화면이 떠 있는 동안은 숨긴다)
    if (!results)
    // 미니게임만 하기: 순위만 보여 주고 한 번 더 / 다른 미니게임
    center = <div className="panel center-panel" style={{ textAlign: 'center' }}>
      <div className="disp" style={{ fontSize: 18, color: 'var(--brass)' }}>{MG[S.solo].icon} {MG[S.solo].name} 결과</div>
      <div style={{ margin: '10px 0 16px', display: 'grid', gap: 4 }}>{(S.lastRank || []).map((g, k) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 8, alignItems: 'center', textAlign: 'left' }}>
        <span className="disp" style={{ fontSize: k ? 20 : 30, color: k ? 'var(--muted)' : 'var(--brass)' }}>{k + 1}위</span><span className="disp" style={{ fontSize: k ? 20 : 30 }}>{names(S, g)}</span></div>)}</div>
      {/* 손패 숫자 카드가 이 판의 시드: 같은 손패로 다시 하면 같은 판 */}
      {S.soloHands && <div className="seedrow"><span className="lbl">이 판의 시드(손패)</span>{S.soloHands.map((h, k) => <span key={k} className="seedp"><i style={{ background: SEATCOL[k % 5] }} />{h.map(cname).join(' ')}</span>)}</div>}
      <div className="btnrow">{amHost && <><button className="btn primary" onClick={() => cmd('restart')}>같은 판 다시</button><button className="btn" onClick={() => cmd('fresh')}>새 판</button></>}<button className="btn" onClick={() => cmd('tolobby')}>다른 미니게임 · 로비로</button></div>
      {!amHost && <p className="lobbytip" style={{ marginTop: 8 }}>다시 시작은 방장이 해요</p>}
    </div>;
  } else if (ph === 'ended') {
    center = <div className="panel center-panel" style={{ textAlign: 'center' }}>
      <div className="disp" style={{ fontSize: 20, color: 'var(--brass)' }}>우승</div>
      <div className="disp" style={{ fontSize: 52, margin: '6px 0 16px' }}>{names(S, S.winners || [])}</div>
      <div className="btnrow">{amHost && <button className="btn primary" onClick={() => cmd('restart')}>같은 자리로 새 게임</button>}<button className="btn" onClick={() => cmd('tolobby')}>로비로</button></div>
      {!amHost && <p className="lobbytip" style={{ marginTop: 8 }}>새 게임은 방장이 시작해요</p>}
    </div>;
  }
  const showRules = ph === 'clubs' && rulesShown && !clubPlaying;
  const screenOn = showRules || screenAlert;
  return (
    <div id="hud" className={arenaOn ? 'arena-on' : undefined}>
      {!arenaOn && <Plates S={S} />}
      <div id="mainui">
        {ph === 'main' && i != null && S.turn!.seat === i && S.turn!.picked && <div className="dz" data-dz="table"><span>테이블에 놓기</span></div>}
        <div className="topl"><button className="logo logobtn" aria-label="메뉴 (Esc)" title="메뉴 (Esc)" aria-expanded={menu} onClick={() => setMenu(m => !m)}><span className="sq" aria-hidden="true">■</span><span aria-hidden="true">³</span></button>{S.solo ? <span className="chip meta">미니게임만 · {MG[S.solo].name}</span> : <><span className="chip meta">{S.round}라운드</span><span className="chip meta">{S.ot ? '연장전 · 4색' : '목표 3색'}</span></>}<Ping uid={me} />
          {ms.length > 1 && ms.map(k => <button key={k} className={`chip ${k === i ? 'on' : ''}`} onClick={() => cmd('ctl', { i: k })}>자리 {k + 1}</button>)}</div>
        <div className="topr">
          <button className="iconbtn" aria-label="위에서 보기" onClick={() => cmd('viewtop')}>{ICON.top}</button>
          <button className="iconbtn" aria-label="기본 시점" onClick={() => cmd('viewseat')}>{ICON.eye}</button>
        </div>
        {optsheet}
        {menu && <div className="escmenu" onClick={() => setMenu(false)}>
          <div className={`panel escbox${arenaOn ? ' stone' : ''}`} role="dialog" aria-label="메뉴" onClick={e => e.stopPropagation()}>
            <div className="eh"><strong>메뉴</strong><kbd>Esc</kbd></div>
            <button className="btn primary" onClick={() => setMenu(false)}>계속하기</button>
            <button className="btn" onClick={() => { setMenu(false); if (!ui.log) cmd('log'); }}>기록 보기</button>
            <button className="btn" onClick={() => { setMenu(false); setOpts(true); }}>설정</button>
          </div>
        </div>}
        {(ph !== 'clubs' || S.clubChoose) && !arenaOn && <div className="prompt">{pill && <div className={`pill${pillWait ? ' wait' : ''}`}>{pill}</div>}
          {sub && <div className="subchips">{sub.map(([t, on]) => <span key={t} className={`chip${on ? ' on' : ''}`}>{t}</span>)}</div>}</div>}
        {flash && <div className="notice" role="alert">{flash}</div>}
        {extra}
        {i != null && !S.solo && !['mg', 'clubs'].includes(ph) && <div className="tray dz" data-dz="tray"><span className="lbl">내 토큰 · {nm(i)} · 카드를 끌어 놓으면 토큰</span>
          <div className="row">{[0, 1, 2].concat(S.ot ? [3] : []).map(k => <span key={k} className={`cube ${S.seats[i].tokens[k] || 'empty'}`} />)}</div></div>}
        {i != null && !handTuck && <Hand seat={i} kind="res" />}
        {(acts || note) && <div className="acts">{note && <div className="note">{note}</div>}<div className="group">{acts}</div></div>}
        {center}
        {ui.log && <div className="panel drawer">{S.log.slice(0, 60).map((l, k) => <div key={k}>{l}</div>)}
          <div style={{ marginTop: 10 }}><button className="btn sm danger" onClick={() => cmd(ui.confirmReset ? 'reset2' : 'reset1')}>{ui.confirmReset ? '정말 테이블을 비울까요? 한 번 더' : '테이블 비우기'}</button></div></div>}
      </div>
      <div className={`screen${screenOn ? ' show' : ''}${screenAlert ? ' alerting' : ''}`} aria-live="polite">{(ph === 'clubs' && S.board && S.die) ? <RulesScreen S={S} /> : null}</div>
      {showRules && !screenAlert && i != null && <HandPeek S={S} seat={i} />}
      {/* 아이템 손패(왼쪽 아래): 규칙 설명 화면 위에도 보이도록 화면 다음에 둔다 */}
      {i != null && ph !== 'ended' && !(ph === 'clubs' && screenAlert) && <Hand seat={i} kind="item" />}
      {cutin && <Cutin S={S} f={cutin} />}
      {results && <ResultsView S={S} r={results} />}
      {fxShow?.f.t === 'item' && <ItemCutin key={fxShow.f.id} S={S} f={fxShow.f} out={fxShow.out} />}
      <div id="fxl">{fxShow && fxShow.f.t !== 'item' && !(arenaOn && ['dodge', 'banner'].includes(fxShow.f.t)) && <FxView key={fxShow.f.id} S={S} f={fxShow.f} out={fxShow.out} />}</div>
      <Toast m={toast} />
      <div id="fpshint" className={fps.locked ? 'fps on' : fps.ok ? 'fps' : 'fps off'}>
        {fps.locked ? <><div className="xh" aria-hidden="true" /><div className="fpstip">Esc · 커서 꺼내기</div></> : fps.ok ? <div className="fpstip">화면을 클릭하면 1인칭 시점 (마우스로 둘러보기)</div> : null}
      </div>
    </div>
  );
}

function Toast({ m }: { m: string }) { return <div className={`toast${m ? ' show' : ''}`} role="status">{m}</div>; }
