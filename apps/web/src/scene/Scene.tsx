/* R3F 캔버스: 렌더러·카메라·크기·루프는 R3F가, 장면 내용은 World가 맡는다 */
import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getWorld, setWorld, canPick, pick, rulesReady, onState } from '../flow';
import { useStore, viewSeat } from '../store';
import { mine, mySeats, whoActs } from '../game';
import { clubChoices } from '@cubic3/engine';
import { tip3d } from '../ui/tip';
import { World } from './World';
import { type Quality, feltColor, prefs, usePrefs } from '../prefs';
import { setCardBack } from './textures';

function Director() {
  const { scene, camera, gl, size } = useThree();
  const ready = useRef(false);
  useEffect(() => {
    const w = new World({
      S: () => useStore.getState().S,
      viewSeat,
      seated: () => { const s = useStore.getState(); return mySeats(s.S, s.me).length > 0; },
      clubSlots: () => { const s = useStore.getState(); const cc = s.S?.clubChoose; return s.S && cc && mine(s.S, s.me, cc.seat) ? clubChoices(s.S) : []; },
      whoActs: () => { const s = useStore.getState(); return whoActs(s.S, s.me); },
      uiMode: () => useStore.getState().ui.mode,
      canPick, pick, tip3d,
      fpsHint: (ok, locked) => useStore.getState().set({ fps: { ok, locked } }),
      rulesReady,
    });
    w.attach(scene, camera as THREE.PerspectiveCamera, gl.domElement);
    setWorld(w); ready.current = true;
    // 첫 화면을 그린 뒤 잠깐 여유가 있을 때 미리 데워 둔다
    const warm = setTimeout(() => { try { w.warmup(gl); } catch (e) { console.warn('warmup', e); } }, 400);
    // 이미 받은 상태가 있으면 바로 그린다
    const S0 = useStore.getState().S; if (S0) onState(S0);
    const unsub = useStore.subscribe((s, prev) => {
      if (s.S && (s.S !== prev.S || s.ctl !== prev.ctl)) onState(s.S);
      else if (!s.S && prev.S) w.sync();
      // 방에 들어가면 자리 시점, 나오면(시작 화면) 메인 화면 시점
      if (!!s.room !== !!prev.room) w.shot(s.room ? 'seat' : 'menu', 1.6);
    });
    // 처음 붙을 때 시점: 방 밖이면 메인 화면, 대기실이면 대기실 시점(그 밖의 단계는 onState가 정한다)
    if (!useStore.getState().room) w.shot('menu', 1.2); else if (S0?.phase === 'lobby') w.shot('lobby', 2);
    // 꾸미기: 테이블 천·카드 뒷면은 바뀌면 바로 반영
    const unsubP = usePrefs.subscribe((p, q) => {
      if (p.felt !== q.felt) w.setFelt(feltColor(p.felt));
      if (p.cardBack !== q.cardBack) setCardBack(p.cardBack);
    });
    return () => { clearTimeout(warm); unsub(); unsubP(); w.dispose(); setWorld(null); ready.current = false; };
  }, [scene, camera, gl]);
  useEffect(() => { getWorld()?.resize(size.width, size.height); }, [size.width, size.height]);
  useFrame((_, dt) => { getWorld()?.frame(dt); });
  return null;
}

/** 그래픽 품질별 해상도 배율(화면 픽셀 대비 최대) */
const DPR: Record<Quality, [number, number]> = { low: [1, 1], mid: [1, 1.5], high: [1, 2] };

export function SceneView() {
  const shakeN = useStore(s => s.shakeN);
  const quality = usePrefs(s => s.quality);
  const ref = useRef<HTMLCanvasElement>(null);
  // 화면 흔들림: 캔버스에 클래스를 다시 붙인다
  useEffect(() => {
    const c = ref.current; if (!c || !shakeN || prefs().reduceMotion) return;
    c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  }, [shakeN]);
  return (
    <Canvas id="gl" ref={ref} aria-label="게임 테이블" shadows dpr={DPR[quality]} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 50, near: 1, far: 4000, position: [0, 150, 128] }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; }}>
      <Director />
    </Canvas>
  );
}
