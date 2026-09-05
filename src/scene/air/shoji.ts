import { createTimeline } from 'animejs'
import { AIR } from '../../config/layers'
import { circle, linGrad, rect, shojiPanel, v, path, wobbly } from '../draw'
import { SHOJI } from '../geometry'
import { makeSvgLayer } from '../layer'
import type { Layer } from '../types'
import { attrWrite } from '../../util/dom'

/**
 * Back wall with four shoji panels. Nothing is painted behind the inner two panels: sliding
 * them open reveals the paddy layers behind. The slide is an anime timeline seeked by scroll.
 */
export function shojiLayer(): Layer {
  const S = SHOJI
  const panels = [0, 1, 2, 3].map((i) =>
    shojiPanel(S.x0 + i * S.panelW, S.y, S.panelW, S.panelH, {
      cols: 3,
      rows: 6,
      prefix: 'in-',
      cls: `shoji-panel p${i}`,
      extra: `data-i="${i}"`,
    }),
  )
  const win = S.sideWindow
  const inner = `<defs>
    ${linGrad('in-paperCool', [
      [0, v('paper-cool')],
      [1, '#cfd3c4'],
    ])}
    ${linGrad('in-paperLit', [
      [0, v('paper-lit')],
      [1, '#efcf98'],
    ])}
  </defs>
    <!-- wall pieces around the opening (the opening itself is unpainted) -->
    ${rect(-300, -300, 2200, S.y + 300, v('plaster-int'))}
    ${rect(-300, S.y, S.x0 + 300, S.panelH, v('plaster-int'))}
    ${rect(S.x0 + 4 * S.panelW, S.y, 800, S.panelH, v('plaster-int'))}
    ${rect(-300, S.floorY, 2200, 12, v('wood-dark'))}
    ${rect(-300, S.floorY + 12, 2200, 200, v('wood-dark'))}
    <path d="M-300 ${S.floorY + 40}H1900M-300 ${S.floorY + 70}H1900" stroke="${v('wood-mid')}" stroke-width="1.5" opacity=".25"/>
    ${rect(win.x, win.y, win.w, win.h, 'url(#in-paperCool)')}
    <path d="M${win.x + win.w / 2} ${win.y}v${win.h}M${win.x} ${win.y + win.h / 2}h${win.w}" stroke="${v('wood-dark')}" stroke-width="3"/>
    ${rect(win.x - 6, win.y - 6, win.w + 12, 6, v('wood-dark'))}${rect(win.x - 6, win.y + win.h, win.w + 12, 6, v('wood-dark'))}
    ${path(
      wobbly(
        [
          [1290, 300],
          [1360, 300],
          [1360, 620],
          [1290, 620],
        ],
        2,
        6,
      ),
      '#e8e0cc',
    )}
    ${rect(1284, 296, 82, 6, v('wood-dark'), 'rx="3"')}${rect(1284, 618, 82, 6, v('wood-dark'), 'rx="3"')}
    ${circle(1325, 450, 26, 'none', `stroke="${v('koi-ink')}" stroke-width="4" opacity=".8" stroke-dasharray="145 30"`)}
    <g class="panels">${panels[0] ?? ''}${panels[3] ?? ''}${panels[1] ?? ''}${panels[2] ?? ''}</g>
    ${rect(S.x0 - 14, S.y - 20, 4 * S.panelW + 28, 20, v('wood-dark'))}
    ${rect(S.x0 - 14, S.floorY, 4 * S.panelW + 28, 12, v('wood-dark'))}
    ${rect(S.x0 - 14, S.y - 20, 14, S.panelH + 32, v('wood-dark'))}
    ${rect(S.x0 + 4 * S.panelW, S.y - 20, 14, S.panelH + 32, v('wood-dark'))}`

  const layer = makeSvgLayer('shoji', AIR.shoji, inner)
  const p1 = layer.el.querySelector('.p1')
  const p2 = layer.el.querySelector('.p2')
  const coolStops = layer.el.querySelectorAll('#in-paperCool stop')
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
      const first = coolStops[0]
      if (first) attrWrite(first, 'stop-color', lastPaper)
    }
  }
  return layer
}
