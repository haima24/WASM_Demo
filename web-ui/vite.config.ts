import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'esnext' },
  server: {
    port: 5173,
    // same-origin calls -> no CORS, and Server-Timing headers stay readable
    proxy: { '/api': 'http://localhost:5080' },
  },
});
