import { expect, test } from '@playwright/test'

const FRACTIONS = [0, 0.12, 0.28, 0.36, 0.41, 0.46, 0.55, 0.68, 0.8, 0.9, 1]

test('plays every beat without console errors', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/?freeze')
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })
  await expect(page.locator('#curtain')).toBeHidden()

  const poseAt = async (f: number) => {
    await page.evaluate((frac) => {
      window.__scene?.seek(frac)
    }, f)
    await page.waitForTimeout(150)
    return page.evaluate(() => {
      const s = window.__scene?.state
      return s ? JSON.stringify({ pose: s.pose, doors: s.doors, underwater: s.underwater }) : ''
    })
  }
  const forward: Record<number, string> = {}
  for (const f of FRACTIONS) {
    forward[f] = await poseAt(f)
    await page.screenshot({ path: testInfo.outputPath(`t-${f}.png`) })
  }
  // The dive flips the underwater state once the camera is below the surface.
  const parse = (s: string | undefined) => JSON.parse(s ?? '{}') as { underwater?: boolean }
  expect(parse(forward[0.68]).underwater).toBe(false)
  expect(parse(forward[0.9]).underwater).toBe(true)
  await expect(page.locator('[data-slot="underwater"]')).toBeVisible()

  // Purity: the pose at a given t must not depend on scroll history.
  for (const f of [...FRACTIONS].reverse()) expect(await poseAt(f)).toBe(forward[f])
  await expect(page.locator('[data-slot="underwater"]')).toBeHidden()
  expect(errors).toEqual([])
})

test('reads without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Christopher Tang')
  await expect(page.locator('#gl')).toHaveCount(1)
  await context.close()
})
