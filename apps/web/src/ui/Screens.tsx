/* 규칙 화면(모니터가 페이지 전체가 된다), ♣ 컷신, 연출 오버레이 */
import { type Card, type Fx, type GameState, type Hand, MG, R, RL, SYM, cname, isItem, U } from '@cubic3/engine';
import { SEATCOL, SUITCOL, mine, seatName } from '../game';
import { cmd } from '../flow';
import { useStore } from '../store';
import { MCard, names } from './bits';
import { mgLook } from '../scene/textures';

export function RulesScreen({ S }: { S: GameState }) {
  const me = useStore(s => s.me); const i = useStore(s => s.ctl); const ui = useStore(s => s.ui);
  const id = S.board![S.die! - 1], def = MG[id]; const rd = S.ready || {}; const [fld, body] = mgLook(id);
  const nm = (k: number) => seatName(S, k);
  const rows = def.text.split('\n').map((l, k) => {
    const c = l.indexOf(':'); if (c < 0) return null; const h = l.slice(0, c).replace(/\(.*\)/, '');
    return <div key={k} className={`rrow${h === '아이템' ? ' it' : ''}`}><b>{h}</b><span>{l.slice(c + 1).trim()}</span></div>;
  });
  const mineLeft = S.seats.map((_, k) => k).filter(k => mine(S, me, k) && !rd[k]);
  const p = i != null ? S.seats[i] : null; const clubs = p && !p.front.length ? p.hand.filter(c => U(c) === 'C' && isItem(c)) : [];
  const clubTxt = p && p.front.length ? '이번 라운드에 아이템을 써서 ♣는 못 써요' : clubs.length ? '규칙 설명 중 언제든. 쓰면 디스크를 다시 골라요.' : '♣ 아이템이 있으면 여기서 미니게임을 바꿀 수 있어요';
  return (
    <>
      <div className="crt">
        <div className="scr-top"><span className="mono">MINIGAME ▸ 규칙 설명</span><span className="scr-chip">{S.round}라운드 · 모두 준비되면 시작</span></div>
        <div className="scr-body">
          <div className="scr-art" style={{ background: `linear-gradient(170deg,${fld},${body})` }}>
            <div className="ttl">{def.name}</div>
            <div className="tags"><span>{def.icon.replace(/🂠|🎲|✊/g, '').trim() || '카드 없음'}</span><span>{def.min}~{def.max}인</span></div>
          </div>
          <div className="scr-rules">{rows}</div>
        </div>
        <div className="scr-foot">
          <div className="scr-box clubbox"><MCard c="C11" />
            <div className="txt"><strong>♣ · 미니게임 바꾸기</strong>{clubTxt}
              {clubs.length > 0 && <div className="clubbtns">{clubs.map(c => R(c) === 11
                ? <button key={c} className="btn sm" onClick={() => cmd('club', { c })}>♣J 다시 굴리기</button>
                : R(c) === 12 ? <span key={c}><button className="btn sm" onClick={() => cmd('club', { c, x: 1 })}>♣Q 눈 +1</button><button className="btn sm" onClick={() => cmd('club', { c, x: -1 })}>♣Q 눈 -1</button></span>
                  : <button key={c} className="btn sm" onClick={() => cmd('clubK', { c })}>♣K 직접 고르기</button>)}</div>}
              {ui.mode === 'clubK' && <div className="clubbtns">{S.board!.map((b, k) => <button key={k} className="btn sm" onClick={() => cmd('clubKgo', { k: k + 1 })}>{k + 1} · {MG[b].name}</button>)}<button className="btn sm" onClick={() => cmd('cancel')}>취소</button></div>}
            </div>
          </div>
          <div className="scr-box"><span className="lbl">준비 상태</span>
            <div className="readys">{S.seats.map((_, k) => <span key={k} className={`ready${rd[k] ? ' ok' : ''}`}><i style={{ background: SEATCOL[k % 5] }} />{nm(k)} · {rd[k] ? '준비 완료' : '읽는 중'}</span>)}</div>
          </div>
          <div className="scr-box" style={{ padding: 10 }}>
            <div className="rewardrow"><span style={{ fontSize: 12, color: 'var(--cyan-dim)' }}>보상</span>{(S.rewardDisp || []).map(c => <MCard key={c} c={c} />)}</div>
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

const EMO: Record<Hand, string> = { S: '✌️', R: '✊', P: '✋' };
export function FxView({ S, f, out }: { S: GameState; f: Fx; out: boolean }) {
  const nm = (k: number) => seatName(S, k);
  const who = f.seats && f.seats.length ? <div className="s">{names(S, f.seats)}</div> : null;
  let cls = 'fx ' + ((f.tone as string) || ''); let inner: React.ReactNode;
  if (f.t === 'dice') {
    const both = f.both as [number, number] | null;
    if (f.bust) cls += ' bad';
    inner = <><div className="k">{f.bust ? '와르르' : '굴림'}</div><div className="b">{both ? `${both[0]} · ${both[1]} → ${f.v}` : String(f.v)}</div>{f.bust ? <div className="s">기준 {String(f.th)} 이하!</div> : null}{who}</>;
  } else if (f.t === 'title') inner = <><div className="k">미니게임 시작</div><div className="b">{MG[f.mg as keyof typeof MG].name}</div></>;
  else if (f.t === 'pop') { cls += ' bad'; inner = <><div className="b">{f.bomb ? '펑!' : '빵!'}</div>{who}<div className="s">{f.small ? '폭탄 1개' : '탈락'}</div></>; }
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
  else if (f.t === 'rank') inner = <><div className="k">미니게임 결과</div>{(f.groups as number[][]).map((g, k) => <div key={k} className="rk"><b>{k + 1}위</b>{names(S, g)}</div>)}</>;
  else if (f.t === 'win') { cls += ' win'; inner = <><div className="k">우승</div><div className="b">{names(S, f.seats!)}</div></>; }
  else inner = <><div className="b">{String(f.text || '')}</div>{who}</>;
  return <div className={cls + (out ? ' out' : '')}>{inner}</div>;
}
