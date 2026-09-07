import { expect, test, type Page } from '@playwright/test'

// Exercise the real Web Audio graph without sending sound to the test machine's speakers.
test.use({ launchOptions: { args: ['--mute-audio'] } })

async function openScene(page: Page, frozen = false): Promise<void> {
  await page.goto(frozen ? '/?freeze' : '/')
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })
  await expect(page.locator('#curtain')).toBeHidden()
}

const audioStatus = (page: Page) =>
  page.evaluate(() => {
    const audio = window.__scene?.audio
    if (!audio) throw new Error('Audio is unavailable after scene readiness')
    return audio
  })

async function observeAudioContexts(page: Page, rejectFirstResume = false): Promise<void> {
  await page.addInitScript((rejectFirstResume) => {
    const NativeAudioContext = window.AudioContext
    let contextCount = 0
    let rejectNextResume = rejectFirstResume
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options)
        document.documentElement.setAttribute('data-audio-contexts', String(++contextCount))
      }

      override resume(): Promise<void> {
        if (rejectNextResume) {
          rejectNextResume = false
          document.documentElement.setAttribute('data-audio-resume-rejections', '1')
          return Promise.reject(
            new DOMException('Simulated audio startup failure', 'NotAllowedError'),
          )
        }
        return super.resume()
      }
    }
  }, rejectFirstResume)
}

test('starts muted and reuses the audio graph through controls and freeze', async ({ page }) => {
  await openScene(page)
  const toggle = page.locator('[data-ui="sound-toggle"]')
  const volume = page.getByRole('slider', { name: 'Sound volume', includeHidden: true })
  await expect(toggle).toHaveAccessibleName('Enable sound')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(volume).toBeHidden()
  expect(await audioStatus(page)).toMatchObject({
    enabled: false,
    active: false,
    paused: false,
    volume: 0.45,
    contextState: 'uninitialized',
    contextCount: 0,
    sourceCount: 0,
  })

  // Keyboard activation exercises the same trusted gesture as a pointer click.
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAccessibleName('Mute sound')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: true,
      active: true,
      contextState: 'running',
      contextCount: 1,
    })
  const sourceCount = (await audioStatus(page)).sourceCount
  expect(sourceCount).toBeGreaterThan(0)
  await expect(volume).toBeVisible()
  await expect(volume).toHaveValue('45')
  await volume.focus()
  await page.keyboard.press('ArrowRight')
  await expect(volume).toHaveValue('46')
  await expect(volume).toHaveAttribute('aria-valuetext', '46%')
  await expect.poll(async () => (await audioStatus(page)).volume).toBe(0.46)

  await toggle.click()
  await expect(toggle).toHaveAccessibleName('Enable sound')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(volume).toBeHidden()
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: false,
      active: false,
      contextState: 'suspended',
      contextCount: 1,
    })

  await toggle.click()
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: true,
      active: true,
      volume: 0.46,
      contextState: 'running',
      contextCount: 1,
      sourceCount,
    })

  await page.evaluate(() => window.__scene?.freeze(true))
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: true,
      paused: true,
      active: false,
      contextState: 'suspended',
    })
  await expect(toggle).toHaveAccessibleName('Mute sound')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await page.evaluate(() => window.__scene?.freeze(false))
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: true,
      paused: false,
      active: true,
      contextState: 'running',
      contextCount: 1,
      sourceCount,
    })
  await toggle.click()
  await expect.poll(async () => (await audioStatus(page)).contextState).toBe('suspended')
})

test('creates one live context across repeated toggles and hidden-tab pauses', async ({ page }) => {
  await observeAudioContexts(page)
  await openScene(page)
  const toggle = page.locator('[data-ui="sound-toggle"]')
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-audio-contexts')

  for (let cycle = 0; cycle < 3; cycle++) {
    await toggle.click()
    await expect
      .poll(() => audioStatus(page))
      .toMatchObject({
        enabled: true,
        active: true,
        contextState: 'running',
        sourceCount: 7,
      })
    await expect(html).toHaveAttribute('data-audio-contexts', '1')
    await toggle.click()
    await expect
      .poll(() => audioStatus(page))
      .toMatchObject({
        enabled: false,
        active: false,
        contextState: 'suspended',
      })
  }

  await toggle.click()
  await expect.poll(async () => (await audioStatus(page)).active).toBe(true)
  const setHidden = async (hidden: boolean) => {
    await page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  }
  await setHidden(true)
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: true,
      paused: true,
      active: false,
      contextState: 'suspended',
    })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toHaveAccessibleName('Mute sound')

  await setHidden(false)
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: true,
      paused: false,
      active: true,
      contextState: 'running',
      sourceCount: 7,
    })
  await expect(html).toHaveAttribute('data-audio-contexts', '1')
  await toggle.click()
  await expect.poll(async () => (await audioStatus(page)).contextState).toBe('suspended')
})

