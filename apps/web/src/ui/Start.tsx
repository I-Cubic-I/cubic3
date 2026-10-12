/* 메인 화면: 왼쪽에 로고와 메뉴(방 만들기·들어가기·꾸미기·설정), 오른쪽에는 테이블이 보인다 */
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { LogoSlot } from './CubicLogo';
import { CustomizePanel, MI, SettingsPanel } from './Options';
import { usePrefs } from '../prefs';
import { MG, type MgId } from '@cubic3/engine';

export const roomFromUrl = () => (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

type View = 'main' | 'custom' | 'settings' | 'mgdev';

export function Start({ msg, busy, onPick, onDevMg }: { msg: string; busy: string | null; onPick: (p: { create: boolean; code: string; name: string }) => void; onDevMg?: (id: MgId) => void }) {
  const urlCode = roomFromUrl();
  const name = usePrefs(s => s.name);
  // 방 링크로 왔는데 이름이 없으면 꾸미기(이름)부터
  // 미니게임 미리보기를 마치고 돌아왔으면 미리보기 선택 화면으로
  const devBack = useStore(s => s.devBack);
  const [view, setView] = useState<View>(() => devBack ? 'mgdev' : urlCode && !name.trim() ? 'custom' : 'main');
  useEffect(() => { if (devBack) { setView('mgdev'); useStore.getState().set({ devBack: false }); } }, [devBack]);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [nameErr, setNameErr] = useState(() => urlCode && !name.trim() ? `이름을 정하고 돌아가면 ${urlCode} 방에 들어갈 수 있어요` : '');

  const go = (create: boolean, c: string) => {
    const nm = name.trim();
    // 이름이 없으면 꾸미기에서 먼저 정한다
    if (!nm) { setNameErr('방에 들어가기 전에 이름을 정해 주세요'); setView('custom'); return; }
    const cc = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!create && !cc) { setErr('방 코드를 적어 주세요'); return; }
    setErr(''); onPick({ create, code: cc, name: nm });
  };
  const back = () => { setView('main'); setNameErr(''); };
  const notice = err || msg;

  return (
    <div className="menu">
      <div className="menuside">
        <h1 className="logo3d menulogo"><LogoSlot size={120} /><sup>3</sup></h1>
        {view === 'custom' ? <CustomizePanel onBack={back} err={name.trim() ? '' : nameErr} />
          : view === 'settings' ? <SettingsPanel onBack={back} />
          : view === 'mgdev' && onDevMg && !busy ? <div className="optpanel">
            <div className="opthead"><button className="iconbtn" aria-label="뒤로" onClick={back}>{MI.back}</button><h2>미니게임 미리보기</h2></div>
            <p className="optnote" style={{ marginTop: 0 }}>개발 서버 전용 · 내 자리 3개, 아이템을 쥔 채로 규칙 설명부터 시작해요. 위의 "자리 1·2·3"으로 조종할 자리를 바꿔요.</p>
            <div className="menulist" style={{ marginTop: 8 }}>{(Object.keys(MG) as MgId[]).map(id => <button key={id} className="mbtn" onClick={() => onDevMg(id)}>{MG[id].name}</button>)}</div>
          </div>
          : busy ? <p className="menubusy" role="status">{busy}</p>
          : <nav className="menulist" aria-label="메인 메뉴">
            <button className="profile" onClick={() => setView('custom')}>
              <span className="pdot" aria-hidden="true" />
              {name.trim() ? <strong>{name}</strong> : <span className="pnone">이름 정하기</span>}
            </button>
            {notice && <div className="menunotice" role="alert">{notice}</div>}
            {urlCode ? <>
              <button className="mbtn primary" onClick={() => go(false, urlCode)}>{MI.door}{urlCode} 방 들어가기</button>
              <button className="mbtn" onClick={() => go(true, '')}>{MI.plus}새 방 만들기</button>
            </> : <>
              <button className="mbtn primary" onClick={() => go(true, '')}>{MI.plus}방 만들기</button>
              <button className="mbtn" aria-expanded={joining} onClick={() => setJoining(j => !j)}>{MI.door}방 코드로 들어가기</button>
              {joining && <div className="joinrow">
                <input maxLength={6} placeholder="방 코드" aria-label="방 코드" autoFocus value={code} onChange={e => { setCode(e.target.value); setErr(''); }} onKeyDown={e => { if (e.key === 'Enter') go(false, code); }} />
                <button className="btn" onClick={() => go(false, code)}>들어가기</button>
              </div>}
            </>}
            <button className="mbtn" onClick={() => setView('custom')}>{MI.palette}꾸미기</button>
            <button className="mbtn" onClick={() => setView('settings')}>{MI.gear}설정</button>
            {onDevMg && <button className="mbtn" onClick={() => setView('mgdev')}>미니게임 미리보기 (개발용)</button>}
            <p className="menufoot">방을 만든 사람의 브라우저가 테이블을 들고 있어요. 방장이 창을 닫으면 게임이 멈추고, 다시 열면 이어서 할 수 있어요.</p>
          </nav>}
      </div>
    </div>
  );
}
