/* 아레나 캔버스: 아레나형 미니게임 중에만 띄운다(테이블 캔버스는 그동안 멈춘다).
   무엇을 그릴지는 미니게임별 등록(registry.ts)에서 고른다: 석판 내용 · 키보드 · 3D 장면 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useArenaOn } from './on';
import { useStore } from '../store';
import { usePrefs } from '../prefs';
import { ARENAS, type ArenaDef, type ArenaScene } from './registry';
import { Scoreboard, Slab } from '../ui/Slab';

function Director({ def }: { def: ArenaDef }) {
  const { scene, camera, gl } = useThree();
  const a = useRef<ArenaScene | null>(null);
  useEffect(() => {
    const x = def.make(scene, camera as THREE.PerspectiveCamera, gl.domElement, gl); a.current = x;
    return () => { x.dispose(); a.current = null; };
    // (개발 중 아레나 코드를 고치면 등록이 새로 만들어져 새 장면으로 다시 짓는다)
  }, [scene, camera, gl, def]);
  useFrame((_, dt) => a.current?.frame(dt));
  return null;
}

const DPR: Record<string, [number, number]> = { low: [1, 1], mid: [1, 1.5], high: [1, 2] };

/** 화면에 고정된 석판 두 장(위쪽 석판 + 점수판)과 그 미니게임의 키보드 조작 */
function Frame({ def }: { def: ArenaDef }) {
  const S = useStore(s => s.S); const i = useStore(s => s.ctl); const ui = useStore(s => s.ui); const sel = useStore(s => s.sel);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 250); return () => clearInterval(t); }, []);
  if (!S?.mg) return null;
  const b = def.board(S, i, ui, sel); const Keys = def.Keys;
  return <Slab b={b}>
    {Keys && <Keys S={S} i={i} ui={ui} />}
    <Scoreboard b={b} />
  </Slab>;
}

export function ArenaView() {
  const on = useArenaOn(); const quality = usePrefs(s => s.quality);
  const id = useStore(s => s.S?.mg?.id); const def = id ? ARENAS[id] : undefined;
  if (!on || !def) return null;
  return <div className="arena">
    <Frame def={def} />
    <Canvas aria-label="미니게임 아레나" dpr={DPR[quality]} gl={{ antialias: true }} camera={{ fov: 40, near: 0.1, far: 1200, position: [0, 14, 12] }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }} style={{ touchAction: 'none' }}>
      <Director def={def} />
    </Canvas>
    {/* 종이 결 + 가장자리 어둡게(잉크 그림 느낌) */}
    <div className="arena-paper" aria-hidden="true" />
    <div className="arena-warp" aria-hidden="true" />
  </div>;
}