test('recovers from a rejected audio enable without an unhandled error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await observeAudioContexts(page, true)
  await openScene(page)
  const toggle = page.locator('[data-ui="sound-toggle"]')
  const status = page.locator('[data-ui="sound-status"]')

  await toggle.click()
  await expect(status).toHaveText('Sound couldn’t be changed. Try again.')
  await expect(toggle).toHaveAccessibleName('Enable sound')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toHaveAttribute('aria-busy', 'false')
  await expect(toggle).toBeEnabled()
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: false,
      active: false,
      contextState: 'suspended',
      sourceCount: 0,
    })
  await expect(page.locator('html')).toHaveAttribute('data-audio-resume-rejections', '1')

  await toggle.click()
  await expect(toggle).toHaveAccessibleName('Mute sound')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveText('')
  await expect
    .poll(() => audioStatus(page))
    .toMatchObject({
      enabled: true,
      active: true,
      contextState: 'running',
      sourceCount: 7,
    })
  await expect(page.locator('html')).toHaveAttribute('data-audio-contexts', '1')
  await toggle.click()
  await expect.poll(async () => (await audioStatus(page)).contextState).toBe('suspended')
  expect(errors).toEqual([])
})

for (const failure of ['fetch', 'decode'] as const) {
  test(`keeps the visual scene available when a recording fails to ${failure}`, async ({
    page,
  }) => {
    const errors: string[] = []
    let intercepted = 0
    page.on('pageerror', (error) => errors.push(error.message))
    const recording = failure === 'fetch' ? 'light-rain.m4a' : 'leaf-drips.m4a'
    await page.route(`**/assets/audio/${recording}`, async (route) => {
      intercepted++
      if (failure === 'fetch') await route.abort('failed')
      else {
        await route.fulfill({
          status: 200,
          contentType: 'audio/mp4',
          body: 'This is invalid audio data.',
        })
      }
    })

    await openScene(page, true)
    expect(intercepted).toBeGreaterThan(0)
    expect(await page.evaluate(() => window.__scene?.audio)).toBeNull()
    await expect(page.locator('html')).toHaveClass(/scene-ready/)
    await expect(page.locator('html')).not.toHaveClass(/no-scene/)
    await expect(page.locator('#gl')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Christopher Tang' })).toBeVisible()
    await expect(page.locator('[data-ui="sound"]')).toBeHidden()
    await expect(page.locator('[data-ui="sound-toggle"]')).toBeDisabled()
    expect(errors).toEqual([])
  })
}

test('follows the landscape mix while muted and makes the dive quiet and muffled', async ({
  page,
}) => {
  await openScene(page, true)

  const mixAt = async (t: number) => {
    await page.evaluate((fraction) => window.__scene?.seek(fraction), t)
    // Native scroll positions are quantized to pixels, including synchronous seeks.
    await expect.poll(() => page.evaluate(() => window.__scene?.state?.t)).toBeCloseTo(t, 3)
    const audio = await audioStatus(page)
    expect(audio).toMatchObject({ enabled: false, active: false, paused: true, contextCount: 0 })
    if (!audio.mix) throw new Error(`The sound mix is missing at t=${t}`)
    expect(audio.mix.gains.door).toBe(0)
    return audio.mix
  }

  const yard = await mixAt(0)
  expect(yard.gains.foliage).toBe(Math.max(...Object.values(yard.gains)))
  expect(yard.gains.puddles).toBeGreaterThan(0)
  expect(yard.gains.puddles).toBeLessThan(0.2 * (yard.gains.foliage ?? 0))
  expect(yard.gains.roof).toBe(0)
  expect(yard.gains.field).toBe(0)

  const room = await mixAt(0.41)
  expect(room.gains.roof).toBe(Math.max(...Object.values(room.gains)))
  expect(room.gains.field).toBeGreaterThan(0)
  expect(room.gains.fire).toBeGreaterThan(0)

  const field = await mixAt(0.68)
  expect(field.gains.field).toBe(Math.max(...Object.values(field.gains)))
  expect(field.gains.roof).toBe(0)

  const underwater = await mixAt(0.9)
  expect(underwater.lowpassHz).toBeLessThanOrEqual(500)
  expect(underwater.master).toBeLessThan(0.5)

  // Seeking in reverse must recover the exact mix without creating an AudioContext.
  expect(await mixAt(0.68)).toEqual(field)
  expect(await mixAt(0.41)).toEqual(room)
  expect(await mixAt(0)).toEqual(yard)
})
