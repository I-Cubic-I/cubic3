/* 상태를 읽는 도우미 (누구 차례인지, 내 자리, 이름) */
import { type GameState, caveDecider, countOpenAt, curlTurn, gestTurn, now, tenTurn, udCaller, udShouter } from '@cubic3/engine';

export const SEATCOL = ['#2f5fc8', '#d3302f', '#e0b100', '#2e9450', '#8a5cc8'];
export const SUITCOL: Record<string, string> = { S: '#2f5fc8', H: '#d3302f', D: '#e0b100', C: '#2e9450' };

export const mine = (S: GameState | null, me: string, i: number | null | undefined): boolean =>
  i != null && !!S?.seats[i] && S.seats[i].uid === me;
export const mySeats = (S: GameState | null, me: string): number[] =>
  S ? S.seats.map((_, i) => i).filter(i => mine(S, me, i)) : [];

export function seatName(S: GameState | null, i: number): string {
  const p = S?.seats[i];
  if (!p) return '';
  const nm = S!.names?.[p.uid] || '';
  const dup = S!.seats.filter(q => q.uid === p.uid).length > 1;
  return `${nm || '플레이어'}${dup || !nm ? ` ${i + 1}` : ''}`;
}

/** 지금 행동해야 하는 자리 (여럿이 동시에 하는 단계면 내 자리를 먼저) */
export function whoActs(S: GameState | null, me: string): number | null {
  if (!S || !S.phase) return null;
  const pickOne = (need: number[]) => need.find(i => mine(S, me, i)) ?? need[0] ?? null;
  if (S.phase === 'roll') return S.first;
  if (S.phase === 'clubs') return pickOne(S.seats.map((_, k) => k).filter(k => !(S.ready || {})[k]));
  if (S.phase === 'main') return S.turn ? S.turn.seat : null;
  if (S.phase === 'defense') return S.pending ? S.pending.target : null;
  if (S.phase === 'reward') return S.reward ? S.reward.order[S.reward.pi] : null;
  // 미니게임이 끝나 결과를 보여 주는 중이면 아무도 차례가 아니다
  if (S.phase === 'mg' && S.mgEnd) return null;
  if (S.phase === 'mg' && S.mg) {
    const m = S.mg;
    if (m.id === 'hold') return m.ord[m.ci];
    if (m.id === 'bomb') return m.alive[m.ci];
    if (m.id === 'auction') return pickOne(S.seats.map((_, i) => i).filter(i => (m.step === 'pre' ? !m.ready[i] : !(i in m.bids))));
    if (m.id === 'balloon') return m.alive[m.ci];
    if (m.id === 'rps' || m.id === 'vault') {
      if (m.step === 'save') return pickOne(m.saveq);
      if (m.step === 'guard') return m.lead;
      return pickOne((m.id === 'rps' ? [m.lead, ...m.alive] : m.alive).filter(j => !m.picks[j]));
    }
    if (m.id === 'count') {
      if (now() < countOpenAt(m)) return null;
      return pickOne(Object.keys(m.hits).map(Number).filter(k => !(k in m.ans)));
    }
    if (m.id === 'race') return m.step === 'bet' ? m.order[m.pi] : S.first;
    if (m.id === 'nunchi') return pickOne(Object.keys(m.pts).map(Number).filter(k => !(k in m.res)));
    if (m.id === 'updown') return m.step === 'grip' ? pickOne(m.ord.filter(k => !(k in m.grip))) : m.step === 'call' ? udCaller(m) : udShouter(m);
    if (m.id === 'curling') return curlTurn(m);
    if (m.id === 'line') return m.step === 'pause' ? m.pause!.seat : pickOne(m.ord.filter(k => m.hands[k]?.length));
    if (m.id === 'speed') return pickOne(m.ord.filter(k => m.hands[k]?.length));
    if (m.id === 'fold') return m.step === 'say' ? m.ord[m.ci] : pickOne(m.ord.filter(k => !(k in m.ans)));
    if (m.id === 'chain') return m.step === 'point' ? pickOne(m.ord.filter(k => !(k in m.aim))) : m.step === 'pass' ? m.cur : null;
    if (m.id === 'mid') return m.step === 'pick' ? pickOne(m.ord.filter(k => !(k in m.picks))) : null;
    if (m.id === 'gesture') return gestTurn(m);
    if (m.id === 'stack') return m.step === 'play' ? pickOne(m.ord.filter(k => !m.done[k])) : null;
    if (m.id === 'change') return m.step === 'move' ? m.changer : m.step === 'guess' ? pickOne(m.ord.filter(k => k !== m.changer && !(k in m.guesses))) : null;
    if (m.id === 'cave') return caveDecider(m);
    if (m.id === 'ten') return tenTurn(m);
    if (m.id === 'balance') return m.step === 'say' ? m.ord[m.ci] : pickOne(m.ord.filter(k => !(k in m.picks)));
  }
  return null;
}
