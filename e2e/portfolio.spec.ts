import { expect, test, type Page } from '@playwright/test'

const open = async (page: Page, url: string) => {
  await page.goto(url)
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })
}
test('the scrolls are painted before an eager start is ready', async ({ page }) => {
  await open(page, '/?freeze&t=0.364')
  expect(await page.evaluate(() => window.__scene?.settled)).toBe(true)
  expect(
    await page.evaluate(() => document.fonts.check('500 64px "Shippori Mincho"', 'CPH2H')),
  ).toBe(true)
})

// A US-style phone number; the hashed asset names in the page cannot look like one.
const PHONE = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/

const position = (page: Page) =>
  page.evaluate(() => ({ y: window.scrollY, t: window.__scene?.state?.t }))

test('the résumé stays out of the served page and opens on demand', async ({ page, request }) => {
  const served = await (await request.get('/')).text()
  for (const text of ['Paradigm Study', 'Jaco Oil', 'stanford.edu'])
    expect(served).not.toContain(text)
  expect(served).not.toMatch(PHONE)

  await open(page, '/')
  expect(await page.content()).not.toContain('Paradigm Study')

  await page.getByRole('button', { name: 'Résumé', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Résumé' })
  await expect(sheet).toBeVisible()
  for (const name of ['Experience', 'Projects', 'Leadership & Programs', 'Distinctions'])
    await expect(sheet.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(sheet.getByRole('link', { name: /stanford\.edu$/ })).toHaveAttribute(
    'href',
    /^mailto:/,
  )
  expect(await sheet.innerText()).not.toMatch(PHONE)
  await expect(page).toHaveURL(/#resume$/)

  // The walk does not move underneath the sheet.
  const before = await position(page)
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(400)
  expect(await position(page)).toEqual(before)

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(page).not.toHaveURL(/#resume/)
  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => window.__scene?.state?.t ?? 0)).toBeGreaterThan(0)
})

test('the résumé says so when its content cannot load', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/resume-content*', (route) => route.abort())
  await open(page, '/')
  await page.getByRole('button', { name: 'Résumé', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Résumé' })).toContainText('could not load')
  expect(errors).toEqual([])
})

test('the résumé opens without WebGL', async ({ page }) => {
  await page.addInitScript(`
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return getContext.call(this, type, ...args)
    }
  `)
  await page.goto('/')
  await expect(page.locator('#scene-note')).toBeVisible()
  await page.getByRole('button', { name: 'Résumé', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Résumé' })).toContainText('Paradigm Study')
})

test('#resume in the URL opens the sheet', async ({ page }) => {
  await open(page, '/#resume')
  await expect(page.getByRole('dialog', { name: 'Résumé' })).toContainText('Paradigm Study')
})

const storyT = (page: Page) => page.evaluate(() => window.__scene?.state?.t ?? -1)

// The banner hold of the turn (`faces` in src/three/camera.ts): all three projects hang there.
const BANNER_HOLD = [0.357, 0.371] as const

test('a project fragment starts at the banner wall with everything loaded', async ({ page }) => {
  for (const id of ['cph2h', 'waifu-focus', 'robotics']) {
    await page.goto('about:blank')
    await open(page, `/#${id}`)
    const t = await storyT(page)
    expect(t).toBeGreaterThanOrEqual(BANNER_HOLD[0])
    expect(t).toBeLessThanOrEqual(BANNER_HOLD[1])
    expect(await page.evaluate(() => window.__scene?.state?.pose.yaw)).toBeCloseTo(90, 5)
    expect(await page.evaluate(() => window.__scene?.settled)).toBe(true)
  }
})

test('the résumé can send the visitor to a project in the house', async ({ page }) => {
  await open(page, '/#resume')
  const sheet = page.getByRole('dialog', { name: 'Résumé' })
  await sheet.getByRole('button', { name: 'See it in the house: CPH2H' }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveURL(/#cph2h$/)
  await expect.poll(() => storyT(page), { timeout: 15_000 }).toBeCloseTo(0.364, 2)
})

test('the go-to button works even when clicked before the scene is ready', async ({ page }) => {
  // Hold the textures back so the scene stays unready while the page itself is idle.
  await page.route('**/assets/tex/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.continue()
  })
  await page.goto('/#resume')
  const sheet = page.getByRole('dialog', { name: 'Résumé' })
  const goto = sheet.getByRole('button', { name: 'See it in the house: CPH2H' })
  await expect(goto).toBeVisible()
  // The scene's listeners are in place (hooks exist) but its loop is not running yet.
  await page.waitForFunction(() => window.__scene !== undefined)
  expect(await page.evaluate(() => window.__scene?.ready === true)).toBe(false)
  await goto.click()
  await expect(page).toHaveURL(/#cph2h$/)
  expect(await page.evaluate(() => window.__scene?.ready === true)).toBe(false)
  await page.waitForFunction(() => window.__scene?.ready === true, null, { timeout: 60_000 })
  // The opening seek itself lands on the project; it does not rely on a smooth scroll catching up.
  expect(await storyT(page)).toBeCloseTo(0.364, 2)
})

test('a beat fragment starts at that beat', async ({ page }) => {
  await open(page, '/#paddy')
  expect(await storyT(page)).toBeCloseTo(0.58, 3)
})

test('unknown fragments are ignored and ?t= wins over a fragment', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page, '/#nope')
  expect(await storyT(page)).toBeCloseTo(0, 3)
  await page.goto('about:blank')
  await open(page, '/?t=0.9#cph2h')
  expect(await storyT(page)).toBeCloseTo(0.9, 3)
  expect(errors).toEqual([])
})

// --- banners and trophies --------------------------------------------------------------------

const BANNER_T = 0.364
const TROPHY_T = 0.456
const BANNERS = [
  {
    id: 'cph2h',
    heading: 'CPH2H',
    kicker: /^Head-to-head coding platform · 2026$/,
    points: 3,
    href: /^https:\/\/cph2h\.com\/?$/,
  },
  {
    id: 'waifu-focus',
    heading: 'Waifu Focus',
    kicker: /^Productivity Chrome extension · 2024 – 2025$/,
    points: 3,
    href: /^https:\/\/chromewebstore\.google\.com\//,
  },
  {
    id: 'robotics',
    heading: 'Robotics',
    kicker: /^VEX Team 11475B · Bakersfield Robotics · 2023 – 2026$/,
    points: 4,
    href: null,
  },
]
const TROPHIES = [
  { id: 'vex', title: 'VEX Robotics' },
  { id: 'scibowl', title: 'National Science Bowl' },
  { id: 'tedx', title: 'TEDx' },
  { id: 'usaco', title: 'USACO' },
  { id: 'half', title: 'Half marathon' },
  { id: 'muscleup', title: 'Muscle ups' },
  { id: 'bench', title: 'Bench press' },
  { id: 'swim', title: '100 yd freestyle' },
]
const SECRETS = [
  /CPH2H/i,
  /Waifu Focus/i,
  /Bakersfield/i,
  /Science Bowl/i,
  /TEDx/i,
  /USACO/i,
  /1:58/,
  /\b225\b/,
  /50\.8/,
  /muscle/i,
]

const panelOf = (page: Page) => page.locator('[data-ui="focus-panel"]')
const focusState = (page: Page) => page.evaluate(() => window.__scene?.focus.state)
const cameraAt = (page: Page) =>
  page.evaluate(() => {
    const p = window.__scene?.app.camera.position
    return p ? [p.x, p.y, p.z] : []
  })
const openObject = (page: Page, id: string) =>
  page.evaluate((x) => window.__scene?.focus.open(x), id)
const closeObject = (page: Page) => page.evaluate(() => window.__scene?.focus.close())
const closedAgain = (page: Page) =>
  expect
    .poll(async () => {
      const s = await focusState(page)
      return s?.id === null && s.k === 0
    })
    .toBe(true)

/** All text a visitor or a crawler could read from the page right now. */
const visibleText = (page: Page) =>
  page.evaluate(() => {
    const parts = [document.documentElement.innerText, document.documentElement.textContent ?? '']
    for (const el of document.querySelectorAll('[aria-label], [title], [alt]'))
      parts.push(
        el.getAttribute('aria-label') ?? '',
        el.getAttribute('title') ?? '',
        el.getAttribute('alt') ?? '',
      )
    return parts.join('\n')
  })

test('no project or trophy text is in the served page or the DOM before an open', async ({
  page,
  request,
}) => {
  const served = await (await request.get('/')).text()
  for (const secret of SECRETS) expect(served).not.toMatch(secret)

  for (const t of [0, BANNER_T, TROPHY_T]) {
    await page.goto('about:blank')
    await open(page, `/?freeze&t=${t}`)
    // The hidden buttons exist at the holds; their labels must still tell nothing.
    const text = await visibleText(page)
    for (const secret of SECRETS) expect(text, `t=${t}`).not.toMatch(secret)
    // The hidden buttons carry opaque slugs (data-id), which are in the URL fragments anyway.
    const html = (await page.content()).replace(/data-id="[^"]*"/g, '')
    for (const secret of SECRETS) expect(html, `t=${t}`).not.toMatch(secret)
  }
})

test('each banner opens, shows its text, points and link, and closes back to the scroll pose', async ({
  page,
}) => {
  await open(page, `/?freeze&t=${BANNER_T}`)
  const poseBefore = await page.evaluate(() => window.__scene?.state?.pose)
  const cameraBefore = await cameraAt(page)
  const panel = panelOf(page)
  for (const banner of BANNERS) {
    await openObject(page, banner.id)
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: banner.heading, exact: true })).toBeVisible()
    // The panel stays labelled by the name, not by the eyebrow above it.
    await expect(panel).toHaveAccessibleName(banner.heading)
    expect(await panel.locator('.focus-kicker').textContent()).toMatch(banner.kicker)
    await expect(panel.locator('.focus-points > li')).toHaveCount(banner.points)
    const link = panel.getByRole('link')
    if (banner.href) await expect(link).toHaveAttribute('href', banner.href)
    else await expect(link).toHaveCount(0)
    expect((await focusState(page))?.id).toBe(banner.id)
    // The camera is somewhere else while open; the pose is the scroll pose regardless.
    await expect.poll(async () => (await focusState(page))?.k).toBe(1)
    expect(await page.evaluate(() => window.__scene?.state?.pose)).toEqual(poseBefore)

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await closedAgain(page)
    expect(await page.evaluate(() => window.__scene?.state?.pose)).toEqual(poseBefore)
    const after = await cameraAt(page)
    for (const [i, v] of cameraBefore.entries()) expect(after[i]).toBeCloseTo(v, 6)
  }
})

test('a hidden button opens a banner from the keyboard and Esc hands focus back', async ({
  page,
}) => {
  await open(page, `/?freeze&t=${BANNER_T}`)
  const buttons = page.locator('[data-ui="focus-list"] button')
  await expect(buttons).toHaveCount(3)
  for (const label of await buttons.allTextContents()) expect(label).toMatch(/^Banner \d of 3$/)

  const first = buttons.first()
  await first.focus()
  await page.keyboard.press('Enter')
  const panel = panelOf(page)
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'CPH2H', exact: true })).toBeVisible()
  await expect.poll(() => panel.evaluate((el) => el.contains(document.activeElement))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(first).toBeFocused()
})

test('an open panel takes the focus once and lets the keyboard leave it', async ({ page }) => {
  await open(page, `/?freeze&t=${BANNER_T}`)
  await page.locator('[data-ui="focus-list"] button').first().focus()
  await page.keyboard.press('Enter')
  const panel = panelOf(page)
  await expect(panel).toBeVisible()
  const inPanel = () => panel.evaluate((el) => el.contains(document.activeElement))
  await expect.poll(inPanel).toBe(true)

  // Back out of the panel to the other hidden buttons: the focus stays where it went.
  await page.keyboard.press('Shift+Tab')
  expect(await inPanel()).toBe(false)
  await page.waitForTimeout(200)
  expect(await inPanel()).toBe(false)

  // And a header control keeps it too (a banner over a portrait screen clears the header away).
  const resume = page.getByRole('button', { name: 'Résumé', exact: true })
  if (await resume.isVisible()) {
    await resume.focus()
    await page.waitForTimeout(200)
    await expect(resume).toBeFocused()
  }
})

test('each trophy opens with its title, one at a time', async ({ page }) => {
  await open(page, `/?freeze&t=${TROPHY_T}`)
  const buttons = page.locator('[data-ui="focus-list"] button')
  await expect(buttons).toHaveCount(TROPHIES.length)
  for (const label of await buttons.allTextContents()) expect(label).toMatch(/^Trophy \d of 8$/)
  const panel = panelOf(page)
  for (const trophy of TROPHIES) {
    await openObject(page, trophy.id)
    await expect(panel.getByRole('heading', { name: trophy.title, exact: true })).toBeVisible()
    expect((await focusState(page))?.id).toBe(trophy.id)
    await closeObject(page)
    await expect(panel).toBeHidden()
    await closedAgain(page)
  }

  // A second one while one is open replaces it: never two at once.
  await openObject(page, 'vex')
  await expect(panel.getByRole('heading', { name: 'VEX Robotics', exact: true })).toBeVisible()
  await openObject(page, 'swim')
  await expect(panel.getByRole('heading', { name: '100 yd freestyle', exact: true })).toBeVisible()
  await expect(panel.getByRole('heading')).toHaveCount(1)
  expect((await focusState(page))?.id).toBe('swim')
  await closeObject(page)
  await closedAgain(page)
})

test('the page does not scroll while something is open', async ({ page }) => {
  await open(page, `/?t=${BANNER_T}`)
  await expect
    .poll(() => page.evaluate(() => window.__scene?.state?.t), { timeout: 20_000 })
    .toBeCloseTo(BANNER_T, 2)
  await page.mouse.move(20, 20)
  await openObject(page, 'cph2h')
  await expect(panelOf(page)).toBeVisible()
  const before = await position(page)
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(400)
  expect(await position(page)).toEqual(before)

  await page.keyboard.press('Escape')
  await closedAgain(page)
  await page.mouse.wheel(0, 900)
  await expect.poll(async () => (await position(page)).y).toBeGreaterThan(before.y)
})

test('away from the holds nothing can be opened and there are no hidden buttons', async ({
  page,
}) => {
  for (const t of [0.2, 0.41, 0.7]) {
    await page.goto('about:blank')
    await open(page, `/?freeze&t=${t}`)
    await expect(page.locator('[data-ui="focus-list"] button')).toHaveCount(0)
    await openObject(page, 'cph2h')
    await openObject(page, 'vex')
    await page.waitForTimeout(150)
    expect((await focusState(page))?.id).toBeNull()
    await expect(panelOf(page)).toBeHidden()
  }
})

test('#cph2h ends with the CPH2H panel open', async ({ page }) => {
  await open(page, '/#cph2h')
  const panel = panelOf(page)
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await expect(panel.getByRole('heading', { name: 'CPH2H', exact: true })).toBeVisible()
})

test('with reduced motion an object opens without a tween', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, `/?freeze&t=${BANNER_T}`)
  await openObject(page, 'robotics')
  // The tween is wall-clock; a cut reaches 1 within a frame or two.
  await expect.poll(async () => (await focusState(page))?.k, { timeout: 500 }).toBe(1)
  await expect(panelOf(page).getByRole('heading', { name: 'Robotics', exact: true })).toBeVisible()
})

// A real pointer click on a banner is not covered: picking needs the projected screen position
// of a banner, which the debug surface does not expose, and software WebGL makes a guessed
// coordinate flaky. The click handler shares focus.open with the paths tested above.
