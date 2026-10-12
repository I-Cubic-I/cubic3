/* 말 컬링 판(위에서 본 2D). 새총식 끌기로 튕긴다: 판 아래쪽(1번 구역 끝)을 누른 채 뒤로 당겼다 놓는다.
   연습(규칙 설명 시간, 내 화면에만)과 본 게임 조준에 함께 쓴다. 굴러가는 모습은 엔진과 같은 계산(curlRun)을 다시 돌려 그린다 */
import { useEffect, useRef, useState } from 'react';
import { CURL, type CurlShot, type CurlingMg, type Stone, curlRun, curlStartX } from '@cubic3/engine';
import { SEATCOL } from '../game';

type Live = { seat: number; x: number; y: number; out: boolean }[];
const PX = 10; // 1cm = 10px
const PAD = 14;
const PULLMAX = 12; // 이만큼(cm) 당기면 최대 세기

/** 직전 샷의 굴러가는 모습(프레임). 같은 샷이면 다시 계산하지 않는다 */
const cache = new Map<string, { frames: { t: number; st: Live }[]; secs: number }>();
export function curlFrames(m: CurlingMg): { frames: { t: number; st: Live }[]; secs: number } | null {
  const L = m.last; if (!L) return null; const key = `${m.end}:${L.n}`;
  let c = cache.get(key);
  if (!c) {
    const frames: { t: number; st: Live }[] = [];
    const r = curlRun(L.before, L.seat, L.shot, L.noWall, (t, st) => frames.push({ t, st }));
    c = { frames, secs: r.secs }; cache.clear(); cache.set(key, c);
  }
  return c;
}

export function CurlPad({ stones, mySeat, canShoot, noWall, onShot, anim, compact }: {
  stones: Stone[]; mySeat: number; canShoot: boolean; noWall?: boolean; onShot: (s: CurlShot) => void;
  /** 굴러가는 모습을 보여 줄 샷: 키가 바뀌면 처음부터 */
  anim?: { key: string; frames: { t: number; st: Live }[]; secs: number } | null; compact?: boolean;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x0: number; y0: number; x: number; y: number; sx: number } | null>(null);
  const [, force] = useState(0);
  const animT0 = useRef<{ key: string; t0: number } | null>(null);
  const { W, L, R } = CURL; const w = W * PX + PAD * 2, h = L * PX + PAD * 2 + 30;
  const bx = (x: number) => PAD + (x + W / 2) * PX, by = (y: number) => PAD + (L - y) * PX;

  useEffect(() => { if (anim && animT0.current?.key !== anim.key) animT0.current = { key: anim.key, t0: performance.now() }; }, [anim]);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = cv.current; if (!c) return; const g = c.getContext('2d')!; g.clearRect(0, 0, w, h);
      // 판: 1·2·3 구역
      [['#e9dfc8', 1], ['#e2d3b2', 2], ['#d9c596', 3]].forEach(([col, z], k) => { g.fillStyle = col as string; g.fillRect(bx(-W / 2), by((k + 1) * 10), W * PX, 10 * PX); g.fillStyle = 'rgba(80,60,30,.35)'; g.font = '700 34px "Black Han Sans",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(z), bx(0), by(k * 10 + 5)); });
      g.strokeStyle = 'rgba(80,60,30,.45)'; g.lineWidth = 1.5; [10, 20].forEach(y => { g.beginPath(); g.moveTo(bx(-W / 2), by(y)); g.lineTo(bx(W / 2), by(y)); g.stroke(); });
      // 끝 벽(게임 박스). 아이템을 쓰면 없다
      if (!noWall) { g.fillStyle = '#5b3b23'; g.fillRect(bx(-W / 2) - 6, by(L) - 8, W * PX + 12, 8); }
      else { g.setLineDash([5, 5]); g.strokeStyle = '#ff6b6b'; g.beginPath(); g.moveTo(bx(-W / 2), by(L) - 3); g.lineTo(bx(W / 2), by(L) - 3); g.stroke(); g.setLineDash([]); }
      // 말들: 굴러가는 중이면 그 프레임
      let list: Live = stones.map(s => ({ ...s, out: false }));
      if (anim && animT0.current?.key === anim.key && anim.frames.length) {
        const t = (performance.now() - animT0.current.t0) / 1000;
        if (t < anim.secs) { const f = anim.frames.find(x => x.t >= t) || anim.frames[anim.frames.length - 1]; list = f.st; }
      }
      list.forEach(s => { if (s.out) return; g.beginPath(); g.arc(bx(s.x), by(s.y), R * PX, 0, 7); g.fillStyle = SEATCOL[s.seat % 5]; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.45)'; g.stroke(); });
      // 조준: 출발 자리의 말과 당긴 방향의 반대쪽 화살표
      const d = drag.current;
      if (d) {
        const px = (d.x - d.x0) / PX, py = -(d.y - d.y0) / PX; const len = Math.min(PULLMAX, Math.hypot(px, py));
        g.beginPath(); g.arc(bx(d.sx), by(R), R * PX, 0, 7); g.fillStyle = SEATCOL[mySeat % 5]; g.fill();
        if (len > .3) {
          const ux = -px / Math.hypot(px, py), uy = -py / Math.hypot(px, py);
          g.strokeStyle = '#ffd36b'; g.lineWidth = 3; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(bx(d.sx), by(R)); g.lineTo(bx(d.sx + ux * len * 2), by(R + uy * len * 2)); g.stroke(); g.setLineDash([]);
          g.fillStyle = '#ffd36b'; g.font = '13px sans-serif'; g.textAlign = 'left'; g.fillText(`세기 ${Math.round(len / PULLMAX * 100)}%`, PAD, h - 12);
        }
      } else if (canShoot) { g.fillStyle = 'rgba(255,211,107,.9)'; g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillText('▲ 여기를 누른 채 아래로 당겼다 놓기', w / 2, h - 12); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  });

  const local = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * (w / r.width), y: (e.clientY - r.top) * (h / r.height) }; };
  const down = (e: React.PointerEvent) => {
    if (!canShoot) return; const p = local(e);
    // 판 아래쪽 절반쯤(1번 구역과 그 아래)에서만 잡는다
    if (p.y < by(12)) return;
    const sx = curlStartX(stones, (p.x - PAD) / PX - W / 2);
    drag.current = { x0: p.x, y0: p.y, x: p.x, y: p.y, sx }; (e.target as HTMLElement).setPointerCapture(e.pointerId); force(x => x + 1);
  };
  const move = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const p = local(e); d.x = p.x; d.y = p.y; };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    const px = (d.x - d.x0) / PX, py = -(d.y - d.y0) / PX; const len = Math.hypot(px, py);
    // 앞으로 밀었거나(뒤로 당기지 않음) 너무 조금 당기면 취소
    if (len < .6 || py > 0) return;
    onShot({ x: d.sx, angle: Math.atan2(-px, -py), power: Math.min(1, len / PULLMAX) });
  };
  return <canvas ref={cv} width={w} height={h} className={`curlpad${canShoot ? ' live' : ''}${compact ? ' compact' : ''}`}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} aria-label="말 컬링 판" />;
}

