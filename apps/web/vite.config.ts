import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages(https://i-cubic-i.github.io/cubic3/)에서 하위 경로로 열리므로 상대 경로로 빌드한다
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
