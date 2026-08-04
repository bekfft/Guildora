import { defineConfig } from '@playwright/test';

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1024', width: 1024, height: 768 },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'mobile-360', width: 360, height: 800, mobile: true }
];

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.012 }
  },
  use: {
    baseURL: 'http://127.0.0.1:5189',
    colorScheme: 'dark',
    locale: 'de-DE',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: viewports.map(({ name, width, height, mobile }) => ({
    name,
    use: {
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1
    }
  })),
  webServer: [
    {
      command: 'node scripts/start-visual-server.mjs',
      url: 'http://127.0.0.1:3199/api/health',
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: 'npm run dev --workspace client -- --host 127.0.0.1 --port 5189',
      url: 'http://127.0.0.1:5189',
      env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:3199' },
      reuseExistingServer: false,
      timeout: 30_000
    }
  ]
});