/** 규칙 설명 시간의 연습판: 내 화면에만 보이는 연습용 말을 자유롭게 튕겨 본다 */
export function CurlPractice({ seat }: { seat: number }) {
  const [stones, setStones] = useState<Stone[]>([]);
  const [anim, setAnim] = useState<{ key: string; frames: { t: number; st: Live }[]; secs: number } | null>(null);
  const [busy, setBusy] = useState(0);
  const shot = (s: CurlShot) => {
    const frames: { t: number; st: Live }[] = []; const r = curlRun(stones, seat, s, false, (t, st) => frames.push({ t, st }));
    const key = String(Math.random()); setAnim({ key, frames, secs: r.secs }); setBusy(performance.now() + r.secs * 1000);
    setTimeout(() => setStones(r.stones.length > 6 ? r.stones.slice(-6) : r.stones), r.secs * 1000);
  };
  const [open, setOpen] = useState(false);
  return <div className="scr-box curlprac">
    <span className="lbl">연습 · 나만 보여요</span>
    <div className="txt">시작 전에 말을 튕겨 볼 수 있어요. 다른 사람과 판에는 영향이 없어요.</div>
    <button className="readybtn" onClick={() => setOpen(true)}>연습하기</button>
    {open && <div className="curlmodal" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="inner">
        <div className="lbl">연습 · 판 아래쪽을 누른 채 뒤로 당겼다 놓기</div>
        <CurlPad stones={stones} mySeat={seat} canShoot={performance.now() >= busy} onShot={shot} anim={anim} />
        <div className="bigbtns"><button className="btn sm" onClick={() => { setStones([]); setAnim(null); }}>말 치우기</button><button className="btn sm primary" onClick={() => setOpen(false)}>닫기</button></div>
      </div>
    </div>}
  </div>;
}
