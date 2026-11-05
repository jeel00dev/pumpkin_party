import { defineConfig } from '@playwright/test';

// A port of our own, and no reuse of a running server: on 4173, Vite's default, these tests once attached
// to a different project's preview and timed out with no hint why. Override with E2E_PORT if it's taken.
const PORT = +(process.env.E2E_PORT || 4317);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    channel: 'chromium',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] },
  },
  webServer: { command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`, url: baseURL, reuseExistingServer: false, timeout: 30000 },
});
