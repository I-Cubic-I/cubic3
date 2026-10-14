/* 아레나 캔버스: 아레나형 미니게임 중에만 띄운다(테이블 캔버스는 그동안 멈춘다) */
import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useArenaOn } from './on';
import { usePrefs } from '../prefs';
import { DodgeArena } from './dodgeArena';


function Director() {
  const { scene, camera, gl } = useThree();
  const a = useRef<DodgeArena | null>(null);
  useEffect(() => {
    const x = new DodgeArena(scene, camera as THREE.PerspectiveCamera, gl.domElement); a.current = x;
    return () => { x.dispose(); a.current = null; };
    // (개발 중 아레나 코드를 고치면 새 클래스로 다시 짓는다)
  }, [scene, camera, gl, DodgeArena]);
  useFrame((_, dt) => a.current?.frame(dt));
  return null;
}

const DPR: Record<string, [number, number]> = { low: [1, 1], mid: [1, 1.5], high: [1, 2] };

export function ArenaView() {
  const on = useArenaOn(); const quality = usePrefs(s => s.quality);
  if (!on) return null;
  return <div className="arena">
    <Canvas aria-label="미니게임 아레나" dpr={DPR[quality]} gl={{ antialias: true }} camera={{ fov: 40, near: 0.1, far: 1200, position: [0, 14, 12] }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }} style={{ touchAction: 'none' }}>
      <Director />
    </Canvas>
    {/* 종이 결 + 가장자리 어둡게(잉크 그림 느낌) */}
    <div className="arena-paper" aria-hidden="true" />
    <div className="arena-warp" aria-hidden="true" />
  </div>;
}
