import { animate } from 'animejs'
import { AIR } from '../../config/layers'
import type { Quality } from '../../config/quality'
import {
  INK,
  brush,
  contour,
  ellipsePts,
  hatch,
  hatchField,
  inkCedar,
  inkEdges,
  inkHydrangea,
  inkStyle,
  rect,
  v,
  wash,
  washRect,
  type InkStyle,
  type P2,
} from '../draw'
import { FACE_WINDOWS, LAMP } from '../geometry'
import { makeSvgLayer } from '../layer'
import { atFace, effectiveDepth, facePitch, withWrapFace } from '../panorama'
import type { Layer } from '../types'

/** Face-local span [x0, x1] a part's content owns, centred on the vanishing point (800). */
function spanOf(depth: number): { x0: number; x1: number; half: number } {
  const half = facePitch(depth) / 2
  return { x0: 800 - half, x1: 800 + half, half }
}

/** The rain-facing opening for a face (FACE_WINDOWS), or a fallback rect for faces without one. */
function winOf(face: number): { x: number; y: number; w: number; h: number } {
  const found = FACE_WINDOWS.find((w) => w.face === face)
  return found ? found.rect : { x: 700, y: 460, w: 200, h: 200 }
}

function rectPts(x: number, y: number, w: number, h: number): P2[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
}

/** A small incrementing seed source so a long function never repeats a seed by accident. */
function seeds(start: number): () => number {
  let s = start
  return () => s++
}

/* ---------------------------- interior-frame ---------------------------- */
/** Beam void + doma floor are drawn once, continuous across all four faces (see task brief);
 * only the posts vary per face: one corner post at each face's right seam, plus a door frame
 * for face 2 (the entrance). */

function cornerPost(x: number, ink: InkStyle, seed: number): string {
  const w = 68
  let out = washRect(x - w / 2, -400, w, 2000, v('wood-wash-dark'), {
    seed,
    amp: 4,
    opacity: 0.92,
    rim: 1,
    bleed: 0,
  })
  out += brush(
    [
      [x - w / 2 + 2, -380],
      [x - w / 2 - 3, 1580],
    ],
    { w: ink.w, seed: seed + 1, wobble: 2.5, color: ink.color, opacity: ink.opacity },
  )
  out += brush(
    [
      [x + w / 2 - 2, -370],
      [x + w / 2 + 3, 1570],
    ],
    { w: ink.w * 0.8, seed: seed + 2, wobble: 2.5, color: ink.color, opacity: ink.opacity * 0.9 },
  )
  out += hatchField(x - w / 2 + 8, -360, w - 16, 1940, 7 * INK.detail, Math.PI / 2, 130, seed + 3, {
    w: 1.4,
    color: ink.color,
    opacity: 0.3 * ink.opacity,
  })
  return out
}

