/* 아이템 툴팁: 올리면 보이고, 누르면 고정. 테이블 위 3D 카드에도 쓴다. */
import { type Card, MG, U, cname, isItem } from '@cubic3/engine';
import { useStore } from '../store';

/** 아이템 효과 (RULES.md 능력표) */
const ITEM_FX: Record<string, [string, string, string]> = {
  S11: ['♠ 약탈', '남의 손패에서 무작위 1장 뺏기', '상대에게 끌어 놓기 · ♥J·♥K로 막힐 수 있음'],
  S12: ['♠ 약탈', '문양 하나를 지목해, 상대가 그 문양 숫자 카드를 가졌으면 1장 받기', '상대에게 끌어 놓기 · ♥J·♥K로 막힐 수 있음'],
  S13: ['♠ 약탈', '남의 토큰 1개 뺏기 (내가 가진 색은 불가)', '상대에게 끌어 놓기 · ♥J·♥K로 막힐 수 있음'],
  H11: ['♥ 수호', '♠ 공격 1회 막기', '남의 턴, 내가 공격받을 때 써요'],
  H12: ['♥ 수호', '버림 줄에서 숫자 카드 2장 골라 가져오기', '테이블로 끌어 놓기'],
  H13: ['♥ 수호', '♠ 공격을 막고 공격한 사람에게 그대로 되돌리기', '남의 턴, 내가 공격받을 때 써요 · 되돌린 공격은 못 막아요'],
  D11: ['♦ 거래', '덱 위 3장을 보고 1장 갖기, 나머지 2장은 버림', '테이블로 끌어 놓기'],
  D12: ['♦ 거래', '지금 비용만큼의 같은 문양 숫자 카드로 원하는 색 토큰 만들기', '토큰 칸에 먼저 놓고, 숫자 카드를 이어서 놓기'],
  D13: ['♦ 거래', '이번 토큰 만들기 비용을 3장으로 (첫 토큰·연장전엔 효과 없음)', '토큰 칸에 먼저 놓고, 숫자 카드를 이어서 놓기'],
  C11: ['♣ 흐름', '미니게임 주사위 다시 굴리기', '규칙 설명 시간에 써요 · 이번 라운드에 아이템을 쓴 사람은 못 써요'],
  C12: ['♣ 흐름', '미니게임 주사위 눈 ±1', '규칙 설명 시간에 써요 · 이번 라운드에 아이템을 쓴 사람은 못 써요'],
  C13: ['♣ 흐름', '미니게임 직접 고르기', '규칙 설명 시간에 써요 · 이번 라운드에 아이템을 쓴 사람은 못 써요'],
};
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

function itemTip(c: Card, note = ''): string | null {
  const base = c.replace(/b$/, ''); const f = ITEM_FX[base]; if (!f) return null;
  const S = useStore.getState().S;
  let mgLine = '';
  if (S && S.phase === 'mg' && S.mg && MG[S.mg.id]) { const l = MG[S.mg.id].text.split('\n').find(x => x.startsWith('아이템')); if (l) mgLine = l.slice(l.indexOf(':') + 1).trim(); }
  return `<div class="tt-h"><span class="tt-c ${U(base)}">${cname(base)}</span><span class="tt-k">${f[0]}</span></div>` +
    (mgLine ? `<div class="tt-mg"><b>이번 미니게임</b> ${esc(mgLine)}</div>${note ? `<div class="tt-note">${esc(note)}</div>` : ''}<div class="tt-sub">메인 턴 효과: ${esc(f[1])}</div>` : `<div class="tt-b">${esc(f[1])}</div><div class="tt-sub">${esc(f[2])}</div>`);
}

let tipEl: HTMLDivElement | null = null;
let tipFor: Element | '3d' | null = null;
let tipPinned = false;
let dragging = false;
export function setDragging(on: boolean): void { dragging = on; if (on) hideTip(true); }
const cardOf = (el: Element) => (el as HTMLElement).dataset.h || (el as HTMLElement).dataset.c || '';
function ensure(): HTMLDivElement {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
  return tipEl;
}
function showTip(el: Element, pin: boolean): void {
  const c = cardOf(el); if (!c || !isItem(c)) return; const html = itemTip(c, (el as HTMLElement).dataset.note || ''); if (!html) return;
  const t = ensure(); t.innerHTML = html; t.dataset.c = ''; tipFor = el; tipPinned = pin; t.classList.add('show');
  const r = el.getBoundingClientRect(); const w = Math.min(300, window.innerWidth - 24); t.style.width = w + 'px';
  let x = r.left + r.width / 2 - w / 2; x = Math.max(12, Math.min(window.innerWidth - w - 12, x)); t.style.left = x + 'px';
  const th = t.offsetHeight; const top = el.classList.contains('hcard') ? Math.min(r.top, window.innerHeight - 200) : r.top;
  let y = top - th - 14; if (y < 12) y = r.bottom + 12; t.style.top = y + 'px';
}
export function hideTip(force = false): void { if (!tipEl) return; if (tipPinned && !force) return; tipEl.classList.remove('show'); tipFor = null; tipPinned = false; }
export function tip3d(c: Card | null, x = 0, y = 0): void {
  if (tipPinned && tipFor) return;
  if (!c) { if (tipFor === '3d') hideTip(true); return; }
  const html = itemTip(c); if (!html) return;
  const t = ensure(); if (t.dataset.c !== c) { t.innerHTML = html; t.dataset.c = c; }
  tipFor = '3d'; t.classList.add('show');
  const w = Math.min(300, window.innerWidth - 24); t.style.width = w + 'px'; const th = t.offsetHeight;
  const lx = Math.max(12, Math.min(window.innerWidth - w - 12, x + 18)); let ly = y - th - 18; if (ly < 12) ly = y + 24;
  t.style.left = lx + 'px'; t.style.top = ly + 'px';
}
/** 화면이 다시 그려져 툴팁 대상이 바뀌었으면 새 요소에 다시 붙인다 */
export function refreshTip(): void {
  if (!tipFor || tipFor === '3d' || document.body.contains(tipFor)) return;
  const c = cardOf(tipFor); const pinned = tipPinned; hideTip(true);
  setTimeout(() => { const el = document.querySelector(`.hcard[data-h="${c}"],.itemtray .mcard[data-h="${c}"]`); if (el && pinned) showTip(el, true); }, 0);
}

let bound = false;
export function bindTips(): void {
  if (bound) return; bound = true;
  const tgt = (e: Event) => (e.target as Element | null)?.closest?.('.hcard,.mcard') || null;
  document.addEventListener('pointerover', e => { if (dragging) { hideTip(true); return; } const el = tgt(e); if (el && isItem(cardOf(el)) && (!tipPinned || tipFor !== el)) showTip(el, false); });
  document.addEventListener('pointerout', e => { const el = tgt(e); if (el && el === tipFor && !tipPinned) hideTip(); });
  document.addEventListener('pointerdown', e => { if (tipPinned && !tgt(e)) hideTip(true); });
  document.addEventListener('focusin', e => { const el = tgt(e); if (el) showTip(el, false); });
  document.addEventListener('focusout', () => hideTip());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(true); });
  // 누르면 고정
  document.addEventListener('click', e => {
    const el = tgt(e); const c = el && cardOf(el);
    if (c && isItem(c)) { if (tipPinned && tipFor && tipFor !== '3d' && cardOf(tipFor) === c) hideTip(true); else showTip(el!, true); }
  });
}
