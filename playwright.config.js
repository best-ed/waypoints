import { defineConfig, devices } from '@playwright/test';

/* The suite runs against scripts/serve.mjs rather than a plain static server, so every test is
   executed under the Content-Security-Policy and the cache headers the deployment will apply.
   A policy that is only exercised in production is a policy nobody has tested. */

const PORT = Number(process.env.PORT || 5174);
const BASE_URL = 'http://127.0.0.1:' + PORT;

export default defineConfig({
  testDir: './e2e',
  /* Each test seeds its own state and shares nothing, so they can run together. */
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
    },
    {
      /* WebKit is not Safari, but it is the only way to run WebKit's storage backend here, and
         that backend is the reason photos are stored as bytes rather than Blobs. */
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } }
    }
  ],

  webServer: {
    command: 'npm run serve:prod',
    url: BASE_URL + '/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    stdout: 'ignore',
    stderr: 'pipe'
  }
});
