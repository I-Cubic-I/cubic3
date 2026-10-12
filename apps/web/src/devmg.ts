/* 개발 서버 전용: 미니게임 미리보기. 내 자리 3개로 게임을 시작하고, 고른 미니게임의 규칙 설명 단계로 바로 보낸다.
   자리마다 아이템(J·Q·K)을 쥐여 줘서 아이템 카드 화면도 볼 수 있다. 화면 위 "자리 1·2·3"으로 조종할 자리를 바꾼다 */
import { type Card, type GameState, MG, type MgId, R, U, draw, shuffle } from '@cubic3/engine';
import type { Room } from './net/room';

export const MG_IDS = Object.keys(MG) as MgId[];

export async function setupMgPreview(r: Room, id: MgId, name: string): Promise<void> {
  for (let k = 0; k < 3; k++) await r.act({ type: 'sit', name });
  await r.act({ type: 'start' });
  r.dev!((S: GameState) => {
    const n = S.seats.length;
    // 미니게임판 6칸: 첫 칸이 고른 미니게임, 주사위 눈 1
    S.board = [id, ...shuffle(MG_IDS.filter(x => x !== id)).slice(0, 5)];
    S.die = 1; S.round = 1; S.phase = 'clubs'; S.ready = {}; S.deadline = null; S.turn = null; S.pending = null;
    S.rewardDisp = []; for (let k = 0; k < 2 * n + 1; k++) { const x = draw(S); if (x) S.rewardDisp.push(x); }
    // 자리마다 아이템 2장(J 하나 + Q나 K 하나)
    const takeJ = (): Card | null => { const k = S.deck.findIndex(c => R(c) === 11); return k < 0 ? null : S.deck.splice(k, 1)[0]; };
    // ♣ 아이템도 하나씩(자리 1·2·3에 ♣J·♣Q·♣K): 규칙 설명 때 끌어 놓아 미니게임 바꾸기를 볼 수 있게
    const takeClub = (r: number): Card | null => {
      for (const pile of [S.deck, S.qPile, S.kPile]) { const k = pile.findIndex(c => U(c) === 'C' && R(c) === r); if (k >= 0) return pile.splice(k, 1)[0]; }
      return null;
    };
    S.seats.forEach((p, k) => {
      const cl = takeClub(11 + (k % 3)); if (cl) p.hand.push(cl);
      const j = takeJ(); if (j) p.hand.push(j);
      const qk = (k % 2 ? S.kPile : S.qPile).pop(); if (qk) p.hand.push(qk);
    });
  });
}
