/* 연결 계층. 방장 1명에게 참가자들이 직접 붙는다.
   중개: PeerJS 공개 서버. 같은 브라우저 시험(?local=1)은 BroadcastChannel. */
import Peer, { type DataConnection } from 'peerjs';

export interface HostLink {
  send(cid: string, msg: unknown): void;
  broadcast(msg: unknown): void;
  close(): void;
}
export interface HostHandlers {
  onJoin(cid: string): void;
  onMsg(cid: string, msg: unknown): void;
  onLeave(cid: string): void;
}
export interface ClientLink {
  send(msg: unknown): void;
  close(): void;
}
export interface ClientHandlers {
  onMsg(msg: unknown): void;
  onClose(): void;
}
export interface Transport {
  host(code: string, h: HostHandlers): Promise<HostLink>;
  join(code: string, h: ClientHandlers): Promise<ClientLink>;
}

const PREFIX = 'cubic3-v2-';
export const rid = (n: number): string => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};

/** 연결 실패 이유 */
export class NetError extends Error {
  constructor(public kind: 'taken' | 'notfound' | 'network' | 'other', message: string) { super(message); }
}

type LocalMsg = { to: string; from?: string; hello?: 1; bye?: 1; msg?: unknown };

export const LocalNet: Transport = {
  host(code, h) {
    const ch = new BroadcastChannel('c3-' + code);
    const peers = new Set<string>();
    ch.onmessage = e => {
      const m = e.data as LocalMsg;
      if (m.to !== 'host' || !m.from) return;
      if (m.hello) { peers.add(m.from); h.onJoin(m.from); return; }
      if (m.bye) { peers.delete(m.from); h.onLeave(m.from); return; }
      h.onMsg(m.from, m.msg);
    };
    return Promise.resolve({
      send: (cid, msg) => ch.postMessage({ to: cid, msg }),
      broadcast: msg => peers.forEach(cid => ch.postMessage({ to: cid, msg })),
      close: () => ch.close(),
    });
  },
  join(code, h) {
    const ch = new BroadcastChannel('c3-' + code);
    const me = 'c_' + rid(8);
    ch.onmessage = e => { const m = e.data as LocalMsg; if (m.to === me) h.onMsg(m.msg); };
    ch.postMessage({ to: 'host', from: me, hello: 1 });
    window.addEventListener('beforeunload', () => ch.postMessage({ to: 'host', from: me, bye: 1 }));
    return Promise.resolve({ send: msg => ch.postMessage({ to: 'host', from: me, msg }), close: () => ch.close() });
  },
};

function toNetError(e: unknown): NetError {
  const t = (e as { type?: string })?.type;
  if (t === 'unavailable-id') return new NetError('taken', '그 방 코드는 이미 쓰이고 있어요. 새 방을 만들어 주세요.');
  if (t === 'peer-unavailable' || t === 'timeout') return new NetError('notfound', '방을 찾지 못했어요. 코드를 확인하거나, 방장이 창을 열어 두었는지 확인해 주세요.');
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return new NetError('network', '연결 서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.');
  return new NetError('other', '연결하지 못했어요. 다시 시도해 주세요.');
}

export const PeerNet: Transport = {
  host(code, h) {
    return new Promise((res, rej) => {
      const peer = new Peer(PREFIX + code);
      const conns = new Map<string, DataConnection>();
      let opened = false;
      peer.on('open', () => {
        opened = true;
        res({
          send: (cid, msg) => { const c = conns.get(cid); if (c?.open) c.send(msg); },
          broadcast: msg => conns.forEach(c => { if (c.open) c.send(msg); }),
          close: () => peer.destroy(),
        });
      });
      peer.on('error', e => { if (!opened) rej(toNetError(e)); });
      peer.on('connection', c => {
        c.on('open', () => { conns.set(c.peer, c); h.onJoin(c.peer); });
        c.on('data', m => h.onMsg(c.peer, m));
        c.on('close', () => { conns.delete(c.peer); h.onLeave(c.peer); });
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* 다시 시도하지 못하면 그대로 둔다 */ } });
    });
  },
  join(code, h) {
    return new Promise((res, rej) => {
      const peer = new Peer();
      let done = false;
      peer.on('error', e => { if (!done) rej(toNetError(e)); else h.onClose(); });
      peer.on('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true });
        const to = setTimeout(() => { if (!done) rej(toNetError({ type: 'timeout' })); }, 12000);
        c.on('open', () => { done = true; clearTimeout(to); res({ send: m => { if (c.open) c.send(m); }, close: () => peer.destroy() }); });
        c.on('data', m => h.onMsg(m));
        c.on('close', () => h.onClose());
      });
    });
  },
};
