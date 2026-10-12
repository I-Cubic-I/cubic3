/* 화면 상태 (zustand). 테이블 상태 S는 방에서 받아 그대로 둔다. */
import { create } from 'zustand';
import { type Action, type Card, type Fx, type GameState, MAX_SEATS, type MgId, type Suit } from '@cubic3/engine';
import type { Room } from './net/room';
import { mine, mySeats, whoActs } from './game';

export interface UiMode {
  mode?: 'target' | 'HQ' | 'DQ' | 'clubK';
  card?: Card;
  /** 끌어 놓은 상대 (♠Q·♠K 대상 고정) */
  only?: number;
  suit?: Suit;
  hq?: Card[];
  cards?: Card[];
  bsub?: boolean;
  vz?: number[];
  /** 손가락 사슬: 가리킬 사람들 */
  aim?: number[];
  /** 스피드: 골라 둔 손패 */
  spc?: Card;
  /** 뭐가 바뀌었지: 옮길 말 / 고른 말들 */
  chg?: number;
  cg?: number[];
  showHand?: boolean;
  rulesAgain?: boolean;
  log?: boolean;
  confirmReset?: boolean;
}

interface Store {
  S: GameState | null;
  room: Room | null;
  me: string;
  name: string;
  /** 지금 조작하는 자리 (한 기기에서 여러 자리를 조종할 때) */
  ctl: number | null;
  sel: Card[];
  ui: UiMode;
  flash: string;
  toast: string;
  fatal: string | null;
  /** 규칙 화면을 보여도 되는지 (디스크 연출이 끝났는지) */
  rulesShown: boolean;
  /** ♣ 컷신이 도는 중 */
  clubPlaying: boolean;
  lastKey: string;
  /** 지금 보여 주는 연출 이벤트 */
  fxShow: { f: Fx; out: boolean } | null;
  shakeN: number;
  /** 규칙 화면이 빨간 X로 바뀐 중(♣) */
  screenAlert: boolean;
  /** ♣ 컷신 */
  cutin: Fx | null;
  /** 미니게임이 끝나고 보여 주는 순위 결과 */
  results: { mg: MgId | null; groups: number[][]; rolls: Record<number, number[]>; order: number[] } | null;
  fps: { ok: boolean; locked: boolean };
  /** 방에 막 들어왔다: 첫 상태를 받으면 빈 의자에 자동으로 앉는다 */
  autoSit: boolean;
  /** 개발 서버 미니게임 미리보기 방인지 / 미리보기가 끝나 선택 화면으로 돌아가는지 */
  devPreview: boolean;
  devBack: boolean;

  setRoom(room: Room, me: string, name: string): void;
  receive(S: GameState): void;
  act(a: Action): Promise<boolean>;
  setUi(u: UiMode): void;
  patchUi(u: Partial<UiMode>): void;
  toggleSel(c: Card): void;
  clearSel(): void;
  setCtl(i: number): void;
  showFlash(m: string): void;
  showToast(m: string): void;
  setFatal(m: string): void;
  set(p: Partial<Store>): void;
}

let flashT = 0, toastT = 0;

export const useStore = create<Store>((set, get) => ({
  S: null, room: null, me: '', name: '', ctl: null, sel: [], ui: {}, flash: '', toast: '', fatal: null,
  rulesShown: false, clubPlaying: false, lastKey: '', fxShow: null, shakeN: 0, screenAlert: false, cutin: null, results: null, fps: { ok: false, locked: false }, autoSit: false, devPreview: false, devBack: false,

  setRoom: (room, me, name) => set({ room, me, name, autoSit: true }),
  receive: S => {
    const { me, lastKey } = get();
    const m = S.mg as unknown as Record<string, unknown> | null;
    const key = S.phase + '|' + (S.turn ? S.turn.seat + ':' + S.ti : '') + '|' + (m ? `${m.id}${m.ci || 0}${m.step || ''}${m.round || ''}${m.pan || ''}${m.turn ?? ''}${m.si ?? ''}${m.end ?? ''}` : '') + '|' + S.round;
    const patch: Partial<Store> = { S };
    if (key !== lastKey) { patch.sel = []; patch.ui = {}; patch.lastKey = key; }
    // 조작할 자리 고르기
    const ms = mySeats(S, me);
    let ctl = get().ctl;
    if (!ms.length) ctl = null;
    else { const a = whoActs(S, me); if (a != null && mine(S, me, a)) ctl = a; else if (ctl == null || !mine(S, me, ctl)) ctl = ms[0]; }
    patch.ctl = ctl;
    set(patch);
    // 들어오자마자 빈 의자에 앉는다(대기실이고, 아직 안 앉았고, 자리가 남았으면). 자리가 다 찼거나 게임 중이면 구경
    if (get().autoSit) {
      set({ autoSit: false });
      if (S.phase === 'lobby' && !ms.length && S.seats.length < MAX_SEATS) void get().act({ type: 'sit', name: get().name });
    }
  },
  act: async a => {
    const room = get().room;
    if (!room) return false;
    const r = await room.act(a);
    if (!r.ok) get().showFlash(r.error);
    return r.ok;
  },
  setUi: u => set({ ui: u }),
  patchUi: u => set({ ui: { ...get().ui, ...u } }),
  toggleSel: c => { const s = get().sel; set({ sel: s.includes(c) ? s.filter(x => x !== c) : [...s, c] }); },
  clearSel: () => set({ sel: [] }),
  setCtl: i => set({ ctl: i, sel: [], ui: {} }),
  showFlash: m => { set({ flash: m }); clearTimeout(flashT); flashT = window.setTimeout(() => { if (get().flash === m) set({ flash: '' }); }, 4000); },
  showToast: m => { set({ toast: m }); clearTimeout(toastT); toastT = window.setTimeout(() => set({ toast: '' }), 1800); },
  setFatal: m => set({ fatal: m }),
  set: p => set(p),
}));

/** 화면 기준 자리: 내가 조작하는 자리(관전이면 0) */
export function viewSeat(): number {
  const { S, me, ctl } = useStore.getState();
  const ms = mySeats(S, me);
  if (!ms.length) return 0;
  return ctl != null && ms.includes(ctl) ? ctl : ms[0];
}
