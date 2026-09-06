import { createTimeline } from 'animejs'
import { attrWrite } from '../../util/dom'
import { AIR } from '../../config/layers'
import {
  INK,
  brush,
  ellipsePts,
  hatchField,
  inkEdges,
  rect,
  v,
  wash,
  type InkStyle,
  type P2,
} from '../draw'
import { SHOJI } from '../geometry'
import { makeSvgLayer } from '../layer'
import { withWrapFace } from '../panorama'
import type { Layer } from '../types'

function rectPts(x: number, y: number, w: number, h: number): P2[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
}

/**
 * One shoji panel: a wood-wash frame, a paper wash (recoloured live by the grade hook via the
 * `.paper-cool` class), an ink lattice of thin tapered bars, and a warm bloom for the two panels
 * nearest the lamp.
 */
function panel(
  x: number,
  y: number,
  w: number,
  h: number,
  i: number,
  ink: InkStyle,
  warm: boolean,
): string {
  const fr = 10
  const ix = x + fr
  const iy = y + fr
  const iw = w - 2 * fr
  const ih = h - 2 * fr
  const cols = 3
  const rows = 4
  let lattice = ''
  for (let c = 1; c < cols; c++)
    lattice += brush(
      [
        [ix + (iw * c) / cols, iy + 3],
        [ix + (iw * c) / cols, iy + ih - 3],
      ],
      {
        w: 1.4,
        seed: 120 + i * 10 + c,
        wobble: 0.6,
        color: ink.color,
        opacity: ink.opacity * 0.8,
        taper: [0.3, 0.3],
      },
    )
  for (let r = 1; r < rows; r++)
    lattice += brush(
      [
        [ix + 3, iy + (ih * r) / rows],
        [ix + iw - 3, iy + (ih * r) / rows],
      ],
      {
        w: 1.4,
        seed: 140 + i * 10 + r,
        wobble: 0.6,
        color: ink.color,
        opacity: ink.opacity * 0.8,
        taper: [0.3, 0.3],
      },
    )
  const glow = warm
    ? wash(ellipsePts(x + w / 2, y + h / 2, w * 0.5, h * 0.5, 8, 0), v('window-amber'), {
        seed: 110 + i,
        amp: 8,
        opacity: 0.2,
        rim: 0,
      })
    : ''
  return (
    `<g class="shoji-panel p${i}" data-i="${i}">` +
    rect(x, y, w, h, v('wood-wash-dark')) +
    `<rect class="paper-cool" x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="${v('paper-cool')}" fill-opacity=".88"/>` +
    glow +
    lattice +
    inkEdges(rectPts(x, y, w, h), ink.w * 0.6, 160 + i, ink.color, ink.opacity) +
    '</g>'
  )
}

/**
 * Back wall with four shoji panels, in ink and wash. Nothing is painted behind the inner two:
 * sliding them open reveals the paddy layers behind. The slide is an anime timeline seeked by
 * scroll; the grade hook writes the live "paper-cool" colour directly onto the panel fills.
 */
