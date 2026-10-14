/* 내 손패. 숫자(자원) 카드는 아래 가운데, 아이템(J·Q·K)은 왼쪽 아래에 따로 둔다.
   숫자 카드: 누르면 고르기, 끌면 테이블에 버리기·토큰 칸에 토큰.
   아이템: 지금 쓸 수 있는 것만 드러나 빛나고, 나머지는 살짝 나온 채 숨어 있다가 커서를 가까이 가져가면 올라온다.
   (규칙 설명 때는 ♣를 화면 가운데로 끌어 놓아 쓴다. 미니게임에서는 눌러서 쓴다) */
import { useEffect, useRef, useState } from 'react';
import { type Card, type GameState, R, RL, SUITS, SYM, U, canAct, cname, costFor, isItem } from '@cubic3/engine';
import { SUITCOL } from '../game';
import { cardScale } from './scale';
import { useStore } from '../store';
import { type Drop, cmd, dropCard, getWorld, toast } from '../flow';
import { Tok, handSort } from './bits';
import { setDragging } from './tip';
import { mgItemUse, useItemUp } from './MgPanel';

function dropZone(x: number, y: number): Drop {
  const el = document.elementFromPoint(x, y);
  if (el) {
    if (el.closest('.tray')) return { kind: 'tray' };
    const pl = el.closest('[data-plate]') as HTMLElement | null; if (pl) return { kind: 'seat', i: +pl.dataset.plate! };
  }
  const si = getWorld()?.seatAt(x, y); if (si != null) return { kind: 'seat', i: si };
  if (y > window.innerHeight - 170) return { kind: 'hand' };
  return { kind: 'table' };
}

/** 규칙 설명 때 ♣ 아이템을 놓았다: 화면 가운데 일정 범위에 놓아야 쓴다(가장자리는 무시) */
function dropClub(S: GameState, i: number, c: Card, x: number, y: number): void {
  if (U(c) !== 'C' || !isItem(c) || S.seats[i].front.length) return;
  if (Math.abs(x - window.innerWidth / 2) > window.innerWidth * .3 || Math.abs(y - window.innerHeight / 2) > window.innerHeight * .3) return;
  // 놓으면 바로 쓴다(컷신). ♣Q·♣K는 그다음 미니게임 선택 화면에서 고른다
  cmd('club', { c });
}

/** 아이템 카드를 드러낼지(show)·빛낼지(lit).
    규칙 설명: ♣만(이번 라운드에 아이템을 썼거나 누가 ♣로 고르는 중이면 숨김) / 내 메인 턴: 모두 드러내되 지금 쓸 수 있는 것만 빛남(♥J·♥K는 공격받을 때만) /
    공격받을 때: ♥J·♥K / 미니게임: 쓸 수 있을 때 모두 */
export function itemLook(S: GameState, i: number, c: Card): { show: boolean; lit: boolean } {
  const su = U(c), r = R(c);
  // 이번 라운드에 이미 아이템을 썼으면(앞에 놓인 카드가 있으면) ♣도 쓸 수 없으니 숨긴다
  if (S.phase === 'clubs') { const ok = su === 'C' && !S.seats[i].front.length && !S.clubChoose; return { show: ok, lit: ok }; }
  if (S.phase === 'main' && S.turn?.seat === i) {
    // 줍고 나서 버리기 전에도 ♠ 공격과 ♦Q·♦K(토큰과 함께)는 쓸 수 있다. 테이블에 놓아 쓰는 ♥Q·♦J는 버리기와 겹치니 버린 뒤에
    const t = S.turn; const can = t.picked && !t.item && !t.trim && !t.peek;
    const usable = su === 'S' || (!t.mustDiscard && ((su === 'H' && r === 12) || (su === 'D' && r === 11))) || (su === 'D' && r >= 12);
    return { show: true, lit: can && usable };
  }
  if (S.phase === 'defense' && S.pending?.target === i) { const ok = su === 'H' && (r === 11 || r === 13); return { show: ok, lit: ok }; }
  if (S.phase === 'mg') { const ok = mgItemUse(S, i).ok; return { show: ok, lit: ok }; }
  return { show: false, lit: false };
}

/** 끌기가 끝난 직후의 click을 삼킨다 */
let swallow = false;

