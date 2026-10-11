/* 상태를 읽는 도우미 (누구 차례인지, 내 자리, 이름) */
import { type GameState, countOpenAt, now } from '@cubic3/engine';

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
  }
  return null;
}
