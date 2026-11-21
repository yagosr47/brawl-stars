import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    allowedHosts: ['.e2b.app', 'localhost'],
    proxy: {
      '/api': { target: process.env.PROXY_TARGET || 'http://127.0.0.1:3000', changeOrigin: true },
      '/socket.io': { target: process.env.PROXY_TARGET || 'http://127.0.0.1:3000', changeOrigin: true, ws: true },
    },
  },
  preview: { host: '0.0.0.0', port: 8080, allowedHosts: ['.e2b.app', 'localhost'] },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
