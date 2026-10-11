/* 내 손패: 누르면 고르기, 끌면 테이블에 버리기·토큰 칸에 토큰·상대에게 공격 */
import { useEffect, useRef, useState } from 'react';
import { type Card, R, RL, SYM, U, cname, isItem } from '@cubic3/engine';
import { useStore } from '../store';
import { type Drop, dropCard, getWorld } from '../flow';
import { handSort } from './bits';
import { setDragging } from './tip';

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

/** 끌기가 끝난 직후의 click을 삼킨다 */
let swallow = false;

export function Hand({ seat }: { seat: number }) {
  const S = useStore(s => s.S)!;
  const sel = useStore(s => s.sel);
  const toggleSel = useStore(s => s.toggleSel);
  const seen = useRef(new Set<Card>());
  const [, force] = useState(0);
  const h = handSort(S.seats[seat].hand); const n = h.length;
  const w = Math.min(860, window.innerWidth); const cw = window.innerWidth <= 720 ? 84 : 118;
  const step = n > 1 ? Math.min(cw * .82, (w - cw - 40) / (n - 1)) : 0;
  const prevSeen = seen.current;
  useEffect(() => { seen.current = new Set(h); });
  useEffect(() => { const f = () => force(x => x + 1); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);

  const drag = useRef<{ c: Card; el: HTMLElement; x: number; y: number; on: boolean; g?: HTMLElement } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.on) {
        if (Math.hypot(dx, dy) < 10) return; d.on = true; setDragging(true);
        const g = d.el.cloneNode(true) as HTMLElement; g.classList.add('ghost'); g.classList.remove('new', 'sel'); document.body.appendChild(g); d.g = g;
        d.el.style.opacity = '.25'; document.body.classList.add('dragging');
      }
      d.g!.style.left = (e.clientX - 59) + 'px'; d.g!.style.top = (e.clientY - 83) + 'px';
      const z = dropZone(e.clientX, e.clientY);
      document.querySelectorAll<HTMLElement>('.dz').forEach(x => x.classList.toggle('hot', x.dataset.dz === z.kind));
      d.g!.classList.toggle('over', z.kind !== 'hand'); e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      const d = drag.current; drag.current = null; if (!d || !d.on) return;
      swallow = true; setTimeout(() => { swallow = false; }, 0);
      d.g?.remove(); d.el.style.opacity = ''; document.body.classList.remove('dragging'); setDragging(false);
      document.querySelectorAll('.dz.hot').forEach(x => x.classList.remove('hot'));
      dropCard(d.c, dropZone(e.clientX, e.clientY));
    };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  return (
    <div className="hand" aria-label="내 손패">
      {h.map((c, k) => {
        const f = k - (n - 1) / 2; const s = sel.includes(c); const isNew = !prevSeen.has(c);
        return (
          <div key={c} className={`hcard ${U(c)}${isItem(c) ? ' item' : ''}${s ? ' sel' : ''}${isNew ? ' new' : ''}`} data-h={c} tabIndex={0} role="button" aria-pressed={s} aria-label={cname(c)}
            style={{ left: w / 2 - cw / 2 + f * step, transform: `translateY(${(s ? -26 : 0) + Math.abs(f) * 5}px) rotate(${f * (n > 7 ? 3.5 : 5)}deg)`, zIndex: k + 1 }}
            onPointerDown={e => { if (e.button > 0) return; drag.current = { c, el: e.currentTarget, x: e.clientX, y: e.clientY, on: false }; }}
            onClick={() => { if (swallow) { swallow = false; return; } toggleSel(c); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSel(c); } }}>
            <span className="rk">{RL(R(c))}</span><span className="su">{SYM[U(c)]}</span>{isItem(c) && <span className="tg">아이템</span>}
          </div>
        );
      })}
    </div>
  );
}
