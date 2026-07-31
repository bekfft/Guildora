import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    allowedHosts: ['bekfft.de', 'alvin-thrushlike-florence.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true
      }
    }
  }
});
