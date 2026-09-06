import { expect, test } from '@playwright/test'

/**
 * Frame-time benchmark, `BENCH=1 pnpm bench` (headed Chrome, real GPU). Gates: no long tasks,
 * draw calls and triangles under budget, and p95 under 16.7 ms when BENCH_GPU=1 says the run
 * is on a real GPU.
 */
const SECONDS = 8

test('scroll sweep stays inside the frame budget', async ({ page }) => {
  test.setTimeout((SECONDS * 2 + 90) * 1000)
  await page.goto(`/?bench=${SECONDS}`)
  await page.waitForFunction(() => window.__bench?.done === true, null, {
    timeout: (SECONDS * 2 + 80) * 1000,
    polling: 500,
  })
  const r = await page.evaluate(() => window.__bench)
  if (!r) throw new Error('no bench report')
  console.log('[bench]', JSON.stringify(r))
  expect(r.longTasks).toBe(0)
  expect(r.callsMax).toBeLessThanOrEqual(220)
  expect(r.trianglesMax).toBeLessThanOrEqual(1_500_000)
  if (process.env.BENCH_GPU) expect(r.p95).toBeLessThanOrEqual(16.7)
})
