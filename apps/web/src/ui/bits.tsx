/* 작은 공용 조각: 카드, 아이콘, 이름 */
import type { ReactNode } from 'react';
import { type Card, type GameState, R, RL, SYM, U, cname, isItem } from '@cubic3/engine';
import { seatName } from '../game';

export const ICON = {
  list: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9" /></svg>,
  top: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>,
  eye: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /></svg>,
};

/** 작은 카드. data-c가 있으면 아이템 툴팁 대상 */
export function MCard({ c, cls = '', onClick, hand = false, ...rest }: { c: Card | null; cls?: string; onClick?: () => void; hand?: boolean } & Record<string, unknown>) {
  if (!c) return <div className={`mcard back${cls ? ' ' + cls : ''}`} {...rest}>?</div>;
  const data = hand ? { 'data-h': c } : { 'data-c': c };
  const clickable = !!onClick;
  // #hud 아래는 기본으로 클릭이 꺼져 있다. 누를 수 있는 카드는 data-a로 켠다
  return (
    <div className={`mcard ${U(c)}${cls ? ' ' + cls : ''}`} title={isItem(c) ? '' : cname(c)} {...data} {...(clickable ? { 'data-a': '1' } : {})} {...rest}
      onClick={onClick} tabIndex={clickable ? 0 : undefined} role={clickable ? 'button' : undefined}
      onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}>
      {RL(R(c))}<small>{SYM[U(c)]}</small>
    </div>
  );
}

export const handSort = (h: Card[]) => h.slice().sort((a, b) => (U(a) > U(b) ? 1 : U(a) < U(b) ? -1 : R(a) - R(b)));
export const Nm = ({ S, i }: { S: GameState; i: number }) => <>{seatName(S, i)}</>;
export const names = (S: GameState, is: number[]) => is.map(i => seatName(S, i)).join(' · ');
export const Tok = ({ s }: { s: string }) => <span className={`tok ${s}`} />;
export const Btn = ({ children, cls = '', ...p }: { children: ReactNode; cls?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
  <button className={`btn${cls ? ' ' + cls : ''}`} {...p}>{children}</button>;
