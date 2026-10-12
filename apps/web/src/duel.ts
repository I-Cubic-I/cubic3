/* 눈치 게임(디지털판: 서부 총잡이 결투)의 내 기기 쪽 진행.
   판 상태를 받은 순간부터 lead 뒤 대치, 그로부터 sig 뒤 종소리. 종소리가 실제로 들린 때부터 누른 때까지를 재서 보낸다.
   종소리 전에 누르면 부정출발. 화면에는 신호를 띄우지 않는다(소리만) */
import { create } from 'zustand';
import type { DuelMg, GameState } from '@cubic3/engine';
import { DECOYS, play } from './sound';
import { useStore } from './store';

type Vis = { id: number; k: number };
interface DuelView {
  key: string;
  /** intro: 대치 전 / standoff: 대치 중 / shot: 나는 쐈다 */
  stage: 'intro' | 'standoff' | 'shot';
  startAt: number;
  mine: number | 'fs' | null;
  vis: Vis[];
}
export const useDuel = create<DuelView>(() => ({ key: '', stage: 'intro', startAt: 0, mine: null, vis: [] }));

let timers: number[] = [];
let bellAt = 0; let fakesSeen = 0; let visN = 0;
const clear = () => { timers.forEach(t => clearTimeout(t)); timers = []; };

export function duelSync(S: GameState): void {
  const m = S.mg?.id === 'nunchi' && S.phase === 'mg' ? (S.mg as DuelMg) : null;
  const st = useDuel.getState();
  if (!m) { if (st.key) { clear(); useDuel.setState({ key: '' }); } return; }
  const key = `${S.round}:${m.pan}`;
  if (key !== st.key) {
    clear(); bellAt = 0; fakesSeen = 0;
    const startAt = performance.now() + m.lead;
    useDuel.setState({ key, stage: 'intro', startAt, mine: null, vis: [] });
    timers.push(window.setTimeout(() => { if (useDuel.getState().stage === 'intro') useDuel.setState({ stage: 'standoff' }); }, m.lead));
    // 미끼 소리(화면 연출과 함께)
    m.decoys.forEach(d => timers.push(window.setTimeout(() => {
      play(DECOYS[d.k % DECOYS.length]);
      const v = { id: ++visN, k: d.k }; useDuel.setState(s => ({ vis: [...s.vis, v] }));
      timers.push(window.setTimeout(() => useDuel.setState(s => ({ vis: s.vis.filter(x => x.id !== v.id) })), 2200));
    }, m.lead + d.t)));
    // 진짜 신호: 종소리(소리만)
    timers.push(window.setTimeout(() => { bellAt = play('bell'); }, m.lead + m.sig));
  }
  // 아이템(가짜 신호): 새로 나온 것만 울린다
  if (m.fakes.length > fakesSeen) { fakesSeen = m.fakes.length; play('fake'); }
  // 다른 기기에서 내 자리가 이미 답했으면(다시 들어온 경우 등)
  const i = useStore.getState().ctl;
  if (i != null && i in m.res && useDuel.getState().stage !== 'shot') useDuel.setState({ stage: 'shot', mine: m.res[i] });
}

/** 쏘기(아무 키·클릭·터치) */
export function duelShoot(): void {
  const st = useDuel.getState(); const s = useStore.getState(); const S = s.S; const i = s.ctl;
  if (!S || S.mg?.id !== 'nunchi' || i == null || st.stage !== 'standoff' || i in S.mg.res) return;
  const t = performance.now();
  if (t < st.startAt) return;
  play('shot');
  const ms = bellAt && t >= bellAt ? Math.round(t - bellAt) : null;
  useDuel.setState({ stage: 'shot', mine: ms ?? 'fs' });
  void s.act({ type: 'duelHit', seat: i, ms });
}

// 3D 장면과 상관없이 상태가 바뀔 때마다 따라간다
useStore.subscribe((s, p) => { if (s.S !== p.S || s.ctl !== p.ctl) { if (s.S) duelSync(s.S); else if (useDuel.getState().key) { clear(); useDuel.setState({ key: '' }); } } });
