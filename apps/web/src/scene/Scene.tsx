/* R3F 캔버스: 렌더러·카메라·크기·루프는 R3F가, 장면 내용은 World가 맡는다 */
import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getWorld, setWorld, canPick, pick, rulesReady, onState } from '../flow';
import { useStore, viewSeat } from '../store';
import { whoActs } from '../game';
import { tip3d } from '../ui/tip';
import { World } from './World';

function Director() {
  const { scene, camera, gl, size } = useThree();
  const ready = useRef(false);
  useEffect(() => {
    const w = new World({
      S: () => useStore.getState().S,
      viewSeat,
      whoActs: () => { const s = useStore.getState(); return whoActs(s.S, s.me); },
      uiMode: () => useStore.getState().ui.mode,
      canPick, pick, tip3d,
      fpsHint: (ok, locked) => useStore.getState().set({ fps: { ok, locked } }),
      rulesReady,
    });
    w.attach(scene, camera as THREE.PerspectiveCamera, gl.domElement);
    setWorld(w); ready.current = true;
    // 이미 받은 상태가 있으면 바로 그린다
    const S0 = useStore.getState().S; if (S0) onState(S0);
    const unsub = useStore.subscribe((s, prev) => { if (s.S && (s.S !== prev.S || s.ctl !== prev.ctl)) onState(s.S); });
    return () => { unsub(); w.dispose(); setWorld(null); ready.current = false; };
  }, [scene, camera, gl]);
  useEffect(() => { getWorld()?.resize(size.width, size.height); }, [size.width, size.height]);
  useFrame((_, dt) => { getWorld()?.frame(dt); });
  return null;
}

export function SceneView() {
  const shakeN = useStore(s => s.shakeN);
  const ref = useRef<HTMLCanvasElement>(null);
  // 화면 흔들림: 캔버스에 클래스를 다시 붙인다
  useEffect(() => {
    const c = ref.current; if (!c || !shakeN) return;
    c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  }, [shakeN]);
  return (
    <Canvas id="gl" ref={ref} aria-label="게임 테이블" shadows dpr={[1, 2]} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 50, near: 1, far: 4000, position: [0, 150, 128] }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; }}>
      <Director />
    </Canvas>
  );
}
