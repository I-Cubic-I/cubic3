/* 캔버스로 그리는 텍스처 (카드 앞뒤, 디스크, 주사위 눈 등) */
import * as THREE from 'three';
import { type Card, type MgId, MG, R, RL, SYM, U } from '@cubic3/engine';
import { prefs } from '../prefs';
import { drawCardBack } from './cardBacks';

const texCache = new Map<string, THREE.CanvasTexture>();
export function ctex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export const FONT_D = "'Black Han Sans','IBM Plex Sans KR',sans-serif";
export const FONT_B = "'IBM Plex Sans KR',sans-serif";
export const FONT_M = "'VT323',monospace";
export const INKC: Record<string, string> = { S: '#2f5fc8', H: '#d3302f', D: '#b98a00', C: '#2e9450' };

export function faceTex(c: Card): THREE.CanvasTexture {
  const base = c.replace(/b$/, '');
  return ctex('f' + base, 256, 358, (g, w, h) => {
    const s = U(base), r = R(base), it = r >= 11;
    g.fillStyle = '#f7f3ea'; rr(g, 0, 0, w, h, 22); g.fill();
    if (it) { g.strokeStyle = '#e8b84a'; g.lineWidth = 14; rr(g, 10, 10, w - 20, h - 20, 16); g.stroke(); }
    g.fillStyle = INKC[s]; g.font = `64px ${FONT_D}`; g.textBaseline = 'top'; g.fillText(RL(r), 24, 20);
    g.font = `48px ${FONT_D}`; g.fillText(SYM[s], 26, 92);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `150px ${FONT_D}`; g.fillText(it ? RL(r) : SYM[s], w / 2, h * 0.6);
  });
}
/** 카드 뒷면: 모든 카드가 텍스처 하나를 같이 쓴다. 꾸미기에서 무늬를 바꾸면 다시 그려 테이블의 카드가 한꺼번에 바뀐다 */
let backT: THREE.CanvasTexture | null = null, backId = '';
export function backTex(): THREE.CanvasTexture {
  if (!backT) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 358;
    backT = new THREE.CanvasTexture(c); backT.colorSpace = THREE.SRGBColorSpace; backT.anisotropy = 4;
    setCardBack(prefs().cardBack);
  }
  return backT;
}
export function setCardBack(id: string): void {
  if (!backT || id === backId) return;
  backId = id;
  const c = backT.image as HTMLCanvasElement, g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height); drawCardBack(id, g, c.width, c.height);
  backT.needsUpdate = true;
}
const MGLOOK: Record<string, [string, string]> = {
  hold: ['#f0b48f', '#cf6f48'], bomb: ['#f7a3a3', '#c94242'], auction: ['#f2d27a', '#c79a1c'], balloon: ['#ffb35c', '#e8853a'],
  rps: ['#a9bdff', '#6a7fe0'], vault: ['#b9c3d6', '#6f7d99'], count: ['#9cc3ea', '#4f86c6'], race: ['#8fd0a4', '#3f9a63'],
};
export const mgLook = (id: string): [string, string] => MGLOOK[id] || ['#cfd4dc', '#7b8494'];
export function floppyTex(id: MgId): THREE.CanvasTexture {
  return ctex('fl' + id, 256, 268, (g, w, h) => {
    const [fld, body] = mgLook(id);
    g.fillStyle = body; g.beginPath(); g.moveTo(0, 0); g.lineTo(w - 24, 0); g.lineTo(w, 24); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = gr; g.fill();
    const sg = g.createLinearGradient(66, 0, 190, 0); sg.addColorStop(0, '#9aa1ab'); sg.addColorStop(.45, '#e4e8ee'); sg.addColorStop(1, '#a7aeb8');
    g.fillStyle = sg; rr(g, 66, -6, 124, 92, 6); g.fill(); g.fillStyle = '#2a2a2e'; rr(g, 140, 14, 26, 58, 4); g.fill();
    g.fillStyle = '#fbf8f0'; rr(g, 22, 108, w - 44, h - 120, 8); g.fill(); g.fillStyle = fld; g.fillRect(22, 108, w - 44, 12);
    g.fillStyle = '#1b2230'; g.textAlign = 'center'; g.textBaseline = 'middle'; const nm = MG[id] ? MG[id].name : id;
    g.font = `${nm.length > 5 ? 34 : 40}px ${FONT_D}`; g.fillText(nm, w / 2, 180);
    g.font = `22px ${FONT_M}`; g.fillStyle = '#8a7f6a'; g.fillText('CUBIC DISK', w / 2, 236);
  });
}
const PIPS: Record<number, [number, number][]> = {
  1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
  5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.27, .22], [.73, .22], [.27, .5], [.73, .5], [.27, .78], [.73, .78]],
};
export function pipTex(n: number): THREE.CanvasTexture {
  return ctex('die' + n, 128, 128, (g, w, h) => {
    g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, w, h); g.fillStyle = n === 1 ? '#d3302f' : '#1b2230';
    PIPS[n].forEach(([x, y]) => { g.beginPath(); g.arc(x * w, y * h, n === 1 ? 17 : 12, 0, 7); g.fill(); });
  });
}
export function numTex(n: number): THREE.CanvasTexture {
  return ctex('slot' + n, 128, 128, (g) => {
    g.fillStyle = '#e8b84a'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
    g.fillStyle = '#1b1408'; g.font = `78px ${FONT_D}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  });
}