export function shojiLayer(): Layer {
  const S = SHOJI
  const ink: InkStyle = { w: 2, color: v('ink-mid'), opacity: 0.9 }
  const runL = S.x0
  const runR = S.x0 + 4 * S.panelW
  const win = S.sideWindow

  let inner = ''
  // side walls flanking the panel run, kept within the +-636/2236 bleed bound for this plane
  inner += wash(rectPts(-636, -400, runL - -636, 2000), v('paper'), {
    seed: 1,
    amp: 12,
    opacity: 0.95,
    rim: 0,
    bleed: 0,
  })
  inner += wash(rectPts(runR, -400, 2236 - runR, 2000), v('paper'), {
    seed: 2,
    amp: 12,
    opacity: 0.95,
    rim: 0,
    bleed: 0,
  })
  // soft mottling so the flanking walls read as a wash, not a flat fill
  inner += wash(rectPts(-500, -100, runL - -500 - 40, 900), v('paper-cool'), {
    seed: 21,
    amp: 40,
    opacity: 0.08,
    rim: 0,
  })
  inner += wash(rectPts(runR + 40, 100, 2236 - runR - 80, 700), v('lamp-glow'), {
    seed: 22,
    amp: 40,
    opacity: 0.08,
    rim: 0,
  })
  // ceiling band above the panels, floor band below
  inner += wash(rectPts(runL, -400, runR - runL, S.y + 400), v('paper'), {
    seed: 3,
    amp: 10,
    opacity: 0.95,
    rim: 0,
    bleed: 0,
  })
  inner += wash(
    rectPts(runL, S.floorY + 12, runR - runL, 1600 - (S.floorY + 12)),
    v('wood-wash-dark'),
    { seed: 4, amp: 8, opacity: 0.9, rim: 0, bleed: 0 },
  )
  // a wooden rail at y ~180, continuous with the room's wall rail, and sparse plaster hatch
  inner += wash(rectPts(-620, 172, 2840, 16), v('wood-wash'), {
    seed: 40,
    amp: 3,
    opacity: 0.85,
    rim: 1,
    bleed: 0,
  })
  inner += brush(
    [
      [-620, 180],
      [2220, 182],
    ],
    { w: ink.w * 0.9, seed: 41, wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  inner += hatchField(-600, 230, 2820, 160, 80 * INK.detail, 0.2, 26, 42, {
    w: 1.2,
    color: ink.color,
    opacity: 0.25,
  })
  // ceiling/floor junction lines
  inner += brush(
    [
      [-620, 214],
      [2220, 210],
    ],
    { w: ink.w, seed: 5, wobble: 3, color: ink.color, opacity: ink.opacity },
  )
  inner += brush(
    [
      [-620, S.floorY + 4],
      [2220, S.floorY + 8],
    ],
    { w: ink.w, seed: 6, wobble: 3, color: ink.color, opacity: ink.opacity },
  )
  inner += hatchField(-600, 240, 2800, 150, 20 * INK.detail, 0, 60, 7, {
    w: 1.3,
    color: ink.color,
    opacity: 0.18 * ink.opacity,
  })
  // side window: pale daylight wash, left of the panel run
  inner += wash(rectPts(win.x, win.y, win.w, win.h), v('paper-sky-low'), {
    seed: 8,
    amp: 5,
    opacity: 0.65,
    rim: 1.2,
    bleed: 0,
  })
  inner += inkEdges(rectPts(win.x, win.y, win.w, win.h), ink.w * 0.75, 9, ink.color, ink.opacity)
  inner += brush(
    [
      [win.x + win.w / 2, win.y + 4],
      [win.x + win.w / 2, win.y + win.h - 4],
    ],
    { w: ink.w * 0.45, seed: 10, color: ink.color, opacity: ink.opacity },
  )
  inner += brush(
    [
      [win.x + 4, win.y + win.h / 2],
      [win.x + win.w - 4, win.y + win.h / 2],
    ],
    { w: ink.w * 0.45, seed: 11, color: ink.color, opacity: ink.opacity },
  )
  // a small hanging plaque on the right wall, brushed in a single calligraphic gesture
  const px = runR + 90
  const py = 300
  const pw = 80
  const ph = 320
  inner += wash(rectPts(px, py, pw, ph), v('paper-lit'), {
    seed: 12,
    amp: 4,
    opacity: 0.5,
    rim: 1,
    bleed: 0,
  })
  inner += inkEdges(rectPts(px, py, pw, ph), ink.w * 0.5, 13, ink.color, ink.opacity)
  inner += brush(
    [
      [px + 16, py + 40],
      [px + pw - 20, py + 150],
      [px + 24, py + 260],
    ],
    { w: ink.w * 0.35, seed: 14, wobble: 3, color: ink.color, opacity: ink.opacity * 0.75 },
  )

  const panels = [0, 1, 2, 3].map((i) =>
    panel(S.x0 + i * S.panelW, S.y, S.panelW, S.panelH, i, ink, i >= 2),
  )
  inner += `<g class="panels">${panels[0] ?? ''}${panels[3] ?? ''}${panels[1] ?? ''}${panels[2] ?? ''}</g>`
  // sill and side frame around the whole run
  inner += rect(S.x0 - 14, S.y - 20, 4 * S.panelW + 28, 20, v('wood-dark'))
  inner += rect(S.x0 - 14, S.floorY, 4 * S.panelW + 28, 12, v('wood-dark'))
  inner += rect(S.x0 - 14, S.y - 20, 14, S.panelH + 32, v('wood-dark'))
  inner += rect(S.x0 + 4 * S.panelW, S.y - 20, 14, S.panelH + 32, v('wood-dark'))

  const layer = makeSvgLayer('shoji', AIR.shoji, withWrapFace('f0-shoji', AIR.shoji.depth, inner))
  const p1 = layer.el.querySelector('.p1')
  const p2 = layer.el.querySelector('.p2')
  const coolFills = layer.el.querySelectorAll('.paper-cool')
  const tl = createTimeline({ autoplay: false, defaults: { ease: 'inOutCubic', duration: 1000 } })
  if (p1) tl.add(p1, { translateX: [0, -S.panelW] }, 0)
  if (p2) tl.add(p2, { translateX: [0, S.panelW] }, 80)
  let lastDoors = -1
  let lastPaper = ''
  layer.update = (state) => {
    if (state.doors !== lastDoors) {
      lastDoors = state.doors
      tl.seek(state.doors * tl.duration, true)
    }
    if (state.grade.paperCool !== lastPaper) {
      lastPaper = state.grade.paperCool
      for (const el of coolFills) attrWrite(el, 'fill', lastPaper)
    }
  }
  return layer
}
