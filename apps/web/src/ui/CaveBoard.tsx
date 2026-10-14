/* 동굴 탐험(아레나): 석판에 새길 내용 · 키보드. 공통 틀은 ui/Slab.tsx */
import { useEffect } from 'react';
import { type CaveMg, type Card, type GameState, caveDecider } from '@cubic3/engine';
import { seatName } from '../game';
import { cmd } from '../flow';
import type { UiMode } from '../store';
import type { MgBoard } from './Slab';
import { themeOf } from '../arena/caveThemes';

export function caveBoard(S: GameState, i: number | null, ui: UiMode, _sel: Card[]): MgBoard {
  const m = S.mg as CaveMg; const nm = (k: number) => seatName(S, k); const dec = caveDecider(m);
  let line = ''; const timer: number | null = null; const buttons: MgBoard['buttons'] = [];
  if (m.step === 'decide') {
    // 고를 차례: 동굴 안의 화살표(전진 / 나가기)를 고르고 위에는 [확정]만(사용자 2026-10-14)
    if (dec != null && dec === i) {
      line = ui.cave === 'stay' ? '전진' : ui.cave === 'leave' ? `나가기 · ${m.turn}점` : '화살표를 고르세요';
      // 화살표를 고르기 전에는 [확정]을 누를 수 없다(사용자 2026-10-14)
      buttons.push({ id: 'cconfirm', label: '확정', key: '', off: !ui.cave });
    } else line = dec != null ? `${nm(dec)} 고르는 중` : '';
  }
  // 굴리기 전 대기("곧 굴립니다")와 굴림 결과 문구(N턴 버팀 · 1이 x개 · 균열 x/3)는 띄우지 않는다: 아레나 연출로 보여 준다(사용자 2026-10-15)
  const tot: Record<number, number> = {}; m.ord.forEach(k => tot[k] = m.score[k].reduce((a, v) => a + v, 0));
  const best = Math.max(...m.ord.map(k => tot[k]));
  return {
    title: '동굴 탐험', sub: `${m.pan}/3판 · ${themeOf(m.pan).name} · ${m.turn}턴`, lines: line ? [line] : [], timer, buttons,
    rows: m.ord.map(k => {
      const inside = m.inside.includes(k); const at = m.inside.indexOf(k);
      // 고르는 사람 = 모래시계, 전진을 고른 사람 = 체크, 이번 판에 나간 사람 = 출구 아이콘
      const st = inside ? (m.step === 'decide' ? (k === dec ? 'think' : at < m.di ? 'ready' : null) : m.step === 'pre' ? 'ready' : null) : k in m.got ? 'out' : null;
      return { k, name: nm(k), pts: tot[k], st, atk: false, me: k === i, top: tot[k] === best && best > 0 };
    }),
    reward: (S.rewardDisp || []).slice(),
  };
}

/** 키보드: ← 나가기 · → 전진 고르기, Space(Enter) 확정(내가 고를 차례일 때) */
export function CaveKeys({ S, i }: { S: GameState; i: number | null; ui: UiMode }) {
  const m = S.mg as CaveMg; const mine = m.step === 'decide' && i != null && caveDecider(m) === i;
  useEffect(() => {
    if (!mine) return;
    const k = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); cmd('csel', { s: 'leave' }); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); cmd('csel', { s: 'stay' }); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cmd('cconfirm'); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [mine]);
  return null;
}
