import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001';
const desktopPackage = JSON.parse(fs.readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __GUILDORA_VERSION__: JSON.stringify(desktopPackage.version)
  },
  server: {
    port: 5174,
    strictPort: true,
    allowedHosts: ['bekfft.de'],
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true
      }
    }
  }
});