export function Hand({ seat, kind = 'res' }: { seat: number; kind?: 'res' | 'item' }) {
  const S = useStore(s => s.S)!;
  const sel = useStore(s => s.sel);
  const toggleSel = useStore(s => s.toggleSel);
  const me = useStore(s => s.me); const uiMode = useStore(s => s.ui.mode);
  const seen = useRef(new Set<Card>());
  const [, force] = useState(0);
  const [near, setNear] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const items = kind === 'item';
  const h = handSort(S.seats[seat].hand).filter(c => isItem(c) === items); const n = h.length;
  // 카드 크기는 화면 크기에 비례(공통 UI 배율)
  const k = cardScale(); const cw = Math.round(118 * k), ch = Math.round(166 * k);
  // 숫자 손패는 왼쪽 아이템 손패와 오른쪽 토큰 칸 사이의 빈 곳 가운데에 놓는다(겹치지 않게)
  const nI = S.seats[seat].hand.filter(isItem).length;
  // 아이템 손패는 화면 폭의 30%를 넘지 않게 겹쳐 쌓는다
  const iStep = nI > 1 ? Math.min(cw * .62, (Math.max(cw * 1.6, window.innerWidth * .3) - cw) / (nI - 1)) : 0;
  const iW = nI ? cw + (nI - 1) * iStep : 0;
  const leftPad = items || !nI ? 0 : 24 + iW + 16;
  const rightPad = !items && !['mg', 'clubs'].includes(S.phase) && window.innerWidth > 720 ? 250 : 0;
  const avail = Math.max(cw * 2, window.innerWidth - leftPad - rightPad);
  const w = items ? iW : Math.min(860, avail);
  // 숫자 손패는 문양별 묶음 사이를 조금 띄운다
  const G = items ? 0 : cw * .22;
  const brk = (k: number) => !items && k > 0 && U(h[k]) !== U(h[k - 1]);
  const nb = h.reduce((a, _, k) => a + (brk(k) ? 1 : 0), 0);
  const step = items ? iStep : n > 1 ? Math.max(cw * .2, Math.min(cw * .82, (w - cw - 40 - nb * G) / (n - 1))) : 0;
  const xs: number[] = []; h.forEach((_, k) => xs.push(k ? xs[k - 1] + step + (brk(k) ? G : 0) : 0));
  const x0 = items ? 0 : w / 2 - cw / 2 - (xs[n - 1] || 0) / 2;
  // 지금 토큰을 만들 수 있는 문양: 그 묶음(쓰일 카드)을 빛내고 위에 버튼을 띄운다
  const tok: { su: string; cards: Card[] }[] = [];
  if (!items && !uiMode) {
    const cost = costFor(S, seat);
    for (const su of SUITS) {
      const cards = S.seats[seat].hand.filter(c => U(c) === su && !isItem(c)).sort((a, b) => R(a) - R(b)).slice(0, cost);
      if (cards.length === cost && !canAct(S, me, { type: 'token', seat, cards })) tok.push({ su, cards });
    }
  }
  const tokOf = (c: Card) => tok.find(g => g.cards.includes(c));
  const prevSeen = seen.current;
  useEffect(() => { seen.current = new Set(h); });
  useEffect(() => { const f = () => force(x => x + 1); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

  // 아이템 손패: 커서가 손패 자리(맨 아래 줄)에 닿으면 숨은 카드까지 올라오고, 손패 위에 있는 동안 머문다
  useEffect(() => {
    if (!items) return;
    const move = (e: PointerEvent) => {
      const el = box.current; if (!el || e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect(); const inX = e.clientX >= r.left && e.clientX <= r.right;
      const v = inX && e.clientY >= window.innerHeight - (near ? ch : 40);
      if (v !== near) setNear(v);
    };
    window.addEventListener('pointermove', move); return () => window.removeEventListener('pointermove', move);
  }, [items, near, ch]);

  const drag = useRef<{ c: Card; el: HTMLElement; x: number; y: number; on: boolean; g?: HTMLElement } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.on) {
        if (Math.hypot(dx, dy) < 10) return; d.on = true; setDragging(true);
        const g = d.el.cloneNode(true) as HTMLElement; g.classList.add('ghost'); g.classList.remove('new', 'sel'); g.style.transform = ''; document.body.appendChild(g); d.g = g;
        d.el.style.opacity = '.25'; document.body.classList.add('dragging');
      }
      d.g!.style.left = (e.clientX - d.el.offsetWidth / 2) + 'px'; d.g!.style.top = (e.clientY - d.el.offsetHeight / 2) + 'px';
      const z = dropZone(e.clientX, e.clientY);
      document.querySelectorAll<HTMLElement>('.dz').forEach(x => x.classList.toggle('hot', x.dataset.dz === z.kind));
      d.g!.classList.toggle('over', z.kind !== 'hand'); e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      const d = drag.current; drag.current = null; if (!d || !d.on) return;
      swallow = true; setTimeout(() => { swallow = false; }, 0);
      d.g?.remove(); d.el.style.opacity = ''; document.body.classList.remove('dragging'); setDragging(false);
      document.querySelectorAll('.dz.hot').forEach(x => x.classList.remove('hot'));
      const st = useStore.getState(); const S_ = st.S;
      if (S_?.phase === 'clubs') { if (st.ctl != null) dropClub(S_, st.ctl, d.c, e.clientX, e.clientY); return; }
      // 미니게임 아이템: 위로 충분히 끌어 올렸으면 쓴다
      if (S_?.phase === 'mg' && isItem(d.c)) { if (e.clientY < d.y - 70) useItemUp(S_, st.ctl, d.c); return; }
      dropCard(d.c, dropZone(e.clientX, e.clientY));
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  if (!n) return null;
  const press = (c: Card) => {
    if (swallow) { swallow = false; return; }
    // 미니게임 아이템은 누르면 쓴다. 그 밖에는 고르기
    // 미니게임 아이템은 위로 끌어 올려 쓴다(누르기만 하면 안내)
    if (items && S.phase === 'mg') { toast('아이템은 위로 끌어 올려 쓰세요'); return; }
    if (items && S.phase === 'clubs') return;
    toggleSel(c);
  };
  const iu = items && S.phase === 'mg' ? mgItemUse(S, seat) : null;
  const note = iu ? (iu.ok ? '위로 끌어 올려 쓰세요' + (iu.mode === 'pick' ? ' · 쓴 뒤 10초 안에 대상을 고르세요' : '') : iu.why) : undefined;
  return (
    <div ref={box} className={items ? 'ihand' : 'hand'} aria-label={items ? '내 아이템' : '내 손패'} style={items ? { width: w } : { left: leftPad + avail / 2, width: w }}>
      {h.map((c, k) => {
        const f = k - (n - 1) / 2; const s = sel.includes(c); const isNew = !prevSeen.has(c);
        const look = items ? itemLook(S, seat, c) : { show: true, lit: false };
        const hide = items && !look.show && !near && !s;
        const style = items
          ? { left: k * step, transform: `translateY(${hide ? ch - 52 : s ? -18 : 0}px) rotate(${f * 4}deg)`, zIndex: k + 1 }
          : { left: x0 + xs[k], transform: `translateY(${(s ? -26 : 0) + Math.abs(f) * 5}px) rotate(${f * (n > 7 ? 3.5 : 5)}deg)`, zIndex: k + 1, ...(tokOf(c) ? { '--tc': SUITCOL[U(c)] } : {}) } as React.CSSProperties;
        return (
          <div key={c} className={`hcard ${U(c)}${isItem(c) ? ' item' : ''}${look.lit ? ' lit' : ''}${tokOf(c) ? ' tokc' : ''}${s ? ' sel' : ''}${isNew ? ' new' : ''}`} data-h={c} data-note={note} tabIndex={0} role="button" aria-pressed={s} aria-label={cname(c)}
            style={style}
            onPointerDown={e => { if (e.button > 0) return; drag.current = { c, el: e.currentTarget, x: e.clientX, y: e.clientY, on: false }; }}
            onClick={() => press(c)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (items && S.phase === 'mg') useItemUp(S, seat, c); else press(c); } }}>
            <span className="rk">{RL(R(c))}</span><span className="su">{SYM[U(c)]}</span>{isItem(c) && <span className="tg">아이템</span>}
          </div>
        );
      })}
      {tok.map(g => {
        const ks = g.cards.map(c => h.indexOf(c)); const cx = x0 + ks.reduce((a, k) => a + xs[k], 0) / ks.length + cw / 2;
        return <button key={'t' + g.su} className="tokbtn" style={{ left: cx, '--tc': SUITCOL[g.su] } as React.CSSProperties} onClick={() => cmd('qtoken', { s: g.su })}>
          <Tok s={g.su} /> {SYM[g.su as 'S']} 토큰 만들기 · {g.cards.length}장</button>;
      })}
    </div>
  );
}
