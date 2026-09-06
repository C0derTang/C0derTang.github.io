import { expect, test } from '@playwright/test'

const FRACTIONS = [0, 0.15, 0.35, 0.5, 0.7, 0.9, 1]

test('plays every beat without console errors', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto('/?freeze')
  await expect(page.locator('#stage-air')).toBeVisible()
  await expect(page.locator('#stage-water')).toBeHidden()

  // Composited-plane budget and texture wiring.
  expect(await page.locator('#stage-air .layer[data-live]').count()).toBeLessThanOrEqual(11)
  expect(await page.locator('#stage-water .layer[data-live]').count()).toBeLessThanOrEqual(7)
  await page.waitForTimeout(400)
  const missingHref = await page.locator('image[data-tex]:not([href])').count()
  expect(missingHref).toBe(0)

  for (const f of FRACTIONS) {
    await page.evaluate((frac) => {
      window.__scene?.seek(frac)
    }, f)
    await page.waitForTimeout(150)
    await page.screenshot({ path: testInfo.outputPath(`t-${f}.png`) })
  }

  // Underwater resting state: air stage off, water stage on, overlay slot visible.
  await expect(page.locator('#stage-water')).toBeVisible()
  await expect(page.locator('#stage-air')).toBeHidden()
  await expect(page.locator('[data-slot="underwater"]')).toBeVisible()

  // Scrub back to the start: the exterior slot hides again and the house is visible.
  await page.evaluate(() => {
    window.__scene?.seek(0)
  })
  await page.waitForTimeout(150)
  await expect(page.locator('#stage-air')).toBeVisible()
  await expect(page.locator('[data-layer="house"]')).toBeVisible()
  await expect(page.locator('[data-slot="underwater"]')).toBeHidden()

  // Purity: the DOM state of visible layers at a given t must not depend on scroll history.
  const snapshot = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.layer')]
        .filter((el) => el.style.visibility !== 'hidden')
        .map(
          (el) =>
            `${el.dataset.layer}|${el.style.opacity}|${[...el.querySelectorAll('svg[data-part]')]
              .map((p) => p.getAttribute('viewBox'))
              .join(';')}`,
        )
        .join('\n'),
    )
  const forward: Record<number, string> = {}
  for (const f of [0.35, 0.5, 0.7]) {
    await page.evaluate((frac) => {
      window.__scene?.seek(frac)
    }, f)
    await page.waitForTimeout(100)
    forward[f] = await snapshot()
  }
  for (const f of [0.7, 0.5, 0.35]) {
    await page.evaluate((frac) => {
      window.__scene?.seek(frac)
    }, f)
    await page.waitForTimeout(100)
    expect(await snapshot()).toBe(forward[f])
  }

  expect(errors).toEqual([])
})

test('reads without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Christopher Tang')
  await expect(page.locator('.stage')).toHaveCount(2)
  await context.close()
})
