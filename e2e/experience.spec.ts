import { expect, test } from '@playwright/test'

test('welcomes visitors, follows scroll progress, and lets them return', async ({ page }) => {
  await page.goto('/?freeze')
  await page.waitForFunction(() => window.__scene?.ready === true)
  await expect(page.locator('#curtain')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Christopher Tang' })).toBeVisible()
  await expect(page.locator('[data-slot="exterior"]')).toHaveCSS('opacity', '1')
  const progress = page.getByRole('progressbar', { name: 'Journey progress' })
  await expect(progress).toHaveAttribute('aria-valuenow', '0')

  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => window.__scene?.state?.t ?? 0)).toBeGreaterThan(0)
  await page.evaluate(() => window.__scene?.seek(1))
  await expect(progress).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByRole('heading', { name: 'A world beneath.' })).toBeVisible()
  await page.getByRole('link', { name: 'Walk again' }).click()
  await expect.poll(() => page.evaluate(() => window.__scene?.state?.t ?? 1)).toBeLessThan(0.001)
  await expect(page.getByRole('heading', { name: 'Christopher Tang' })).toBeVisible()
})

test('keeps the complete story readable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(`
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return getContext.call(this, type, ...args)
    }
  `)
  await page.goto('/')
  await expect(page.locator('#curtain')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Christopher Tang' })).toBeVisible()
  await expect(page.locator('[data-slot="underwater"]')).toBeVisible()
  await expect(page.getByRole('link', { name: 'GitHub' })).toBeVisible()
  await expect(page.locator('#scene-note')).toBeVisible()
  await expect(page.locator('.scroll-track')).toBeHidden()
  await page.getByRole('link', { name: 'Walk again' }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})
