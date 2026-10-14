/* 아레나형 미니게임 등록(사용자 2026-10-14: 미니게임마다 UI를 통일한다).
   새 아레나 미니게임은 여기에 석판 내용(board) · 키보드(Keys, 없어도 됨) · 3D 장면(make)만 더하면
   아레나 캔버스, 위쪽 석판, 점수판이 그대로 붙는다(ESC 메뉴·아이템 쓰기는 원래 모든 미니게임 공통) */
import type * as THREE from 'three';
import type { ReactNode } from 'react';
import type { Card, GameState, MgId } from '@cubic3/engine';
import type { UiMode } from '../store';
import type { MgBoard } from '../ui/Slab';
import { DodgeKeys, dodgeBoard } from '../ui/MgPanel4';
import { DodgeArena } from './dodgeArena';

/** 아레나 3D 장면: 매 프레임 그리고, 끝나면 치운다 */
export interface ArenaScene { frame(dt: number): void; dispose(): void }
export interface ArenaDef {
  /** 석판에 새길 내용 */
  board(S: GameState, i: number | null, ui: UiMode, sel: Card[]): MgBoard;
  /** 키보드 조작을 붙이는 컴포넌트(화면에는 아무것도 그리지 않아도 된다) */
  Keys?: (p: { S: GameState; i: number | null; ui: UiMode }) => ReactNode;
  /** 3D 장면 만들기 */
  make(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dom: HTMLCanvasElement, gl: THREE.WebGLRenderer): ArenaScene;
}

export const ARENAS: Partial<Record<MgId, ArenaDef>> = {
  dodge: { board: dodgeBoard, Keys: DodgeKeys, make: (scene, camera, dom, gl) => new DodgeArena(scene, camera, dom, gl) },
};
