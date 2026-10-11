/* 방: 방장은 테이블 상태를 들고 행동을 판정하고, 참가자는 행동만 보낸다.
   메시지
   참가자 → 방장: hello{uid} · act{id, a} · time{id}
   방장 → 참가자: snap{data} · res{id, ok, error} · time{id, now} */
import { type Action, type GameState, type Result, advanceTimers, applyAction, newLobby } from '@cubic3/engine';
import type { ClientLink, HostLink, Transport } from './transport';

export interface Room {
  role: 'host' | 'client';
  code: string;
  /** 내 행동을 보낸다(방장은 바로 판정) */
  act(a: Action): Promise<Result>;
  /** 새 상태가 오면 부른다 */
  subscribe(f: (S: GameState) => void): () => void;
  /** 방장과 내 시계 차이(ms). 참가자만 */
  clockOffset: number;
  close(): void;
}

type CMsg = { t: 'hello'; uid: string } | { t: 'act'; id: number; a: Action } | { t: 'time'; id: number };
type HMsg = { t: 'snap'; data: GameState } | { t: 'res'; id: number; ok: boolean; error?: string } | { t: 'time'; id: number; now: number };

const LS = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 진행 */ } },
};
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const hostKey = (code: string) => 'c3-host-' + code;

/** 방장이었던 방인지 (새로고침해도 이어서 방장으로) */
export function wasHosting(code: string): boolean {
  return LS.get('c3-hosting') === code && !!LS.get(hostKey(code));
}

export async function hostRoom(net: Transport, code: string, myUid: string): Promise<Room> {
  let S: GameState = newLobby();
  const saved = LS.get(hostKey(code));
  if (saved) { try { S = JSON.parse(saved); } catch { /* 망가진 저장은 버린다 */ } }
  const subs = new Set<(S: GameState) => void>();
  const who = new Map<string, string>(); // 연결 → uid
  let link: HostLink | null = null;

  const publish = () => {
    LS.set(hostKey(code), JSON.stringify(S));
    const snap = clone(S);
    subs.forEach(f => f(clone(snap)));
    link?.broadcast({ t: 'snap', data: snap } satisfies HMsg);
  };
  const judge = (uid: string, a: Action): Result => {
    const r = applyAction(S, uid, a);
    if (r.ok) publish();
    return r;
  };

  link = await net.host(code, {
    onJoin: cid => link?.send(cid, { t: 'snap', data: S } satisfies HMsg),
    onLeave: cid => { who.delete(cid); },
    onMsg: (cid, raw) => {
      const m = raw as CMsg;
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello' && typeof m.uid === 'string') { who.set(cid, m.uid); return; }
      if (m.t === 'time') { link?.send(cid, { t: 'time', id: m.id, now: Date.now() } satisfies HMsg); return; }
      if (m.t === 'act') {
        const uid = who.get(cid);
        const r: Result = uid ? judge(uid, m.a) : { ok: false, error: '아직 연결 중이에요.' };
        link?.send(cid, { t: 'res', id: m.id, ok: r.ok, error: r.ok ? undefined : r.error } satisfies HMsg);
      }
    },
  });
  LS.set('c3-hosting', code);

  // 시간이 지난 단계(♠ 방어 유예 등)는 방장이 넘긴다
  const timer = setInterval(() => { if (advanceTimers(S)) { S.v = (S.v || 0) + 1; publish(); } }, 250);

  return {
    role: 'host', code, clockOffset: 0,
    act: async a => judge(myUid, a),
    subscribe: f => { subs.add(f); setTimeout(() => f(clone(S)), 0); return () => subs.delete(f); },
    close: () => { clearInterval(timer); link?.close(); },
  };
}

export async function joinRoom(net: Transport, code: string, myUid: string, onLost: () => void): Promise<Room> {
  let last: GameState | null = null;
  const subs = new Set<(S: GameState) => void>();
  const wait = new Map<number, (m: HMsg) => void>();
  let seq = 0;
  let link: ClientLink | null = null;

  link = await net.join(code, {
    onMsg: raw => {
      const m = raw as HMsg;
      if (m.t === 'snap') { last = m.data; subs.forEach(f => f(clone(m.data))); return; }
      const w = wait.get(m.id);
      if (w) { wait.delete(m.id); w(m); }
    },
    onClose: onLost,
  });
  const ask = (m: CMsg & { id: number }) => new Promise<HMsg>((res, rej) => {
    wait.set(m.id, res);
    link!.send(m);
    setTimeout(() => { if (wait.has(m.id)) { wait.delete(m.id); rej(new Error('timeout')); } }, 6000);
  });
  link.send({ t: 'hello', uid: myUid } satisfies CMsg);

  // 방장 시계에 맞춘다(몇 장이었지처럼 시간을 쓰는 미니게임용)
  let clockOffset = 0;
  try {
    const t0 = Date.now();
    const r = await ask({ t: 'time', id: ++seq });
    const t1 = Date.now();
    if (r.t === 'time') clockOffset = r.now + (t1 - t0) / 2 - t1;
  } catch { /* 맞추지 못해도 진행 */ }

  return {
    role: 'client', code, clockOffset,
    act: async a => {
      try {
        const r = await ask({ t: 'act', id: ++seq, a });
        return r.t === 'res' && r.ok ? { ok: true } : { ok: false, error: (r as { error?: string }).error || '지금은 할 수 없어요.' };
      } catch { return { ok: false, error: '방장에게서 답이 없어요. 잠시 뒤 다시 시도해 주세요.' }; }
    },
    subscribe: f => { subs.add(f); if (last) { const l = last; setTimeout(() => f(clone(l)), 0); } return () => subs.delete(f); },
    close: () => link?.close(),
  };
}
