import { createRoot } from 'react-dom/client';
import './style.css';
import { App } from './App';
import { useStore } from './store';
import { cmd, getWorld } from './flow';

// 개발 서버에서만: 시험 도구가 상태를 보고 버튼 동작을 부를 수 있게
if (import.meta.env.DEV) import('./devtest').then(({ auto }) => { (window as unknown as { __c3: unknown }).__c3 = { store: useStore, cmd, world: getWorld, auto }; });

createRoot(document.getElementById('root')!).render(<App />);
