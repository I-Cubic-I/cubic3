/* 화면 크기에 맞춘 UI 배율(0.62~1). 손패·아이템 카드, 아레나 석판 헤더·점수판이 함께 줄어든다(CSS 변수 --k). 규칙 설명 화면은 --kr */
export const uiScale = (): number => Math.max(0.62, Math.min(1, window.innerWidth / 1280, window.innerHeight / 740));
/** 손패·아이템 카드 배율: 해상도에 따라 더 넓게(작은 화면은 더 작게, 큰 화면은 더 크게) */
export const cardScale = (): number => Math.max(0.42, Math.min(1.3, window.innerWidth / 1280, window.innerHeight / 740));
/** 규칙 설명 화면 배율(사용자 2026-10-14: 해상도에 따라 크기 조정). 큰 화면은 키우고 작은 화면은 줄인다.
    좁은 화면(720px 이하)은 한 줄 배치로 바뀌므로 휴대폰 폭 기준으로 잰다 */
export const rulesScale = (): number => {
  const W = window.innerWidth, H = window.innerHeight;
  return W <= 720 ? Math.max(0.62, Math.min(1, W / 420, H / 800)) : Math.max(0.62, Math.min(1.4, W / 1280, H / 760));
};
export function bindUiScale(): void {
  const f = () => { const r = document.documentElement.style; r.setProperty('--k', uiScale().toFixed(3)); r.setProperty('--kc', cardScale().toFixed(3)); r.setProperty('--kr', rulesScale().toFixed(3)); };
  f(); window.addEventListener('resize', f);
}
/** 아레나 위쪽 석판 두께: 띠(h1)·가운데 칸(h2). 작은 화면에서도 띠가 너무 얇아지지 않게 */
export function slabH(k = uiScale()): { h1: number; h2: number } {
  const h1 = Math.max(46, Math.round(56 * k)); return { h1, h2: Math.max(h1 + 26, Math.round(94 * k)) };
}
