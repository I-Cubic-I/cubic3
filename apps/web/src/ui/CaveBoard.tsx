/* 동굴 탐험(아레나): 석판에 새길 내용 · 키보드. 공통 틀은 ui/Slab.tsx */
import { useEffect } from 'react';
import { type CaveMg, type Card, type GameState, caveDecider, now } from '@cubic3/engine';
import { seatName } from '../game';
import { cmd } from '../flow';
import type { UiMode } from '../store';
import type { MgBoard } from './Slab';

const secs = (t: number) => Math.max(0, Math.ceil((t - now()) / 1000));

export function caveBoard(S: GameState, i: number | null, _ui: UiMode, _sel: Card[]): MgBoard {
  const m = S.mg as CaveMg; const nm = (k: number) => seatName(S, k); const dec = caveDecider(m);
  const L = m.last; let line = ''; let timer: number | null = null; const buttons: MgBoard['buttons'] = [];
  if (m.step === 'decide') {
    if (dec != null && dec === i) {
      line = '남을까요, 나갈까요?';
      buttons.push({ id: 'cstay', label: '남기', key: '1' }, { id: 'cleave', label: `나가기 · ${m.turn}점`, key: '2' });
    } else line = dec != null ? `${nm(dec)} 고르는 중` : '';
  } else if (m.step === 'pre') { line = '곧 굴립니다'; timer = secs(m.until); }
  else if (L) line = L.collapse ? '무너졌다!' : L.faces.includes(1) ? `1이 ${L.faces.filter(v => v === 1).length - L.kept}개 · 균열 ${L.ones}/3` : `${L.turn}턴 버팀`;
  const tot: Record<number, number> = {}; m.ord.forEach(k => tot[k] = m.score[k].reduce((a, v) => a + v, 0));
  const best = Math.max(...m.ord.map(k => tot[k]));
  return {
    title: '동굴 탐험', sub: `${m.pan}/3판 · ${m.turn}턴`, lines: line ? [line] : [], timer, buttons,
    rows: m.ord.map(k => {
      const inside = m.inside.includes(k); const at = m.inside.indexOf(k);
      // 고르는 사람 = 모래시계, 남기로 한 사람 = 체크, 나간 사람 = 표시 없음
      const st = m.step === 'decide' && inside ? (k === dec ? 'think' : at < m.di ? 'ready' : null) : null;
      return { k, name: nm(k), pts: tot[k], st, atk: false, me: k === i, top: tot[k] === best && best > 0 };
    }),
    reward: (S.rewardDisp || []).slice(),
  };
}

/** 키보드: 1 남기 · 2 나가기(내가 고를 차례일 때) */
export function CaveKeys({ S, i }: { S: GameState; i: number | null; ui: UiMode }) {
  const m = S.mg as CaveMg; const mine = m.step === 'decide' && i != null && caveDecider(m) === i;
  useEffect(() => {
    if (!mine) return;
    const k = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === '1') cmd('cstay'); else if (e.key === '2') cmd('cleave');
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [mine]);
  return null;
}
