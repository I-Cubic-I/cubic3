/* 카드 뒷면 무늬 (꾸미기). 테이블의 카드와 꾸미기 화면의 미리보기가 같은 그리기 함수를 쓴다 */
import { rr } from './textures';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
const FONT = "'Black Han Sans','IBM Plex Sans KR',sans-serif";
const SUITS: [string, string][] = [['♠', '#2f5fc8'], ['♥', '#d3302f'], ['♦', '#e0b100'], ['♣', '#2e9450']];

/** 테두리 + 가운데 원 + C (기본 무늬의 뼈대) */
function frame(g: CanvasRenderingContext2D, w: number, h: number, bg: string, ink: string) {
  g.fillStyle = bg; rr(g, 0, 0, w, h, 22); g.fill();
  g.strokeStyle = ink; g.lineWidth = 10; rr(g, 16, 16, w - 32, h - 32, 14); g.stroke();
}

export const CARD_BACKS: { id: string; label: string; draw: Draw }[] = [
  {
    id: 'classic', label: '기본', draw: (g, w, h) => {
      frame(g, w, h, '#24324f', '#e8b84a');
      g.save(); rr(g, 16, 16, w - 32, h - 32, 14); g.clip();
      g.strokeStyle = 'rgba(232,184,74,.35)'; g.lineWidth = 3;
      for (let k = -h; k < w; k += 22) { g.beginPath(); g.moveTo(k + 30, 30); g.lineTo(k + 30 + h, 30 + h); g.stroke(); }
      g.restore();
      g.fillStyle = '#24324f'; rr(g, w / 2 - 50, h / 2 - 50, 100, 100, 50); g.fill(); g.strokeStyle = '#e8b84a'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#e8b84a'; g.font = `56px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', w / 2, h / 2 + 3);
    },
  },
  {
    id: 'wine', label: '와인 격자', draw: (g, w, h) => {
      frame(g, w, h, '#5a1f2a', '#e6c27a');
      g.save(); rr(g, 16, 16, w - 32, h - 32, 14); g.clip();
      g.strokeStyle = 'rgba(230,194,122,.4)'; g.lineWidth = 2.5;
      for (let k = -h; k < w + h; k += 28) {
        g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke();
        g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke();
      }
      g.restore();
      // 가운데 마름모
      g.fillStyle = '#5a1f2a'; g.beginPath(); g.moveTo(w / 2, h / 2 - 62); g.lineTo(w / 2 + 46, h / 2); g.lineTo(w / 2, h / 2 + 62); g.lineTo(w / 2 - 46, h / 2); g.closePath(); g.fill();
      g.strokeStyle = '#e6c27a'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#e6c27a'; g.font = `44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', w / 2, h / 2 + 3);
    },
  },
  {
    id: 'suits', label: '네 문양', draw: (g, w, h) => {
      frame(g, w, h, '#16181d', '#d9d4c8');
      g.textAlign = 'center'; g.textBaseline = 'middle';
      // 네 귀퉁이 문양 + 가운데 큐빅
      const pos: [number, number][] = [[.3, .26], [.7, .26], [.7, .74], [.3, .74]];
      SUITS.forEach(([s, c], k) => { g.fillStyle = c; g.font = `54px ${FONT}`; g.fillText(s, pos[k][0] * w, pos[k][1] * h); });
      g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
      g.fillStyle = '#d9d4c8'; rr(g, -26, -26, 52, 52, 8); g.fill();
      g.fillStyle = '#16181d'; rr(g, -9, -9, 18, 18, 3); g.fill();
      g.restore();
    },
  },
  {
    id: 'mint', label: '민트 체크', draw: (g, w, h) => {
      frame(g, w, h, '#f1ede2', '#2f7d6b');
      g.save(); rr(g, 16, 16, w - 32, h - 32, 14); g.clip();
      g.fillStyle = 'rgba(47,125,107,.18)';
      for (let x = 16; x < w; x += 32) g.fillRect(x, 0, 16, h);
      for (let y = 16; y < h; y += 32) g.fillRect(0, y, w, 16);
      g.restore();
      g.fillStyle = '#f1ede2'; rr(g, w / 2 - 48, h / 2 - 48, 96, 96, 48); g.fill(); g.strokeStyle = '#2f7d6b'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#2f7d6b'; g.font = `54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', w / 2, h / 2 + 3);
    },
  },
];
export const drawCardBack = (id: string, g: CanvasRenderingContext2D, w: number, h: number) =>
  (CARD_BACKS.find(b => b.id === id) || CARD_BACKS[0]).draw(g, w, h);
