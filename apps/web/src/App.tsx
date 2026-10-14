/* 앱: 방에 연결한 뒤 테이블 장면과 화면 UI를 띄운다 */
import { usePerf } from './scene/perf';
import { useEffect, useState } from 'react';
import { setClock } from '@cubic3/engine';
import { type Room, clearHostMark, hostMarkPerTab, hostRoom, joinRoom, wasHosting } from './net/room';
import { LocalNet, NetError, PeerNet, rid } from './net/transport';
import { useStore } from './store';
import { exitRoom } from './flow';
import { SceneView } from './scene/Scene';
import { ArenaView } from './arena/ArenaView';
import { Hud } from './ui/Hud';
import { Start, roomFromUrl } from './ui/Start';
import { prefs } from './prefs';
import type { MgId } from '@cubic3/engine';
import { bindTips } from './ui/tip';
import { startBrand } from './ui/brand';
import { LogoHost } from './ui/CubicLogo';

const LS = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 진행 */ } },
};
const useLocal = new URLSearchParams(location.search).get('local') === '1';
if (useLocal) hostMarkPerTab();
let autoJoined = false; // 개발 모드에서 효과가 두 번 돌아도 한 번만
/** 이 브라우저의 플레이어 id (같은 브라우저 탭 시험이면 탭마다 따로, 새로고침해도 같은 id) */
function myId(): string {
  if (useLocal) {
    let u: string | null = null; try { u = sessionStorage.getItem('c3-uid'); } catch { /* 없으면 새로 */ }
    if (!u) { u = 'p_' + rid(12); try { sessionStorage.setItem('c3-uid', u); } catch { /* 저장 못 해도 진행 */ } }
    return u;
  }
  let u = LS.get('c3-uid'); if (!u) { u = 'p_' + rid(12); LS.set('c3-uid', u); } return u;
}

