import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * Paint-budget benchmark. Runs only with BENCH=1 (`pnpm bench`). Headless numbers are software
 * raster (pessimistic for <image>), so the gate is relative to the committed baseline.
 * BENCH_MODE=bisect prints per-layer p95 deltas by exclusion; BENCH_MODE=record rewrites nothing
 * (copy the printed JSON into e2e/bench.baseline.json deliberately).
 */
interface Report {
  done: boolean
  p50: number
  p95: number
  p99: number
  max: number
  longTasks: number
  jsP95: number
  partsMax: number
  liveMax: number
  visibleMax: number
  textureMs: number
}

const baseline = JSON.parse(
  readFileSync(new URL('./bench.baseline.json', import.meta.url), 'utf8'),
) as {
  p95: number
}
const SECONDS = 8

async function runBench(page: Page, query: string): Promise<Report> {
  await page.goto(`/?bench=${SECONDS}${query}`)
  await page.waitForFunction(() => window.__bench?.done === true, null, {
    timeout: (SECONDS * 2 + 20) * 1000,
    polling: 500,
  })
  const r = await page.evaluate(() => window.__bench)
  if (!r) throw new Error('no bench report')
  return r
}

test('scroll sweep stays inside the paint budget', async ({ page }) => {
  test.setTimeout((SECONDS * 2 + 40) * 1000)
  const r = await runBench(page, '')
  console.log('[bench]', JSON.stringify(r))
  expect(r.longTasks).toBe(0)
  expect(r.p95).toBeLessThanOrEqual(baseline.p95 * 1.35 + 2)
  expect(r.partsMax).toBeLessThanOrEqual(32)
  expect(r.liveMax).toBeLessThanOrEqual(18)
})

test('per-layer cost by exclusion', async ({ page }) => {
  test.skip(process.env.BENCH_MODE !== 'bisect', 'set BENCH_MODE=bisect')
  test.setTimeout(30 * 60 * 1000)
  const all = await runBench(page, '')
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.layer')].map((el) => el.dataset.layer ?? ''),
  )
  const rows: string[] = []
  for (const id of ids) {
    const r = await runBench(page, `&skip=${id}`)
    rows.push(`${id.padEnd(18)} p95 ${r.p95.toFixed(2)}  delta ${(all.p95 - r.p95).toFixed(2)}`)
  }
  console.log(`[bisect] all p95 ${all.p95.toFixed(2)}\n${rows.join('\n')}`)
})
