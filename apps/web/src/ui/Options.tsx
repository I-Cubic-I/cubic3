/* 꾸미기·설정 화면 (메인 화면 왼쪽 메뉴 자리, 게임 중에는 설정만 오른쪽 위에 겹쳐 연다) */
import { usePerf } from '../scene/perf';
import { useEffect, useRef, type ReactNode } from 'react';
import { CARD_BACKS, drawCardBack } from '../scene/cardBacks';
import { FELTS, type Quality, usePrefs } from '../prefs';

export const MI = {
  plus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  door: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M3 12h11M10 8l4 4-4 4" /></svg>,
  palette: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3A1.4 1.4 0 0 1 12 21z" /><circle cx="7.5" cy="11" r="1.2" fill="currentColor" /><circle cx="11" cy="7.5" r="1.2" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" /></svg>,
  gear: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>,
  x: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
};

function Head({ title, onBack, close = false }: { title: string; onBack: () => void; close?: boolean }) {
  return (
    <div className="opthead">
      {!close && <button className="iconbtn" aria-label="뒤로" onClick={onBack}>{MI.back}</button>}
      <h2>{title}</h2>
      {close && <button className="iconbtn" aria-label="닫기" onClick={onBack}>{MI.x}</button>}
    </div>
  );
}
function Sec({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <section className="optsec"><h3>{title}</h3>{children}{note && <p className="optnote">{note}</p>}</section>;
}

function BackThumb({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    // 큰 캔버스 크기로 그리고 CSS로 줄인다(테이블 카드와 같은 그림)
    drawCardBack(id, c.getContext('2d')!, c.width, c.height);
  }, [id]);
  return <canvas ref={ref} width={256} height={358} />;
}

export function CustomizePanel({ onBack, err }: { onBack: () => void; err?: string }) {
  const p = usePrefs();
  return (
    <div className="optpanel">
      <Head title="꾸미기" onBack={onBack} />
      <div className="optbody">
        <Sec title="이름">
          <input className="optinput" maxLength={12} value={p.name} onChange={e => p.set({ name: e.target.value })} placeholder="방장" autoComplete="nickname" aria-invalid={!!err} autoFocus={!!err} />
          {err && <p className="opterr" role="alert">{err}</p>}
        </Sec>
        <Sec title="카드 뒷면" note="내 화면에서만 바뀌어요.">
          <div className="backgrid">
            {CARD_BACKS.map(b => (
              <button key={b.id} className={`backopt${p.cardBack === b.id ? ' on' : ''}`} aria-pressed={p.cardBack === b.id} onClick={() => p.set({ cardBack: b.id })}>
                <BackThumb id={b.id} /><span>{b.label}</span>
              </button>
            ))}
          </div>
        </Sec>
        <Sec title="테이블 천" note="내 화면에서만 바뀌어요.">
          <div className="feltrow">
            {FELTS.map(f => (
              <button key={f.id} className={`feltopt${p.felt === f.id ? ' on' : ''}`} aria-pressed={p.felt === f.id} onClick={() => p.set({ felt: f.id })}>
                <span className="sw" style={{ background: f.color }} /><span>{f.label}</span>
              </button>
            ))}
          </div>
        </Sec>
        <Sec title="준비 중">
          <div className="soon"><span>플레이어 꾸미기</span><span>큐빅·주사위 스킨</span></div>
        </Sec>
      </div>
    </div>
  );
}

const QUAL: [Quality, string][] = [['low', '낮음'], ['mid', '보통'], ['high', '높음']];
const VOLS: ['master' | 'sfx' | 'music', string][] = [['master', '전체'], ['sfx', '효과음'], ['music', '음악']];

export function SettingsPanel({ onBack, close = false }: { onBack: () => void; close?: boolean }) {
  const p = usePrefs(); const perf = usePerf();
  return (
    <div className="optpanel">
      <Head title="설정" onBack={onBack} close={close} />
      <div className="optbody">
        <Sec title="소리" note="지금은 눈치 게임의 효과음(종소리·미끼 소리)에 쓰여요.">
          {VOLS.map(([k, label]) => (
            <label key={k} className="volrow">
              <span>{label}</span>
              <input type="range" min={0} max={100} step={1} value={p.vol[k]} onChange={e => p.set({ vol: { ...p.vol, [k]: +e.target.value } })} />
              <span className="val">{p.vol[k]}</span>
            </label>
          ))}
        </Sec>
        <Sec title="그래픽 품질" note="버벅이면 낮춰 보세요. 테이블과 로고를 그리는 해상도가 줄어요.">
          <div className="seg" role="group" aria-label="그래픽 품질">
            {QUAL.map(([q, label]) => <button key={q} className={p.quality === q ? 'on' : ''} aria-pressed={p.quality === q} onClick={() => p.set({ quality: q })}>{label}</button>)}
          </div>
        </Sec>
        <Sec title="자동 품질 조절" note={`화면이 끊기면 그리는 해상도를 저절로 낮추고, 넉넉해지면 다시 올려요(위 품질이 최대). 지금 ×${perf.dpr}`}>
          <label className="togrow">
            <span>끊기면 저절로 낮추기</span>
            <input type="checkbox" role="switch" className="tog" checked={p.autoQuality} onChange={e => p.set({ autoQuality: e.target.checked })} />
          </label>
        </Sec>
        <Sec title="움직임 줄이기">
          <label className="togrow">
            <span>화면 흔들림을 끄고, 로고 회전과 화면 전환 효과를 줄여요</span>
            <input type="checkbox" role="switch" className="tog" checked={p.reduceMotion} onChange={e => p.set({ reduceMotion: e.target.checked })} />
          </label>
        </Sec>
      </div>
    </div>
  );
}
