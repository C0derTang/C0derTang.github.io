import { expect, test } from '@playwright/test'

test('tab visibility does not start a loading or failed landscape', async ({ page }) => {
  await page.addInitScript(() => {
    let scene: typeof window.__scene
    Object.defineProperty(window, '__scene', {
      configurable: true,
      get: () => scene,
      set(value: NonNullable<typeof window.__scene> & { app: object }) {
        scene = value
        Object.defineProperty(value.app, 'ready', {
          value: new Promise<void>((_resolve, reject) => {
            window.addEventListener(
              'reject-scene-ready',
              () => reject(new Error('Simulated landscape preparation failure')),
              { once: true },
            )
          }),
        })
      },
    })
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__scene !== undefined)

  const loadingState = await page.evaluate(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
    for (let frame = 0; frame < 2; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return window.__scene?.state
  })
  expect.soft(loadingState).toBeUndefined()

  await page.evaluate(() => window.dispatchEvent(new Event('reject-scene-ready')))
  await expect(page.locator('html')).toHaveClass(/no-scene/)
  const fallbackInert = await page.evaluate(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
    for (let frame = 0; frame < 2; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return Array.from(document.querySelectorAll<HTMLElement>('.slot'), (slot) => slot.inert)
  })
  expect(fallbackInert).toEqual([false, false, false, false])
})

test('seeking and resizing do not create extra animation loops', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })

  const pendingFrames = await page.evaluate(async () => {
    const scene = window.__scene
    if (!scene) throw new Error('Scene not ready')
    const request = window.requestAnimationFrame.bind(window)
    const cancel = window.cancelAnimationFrame.bind(window)
    const pending = new Set<number>()
    window.requestAnimationFrame = (callback) => {
      const id = request((time) => {
        pending.delete(id)
        callback(time)
      })
      pending.add(id)
      return id
    }
    window.cancelAnimationFrame = (id) => {
      pending.delete(id)
      cancel(id)
    }
    try {
      for (const t of [1, 0.55, 0.41, 0.28, 0]) scene.seek(t)
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event('resize'))
      // Let Lenis finish its one-shot scroll-end callbacks before counting live loops.
      for (let frame = 0; frame < 3; frame++)
        await new Promise<void>((resolve) => request(() => resolve()))
      return pending.size
    } finally {
      window.requestAnimationFrame = request
      window.cancelAnimationFrame = cancel
    }
  })

  expect(pendingFrames).toBe(1)
})

test('reduced motion holds complete stills and reaches the fish underwater', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?freeze')
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })

  const frameAt = (t: number) =>
    page.evaluate((fraction) => {
      window.__scene?.seek(fraction)
      const state = window.__scene?.state as
        | (NonNullable<typeof window.__scene>['state'] & {
            fog: unknown
            sun: unknown
            sky: number
            lamp: number
            focus: unknown
            grade: unknown
          })
        | undefined
      if (!state) throw new Error('Scene not ready')
      return {
        pose: state.pose,
        underwater: state.underwater,
        fog: state.fog,
        sun: state.sun,
        sky: state.sky,
        lamp: state.lamp,
        focus: state.focus,
        grade: state.grade,
      }
    }, t)

  const paddy = await frameAt(0.65)
  expect(paddy.underwater).toBe(false)
  expect.soft(await frameAt(0.73)).toEqual(paddy)

  const underwater = await frameAt(0.9)
  expect.soft(underwater.underwater).toBe(true)
  expect.soft(underwater.pose.y).toBeLessThan(-0.33)
  expect(await frameAt(0.98)).toEqual(underwater)
  await frameAt(0.28)
  expect(await frameAt(0.9)).toEqual(underwater)
})
