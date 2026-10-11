/* 개발 전용 스튜디오 보기(?studio=1): 프리즘 로고가 반사 환경으로 쓰는 가상의 스튜디오를 3D로 보여 준다.
   숨긴 문양 조명(이스터에그)이 드러나는 화면이라 공개판에는 넣지 않는다. */
import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { buildStudio } from './prismMaterial';
import { CubePrism } from './CubicLogo';

function Studio() {
  const { scene } = useThree();
  const studio = useMemo(buildStudio, []);
  useEffect(() => {
    // 스튜디오 장면의 내용을 그대로 옮겨 붙인다(배경 구·조명판·문양)
    const kids = [...studio.scene.children];
    kids.forEach(k => scene.add(k));
    return () => { kids.forEach(k => scene.remove(k)); studio.dispose(); };
  }, [scene, studio]);
  return null;
}

const LEGEND = [
  ['꼭대기 소프트박스(원형 지름 5)', '흰색 ×6'],
  ['위쪽 고리(+35°) 가로 조명 3개', '흰색 ×5 · 미색 ×4 · 하늘색 ×4'],
  ['아래쪽 고리(−30°) 짧은 조명 3개', '흰색 ×4 · 하늘색 ×3 · 미색 ×3'],
  ['바닥 소프트박스(원형 지름 5)', '하늘색 ×1.5'],
  ['숨긴 문양 ♠♥♦♣', '흰색 ×4, 크기 2.4, 큐빅 높이 띠'],
];

export function StudioView() {
  return (
    <>
      <Canvas camera={{ fov: 50, position: [14, 8, 18], near: .1, far: 200 }} style={{ position: 'fixed', inset: 0 }}>
        <Studio />
        <group scale={2.2}><CubePrism envSpin={false} /></group>
        <axesHelper args={[3]} />
        <OrbitControls makeDefault target={[0, 0, 0]} />
      </Canvas>
      <div style={{ position: 'fixed', left: 16, top: 16, padding: '12px 14px', borderRadius: 12, background: 'rgba(10,12,18,.85)', color: '#e9eef8', font: '13px/1.6 "IBM Plex Sans KR",sans-serif', maxWidth: 300 }}>
        <b style={{ fontSize: 15 }}>프리즘 로고 스튜디오</b>
        <div style={{ color: '#9fb0c8', marginBottom: 6 }}>끌어서 돌리기 · 휠로 확대 · 가운데 큐빅이 로고(카메라는 +z 쪽에서 본다)</div>
        {LEGEND.map(([a, b]) => <div key={a}>{a} <span style={{ color: '#9fb0c8' }}>· {b}</span></div>)}
        <div style={{ color: '#9fb0c8', marginTop: 6 }}>스튜디오 전체를 피치 45° · 롤 45° 기울였다. 실제 로고에서는 이 스튜디오가 큐빅과 반대로 천천히 돈다. 축: 빨강 x · 초록 y · 파랑 z</div>
      </div>
    </>
  );
}
