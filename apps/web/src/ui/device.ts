/* 기기 감지: 손가락으로만 조작하는 기기(휴대폰·태블릿)에서는 키보드 단축키 표시를 숨긴다(사용자 2026-10-14).
   키보드·마우스가 하나라도 붙어 있으면(any-pointer: fine) 단축키를 보여 준다 */
const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);
const coarse = mq('(pointer: coarse)'), fine = mq('(any-pointer: fine)');
/** 단축키 표시를 숨길 기기인지 */
export const noKeys = (): boolean => !!coarse?.matches && !fine?.matches;
/** <html>에 no-keys 클래스(CSS가 kbd를 숨긴다). 기기 상태가 바뀌면 다시 */
export function bindDevice(): void {
  const f = () => document.documentElement.classList.toggle('no-keys', noKeys());
  f(); coarse?.addEventListener('change', f); fine?.addEventListener('change', f);
}
