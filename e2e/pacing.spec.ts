import { expect, test } from '@playwright/test'

test('the interior look-around gets three times the scroll distance', async ({ page }) => {
  await page.goto('/?freeze')
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })
  const distance = await page.evaluate(() => {
    const at = (t: number) => {
      window.__scene?.seek(t)
      return window.scrollY
    }
    const exterior = (at(0.12) - at(0)) / 0.12
    const interior = (at(0.5) - at(0.32)) / 0.18
    const paddy = (at(0.73) - at(0.62)) / 0.11
    return { interior: interior / exterior, paddy: paddy / exterior }
  })
  expect(distance.interior).toBeCloseTo(3, 2)
  expect(distance.paddy).toBeCloseTo(1, 2)

  // The room's three feature views stay at rest while there is time to read them.
  for (const [from, to, yaw] of [
    [0.359, 0.369, 90],
    [0.403, 0.417, 180],
    [0.451, 0.461, 270],
  ]) {
    const poses = await page.evaluate(
      ([start, end]) => {
        window.__scene?.seek(start ?? 0)
        const first = window.__scene?.state?.pose
        window.__scene?.seek(end ?? 0)
        return { first, last: window.__scene?.state?.pose }
      },
      [from, to],
    )
    expect(poses.first?.yaw).toBeCloseTo(yaw ?? 0, 2)
    expect(poses.first).toBeDefined()
    expect(poses.last).toBeDefined()
    if (!poses.first || !poses.last) throw new Error('The scene did not return both room poses')
    for (const key of Object.keys(poses.first) as (keyof typeof poses.first)[]) {
      expect(poses.last[key]).toBeCloseTo(poses.first[key], 10)
    }
  }
})

test('a small wheel gesture turns gently inside the room', async ({ page }) => {
  await page.goto('/?freeze')
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })
  await page.evaluate(() => window.__scene?.seek(0.335))
  const start = await page.evaluate(() => window.__scene?.state?.pose.yaw ?? 0)
  await page.mouse.wheel(0, 100)
  await expect
    .poll(() => page.evaluate(() => window.__scene?.state?.pose.yaw ?? 0))
    .toBeGreaterThan(start)
  await page.waitForTimeout(1500)
  const end = await page.evaluate(() => window.__scene?.state?.pose.yaw ?? 0)
  expect(end - start).toBeLessThan(30)
})
