import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: process.env.BENCH ? [] : [/bench\.spec\.ts/],
  timeout: 180_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      // Real GPU: the installed Chrome, headed. Set BENCH_GPU=1 to gate p95.
      name: 'bench',
      testMatch: /bench\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        headless: false,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1.5,
        launchOptions: {
          args: ['--mute-audio', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
        },
      },
    },
  ],
})
