/* 아레나에서 하는 미니게임인지(테이블 캔버스·화면 UI도 이걸 보고 바뀐다) */
import { useStore } from '../store';

/** 별도 공간(아레나)에서 하는 미니게임 */
export const ARENA_MG = ['dodge'];
export const useArenaOn = () => useStore(s => s.S?.phase === 'mg' && !!s.S.mg && ARENA_MG.includes(s.S.mg.id));
