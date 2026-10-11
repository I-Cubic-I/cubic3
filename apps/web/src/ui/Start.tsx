/* 시작 화면: 이름, 방 만들기 / 들어가기 */
import { useState } from 'react';

const LS = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 진행 */ } },
};
export const myName = () => LS.get('c3-name') || '';
export const roomFromUrl = () => (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export type StartPick = { host: boolean; code: string } | { host: false; code: string };

export function Start({ msg, busy, onPick }: { msg: string; busy: string | null; onPick: (p: { create: boolean; code: string; name: string }) => void }) {
  const urlCode = roomFromUrl();
  const [name, setName] = useState(myName());
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  if (busy) return <div className="p2pstart"><div className="panel lobby"><h1>Cubic³</h1><p>{busy}</p></div></div>;
  const go = (create: boolean, c: string) => {
    const nm = name.trim(); if (!nm) { setErr('이름을 적어 주세요'); return; }
    LS.set('c3-name', nm);
    const cc = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!create && !cc) { setErr('방 코드를 적어 주세요'); return; }
    onPick({ create, code: cc, name: nm });
  };
  const notice = err || msg;
  return (
    <div className="p2pstart">
      <div className="panel lobby">
        <h1>Cubic³</h1>
        <p>방을 만들면 링크가 생겨요. 친구에게 링크를 보내면 같은 테이블에 앉을 수 있어요.</p>
        <label className="fld"><span>내 이름</span><input maxLength={12} value={name} onChange={e => setName(e.target.value)} placeholder="이름" autoComplete="nickname" /></label>
        {notice && <div className="notice" style={{ position: 'static', transform: 'none', margin: '8px 0' }}>{notice}</div>}
        <div className="btnrow" style={{ marginTop: 12 }}>
          {urlCode ? <>
            <button className="btn primary" onClick={() => go(false, urlCode)}>{urlCode} 방 들어가기</button>
            <button className="btn" onClick={() => go(true, '')}>새 방 만들기</button>
          </> : <button className="btn primary" onClick={() => go(true, '')}>방 만들기</button>}
        </div>
        {!urlCode && <div className="btnrow" style={{ marginTop: 10 }}>
          <input maxLength={6} placeholder="방 코드" style={{ width: 120, textTransform: 'uppercase' }} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(false, code); }} />
          <button className="btn" onClick={() => go(false, code)}>들어가기</button>
        </div>}
        <p style={{ marginTop: 14, fontSize: 12 }}>방을 만든 사람의 브라우저가 테이블을 들고 있어요. 방장이 창을 닫으면 게임이 멈추고, 다시 열면 이어서 할 수 있어요.</p>
      </div>
    </div>
  );
}