/** Door frame around the entrance opening (face 2): two jambs and a lintel, wood wash + ink. */
function doorFrame(ink: InkStyle, seed: number): string {
  const win = winOf(2)
  const fw = 28
  let out = washRect(win.x - fw, win.y - fw, fw, win.h + fw * 2, v('wood-wash'), {
    seed,
    amp: 3,
    opacity: 0.85,
    rim: 1,
    bleed: 0,
  })
  out += washRect(win.x + win.w, win.y - fw, fw, win.h + fw * 2, v('wood-wash'), {
    seed: seed + 1,
    amp: 3,
    opacity: 0.85,
    rim: 1,
    bleed: 0,
  })
  out += washRect(win.x - fw, win.y - fw, win.w + fw * 2, fw, v('wood-wash-dark'), {
    seed: seed + 2,
    amp: 3,
    opacity: 0.85,
    rim: 1,
    bleed: 0,
  })
  out += brush(
    [
      [win.x - fw / 2, win.y - fw + 4],
      [win.x - fw / 2, win.y + win.h + fw],
    ],
    { w: ink.w, seed: seed + 3, wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  out += brush(
    [
      [win.x + win.w + fw / 2, win.y - fw + 4],
      [win.x + win.w + fw / 2, win.y + win.h + fw],
    ],
    { w: ink.w, seed: seed + 4, wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  out += brush(
    [
      [win.x - fw, win.y - fw / 2],
      [win.x + win.w + fw, win.y - fw / 2],
    ],
    { w: ink.w * 1.1, seed: seed + 5, wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  return out
}

/** Near ring of the room on three depths: roof void + beam + rafters, doma floor, corner posts. */
export function interiorFrameLayer(): Layer {
  const P = AIR.interiorFrame.parts
  const D = {
    beam: effectiveDepth(AIR.interiorFrame, P.beam.depth),
    doma: effectiveDepth(AIR.interiorFrame, P.doma.depth),
    posts: effectiveDepth(AIR.interiorFrame, P.posts.depth),
  }
  const inkFrame: InkStyle = { ...inkStyle(D.posts), w: 3.2 }
  const inkBeam = inkFrame

  // Ceiling void and doma floor are drawn per face (with a small overlap at the seams, hidden
  // behind the corner posts) so face 4 is an exact copy of face 0 and the wrap stays seamless.
  const beamPitch = facePitch(D.beam)
  const beamFace = (seed: number, glow: boolean): string => {
    const x0 = 800 - beamPitch / 2 - 100
    const w = beamPitch + 200
    let rafters = ''
    for (let i = 0; i < 4; i++) {
      const x = x0 + 120 + (i * (w - 240)) / 3
      rafters += brush(
        [
          [x - 15, 150],
          [800 + (x - 800) * 0.15, -380],
        ],
        {
          w: inkBeam.w * 0.65,
          seed: seed + i,
          wobble: 2.5,
          color: inkBeam.color,
          opacity: inkBeam.opacity * 0.75,
        },
      )
    }
    return (
      rect(x0, -400, w, 620, v('wood-wash-dark')) +
      brush(
        [
          [x0, 214],
          [x0 + w, 210],
        ],
        {
          w: inkBeam.w,
          seed: seed + 11,
          wobble: 3,
          color: inkBeam.color,
          opacity: inkBeam.opacity,
        },
      ) +
      rafters +
      hatchField(x0 + 20, -390, w - 40, 590, 8 * INK.detail, 0.12, 170, seed + 12, {
        w: 1.6,
        color: inkBeam.color,
        opacity: 0.22 * inkBeam.opacity,
      }) +
      (glow
        ? wash(ellipsePts(LAMP.x, 210, 380, 130, 8, 0), v('lamp-glow'), {
            seed: seed + 13,
            amp: 20,
            opacity: 0.2,
            rim: 0,
          })
        : '')
    )
  }
  const beam =
    withWrapFace('f0-frame-beam', D.beam, beamFace(3000, true)) +
    atFace(1, D.beam, beamFace(3100, false)) +
    atFace(2, D.beam, beamFace(3200, false)) +
    atFace(3, D.beam, beamFace(3300, false))

  const domaPitch = facePitch(D.doma)
  const domaFace = (seed: number): string => {
    const x0 = 800 - domaPitch / 2 - 100
    const w = domaPitch + 200
    return (
      washRect(x0, 1040, w, 420, v('mud-wash'), {
        seed,
        amp: 6,
        opacity: 0.92,
        rim: 1,
        bleed: 0,
      }) +
      brush(
        [
          [x0, 1044],
          [x0 + w, 1040],
        ],
        { w: inkBeam.w, seed: seed + 1, wobble: 3, color: inkBeam.color, opacity: inkBeam.opacity },
      ) +
      hatchField(x0 + 20, 1060, w - 40, 380, 9 * INK.detail, 0.08, 55, seed + 2, {
        w: 1.3,
        color: inkBeam.color,
        opacity: 0.25 * inkBeam.opacity,
      })
    )
  }
  const doma =
    withWrapFace('f0-frame-doma', D.doma, domaFace(410)) +
    atFace(1, D.doma, domaFace(420)) +
    atFace(2, D.doma, domaFace(430)) +
    atFace(3, D.doma, domaFace(440))

  const postsSpan = spanOf(D.posts)
  const seamPost = (seed: number): string => cornerPost(postsSpan.x1, inkFrame, seed)
  const posts =
    withWrapFace('f0-frame-posts', D.posts, seamPost(420)) +
    atFace(1, D.posts, seamPost(430)) +
    atFace(2, D.posts, seamPost(440) + doorFrame(inkFrame, 450)) +
    atFace(3, D.posts, seamPost(460))

  return makeSvgLayer('interior-frame', AIR.interiorFrame, [
    { part: 'beam', inner: beam },
    { part: 'doma', inner: doma },
    { part: 'posts', inner: posts },
  ])
}

/* ----------------------------- interior-room ----------------------------- */

/** Wooden rail at y~180 (continuous across faces) plus sparse plaster hatch, shared by every face. */
function wallSurface(span: { x0: number; x1: number }, ink: InkStyle, sd: () => number): string {
  let out = washRect(span.x0 - 20, 172, span.x1 - span.x0 + 40, 16, v('wood-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.85,
    rim: 1,
    bleed: 0,
  })
  out += brush(
    [
      [span.x0 - 20, 180],
      [span.x1 + 20, 182],
    ],
    { w: ink.w * 0.9, seed: sd(), wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  out += hatchField(span.x0, 230, span.x1 - span.x0, 540, 80 * INK.detail, 0.2, 26, sd(), {
    w: 1.2,
    color: ink.color,
    opacity: 0.25,
  })
  return out
}

/** Face 0: header beam trim in front of the shoji, a shelf with jars, a hanging scroll. */
function wallFace0(ink: InkStyle, span: { x0: number; x1: number }): string {
  const sd = seeds(500)
  let out = wallSurface(span, ink, sd)
  out += washRect(-20, 178, 1640, 56, v('wood-wash-dark'), {
    seed: sd(),
    amp: 4,
    opacity: 0.88,
    rim: 1,
    bleed: 0,
  })
  out += brush(
    [
      [-10, 180],
      [1610, 178],
    ],
    { w: ink.w, seed: sd(), wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  out += brush(
    [
      [-10, 234],
      [1610, 232],
    ],
    { w: ink.w * 0.75, seed: sd(), wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  out += hatchField(-10, 250, 1620, 50, 14 * INK.detail, 0, 60, sd(), {
    w: 1.4,
    color: ink.color,
    opacity: 0.2 * ink.opacity,
  })
  // shelf with two jars
  out += brush(
    [
      [190, 624],
      [400, 621],
    ],
    { w: ink.w, seed: sd(), wobble: 1.5, color: ink.color, opacity: ink.opacity },
  )
  out += washRect(190, 608, 210, 14, v('wood-wash'), {
    seed: sd(),
    amp: 2,
    opacity: 0.75,
    rim: 1,
    bleed: 0,
  })
  out += wash(ellipsePts(232, 590, 20, 22, 7, 0.3), v('stone-wall'), {
    seed: sd(),
    amp: 3,
    opacity: 0.6,
    rim: 1,
  })
  out += contour(
    ellipsePts(232, 590, 20, 22, 7, 0.3),
    ink.w * 0.55,
    sd(),
    ink.color,
    ink.opacity * 0.85,
  )
  out += wash(ellipsePts(284, 594, 16, 17, 7, 1.1), v('wood-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.6,
    rim: 1,
  })
  out += contour(
    ellipsePts(284, 594, 16, 17, 7, 1.1),
    ink.w * 0.5,
    sd(),
    ink.color,
    ink.opacity * 0.85,
  )
  // hanging scroll to the right of the shoji
  const sx = 1150
  const sy = 250
  const sw = 92
  const sh = 250
  out += washRect(sx, sy, sw, sh, v('paper-lit'), { seed: sd(), amp: 3, opacity: 0.55, rim: 1 })
  out += brush(
    [
      [sx + 4, sy - 6],
      [sx + 4, sy + sh + 10],
    ],
    { w: ink.w * 0.55, seed: sd(), wobble: 1, color: ink.color, opacity: ink.opacity },
  )
  out += brush(
    [
      [sx + sw - 4, sy - 6],
      [sx + sw - 4, sy + sh + 10],
    ],
    { w: ink.w * 0.55, seed: sd(), wobble: 1, color: ink.color, opacity: ink.opacity },
  )
  out += brush(
    [
      [sx + 16, sy + 34],
      [sx + sw - 24, sy + 30],
      [sx + 26, sy + 96],
    ],
    { w: ink.w * 0.35, seed: sd(), wobble: 1.5, color: ink.color, opacity: ink.opacity * 0.8 },
  )
  out += brush(
    [
      [sx + 20, sy + 140],
      [sx + sw - 18, sy + 118],
    ],
    { w: ink.w * 0.32, seed: sd(), wobble: 1.2, color: ink.color, opacity: ink.opacity * 0.7 },
  )
  return out
}

/**
 * Face 1: the doma kitchen wall — a pot rack of 4-5 hanging pans/ladles, a shelf of jars and
 * bowls, wall hooks, and the small pale window.
 */
function wallFace1(ink: InkStyle, span: { x0: number; x1: number }): string {
  const sd = seeds(2500)
  let out = washRect(span.x0, -400, span.x1 - span.x0, 2000, v('paper'), {
    seed: sd(),
    amp: 12,
    opacity: 0.95,
    rim: 0,
    bleed: 0,
  })
  out += washRect(span.x0 + 40, -100, (span.x1 - span.x0) * 0.55, 900, v('lamp-glow'), {
    seed: sd(),
    amp: 40,
    opacity: 0.08,
    rim: 0,
  })
  out += wallSurface(span, ink, sd)
  out += brush(
    [
      [span.x0 + 20, 800],
      [span.x1 - 20, 796],
    ],
    { w: ink.w, seed: sd(), wobble: 3, color: ink.color, opacity: ink.opacity },
  )
  const win = winOf(1)
  out += wash(rectPts(win.x, win.y, win.w, win.h), v('paper-sky-low'), {
    seed: sd(),
    amp: 5,
    opacity: 0.65,
    rim: 1,
  })
  out += inkEdges(rectPts(win.x, win.y, win.w, win.h), ink.w * 0.7, sd(), ink.color, ink.opacity)
  out += brush(
    [
      [win.x + win.w / 2, win.y + 4],
      [win.x + win.w / 2, win.y + win.h - 4],
    ],
    { w: ink.w * 0.45, seed: sd(), color: ink.color, opacity: ink.opacity },
  )
  // pot rack: a rail with 5 hanging pans/ladles, kept inside the turn's visible window (y 330..420)
  const rackY = 330
  const rackX0 = span.x0 + 260
  const rackX1 = win.x - 40
  out += brush(
    [
      [rackX0, rackY],
      [rackX1, rackY + 2],
    ],
    { w: ink.w * 0.6, seed: sd(), wobble: 1.5, color: ink.color, opacity: ink.opacity },
  )
  for (let i = 0; i < 5; i++) {
    const x = rackX0 + ((rackX1 - rackX0) * (i + 0.5)) / 5
    const drop = 38 + (i % 2) * 28
    out += brush(
      [
        [x, rackY],
        [x, rackY + drop],
      ],
      { w: 1.4, seed: sd(), wobble: 0.6, color: ink.color, opacity: ink.opacity * 0.8 },
    )
    const r = 13 + (i % 3) * 4
    out += wash(ellipsePts(x, rackY + drop + r * 0.7, r, r * 0.7, 6, i), v('wood-wash-dark'), {
      seed: sd(),
      amp: 3,
      opacity: 0.75,
      rim: 1,
    })
    out += contour(
      ellipsePts(x, rackY + drop + r * 0.7, r, r * 0.7, 6, i),
      ink.w * 0.4,
      sd(),
      ink.color,
      ink.opacity * 0.8,
    )
  }
  // shelf of jars and bowls, LEFT side of the wall, y 440..520
  const shx = span.x0 + 130
  out += brush(
    [
      [shx, 502],
      [shx + 190, 498],
    ],
    { w: ink.w, seed: sd(), wobble: 1.5, color: ink.color, opacity: ink.opacity },
  )
  out += washRect(shx, 486, 190, 16, v('wood-wash'), {
    seed: sd(),
    amp: 2,
    opacity: 0.75,
    rim: 1,
    bleed: 0,
  })
  out += wash(ellipsePts(shx + 26, 460, 18, 22, 6, 0.2), v('stone-wall'), {
    seed: sd(),
    amp: 3,
    opacity: 0.6,
    rim: 1,
  })
  out += contour(
    ellipsePts(shx + 26, 460, 18, 22, 6, 0.2),
    ink.w * 0.5,
    sd(),
    ink.color,
    ink.opacity * 0.85,
  )
  out += wash(ellipsePts(shx + 72, 466, 15, 18, 6, 0.9), v('wood-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.6,
    rim: 1,
  })
  out += contour(
    ellipsePts(shx + 72, 466, 15, 18, 6, 0.9),
    ink.w * 0.45,
    sd(),
    ink.color,
    ink.opacity * 0.85,
  )
  const bowl = rectPts(shx + 108, 472, 62, 12)
  out += wash(
    [
      [shx + 108, 472],
      [shx + 170, 472],
      [shx + 160, 486],
      [shx + 118, 486],
    ],
    v('paper-lit'),
    {
      seed: sd(),
      amp: 3,
      opacity: 0.6,
      rim: 1,
    },
  )
  out += inkEdges(bowl, ink.w * 0.35, sd(), ink.color, ink.opacity * 0.7)
  // hooks and hanging herb bundles filling the wall either side of the kamado's footprint
  // (x ~600..960 on the nearer hearth part), so they read as distinct from its pots
  const hookXs = [span.x0 + 360, span.x0 + 480, win.x - 140, win.x - 60]
  for (let i = 0; i < hookXs.length; i++) {
    const x = hookXs[i] ?? span.x0 + 360
    const hookY = 590
    const drop = 40 + (i % 2) * 26
    out += hatch(x, hookY - 8, 10, Math.PI / 2, 1.6, ink.color, 0.55 * ink.opacity)
    out += brush(
      [
        [x, hookY],
        [x, hookY + drop],
      ],
      {
        w: 1.2,
        seed: sd(),
        wobble: 0.5,
        color: ink.color,
        opacity: ink.opacity * 0.7,
      },
    )
    out += wash(ellipsePts(x, hookY + drop + 16, 15, 20, 6, i), v('thatch-wash'), {
      seed: sd(),
      amp: 3,
      opacity: 0.6,
      rim: 1,
    })
    out += hatchField(x - 11, hookY + drop, 22, 32, 5 * INK.detail, 0.4, 12, sd(), {
      w: 1.1,
      color: ink.color,
      opacity: 0.4,
    })
  }
  return out
}

/** Face 2: the front wall from inside — the entrance, with the rainy yard painted in the opening. */
function wallFace2(ink: InkStyle, span: { x0: number; x1: number }): string {
  const sd = seeds(4000)
  const win = winOf(2)
  let out = washRect(span.x0, -400, win.x - span.x0, 2000, v('paper'), {
    seed: sd(),
    amp: 10,
    opacity: 0.95,
    rim: 0,
    bleed: 0,
  })
  out += washRect(win.x + win.w, -400, span.x1 - (win.x + win.w), 2000, v('paper'), {
    seed: sd(),
    amp: 10,
    opacity: 0.95,
    rim: 0,
    bleed: 0,
  })
  out += washRect(win.x, -400, win.w, win.y + 400, v('paper'), {
    seed: sd(),
    amp: 10,
    opacity: 0.95,
    rim: 0,
    bleed: 0,
  })
  out += wallSurface(span, ink, sd)
  out += brush(
    [
      [span.x0 + 20, 800],
      [win.x - 10, 798],
    ],
    { w: ink.w, seed: sd(), wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  out += brush(
    [
      [win.x + win.w + 10, 800],
      [span.x1 - 20, 802],
    ],
    { w: ink.w, seed: sd(), wobble: 2, color: ink.color, opacity: ink.opacity },
  )
  // the rainy yard glimpsed through the opening: pale sky, a stone-edged wet path with a puddle
  out += washRect(win.x, win.y, win.w, win.h * 0.4, v('paper-sky'), {
    seed: sd(),
    amp: 8,
    opacity: 0.75,
    rim: 0,
    bleed: 0,
  })
  out += washRect(win.x, win.y + win.h * 0.32, win.w, win.h * 0.3, v('hedge'), {
    seed: sd(),
    amp: 10,
    opacity: 0.55,
    rim: 1,
  })
  out += washRect(win.x, win.y + win.h * 0.58, win.w, win.h * 0.42, v('road'), {
    seed: sd(),
    amp: 10,
    opacity: 0.6,
    rim: 1,
    bleed: 0,
  })
  out += wash(
    ellipsePts(win.x + win.w * 0.6, win.y + win.h * 0.76, win.w * 0.13, win.h * 0.06, 6, 0.4),
    v('puddle'),
    {
      seed: sd(),
      amp: 4,
      opacity: 0.35,
      glaze: true,
    },
  )
  out += wash(
    ellipsePts(win.x + win.w * 0.32, win.y + win.h * 0.9, win.w * 0.1, win.h * 0.045, 6, 1.1),
    v('puddle'),
    {
      seed: sd(),
      amp: 3,
      opacity: 0.3,
      glaze: true,
    },
  )
  // the real recipes: a small cedar and a hydrangea by the path — kept low, below the noren's
  // hem (the noren-from-behind hangs on the props part above y ~578 in this window)
  const ink0 = inkStyle(0)
  out += inkCedar(win.x + win.w * 0.8, win.y + win.h * 0.9, 0.35, sd(), {
    ink: { ...ink0, w: ink0.w * 0.4 },
    tiers: 2,
    detail: INK.detail,
  })
  out += inkHydrangea(win.x + win.w * 0.24, win.y + win.h * 0.82, 20, sd(), {
    ink: { ...ink0, w: ink0.w * 0.45 },
    florets: 6,
    detail: INK.detail,
  })
  return out
}

/** Face 3: left wall — a large window on the rainy yard, a shelf, a coat and straw hat on pegs. */
function wallFace3(ink: InkStyle, span: { x0: number; x1: number }): string {
  const sd = seeds(5500)
  let out = washRect(span.x0, -400, span.x1 - span.x0, 2000, v('paper'), {
    seed: sd(),
    amp: 12,
    opacity: 0.95,
    rim: 0,
    bleed: 0,
  })
  out += washRect(
    span.x0 + (span.x1 - span.x0) * 0.5,
    250,
    (span.x1 - span.x0) * 0.4,
    500,
    v('lamp-glow'),
    {
      seed: sd(),
      amp: 40,
      opacity: 0.06,
      rim: 0,
    },
  )
  out += wallSurface(span, ink, sd)
  out += brush(
    [
      [span.x0 + 20, 800],
      [span.x1 - 20, 796],
    ],
    { w: ink.w, seed: sd(), wobble: 3, color: ink.color, opacity: ink.opacity },
  )
  const win = winOf(3)
  // the yard inside the window, painted with the real recipes at small scale
  out += washRect(win.x, win.y, win.w, win.h * 0.5, v('paper-sky'), {
    seed: sd(),
    amp: 6,
    opacity: 0.75,
    rim: 0,
    bleed: 0,
  })
  out += washRect(win.x, win.y + win.h * 0.42, win.w, win.h * 0.58, v('road'), {
    seed: sd(),
    amp: 8,
    opacity: 0.6,
    rim: 1,
    bleed: 0,
  })
  out += wash(
    ellipsePts(win.x + win.w * 0.5, win.y + win.h * 0.86, win.w * 0.16, win.h * 0.05, 6, 0.2),
    v('puddle'),
    {
      seed: sd(),
      amp: 3,
      opacity: 0.32,
      glaze: true,
    },
  )
  const ink0 = inkStyle(0)
  out += inkCedar(win.x + win.w * 0.18, win.y + win.h * 0.7, 0.34, sd(), {
    ink: { ...ink0, w: ink0.w * 0.4 },
    tiers: 3,
    detail: INK.detail,
  })
  out += inkHydrangea(win.x + win.w * 0.76, win.y + win.h * 0.78, 15, sd(), {
    ink: { ...ink0, w: ink0.w * 0.4 },
    florets: 5,
    detail: INK.detail,
  })
  out += inkEdges(rectPts(win.x, win.y, win.w, win.h), ink.w * 0.75, sd(), ink.color, ink.opacity)
  out += brush(
    [
      [win.x + win.w / 2, win.y + 4],
      [win.x + win.w / 2, win.y + win.h - 4],
    ],
    {
      w: ink.w * 0.45,
      seed: sd(),
      color: ink.color,
      opacity: ink.opacity,
    },
  )
  out += brush(
    [
      [win.x + 4, win.y + win.h / 2],
      [win.x + win.w - 4, win.y + win.h / 2],
    ],
    {
      w: ink.w * 0.45,
      seed: sd(),
      color: ink.color,
      opacity: ink.opacity,
    },
  )
  // shelf with jars, left of the window
  const shx = win.x - 140
  out += brush(
    [
      [shx, 500],
      [shx + 120, 497],
    ],
    { w: ink.w, seed: sd(), wobble: 1.5, color: ink.color, opacity: ink.opacity },
  )
  out += washRect(shx, 484, 120, 14, v('wood-wash'), {
    seed: sd(),
    amp: 2,
    opacity: 0.75,
    rim: 1,
    bleed: 0,
  })
  out += wash(ellipsePts(shx + 26, 466, 15, 17, 6, 0.2), v('stone-wall'), {
    seed: sd(),
    amp: 3,
    opacity: 0.6,
    rim: 1,
  })
  out += contour(
    ellipsePts(shx + 26, 466, 15, 17, 6, 0.2),
    ink.w * 0.5,
    sd(),
    ink.color,
    ink.opacity * 0.85,
  )
  out += wash(ellipsePts(shx + 68, 470, 13, 15, 6, 0.9), v('wood-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.6,
    rim: 1,
  })
  out += contour(
    ellipsePts(shx + 68, 470, 13, 15, 6, 0.9),
    ink.w * 0.45,
    sd(),
    ink.color,
    ink.opacity * 0.85,
  )
  // a coat and a straw hat hanging on pegs, right of the window
  const px = win.x + win.w + 60
  out += brush(
    [
      [px, 460],
      [px, 500],
    ],
    { w: ink.w * 0.4, seed: sd(), color: ink.color, opacity: ink.opacity },
  )
  // coat: body, two sleeves, a collar and 5 drape folds (not a flat blob)
  const coat: P2[] = [
    [px - 28, 502],
    [px - 18, 484],
    [px + 18, 484],
    [px + 28, 502],
    [px + 22, 656],
    [px - 22, 656],
  ]
  out += wash(coat, v('indigo-wash'), { seed: sd(), amp: 5, opacity: 0.62, rim: 1 })
  out += contour(coat, ink.w * 0.7, sd(), ink.color, ink.opacity)
  const sleeveL: P2[] = [
    [px - 26, 498],
    [px - 50, 512],
    [px - 56, 580],
    [px - 36, 588],
    [px - 22, 536],
  ]
  out += wash(sleeveL, v('indigo-wash'), { seed: sd(), amp: 4, opacity: 0.58, rim: 1 })
  out += contour(sleeveL, ink.w * 0.55, sd(), ink.color, ink.opacity)
  const sleeveR: P2[] = [
    [px + 26, 498],
    [px + 50, 512],
    [px + 56, 580],
    [px + 36, 588],
    [px + 22, 536],
  ]
  out += wash(sleeveR, v('indigo-wash'), { seed: sd(), amp: 4, opacity: 0.58, rim: 1 })
  out += contour(sleeveR, ink.w * 0.55, sd(), ink.color, ink.opacity)
  out += wash(
    [
      [px - 16, 486],
      [px, 480],
      [px + 16, 486],
      [px, 500],
    ],
    v('paper-cool'),
    { seed: sd(), amp: 2, opacity: 0.5, rim: 1 },
  )
  out += brush(
    [
      [px - 16, 486],
      [px, 502],
      [px + 16, 486],
    ],
    {
      w: ink.w * 0.35,
      seed: sd(),
      wobble: 0.5,
      color: ink.color,
      opacity: ink.opacity,
    },
  )
  for (let i = 0; i < 5; i++) {
    const fx = px - 18 + i * 9
    out += brush(
      [
        [fx, 505 + (i % 2) * 4],
        [fx + (i % 2 ? 4 : -4), 650],
      ],
      {
        w: 1.3,
        seed: sd(),
        wobble: 1,
        color: ink.color,
        opacity: ink.opacity * 0.5,
        taper: [0.3, 0.1],
      },
    )
  }
  // straw hat: a crown, a wide brim, and radial hatch for the woven straw
  out += wash(ellipsePts(px, 414, 22, 12, 8, 0.1), v('thatch-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.7,
    rim: 1,
  })
  out += contour(ellipsePts(px, 414, 22, 12, 8, 0.1), ink.w * 0.5, sd(), ink.color, ink.opacity)
  out += wash(ellipsePts(px, 430, 52, 18, 10, 0), v('thatch-wash'), {
    seed: sd(),
    amp: 4,
    opacity: 0.68,
    rim: 1,
  })
  out += contour(ellipsePts(px, 430, 52, 18, 10, 0), ink.w * 0.55, sd(), ink.color, ink.opacity)
  const spokes = 12
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2
    out += hatch(px, 430, 46, a, 1.1, ink.color, 0.4 * ink.opacity)
  }
  // a small hanging bamboo basket on the wall, left of the shelf
  const bx = shx - 90
  out += brush(
    [
      [bx, 430],
      [bx, 460],
    ],
    { w: ink.w * 0.4, seed: sd(), color: ink.color, opacity: ink.opacity * 0.7 },
  )
  out += wash(ellipsePts(bx, 486, 26, 24, 7, 0), v('thatch-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.7,
    rim: 1.2,
  })
  out += contour(ellipsePts(bx, 486, 26, 24, 7, 0), ink.w * 0.55, sd(), ink.color, ink.opacity)
  out += hatchField(bx - 20, 466, 40, 36, 8 * INK.detail, 0.3, 12, sd(), {
    w: 1.1,
    color: ink.color,
    opacity: 0.4,
  })
  return out
}

const FLOOR = {
  far: [330, 1270] as const,
  near: [100, 1500] as const,
  yFar: 800,
  yMid: 905,
  yNear: 1100,
}

/**
 * Converging tatami mats in true perspective (the old FLOOR geometry): a 2-row x `cols` grid of
 * trapezoids narrowing toward the far wall, each with a wash fill, an ink border along its own
 * (possibly slanted) edges, and weave strands that follow those edges — alternating direction
 * per mat.
 */
function matGridPerspective(ink: InkStyle, seedBase: number, cols = 3): string {
  const { far, near, yFar, yMid, yNear } = FLOOR
  const xAt = (y: number, u: number): number => {
    const t = (y - yFar) / (yNear - yFar)
    const l = far[0] + (near[0] - far[0]) * t
    const r = far[1] + (near[1] - far[1]) * t
    return l + (r - l) * u
  }
  const rows: [number, number][] = [
    [yFar, yMid],
    [yMid, yNear],
  ]
  const marksPerMat = Math.round(18 * INK.detail)
  let out = ''
  rows.forEach(([y0, y1], ri) => {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols
      const u1 = (c + 1) / cols
      const pts: P2[] = [
        [xAt(y0, u0), y0],
        [xAt(y0, u1), y0],
        [xAt(y1, u1), y1],
        [xAt(y1, u0), y1],
      ]
      const odd = (ri + c) % 2 === 1
      const seed = seedBase + ri * 37 + c * 11
      out += wash(pts, v('tatami'), { seed, amp: 4, opacity: 0.75, rim: 1.4, bleed: 0 })
      out += inkEdges(pts, ink.w * 0.65, seed + 1, ink.color, ink.opacity * 0.85)
      for (let k = 1; k <= marksPerMat; k++) {
        const frac = k / (marksPerMat + 1)
        if (odd) {
          const u = u0 + (u1 - u0) * frac
          out += brush(
            [
              [xAt(y0, u), y0 + 2],
              [xAt(y1, u), y1 - 2],
            ],
            {
              w: 1.1,
              seed: seed + 20 + k,
              wobble: 0.4,
              color: ink.color,
              opacity: 0.26 * ink.opacity,
            },
          )
        } else {
          const y = y0 + (y1 - y0) * frac
          out += brush(
            [
              [xAt(y, u0) + 3, y],
              [xAt(y, u1) - 3, y],
            ],
            {
              w: 1.1,
              seed: seed + 20 + k,
              wobble: 0.4,
              color: ink.color,
              opacity: 0.26 * ink.opacity,
            },
          )
        }
      }
    }
  })
  return out
}

/** Earthen doma floor for face 1: a mud wash, converging scuff strokes, and a raised board edge. */
function earthFloor(ink: InkStyle, x0: number, x1: number): string {
  const { yFar, yNear } = FLOOR
  const sd = seeds(6600)
  let out = washRect(x0, yFar, x1 - x0, yNear - yFar + 100, v('mud-wash'), {
    seed: sd(),
    amp: 10,
    opacity: 0.85,
    rim: 1,
    bleed: 0,
  })
  const vp = 800
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.5) / 5
    const nearX = x0 + (x1 - x0) * u
    const farX = vp + (nearX - vp) * 0.32
    out += brush(
      [
        [farX, yFar + 24],
        [nearX, yNear - 8],
      ],
      {
        w: 1.6,
        seed: sd(),
        wobble: 3,
        color: ink.color,
        opacity: 0.22 * ink.opacity,
        taper: [0.4, 0.1],
      },
    )
  }
  out += washRect(x0, yFar - 12, x1 - x0, 16, v('wood-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.85,
    rim: 1,
    bleed: 0,
  })
  out += inkEdges(rectPts(x0, yFar - 12, x1 - x0, 16), ink.w * 0.6, sd(), ink.color, ink.opacity)
  out += hatchField(
    x0 + 10,
    yFar + 12,
    x1 - x0 - 20,
    yNear - yFar - 30,
    30 * INK.detail,
    0.15,
    30,
    sd(),
    {
      w: 1.3,
      color: ink.color,
      opacity: 0.25 * ink.opacity,
    },
  )
  return out
}

/** Face 0: the fire pit (irori) with an ember wash, and the indigo cushion. */
function hearthFace0(ink: InkStyle): string {
  const sd = seeds(700)
  const cx = 800
  const cy = 950
  let out = wash(ellipsePts(cx, cy + 20, 110, 45, 8, 0), v('wood-wash-dark'), {
    seed: sd(),
    amp: 6,
    opacity: 0.8,
    rim: 1,
  })
  out += contour(ellipsePts(cx, cy + 20, 110, 45, 8, 0), ink.w, sd(), ink.color, ink.opacity)
  out += wash(ellipsePts(cx, cy + 8, 66, 26, 7, 0.3), v('ember'), {
    seed: sd(),
    amp: 4,
    opacity: 0.75,
    rim: 1,
  })
  out += hatch(cx - 20, cy, 18, 0.5, 2, v('lamp'), 0.7)
  out += hatch(cx + 10, cy - 4, 14, 2.2, 2, v('lamp'), 0.6)
  out += hatch(cx - 4, cy + 6, 12, 1.1, 1.6, v('lamp-core'), 0.6)
  const cushion = rectPts(1000, 950, 150, 50)
  out += wash(cushion, v('indigo-wash'), { seed: sd(), amp: 6, opacity: 0.7, rim: 1.2 })
  out += inkEdges(cushion, ink.w * 0.6, sd(), ink.color, ink.opacity)
  return out
}

/**
 * Face 1: a large kamado clay stove with two pots (one steaming), a bucket, a bamboo basket and
 * a chopping board on the earthen floor.
 */
/**
 * A large kamado with two firebox mouths and two pots (one steaming), plus a water jar, a
 * bucket, a bamboo basket and a chopping board standing on the floor beside it. Kept inside the
 * turn's visible window: the stove-and-pots assembly spans y ~620..980, the floor goods y ~880..1000.
 */
function hearthFace1(ink: InkStyle): string {
  const sd = seeds(2700)
  const x = 780
  const domeBottom = 980
  const body: P2[] = [
    [x - 175, domeBottom],
    [x - 160, 830],
    [x - 40, 740],
    [x + 100, 760],
    [x + 168, 850],
    [x + 178, domeBottom],
  ]
  let out = wash(body, v('stone-wall'), { seed: sd(), amp: 6, opacity: 0.85, rim: 1.2 })
  out += contour(body, ink.w, sd(), ink.color, ink.opacity)
  out += hatchField(x - 160, 760, 340, 200, 18 * INK.detail, 0.2, 24, sd(), {
    w: 1.2,
    color: ink.color,
    opacity: 0.2 * ink.opacity,
  })
  // two firebox mouths, low on the dome's front
  const mouth1 = rectPts(x - 115, 900, 58, 55)
  out += wash(mouth1, v('ember'), { seed: sd(), amp: 3, opacity: 0.8, rim: 1 })
  out += inkEdges(mouth1, ink.w * 0.55, sd(), ink.color, ink.opacity)
  out += hatch(x - 98, 930, 12, 0.6, 1.6, v('lamp'), 0.7)
  const mouth2 = rectPts(x + 30, 895, 52, 55)
  out += wash(mouth2, v('ember'), { seed: sd(), amp: 3, opacity: 0.6, rim: 1, glaze: true })
  out += inkEdges(mouth2, ink.w * 0.5, sd(), ink.color, ink.opacity * 0.8)
  // two pots sitting on the dome's flat top: the left one lidded and quiet, the right one steaming
  out += wash(ellipsePts(x - 85, 690, 48, 28, 7, 0.2), v('wood-wash-dark'), {
    seed: sd(),
    amp: 4,
    opacity: 0.8,
    rim: 1,
  })
  out += contour(ellipsePts(x - 85, 690, 48, 28, 7, 0.2), ink.w * 0.7, sd(), ink.color, ink.opacity)
  out += wash(ellipsePts(x + 70, 665, 44, 26, 7, 0.6), v('wood-wash-dark'), {
    seed: sd(),
    amp: 4,
    opacity: 0.8,
    rim: 1,
  })
  out += contour(
    ellipsePts(x + 70, 665, 44, 26, 7, 0.6),
    ink.w * 0.65,
    sd(),
    ink.color,
    ink.opacity,
  )
  out += brush(
    [
      [x + 48, 645],
      [x + 34, 590],
      [x + 52, 550],
    ],
    { w: 3, seed: sd(), wobble: 2, color: v('paper'), opacity: 0.28, taper: [0.05, 0.4] },
  )
  out += brush(
    [
      [x + 86, 642],
      [x + 96, 594],
      [x + 78, 558],
    ],
    { w: 2.4, seed: sd(), wobble: 2, color: v('paper'), opacity: 0.24, taper: [0.05, 0.4] },
  )
  // water jar, bucket, basket and chopping board standing on the floor, y ~880..1000
  const jar: P2[] = [
    [x + 250, 1000],
    [x + 236, 940],
    [x + 250, 890],
    [x + 300, 890],
    [x + 314, 940],
    [x + 300, 1000],
  ]
  out += wash(jar, v('mud-wash'), { seed: sd(), amp: 4, opacity: 0.8, rim: 1.2 })
  out += contour(jar, ink.w * 0.6, sd(), ink.color, ink.opacity)
  out += hatch(x + 260, 905, 30, 0, 1.4, ink.color, 0.4 * ink.opacity)
  const bucket: P2[] = [
    [x + 340, 1000],
    [x + 330, 920],
    [x + 388, 920],
    [x + 382, 1000],
  ]
  out += wash(bucket, v('wood-wash'), { seed: sd(), amp: 3, opacity: 0.8, rim: 1 })
  out += inkEdges(bucket, ink.w * 0.6, sd(), ink.color, ink.opacity)
  out += brush(
    [
      [x + 334, 916],
      [x + 359, 890],
      [x + 384, 916],
    ],
    {
      w: 1.6,
      seed: sd(),
      color: ink.color,
      opacity: ink.opacity,
    },
  )
  out += wash(ellipsePts(x - 280, 940, 44, 38, 8, 0), v('thatch-wash'), {
    seed: sd(),
    amp: 4,
    opacity: 0.75,
    rim: 1.2,
  })
  out += contour(ellipsePts(x - 280, 940, 44, 38, 8, 0), ink.w * 0.6, sd(), ink.color, ink.opacity)
  out += hatchField(x - 314, 910, 68, 56, 10 * INK.detail, 0.3, 14, sd(), {
    w: 1.2,
    color: ink.color,
    opacity: 0.4,
  })
  const board = rectPts(x - 400, 960, 96, 32)
  out += wash(board, v('wood-wash'), { seed: sd(), amp: 3, opacity: 0.8, rim: 1 })
  out += inkEdges(board, ink.w * 0.5, sd(), ink.color, ink.opacity)
  return out
}

/** Face 2: an earthen threshold step, a doormat, sandals, and an umbrella leaning by the door. */
function hearthFace2(ink: InkStyle): string {
  const sd = seeds(4700)
  const win = winOf(2)
  const stepY = 820
  let out = washRect(win.x - 40, stepY, win.w + 80, 46, v('wood-wash'), {
    seed: sd(),
    amp: 4,
    opacity: 0.85,
    rim: 1,
    bleed: 0,
  })
  out += inkEdges(
    rectPts(win.x - 40, stepY, win.w + 80, 46),
    ink.w * 0.65,
    sd(),
    ink.color,
    ink.opacity,
  )
  const mat = rectPts(760, stepY - 62, 320, 55)
  out += wash(mat, v('thatch-wash'), { seed: sd(), amp: 5, opacity: 0.7, rim: 1 })
  out += inkEdges(mat, ink.w * 0.55, sd(), ink.color, ink.opacity)
  out += wash(ellipsePts(792, stepY - 25, 26, 12, 6, 0), v('wood-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.65,
    rim: 1,
  })
  out += contour(
    ellipsePts(792, stepY - 25, 26, 12, 6, 0),
    ink.w * 0.5,
    sd(),
    ink.color,
    ink.opacity,
  )
  out += wash(ellipsePts(852, stepY - 27, 26, 12, 6, 0.2), v('wood-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.65,
    rim: 1,
  })
  out += contour(
    ellipsePts(852, stepY - 27, 26, 12, 6, 0.2),
    ink.w * 0.5,
    sd(),
    ink.color,
    ink.opacity,
  )
  // umbrella leaning by the door
  const ux = win.x - 66
  const uTop = 540
  const uBot = 830
  out += brush(
    [
      [ux, uTop],
      [ux + 18, uBot],
    ],
    { w: 2, seed: sd(), wobble: 2, color: ink.color, opacity: ink.opacity, taper: [0.1, 0.3] },
  )
  const canopy: P2[] = [
    [ux - 34, uTop + 58],
    [ux, uTop],
    [ux + 34, uTop + 58],
    [ux + 18, uTop + 70],
    [ux, uTop + 48],
    [ux - 18, uTop + 70],
  ]
  out += wash(canopy, v('indigo-wash'), { seed: sd(), amp: 5, opacity: 0.7, rim: 1 })
  out += contour(canopy, ink.w * 0.55, sd(), ink.color, ink.opacity)
  return out
}

/** Face 3: a rake, a hoe and a sickle leaning in the corner, and a rolled futon. */
/** A rake with a crossbar and tines, a hoe with a clear flat blade, a sickle with a hooked
 * crescent blade, and a folded futon with a striped glaze — all drawn as recognisable heads. */
function hearthFace3(ink: InkStyle): string {
  const sd = seeds(5700)
  // rake: handle, crossbar, four tines
  let out = brush(
    [
      [700, 1020],
      [665, 840],
    ],
    {
      w: ink.w * 0.5,
      seed: sd(),
      wobble: 2,
      color: ink.color,
      opacity: ink.opacity,
      taper: [0.3, 0.08],
    },
  )
  out += brush(
    [
      [638, 828],
      [694, 819],
    ],
    { w: ink.w * 0.45, seed: sd(), wobble: 1, color: ink.color, opacity: ink.opacity },
  )
  for (let i = 0; i < 4; i++) {
    const tx = 646 + i * 15
    out += brush(
      [
        [tx, 825 - i * 1.5],
        [tx - 3, 796 - i * 2],
      ],
      {
        w: 1.6,
        seed: sd(),
        wobble: 0.6,
        color: ink.color,
        opacity: ink.opacity * 0.85,
        taper: [0.2, 0.05],
      },
    )
  }
  // hoe: handle, a clear flat blade at an angle with a cutting edge line
  out += brush(
    [
      [738, 1020],
      [772, 852],
    ],
    {
      w: ink.w * 0.45,
      seed: sd(),
      wobble: 2,
      color: ink.color,
      opacity: ink.opacity,
      taper: [0.3, 0.08],
    },
  )
  const hoeHead: P2[] = [
    [758, 846],
    [800, 828],
    [808, 852],
    [766, 872],
  ]
  out += wash(hoeHead, v('wood-wash'), { seed: sd(), amp: 3, opacity: 0.68, rim: 1 })
  out += inkEdges(hoeHead, ink.w * 0.5, sd(), ink.color, ink.opacity)
  out += brush(
    [
      [800, 828],
      [808, 852],
    ],
    { w: 1.2, seed: sd(), color: ink.color, opacity: ink.opacity * 0.7 },
  )
  // sickle: handle, a hooked crescent blade
  out += brush(
    [
      [810, 1010],
      [826, 884],
    ],
    {
      w: ink.w * 0.4,
      seed: sd(),
      wobble: 1.5,
      color: ink.color,
      opacity: ink.opacity,
      taper: [0.3, 0.08],
    },
  )
  const blade: P2[] = [
    [826, 884],
    [862, 868],
    [880, 878],
    [886, 902],
    [864, 900],
    [838, 894],
  ]
  out += wash(blade, v('wood-wash-dark'), { seed: sd(), amp: 3, opacity: 0.75, rim: 1 })
  out += contour(blade, ink.w * 0.5, sd(), ink.color, ink.opacity)
  out += brush(
    [
      [830, 890],
      [864, 876],
      [882, 882],
    ],
    { w: 1, seed: sd(), color: ink.color, opacity: ink.opacity * 0.7 },
  )
  // rolled futon against the wall, with a striped glaze along its length
  const fa: P2 = [900, 900]
  const fb: P2 = [1000, 890]
  const fd: P2 = [910, 962]
  const fc: P2 = [1010, 950]
  const futon: P2[] = [fa, fb, fc, fd]
  out += wash(futon, v('paper-cool'), { seed: sd(), amp: 5, opacity: 0.7, rim: 1.2 })
  out += contour(futon, ink.w * 0.6, sd(), ink.color, ink.opacity)
  const lerp2 = (a: P2, b: P2, t: number): P2 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ]
  for (let i = 0; i < 3; i++) {
    const t0 = 0.18 + i * 0.26
    const t1 = t0 + 0.09
    const stripe: P2[] = [
      lerp2(fa, fb, t0),
      lerp2(fa, fb, t1),
      lerp2(fd, fc, t1),
      lerp2(fd, fc, t0),
    ]
    out += wash(stripe, v('indigo-wash'), { seed: sd(), amp: 2, opacity: 0.24, glaze: true })
  }
  return out
}

/**
 * The room on three depths: back/side/front/left walls (opaque backdrops for faces 1-3, the
 * lighter face-0 trim in front of the shoji), the tatami/earthen floor, and near hearth objects.
 * The animated props (kettle, lamp, steam) live in interiorPropsLayer.
 */
export function interiorRoomLayer(): Layer {
  const P = AIR.interiorRoom.parts
  const D = {
    wall: effectiveDepth(AIR.interiorRoom, P.wall.depth),
    tatami: effectiveDepth(AIR.interiorRoom, P.tatami.depth),
    hearth: effectiveDepth(AIR.interiorRoom, P.hearth.depth),
  }
  const inkWall = inkStyle(D.wall)
  const inkTatami = inkStyle(D.tatami)
  const inkHearth = inkStyle(D.hearth)
  const wallSpan = spanOf(D.wall)
  const tatamiSpan = spanOf(D.tatami)

  const wall =
    withWrapFace('f0-room-wall', D.wall, wallFace0(inkWall, wallSpan)) +
    atFace(1, D.wall, wallFace1(inkWall, wallSpan)) +
    atFace(2, D.wall, wallFace2(inkWall, wallSpan)) +
    atFace(3, D.wall, wallFace3(inkWall, wallSpan))

  const tatamiFace0 =
    matGridPerspective(inkTatami, 8000, 3) +
    wash(ellipsePts(1000, 990, 380, 160, 8, 0), v('lamp-glow'), {
      seed: 8900,
      amp: 20,
      opacity: 0.22,
      rim: 0,
    })
  const tatami =
    withWrapFace('f0-room-tatami', D.tatami, tatamiFace0) +
    atFace(1, D.tatami, earthFloor(inkTatami, tatamiSpan.x0, tatamiSpan.x1)) +
    atFace(2, D.tatami, matGridPerspective(inkTatami, 8200, 2)) +
    atFace(3, D.tatami, matGridPerspective(inkTatami, 8400, 3))

  const hearth =
    withWrapFace('f0-room-hearth', D.hearth, hearthFace0(inkHearth)) +
    atFace(1, D.hearth, hearthFace1(inkHearth)) +
    atFace(2, D.hearth, hearthFace2(inkHearth)) +
    atFace(3, D.hearth, hearthFace3(inkHearth))

  return makeSvgLayer('interior-room', AIR.interiorRoom, [
    { part: 'wall', inner: wall },
    { part: 'tatami', inner: tatami },
    { part: 'hearth', inner: hearth },
  ])
}

/** The noren seen from behind, hanging in the entrance opening (face 2 only): folds + a crest. */
function norenFace2(): string {
  const sd = seeds(9200)
  const win = winOf(2)
  const rodY = win.y - 10
  const cx = win.x + win.w / 2
  const panelW = (win.w - 40) / 2
  const h = win.h * 0.42
  let out = rect(win.x + 10, rodY - 6, win.w - 20, 6, v('wood-dark'))
  for (const px of [win.x + 20, win.x + 30 + panelW]) {
    // fully opaque cloth: no bleed halo, so nothing behind (the yard, on a farther part) shows through
    out += wash(rectPts(px, rodY, panelW, h), v('indigo-wash'), {
      seed: sd(),
      amp: 6,
      opacity: 0.9,
      rim: 1.2,
      bleed: 0,
    })
    for (let i = 0; i < 5; i++) {
      const fx = px + (panelW * (i + 0.5)) / 5
      const bow = i % 2 ? 3 : -3
      out += brush(
        [
          [fx, rodY + 4],
          [fx + bow, rodY + h * 0.5],
          [fx, rodY + h - 4],
        ],
        { w: 1.6, seed: sd(), wobble: 0.6, color: v('ink-mid'), opacity: 0.4, taper: [0.3, 0.3] },
      )
    }
  }
  // a crest where the panels meet: a brush ring
  out += brush(ellipsePts(cx, rodY + h * 0.4, 18, 18, 10, 0), {
    w: 2.4,
    seed: sd(),
    close: true,
    wobble: 1,
    color: v('paper'),
    opacity: 0.55,
  })
  return out
}

/**
 * Kettle on its chain (a continuous ink outline with a lid, spout, bail handle, a chain of link
 * marks and a carp counterweight), the lamp with its ribs, steam curls: the room's animated
 * props (live plane).
 */
function kettleAssembly(inkProps: InkStyle): string {
  const sd = seeds(1000)
  const cx = 800
  const topY = 560
  const bodyTop = 770
  const bodyBot = 866
  let out = brush(
    [
      [cx, 230],
      [cx, topY],
    ],
    { w: 2, seed: sd(), wobble: 1, color: v('ink-mid'), opacity: 0.6 },
  )
  for (let i = 0; i < 7; i++) out += hatch(cx - 5, 250 + i * 44, 10, 0, 1.4, v('ink-mid'), 0.5)
  // carp counterweight
  const carp: P2[] = [
    [cx - 40, 410],
    [cx - 22, 400],
    [cx - 2, 406],
    [cx + 8, 418],
    [cx - 2, 430],
    [cx - 22, 434],
    [cx - 38, 426],
  ]
  out += wash(carp, v('wood-wash-dark'), { seed: sd(), amp: 3, opacity: 0.8, rim: 1 })
  out += contour(carp, inkProps.w * 0.55, sd(), inkProps.color, inkProps.opacity)
  out += hatch(cx - 18, 414, 10, 0.3, 1.2, inkProps.color, 0.6)
  // bail handle
  out += brush(
    [
      [cx - 38, topY + 15],
      [cx, topY - 18],
      [cx + 38, topY + 15],
    ],
    {
      w: 2.4,
      seed: sd(),
      wobble: 1,
      color: inkProps.color,
      opacity: inkProps.opacity,
    },
  )
  // body: one continuous rounded outline
  const body: P2[] = [
    [cx - 64, bodyTop + 10],
    [cx - 46, bodyTop - 6],
    [cx - 14, bodyTop - 16],
    [cx + 18, bodyTop - 14],
    [cx + 46, bodyTop - 2],
    [cx + 62, bodyTop + 16],
    [cx + 66, bodyTop + 46],
    [cx + 58, bodyBot - 14],
    [cx + 34, bodyBot],
    [cx, bodyBot + 4],
    [cx - 34, bodyBot - 2],
    [cx - 58, bodyBot - 18],
    [cx - 66, bodyTop + 44],
  ]
  out += wash(body, v('wood-wash-dark'), { seed: sd(), amp: 5, opacity: 0.85, rim: 1.4 })
  out += contour(body, inkProps.w, sd(), inkProps.color, inkProps.opacity)
  // spout
  const spout: P2[] = [
    [cx + 58, bodyTop + 10],
    [cx + 82, bodyTop - 4],
    [cx + 86, bodyTop + 10],
    [cx + 66, bodyTop + 22],
  ]
  out += wash(spout, v('wood-wash-dark'), { seed: sd(), amp: 2, opacity: 0.85, rim: 1 })
  out += contour(spout, inkProps.w * 0.65, sd(), inkProps.color, inkProps.opacity)
  // lid + knob
  out += wash(ellipsePts(cx, bodyTop - 8, 42, 14, 7, 0), v('wood-wash'), {
    seed: sd(),
    amp: 3,
    opacity: 0.85,
    rim: 1.2,
  })
  out += contour(
    ellipsePts(cx, bodyTop - 8, 42, 14, 7, 0),
    inkProps.w * 0.65,
    sd(),
    inkProps.color,
    inkProps.opacity,
  )
  out += wash(ellipsePts(cx, bodyTop - 17, 8, 6, 6, 0), v('wood-wash-dark'), {
    seed: sd(),
    amp: 1,
    opacity: 0.85,
    rim: 1,
  })
  // steam: two thin grey curls
  out += `<g class="steam">${brush(
    [
      [cx - 20, bodyTop - 20],
      [cx - 34, bodyTop - 60],
      [cx - 18, bodyTop - 90],
    ],
    {
      w: 3,
      seed: sd(),
      wobble: 3,
      color: v('paper'),
      opacity: 0.28,
      taper: [0.05, 0.4],
    },
  )}${brush(
    [
      [cx + 22, bodyTop - 16],
      [cx + 10, bodyTop - 54],
      [cx + 26, bodyTop - 82],
    ],
    {
      w: 2.4,
      seed: sd(),
      wobble: 3,
      color: v('paper'),
      opacity: 0.24,
      taper: [0.05, 0.4],
    },
  )}</g>`
  return out
}

export function interiorPropsLayer(quality: Quality): Layer {
  const inkProps = inkStyle(AIR.interiorProps.depth)
  let inner = kettleAssembly(inkProps)
  // lamp
  inner += brush(
    [
      [LAMP.x, 230],
      [LAMP.x, LAMP.y - 60],
    ],
    { w: 2, seed: 1200, color: v('ink-mid'), opacity: 0.6 },
  )
  const lampBody = rectPts(LAMP.x - 40, LAMP.y - 60, 80, 120)
  inner += wash(lampBody, v('paper-lit'), { seed: 1201, amp: 5, opacity: 0.78, rim: 1.2 })
  inner += contour(lampBody, inkProps.w, 1202, inkProps.color, inkProps.opacity)
  for (let i = -1; i <= 1; i++) {
    const rx = LAMP.x + i * 14
    inner += brush(
      [
        [rx, LAMP.y - 56],
        [rx + i * 5, LAMP.y],
        [rx, LAMP.y + 56],
      ],
      { w: 1.3, seed: 1210 + i, wobble: 0.4, color: inkProps.color, opacity: 0.55 },
    )
  }
  inner += `<g class="lamp-core">${wash(ellipsePts(LAMP.x, LAMP.y, 40, 40, 8, 0), v('lamp-core'), {
    seed: 1220,
    amp: 4,
    opacity: 0.55,
    rim: 0,
    bloom: { color: '#fff8e6', scale: 0.5, opacity: 0.5 },
  })}</g>`
  inner += rect(LAMP.x - 44, LAMP.y - 66, 88, 10, v('wood-dark'), 'rx="4"')

  const layer = makeSvgLayer(
    'interior-props',
    { ...AIR.interiorProps, live: !quality.reducedMotion },
    withWrapFace('f0-props', AIR.interiorProps.depth, inner) +
      atFace(2, AIR.interiorProps.depth, norenFace2()),
  )
  if (!quality.reducedMotion) {
    const core = layer.el.querySelector('.lamp-core')
    if (core)
      animate(core, {
        opacity: [1, 0.72, 0.95, 0.8, 1],
        duration: 2600,
        loop: true,
        ease: 'inOutSine',
      })
    const steam = layer.el.querySelector('.steam')
    if (steam)
      animate(steam, {
        translateY: [0, -24],
        opacity: [0.9, 0.2],
        duration: 4000,
        loop: true,
        ease: 'outSine',
      })
  }
  return layer
}
