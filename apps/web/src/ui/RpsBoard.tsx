/* 선 가위바위보(아레나, 구상 중): 석판에 새길 내용. 공통 틀은 ui/Slab.tsx */
import type { Card, GameState, OvnMg } from '@cubic3/engine';
import { seatName } from '../game';
import type { UiMode } from '../store';
import type { MgBoard } from './Slab';

/** 원소(디지털 겉모습, 사용자 2026-10-15): 불 = 바위(R), 물 = 보(P), 풀 = 가위(S). 물 > 불, 풀 > 물, 불 > 풀 */
export const ELEM: Record<'R' | 'P' | 'S', string> = { R: '불', P: '물', S: '풀' };

export function rpsBoard(S: GameState, i: number | null, ui: UiMode, _sel: Card[]): MgBoard {
  const m = S.mg as OvnMg; const nm = (k: number) => seatName(S, k);
  const who = [m.lead, ...m.alive];
  const mine = i != null && m.step === 'pick' && who.includes(i) && !m.picks[i];
  const buttons: MgBoard['buttons'] = mine ? [{ id: 'rconfirm', label: '확정', key: '', off: !ui.rps }] : [];
  const line = mine ? (ui.rps ? ELEM[ui.rps] : '원소를 고르세요') : m.step === 'pick' && i != null && who.includes(i) ? '다른 사람을 기다리는 중' : '';
  return {
    title: '선 가위바위보', sub: `${m.round}/${m.max}판 · 선 ${nm(m.lead)}`,
    lines: line ? [line] : [], timer: null, buttons,
    rows: [m.lead, ...m.alive, ...m.out.flat()].map(k => ({
      k, name: nm(k), pts: 0, st: who.includes(k) ? (m.picks[k] ? 'ready' : 'think') : 'out',
      atk: k === m.lead, me: k === i, top: false,
    })),
    reward: (S.rewardDisp || []).slice(),
  };
}
