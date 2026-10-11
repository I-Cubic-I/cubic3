/* 앱: 방에 연결한 뒤 테이블 장면과 화면 UI를 띄운다 */
import { useEffect, useState } from 'react';
import { setClock } from '@cubic3/engine';
import { type Room, hostRoom, joinRoom, wasHosting } from './net/room';
import { LocalNet, NetError, PeerNet, rid } from './net/transport';
import { useStore } from './store';
import { SceneView } from './scene/Scene';
import { Hud } from './ui/Hud';
import { Start } from './ui/Start';
import { bindTips } from './ui/tip';

const LS = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 진행 */ } },
};
const useLocal = new URLSearchParams(location.search).get('local') === '1';
let localUid: string | null = null;
/** 이 브라우저의 플레이어 id (같은 브라우저 탭 시험이면 탭마다 따로) */
function myId(): string {
  if (useLocal) return localUid || (localUid = 'p_' + rid(12));
  let u = LS.get('c3-uid'); if (!u) { u = 'p_' + rid(12); LS.set('c3-uid', u); } return u;
}

export function App() {
  const room = useStore(s => s.room);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [fontsOk, setFontsOk] = useState(false);
  useEffect(() => {
    bindTips();
    // 캔버스 글자(카드·디스크)가 대체 글꼴로 그려지지 않게 글꼴을 먼저 받는다
    Promise.race([
      Promise.all(["24px 'Black Han Sans'", "24px 'VT323'", "16px 'IBM Plex Sans KR'"].map(f => document.fonts.load(f))),
      new Promise(r => setTimeout(r, 3000)),
    ]).finally(() => setFontsOk(true));
  }, []);

  const connect = async (p: { create: boolean; code: string; name: string }) => {
    const net = useLocal ? LocalNet : PeerNet;
    const me = myId();
    const code = p.create ? rid(5) : p.code;
    // 같은 브라우저 시험(?local=1)은 탭끼리 저장소를 같이 써서, 방장 이어 하기를 쓰지 않는다
    const host = p.create || (!useLocal && wasHosting(code));
    setBusy(host ? '방을 여는 중…' : '방에 연결하는 중…');
    try {
      let r: Room;
      if (host) r = await hostRoom(net, code, me);
      else r = await joinRoom(net, code, me, () => useStore.getState().setFatal('방장과 연결이 끊겼어요. 방장이 창을 닫았을 수 있어요. 새로고침해서 다시 들어와 주세요.'));
      if (r.clockOffset) { const off = r.clockOffset; setClock(() => Date.now() + off); }
      const u = new URL(location.href); u.searchParams.set('room', code); history.replaceState(null, '', u);
      useStore.getState().setRoom(r, me, p.name);
      r.subscribe(S => useStore.getState().receive(S));
      setBusy(null);
    } catch (e) {
      console.error(e);
      if (host) LS.set('c3-hosting', '');
      setMsg(e instanceof NetError ? e.message : '연결하지 못했어요. 다시 시도해 주세요.');
      setBusy(null);
    }
  };

  return (
    <>
      {fontsOk && <SceneView />}
      {room ? <Hud /> : <Start msg={msg} busy={busy} onPick={connect} />}
    </>
  );
}
