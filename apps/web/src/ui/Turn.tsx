/* 메인 턴 조작 (내 차례) */
import type { ReactNode } from 'react';
import { type GameState, R, SNAME, SUITS, SYM, U, canMakeToken, cname, costFor, isItem } from '@cubic3/engine';
import { SUITCOL, seatName } from '../game';
import { cmd } from '../flow';
import type { UiMode } from '../store';
import { MCard, Tok } from './bits';

export interface TurnView { pill: string; sub?: [string, boolean][]; acts?: ReactNode; note?: string; center?: ReactNode }

export function turnActs(S: GameState, i: number, sel: string[], ui: UiMode): TurnView {
  const t = S.turn!, p = S.seats[i];
  const nm = (k: number) => seatName(S, k);
  if (t.peek) return {
    pill: '♦J: 덱 위 카드 중 1장을 고르세요',
    center: <div className="panel center-panel"><div className="line" style={{ textAlign: 'center', marginBottom: 12 }}>나머지는 버림 줄로 갑니다</div>
      <div className="mini-cards">{t.peek.map(c => <MCard key={c} c={c} cls="click" onClick={() => cmd('dj', { c })} />)}</div></div>,
  };
  if (t.mustDiscard) return {
    pill: `${cname(t.justTook!)}을 주웠어요 · 버릴 카드를 테이블로 끌어 놓으세요`,
    acts: sel.length === 1 ? <button className="btn sm" onClick={() => cmd('pdisc')}>고른 카드 버리기</button> : null,
  };
  if (t.trim) {
    const over = p.hand.length - 6;
    return { pill: `손패가 6장을 넘어요 · ${over}장을 테이블로 끌어 버리세요`, acts: <button className="btn primary" disabled={sel.length !== over} onClick={() => cmd('trim')}>{sel.length}/{over}장 버리고 턴 끝</button> };
  }
  if (ui.mode === 'target') {
    const it = ui.card!; const others = S.seats.map((_, k) => k).filter(k => k !== i && (ui.only == null || k === ui.only));
    return {
      pill: `${cname(it)} · 공격할 사람을 고르세요${R(it) === 12 ? ' (받을 문양도)' : ''}`,
      acts: <>
        {R(it) === 12 && <div className="group">{SUITS.map(su => <button key={su} className={`btn sm ${ui.suit === su ? 'primary' : ''}`} onClick={() => cmd('tsuit', { s: su })}>{SYM[su]} {SNAME[su]}</button>)}</div>}
        <div className="group">
          {others.map(k => R(it) === 13
            ? S.seats[k].tokens.filter(c => !p.tokens.includes(c)).map(c => <button key={k + c} className="btn sm" onClick={() => cmd('atk', { t: k, s: c })}>{nm(k)} <Tok s={c} /></button>)
            : <button key={k} className="btn sm" disabled={R(it) === 12 && !ui.suit} onClick={() => cmd('atk', { t: k })}>{nm(k)}</button>)}
          <button className="btn sm" onClick={() => cmd('cancel')}>취소</button>
        </div>
      </>,
    };
  }
  if (ui.mode === 'HQ') return {
    pill: '♥Q: 버림 줄에서 숫자 카드를 2장까지 누르세요',
    acts: <><button className="btn primary" onClick={() => cmd('hq')}>{(ui.hq || []).length}장 가져오기</button><button className="btn" onClick={() => cmd('cancel')}>취소</button></>,
  };
  if (ui.mode === 'DQ') return {
    pill: '♦Q: 만들 토큰 색을 고르세요',
    acts: <div className="group">{SUITS.filter(c => S.supply[c] > 0 && !p.tokens.includes(c)).map(c => <button key={c} className="btn sm" onClick={() => cmd('dqcol', { s: c })}><Tok s={c} /> {SNAME[c]}</button>)}<button className="btn sm" onClick={() => cmd('cancel')}>취소</button></div>,
  };
  const tokErr = sel.length ? canMakeToken(S, i, sel) : '카드를 고르세요.'; const one = sel.length === 1 && isItem(sel[0]) ? sel[0] : null;
  const acts: ReactNode[] = []; let note = '';
  if (!t.picked) acts.push(<button key="pd" className="btn primary" onClick={() => cmd('pdeck')}>덱에서 줍기</button>);
  if (!t.token) {
    const cost = costFor(S, i);
    for (const su of SUITS) {
      const nums = p.hand.filter(c => U(c) === su && !isItem(c)).sort((x, y) => R(x) - R(y));
      if (nums.length >= cost && !canMakeToken(S, i, nums.slice(0, cost))) acts.push(<button key={'q' + su} className="btn" style={{ borderColor: SUITCOL[su] }} onClick={() => cmd('qtoken', { s: su })}><Tok s={su} /> {SNAME[su]} 토큰 만들기 · {cost}장</button>);
    }
  }
  if (sel.length && !one) acts.push(<button key="tk" className="btn" disabled={!!tokErr} onClick={() => cmd('token')}>고른 카드로 토큰</button>);
  if (one && !t.item) {
    const su = U(one), r = R(one);
    if (su === 'S' || (su === 'H' && r === 12) || (su === 'D' && r === 11)) acts.push(<button key="it" className="btn" onClick={() => cmd('item')}>{cname(one)} 쓰기</button>);
    else note = `${cname(one)}: ${su === 'H' ? '남의 공격을 막을 때 써요.' : su === 'C' ? '미니게임을 정할 때 써요.' : '토큰 만들 카드와 함께 고르세요.'}`;
  }
  if (sel.length && tokErr && !one) note = tokErr;
  acts.push(<button key="end" className={`btn ${t.picked ? 'primary' : ''}`} disabled={!t.picked} onClick={() => cmd('end')}>턴 끝내기</button>);
  return {
    pill: t.picked ? '카드를 끌어 토큰 칸에 놓으면 토큰, 상대에게 놓으면 공격' : '테이블의 덱이나 버림 줄 카드를 눌러 주우세요',
    sub: [[t.picked ? '줍기 완료' : '줍기', !t.picked], [`아이템 ${t.item ? 1 : 0}/1`, false], [`토큰 ${t.token ? 1 : 0}/1 · 다음 ${costFor(S, i)}장`, false]],
    acts: <>{acts}</>, note,
  };
}
