import { defineConfig, devices } from '@playwright/test';

/* The suite runs against scripts/serve.mjs rather than a plain static server, so every test is
   executed under the Content-Security-Policy and the cache headers the deployment will apply.
   A policy that is only exercised in production is a policy nobody has tested. */

const PORT = Number(process.env.PORT || 5174);
const BASE_URL = 'http://127.0.0.1:' + PORT;

export default defineConfig({
  /* Both suites live under here; each project names the one it runs. */
  testDir: '.',
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
      testDir: './e2e',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
    },
    {
      /* WebKit is not Safari, but it is the only way to run WebKit's storage backend here, and
         that backend is the reason photos are stored as bytes rather than Blobs. */
      name: 'webkit',
      testDir: './e2e',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } }
    },
    {
      /* Firefox runs the smoke subset only, and so is not named by npm run test:e2e.

         A third engine over the whole suite would be four more minutes for the paths the other
         two already cover, while the subset is exactly the set worth knowing works everywhere:
         boot, add, a photo round trip, the detail view, filters from the url, a hostile import,
         an offline boot and the theme before the first paint. */
      name: 'firefox',
      testDir: './e2e',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 } }
    },
    {
      /* Screenshots, Chromium only and deliberately not part of npm run test:e2e: a baseline
         is a record of a decision, and a pixel difference is a question for a person rather
         than a build failure. It is excluded from CI for the same reason, plus a practical
         one - these baselines are win32 and a Linux runner would compare against the wrong
         platform's files. CLAUDE.md says how to generate the Linux set. */
      name: 'visual',
      testDir: './visual',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        /* Every transition and animation in the app is on the duration tokens, which this
           takes to zero. A frame caught mid-transition is a different frame every run. */
        reducedMotion: 'reduce',
        /* The app's own storage is per origin, and the sandbox keys keep a visual run away
           from anything real; this keeps each test away from the one before it. */
        storageState: undefined
      }
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
