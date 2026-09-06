import { expect, test } from '@playwright/test'

const FRACTIONS = [0, 0.12, 0.28, 0.36, 0.41, 0.46, 0.55, 0.68, 0.9, 1]

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
  for (const f of [0.36, 0.46, 0.55, 0.68]) {
    await page.evaluate((frac) => {
      window.__scene?.seek(frac)
    }, f)
    await page.waitForTimeout(100)
    forward[f] = await snapshot()
  }
  for (const f of [0.68, 0.55, 0.46, 0.36]) {
    await page.evaluate((frac) => {
      window.__scene?.seek(frac)
    }, f)
    await page.waitForTimeout(100)
    expect(await snapshot()).toBe(forward[f])
  }

  expect(errors).toEqual([])
})

test('the turn wraps onto the same pixels', async ({ page }) => {
  // Face 4 at the end of the pan is a copy of face 0 and cx snaps back to 0: the two frames may
  // differ only by anti-aliasing.
  await page.goto('/?freeze')
  await expect(page.locator('#stage-air')).toBeVisible()
  await page.waitForTimeout(400)
  const grab = async (t: number) => {
    await page.evaluate((frac) => {
      window.__scene?.seek(frac)
    }, t)
    await page.waitForTimeout(200)
    return (await page.screenshot()).toString('base64')
  }
  const a = await grab(0.4995)
  const b = await grab(0.5)
  const diff = await page.evaluate(
    async ([pa, pb]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((res) => {
          const im = new Image()
          im.onload = () => res(im)
          im.src = `data:image/png;base64,${src}`
        })
      const [ia, ib] = await Promise.all([load(pa ?? ''), load(pb ?? '')])
      const c = document.createElement('canvas')
      c.width = ia.width
      c.height = ia.height
      const x = c.getContext('2d')
      if (!x) return { pixels: 1, big: 1 }
      x.drawImage(ia, 0, 0)
      const A = x.getImageData(0, 0, c.width, c.height).data
      x.drawImage(ib, 0, 0)
      const B = x.getImageData(0, 0, c.width, c.height).data
      let big = 0
      for (let i = 0; i < A.length; i += 4) {
        const d = Math.max(
          Math.abs((A[i] ?? 0) - (B[i] ?? 0)),
          Math.abs((A[i + 1] ?? 0) - (B[i + 1] ?? 0)),
          Math.abs((A[i + 2] ?? 0) - (B[i + 2] ?? 0)),
        )
        if (d > 24) big++
      }
      return { pixels: c.width * c.height, big }
    },
    [a, b],
  )
  expect(diff.big / diff.pixels).toBeLessThan(0.002)
})

test('reads without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Christopher Tang')
  await expect(page.locator('.stage')).toHaveCount(2)
  await context.close()
})
