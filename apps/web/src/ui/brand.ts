/* 브랜드 색 순환: 문양 4색(♠ 파랑 → ♥ 빨강 → ♦ 노랑 → ♣ 초록)을 천천히 돈다.
   3D 큐빅 로고, 화면의 ■³ 로고(--brand), 탭 제목(🟦³ 🟥³ 🟨³ 🟩³)이 같은 시계를 쓴다. */
import * as THREE from 'three';

export const BRAND_COLORS = ['#2f5fc8', '#d3302f', '#e0b100', '#2e9450'];
const SQUARES = ['🟦', '🟥', '🟨', '🟩'];
const HOLD = 2.2, FADE = 1.3; // 한 색에 머무는 시간, 넘어가는 시간(초)
const STEP = HOLD + FADE;
const COLS = BRAND_COLORS.map(c => new THREE.Color(c));

/** 지금 색의 번호와 다음 색으로 넘어간 정도(0~1) */
function phase(t = performance.now() / 1000): { k: number; e: number } {
  const k = Math.floor(t / STEP) % COLS.length;
  const f = Math.max(0, (t % STEP) - HOLD) / FADE;
  return { k, e: f * f * (3 - 2 * f) };
}
/** 지금 브랜드 색 (target에 담아 돌려준다) */
export function brandColor(target: THREE.Color): THREE.Color {
  const { k, e } = phase();
  return target.copy(COLS[k]).lerp(COLS[(k + 1) % COLS.length], e);
}

let started = false;
/** CSS 변수 --brand와 탭 제목을 계속 바꾼다 */
export function startBrand(): void {
  if (started) return; started = true;
  const c = new THREE.Color(); let lastTitle = '';
  const tick = () => {
    document.documentElement.style.setProperty('--brand', '#' + brandColor(c).getHexString());
    const title = SQUARES[phase().k] + '³';
    if (title !== lastTitle) { document.title = title; lastTitle = title; }
  };
  tick(); setInterval(tick, 100);
}