export function App() {
  const room = useStore(s => s.room);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [fontsOk, setFontsOk] = useState(false);
  useEffect(() => {
    bindTips(); startBrand();
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
    // 새로고침한 방장은 이어서 방장으로 연다
    const host = p.create || wasHosting(code);
    setBusy(host ? '방을 여는 중…' : '방에 연결하는 중…');
    try {
      let r: Room;
      // 내가 나간 뒤(또는 다른 방으로 옮긴 뒤) 끊긴 것은 알리지 않는다
      const join = () => joinRoom(net, code, me, () => useStore.getState().room?.code === code && useStore.getState().setFatal('방장과 연결이 끊겼어요. 방장이 창을 닫았을 수 있어요. 새로고침해서 다시 들어와 주세요.'));
      if (host) {
        // 새로고침 직후에는 중계 서버가 예전 방장 연결을 아직 쥐고 있어 방 코드가 '쓰는 중'일 수 있다. 잠깐씩 기다려 다시 연다
        let tries = p.create ? 1 : 5;
        for (;;) {
          try { r = await hostRoom(net, code, me); break; }
          catch (e) {
            if (p.create || !(e instanceof NetError && e.kind === 'taken')) throw e;
            // 끝내 안 되면 다른 탭에서 이미 열고 있는 것: 참가자로 들어간다
            if (--tries <= 0) { r = await join(); break; }
            await new Promise(res => setTimeout(res, 1200));
          }
        }
      } else r = await join();
      if (r.clockOffset) { const off = r.clockOffset; setClock(() => Date.now() + off); }
      const u = new URL(location.href); u.searchParams.set('room', code); history.replaceState(null, '', u);
      useStore.getState().setRoom(r, me, p.name);
      r.subscribe(S => useStore.getState().receive(S));
      r.onPings(m => useStore.getState().set({ pings: m }));
      setBusy(null);
    } catch (e) {
      console.error(e);
      if (p.create) clearHostMark();
      setMsg(e instanceof NetError ? e.message : '연결하지 못했어요. 다시 시도해 주세요.');
      setBusy(null);
    }
  };

  // 개발 서버 전용: 미니게임 미리보기(시험 방을 내 자리 3개로 열어 고른 미니게임으로)
  const devPreview = async (id: MgId, go = false) => {
    const me = myId(); const name = prefs().name.trim() || '나';
    setBusy('미리보기 준비 중…');
    try {
      const r = await hostRoom(LocalNet, rid(5), me);
      useStore.getState().setRoom(r, me, name); useStore.getState().set({ autoSit: false, devPreview: true });
      r.subscribe(S => useStore.getState().receive(S));
      const { setupMgPreview } = await import('./devmg');
      await setupMgPreview(r, id, name, go);
      await (await import('./devmg')).devTools();
    } catch (e) { console.error(e); setMsg('미리보기를 열지 못했어요.'); }
    setBusy(null);
  };

  // 미리보기는 미니게임이 끝나면 보상 없이 바로 미니게임 선택 화면으로 돌아간다
  // (순위 결과 화면이 뜨면 그걸 닫은 뒤에)
  useEffect(() => {
    let leaving = false;
    const leave = () => { leaving = false; setTimeout(() => { void exitRoom().then(() => useStore.getState().set({ devBack: true })); }, 400); };
    return useStore.subscribe((s, p) => {
      if (s.devPreview && s.S && p.S?.phase === 'mg' && s.S.phase !== 'mg') {
        useStore.getState().set({ devPreview: false }); leaving = true;
        // 결과 화면이 뜰 틈을 두고(앞선 연출이 끝나야 뜬다), 안 떴으면 나간다
        const wait = (n: number) => setTimeout(() => { if (!leaving || useStore.getState().results) return; if (n > 0) wait(n - 1); else leave(); }, 300);
        wait(40);
      } else if (leaving && p.results && !s.results) leave();
    });
  }, []);

  // 개발 서버 전용: ?mg=미니게임id 로 열면 그 미니게임 미리보기로 바로(&go=1 이면 규칙 설명도 건너뛴다)
  useEffect(() => {
    const q = new URLSearchParams(location.search); const id = q.get('mg') as MgId | null;
    if (!import.meta.env.DEV || !id || autoJoined) return;
    autoJoined = true; void devPreview(id, q.get('go') === '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 방 링크(?room=코드)로 열면 바로 들어간다. 이름을 아직 안 정했으면 메인 화면에서 이름부터 정한다
  useEffect(() => {
    const code = roomFromUrl(), name = prefs().name.trim();
    if (!code || !name || autoJoined) return;
    autoJoined = true; void connect({ create: false, code, name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {fontsOk && <SceneView />}
      {fontsOk && room && <ArenaView />}
      {room ? <Hud /> : <Start msg={msg} busy={busy} onPick={connect} onDevMg={import.meta.env.DEV ? devPreview : undefined} />}
      {/* 로고는 하나만: 시작 화면·로비의 자리를 따라다녀 화면이 바뀌어도 끊기지 않는다 */}
      {fontsOk && <LogoHost />}
      <GpuWarn />
      {/* 휴대폰은 가로 화면 전용: 세로로 들면 돌려 달라고 덮는다 */}
      <div className="rotate" role="alert"><div className="rotphone" aria-hidden="true" /><p>휴대폰을 가로로 돌려 주세요</p><span>Cubic³는 가로 화면에서 즐길 수 있어요</span></div>
    </>
  );
}

/** 그래픽 가속이 꺼져 있으면(소프트웨어로 그리는 중) 켜 달라고 안내한다 */
function GpuWarn() {
  const soft = usePerf(s => s.software); const closed = usePerf(s => s.warnClosed);
  if (!soft || closed) return null;
  return <div className="gpuwarn" role="alert">
    <b>그래픽 가속이 꺼져 있는 것 같아요</b>
    <span>그래서 화면이 계속 끊길 수 있어요. 품질을 "낮음"으로 바꿔 두었어요. 크롬이면 설정 → 시스템 → "가능한 경우 그래픽 가속 사용"을 켜고 브라우저를 다시 시작해 주세요.</span>
    <button className="btn sm" onClick={() => usePerf.setState({ warnClosed: true })}>닫기</button>
  </div>;
}
