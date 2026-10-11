/* 미니게임 HUD (테이블 아래 조작판) */
import { useEffect, useState } from 'react';
import {
  BLIMIT, CFLIP, type Card, type GameState, type Hand, MG, R, RLIMIT, RPSN, SUITS, SYM, U, cname, countOpenAt, isItem, now,
} from '@cubic3/engine';
import { SUITCOL, seatName } from '../game';
import { cmd } from '../flow';
import type { UiMode } from '../store';
import { MCard } from './bits';

const HAND_EMOJI: Record<Hand, string> = { S: '✌️', R: '✊', P: '✋' };

/** 시간이 흐르는 화면(몇 장이었지)은 주기적으로 다시 그린다 */
function useTick(on: boolean, ms = 250) {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => set(x => x + 1), ms); return () => clearInterval(t); }, [on, ms]);
}

export function MgPanel({ S, i, sel, ui }: { S: GameState; i: number | null; sel: Card[]; ui: UiMode }) {
  const m = S.mg!; const def = MG[m.id];
  const nm = (k: number) => seatName(S, k);
  const selItem = sel.length === 1 && isItem(sel[0]) ? sel[0] : null;
  const itemHint = selItem ? ` (${cname(selItem)})` : '';
  useTick(m.id === 'count');
  let body: React.ReactNode = null;

  if (m.id === 'hold') {
    const who = m.ord[m.ci];
    body = <>
      <div className="line">{m.pan}/3판 · <strong>{nm(who)}</strong> 차례 · 이번 판 <strong>{m.s}점</strong> · 다음 굴림 <strong>{m.k + 1} 이하</strong>면 잃음</div>
      <div className="chips">{m.ord.map(k => <span key={k} className={`chip ${k === who ? 'on' : ''}`}>{nm(k)} {m.tot[k]}점</span>)}</div>
      {who === i && <div className="bigbtns">
        <button className="btn primary" onClick={() => cmd('hroll')}>굴리기</button>
        <button className="btn" disabled={!selItem} onClick={() => cmd('hroll2')}>아이템 내고 굴리기{itemHint}</button>
        <button className="btn" disabled={!m.k} onClick={() => cmd('hstop')}>멈추기</button>
      </div>}
    </>;
  }
  if (m.id === 'bomb') {
    const who = m.alive[m.ci];
    body = <>
      <div className="line"><strong>{nm(who)}</strong> 차례 · 가장 높은 카드를 뒤집은 사람이 탈락</div>
      {who === i && <div className="line">테이블의 카드 1장을 눌러 뒤집으세요</div>}
      <div className="chips">
        {m.alive.map(k => <span key={k} className={`chip ${k === who ? 'on' : ''}`}>{nm(k)}{m.alive.length === 2 ? ` 폭탄 ${(m.hits && m.hits[k]) || 0}/2` : ''}</span>)}
        {m.out.flat().map(k => <span key={'o' + k} className="chip out">{nm(k)}</span>)}
      </div>
      {who === i && !m.arm[i] && <div className="bigbtns"><button className="btn" disabled={!selItem} onClick={() => cmd('barm')}>아이템 내기 (-3){itemHint}</button></div>}
    </>;
  }
  if (m.id === 'auction') {
    let mine_: React.ReactNode = null;
    if (i != null && m.hands[i]) {
      const head = m.step === 'pre'
        ? (m.ready[i] ? <div className="line">다른 사람을 기다리는 중</div> : <div className="bigbtns"><button className="btn" disabled={!selItem} onClick={() => cmd('aitem')}>아이템: 다음 상품도 걸기{itemHint}</button><button className="btn primary" onClick={() => cmd('aready')}>입찰하기</button></div>)
        : (i in m.bids ? <div className="line">입찰 완료 · 기다리는 중</div> : <div className="line"><strong>입찰할 카드를 누르세요</strong></div>);
      const canBid = m.step === 'bid' && !(i in m.bids);
      mine_ = <>{head}<div className="mini-cards">{m.hands[i].map(c => <MCard key={c} c={c} cls={canBid ? 'click' : ''} onClick={canBid ? () => cmd('abid', { c }) : undefined} />)}</div></>;
    }
    body = <>
      <div className="line">이번 상품 <strong>{m.pot.map(p => cname(p.c)).join(' + ')}</strong> · 테이블 가운데</div>
      <div className="chips">{Object.keys(m.won).map(k => <span key={k} className="chip">{nm(+k)} {m.won[+k].reduce((a, c) => a + R(c), 0)}점</span>)}</div>
      {mine_}
    </>;
  }
  if (m.id === 'balloon') {
    const who = m.alive[m.ci];
    const myB = i != null && m.hands[i] && m.alive.includes(i) ? <>
      <div className="mini-cards">{m.hands[i].map(c => {
        const nx = m.total + R(c);
        return <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <MCard c={c} cls={who === i ? 'click' : ''} onClick={who === i ? () => cmd('blp', { c }) : undefined} />
          <small style={{ color: nx > BLIMIT ? '#ff8080' : nx > 40 ? '#ffb35c' : 'var(--muted)' }}>→ {ui.bsub ? Math.max(0, m.total - R(c)) : nx}</small>
        </div>;
      })}</div>
      {who === i && <div className="bigbtns"><button className={`btn ${ui.bsub ? 'primary' : ''}`} disabled={!S.seats[i].hand.some(isItem)} onClick={() => cmd('bsub')}>{ui.bsub ? '빼기 모드: 아이템을 고르고 카드를 내세요' : '아이템으로 빼기'}</button></div>}
    </> : null;
    body = <>
      <div className="line">합 <strong>{m.total}</strong> / {BLIMIT} · <strong>{nm(who)}</strong> 차례{m.last ? ` · 방금 ${nm(m.last.i)} ${cname(m.last.c)}${m.last.sub ? ' 빼기' : ''}` : ''}</div>
      <div className="chips">
        {m.alive.map(k => <span key={k} className={`chip ${k === who ? 'on' : ''}`}>{nm(k)} · {m.hands[k].length}장</span>)}
        {m.out.flat().map(k => <span key={'o' + k} className="chip out">{nm(k)}</span>)}
      </div>
      {myB}
    </>;
  }
  if (m.id === 'rps' || m.id === 'vault') {
    const L = m.lead; const amLead = i === L; const isR = m.id === 'rps'; let me_: React.ReactNode = null;
    if (m.step === 'save') me_ = i != null && m.saveq.includes(i)
      ? <><div className="line"><strong>{isR ? '졌어요!' : '잡혔어요!'}</strong> 아이템을 내면 이번엔 버텨요</div><div className="bigbtns"><button className="btn primary" disabled={!selItem} onClick={() => cmd('osave')}>아이템 내고 버티기{itemHint}</button><button className="btn" onClick={() => cmd('onosave')}>탈락 받아들이기</button></div></>
      : <div className="line">아이템 사용을 기다리는 중</div>;
    else if (isR) {
      const can = i != null && (amLead || m.alive.includes(i)) && !m.picks[i];
      me_ = <>
        {m.armL && <div className="line"><strong>이번 판: 비겨도 탈락</strong></div>}
        {can ? <>
          <div className="bigbtns">{(['S', 'R', 'P'] as Hand[]).map(h => <button key={h} className="handbtnbig" onClick={() => cmd('rps', { hand: h })}><span>{HAND_EMOJI[h]}</span>{RPSN[h]}</button>)}</div>
          {amLead && !m.armL && <div className="bigbtns"><button className="btn" disabled={!selItem} onClick={() => cmd('rarm')}>아이템: 비긴 사람도 탈락{itemHint}</button></div>}
        </> : <div className="line">{i != null && m.picks[i] ? `${RPSN[m.picks[i] as Hand]}을 냈어요 · 기다리는 중` : '구경 중'}</div>}
      </>;
    } else {
      if (m.step === 'hide') me_ = i != null && m.alive.includes(i) && !m.picks[i]
        ? <><div className="line">숨을 금고를 고르세요 · 테이블의 금고를 눌러도 돼요</div><div className="doors">{[1, 2, 3].map(z => <button key={z} className="door" onClick={() => cmd('vhide', { z })}>{z}</button>)}</div></>
        : amLead ? <><div className="line">도둑들이 숨는 중… 눈을 감으세요</div>{!m.armL && <div className="bigbtns"><button className="btn" disabled={!selItem} onClick={() => cmd('varm')}>아이템: 2곳 수색{itemHint}</button></div>}</>
          : <div className="line">{i != null && m.picks[i] ? `${m.picks[i]}번 금고에 숨었어요. 쉿.` : '구경 중'}</div>;
      if (m.step === 'guard') {
        const need = m.armL ? 2 : 1; const zs = ui.vz || [];
        me_ = amLead ? <>
          <div className="line">뒤질 금고를 {need}곳 고르세요</div>
          <div className="doors">{[1, 2, 3].map(z => <button key={z} className={`door ${zs.includes(z) ? 'on' : ''}`} onClick={() => cmd('vz', { z })}>{z}</button>)}</div>
          <div className="bigbtns"><button className="btn primary" disabled={zs.length !== need} onClick={() => cmd('vgo')}>수색!</button>{!m.armL && <button className="btn" disabled={!selItem} onClick={() => cmd('varm')}>아이템: 2곳{itemHint}</button>}</div>
        </> : <div className="line">경비원이 고르는 중…</div>;
      }
    }
    body = <>
      <div className="line">{m.round}/{m.max}판 · {isR ? '선' : '경비원'} <strong>{nm(L)}</strong></div>
      <div className="chips">
        <span className="chip lead">{nm(L)} · {isR ? '선' : '경비원'}</span>
        {m.alive.map(k => <span key={k} className="chip">{nm(k)}{m.step !== 'save' && m.picks[k] && isR ? ' ✓' : ''}</span>)}
        {m.out.flat().map(k => <span key={'o' + k} className="chip out">{nm(k)}</span>)}
      </div>
      {me_}
    </>;
  }
  if (m.id === 'count') {
    const t = now(); const k = Math.floor((t - m.t0) / CFLIP); const open = t >= countOpenAt(m);
    let stage: React.ReactNode;
    if (t < m.t0) stage = <div className="line">{Math.ceil((m.t0 - t) / 1000)}초 뒤에 넘겨요. 문양별로 세어 두세요!</div>;
    else if (!open) stage = <div className="line">테이블의 카드를 보세요 · {k + 1} / {m.seq!.length}</div>;
    else { const su = U(m.dec || 'S1'); stage = <div className="line">정답 문양 <strong style={{ color: SUITCOL[su], fontSize: 22 }}>{SYM[su]}</strong> · 몇 장이었을까요?</div>; }
    let me_: React.ReactNode = null;
    if (open && i != null && (i in m.hits)) me_ = (i in m.ans) ? <div className="line">{m.ans[i]}장이라고 답했어요</div> : <>
      <div className="nums">{[0, 1, 2, 3, 4, 5, 6].map(a => <button key={a} className="num" onClick={() => cmd('cans', { n: a })}>{a}{a === 6 ? '+' : ''}</button>)}</div>
      {!m.arm[i] ? <div className="bigbtns"><button className="btn" disabled={!selItem} onClick={() => cmd('carm')}>아이템: ±1도 정답{itemHint}</button></div> : <div className="line"><strong>±1 적용</strong></div>}
    </>;
    body = <><div className="line">{m.pan}/3판</div><div className="chips">{Object.keys(m.hits).map(k => <span key={k} className="chip">{nm(+k)} {m.hits[+k]}점</span>)}</div>{stage}{me_}</>;
  }
  if (m.id === 'race') {
    let me_: React.ReactNode;
    if (m.step === 'bet') { const who = m.order[m.pi]; me_ = who === i ? <><div className="line">우승할 문양을 고르세요 (겹쳐도 돼요)</div><div className="bigbtns">{SUITS.map(su => <button key={su} className="btn" style={{ borderColor: SUITCOL[su], fontSize: 22 }} onClick={() => cmd('rbet', { s: su })}>{SYM[su]}</button>)}</div></> : <div className="line">{nm(who)}이 고르는 중</div>; }
    else me_ = <>
      {i === S.first ? <div className="bigbtns"><button className="btn primary" onClick={() => cmd('rflip')}>카드 뒤집기</button></div> : <div className="line">선({nm(S.first)})이 카드를 뒤집어요</div>}
      {i != null && (i in m.bet) && <div className="bigbtns">{SUITS.filter(su => su !== m.bet[i]).map(su => <button key={su} className="btn sm" disabled={!selItem} onClick={() => cmd('rswap', { s: su })}>아이템: {SYM[su]}로 갈아타기</button>)}</div>}
    </>;
    body = <>
      <div className="line">뒤집은 카드 {m.pile.length}/{RLIMIT}{m.last ? ` · 방금 ${cname(m.last.c)} ${SYM[m.last.s]} ${m.last.fw ? '앞으로!' : '뒤로…'}` : ''}</div>
      {me_}
    </>;
  }
  return (
    <div className="panel mg">
      <div className="head"><span className="disp">{def.name}</span><button className="btn sm" onClick={() => cmd('rulesagain')}>규칙 다시 보기</button></div>
      <div className="stage">{body}</div>
      {ui.rulesAgain && <div className="line" style={{ marginTop: 10, textAlign: 'left', whiteSpace: 'pre-line', fontSize: 13, color: 'var(--muted)' }}>{def.text}</div>}
    </div>
  );
}
