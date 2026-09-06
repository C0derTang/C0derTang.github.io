import type { LayerOpts } from '../scene/types'

/**
 * Air world layer placement (depth in design px, restCz = camera z the art is authored for,
 * fade window in pass-through ratio zr, range = t window the layer exists in).
 * DOM order is far -> near, see scene/air/index.ts.
 */
export const AIR = {
  mtnFar: {
    depth: 16000,
    restCz: 0,
    range: [0, 0.87],
    parts: { ridge: { depth: 16000 }, clouds: { depth: 15000 }, mist: { depth: 14500 } },
  },
  mtnNear: {
    depth: 11000,
    restCz: 0,
    range: [0, 0.87],
    parts: { ridge: { depth: 11000 }, mist: { depth: 9600 } },
  },
  treeline: {
    depth: 8000,
    restCz: 0,
    range: [0, 0.87],
    parts: { band: { depth: 8000 }, bamboo: { depth: 7400 }, mist: { depth: 7000 } },
  },
  paddyFar: {
    depth: 4100,
    restCz: 2600,
    range: [0.5, 0.87],
    portal: true,
    parts: { horizon: { depth: 4100 }, mist: { depth: 3800 } },
  },
  paddyPlane: { depth: 3400, restCz: 2600, range: [0.5, 0.87], portal: true },
  paddyRiceNear: { depth: 2850, restCz: 2600, range: [0.5, 0.87], portal: true },
  paddyEngawa: {
    depth: 2480,
    restCz: 2600,
    fade: [0.5, 0.7],
    range: [0.5, 0.75],
    portal: true,
    parts: { eave: { depth: 2480 }, boards: { depth: 2430 }, post: { depth: 2400 } },
  },
  shoji: { depth: 1950, restCz: 1000, fade: [0.51, 0.66], range: [0, 0.7], portal: true },
  interiorRoom: {
    depth: 1550,
    restCz: 1000,
    fade: [0.45, 0.6],
    range: [0, 0.66],
    portal: true,
    parts: { wall: { depth: 1550 }, tatami: { depth: 1500 }, hearth: { depth: 1450 } },
  },
  /** Kettle, chain, lamp and steam: the animated props get their own composited plane. */
  interiorProps: { depth: 1400, restCz: 1000, fade: [0.5, 0.68], range: [0, 0.64], portal: true },
  interiorFrame: {
    depth: 1150,
    restCz: 1000,
    fade: [0.5, 0.7],
    range: [0, 0.62],
    portal: true,
    parts: { beam: { depth: 1150 }, doma: { depth: 1120 }, posts: { depth: 1100 } },
  },
  house: { depth: 500, restCz: 0, fade: [0.75, 0.87], range: [0, 0.32] },
  noren: { depth: 440, restCz: 0, fade: [0.55, 0.75], range: [0, 0.32] },
  ground: { depth: 100, restCz: 0, fade: [0.75, 0.88], range: [0, 0.31] },
  treesFore: {
    depth: -150,
    restCz: 0,
    fade: [0.6, 0.8],
    range: [0, 0.26],
    parts: { mid: { depth: -60 }, near: { depth: -150 }, bough: { depth: -200 } },
  },
} as const satisfies Record<string, LayerOpts>

/** Water world (its own camera: cz 0 -> 150 over the underwater beat). */
export const WATER = {
  ceiling: { depth: 1200, restCz: 0 },
  rays: { depth: 1000, restCz: 0 },
  stemsFar: { depth: 800, restCz: 0 },
  fishBack: { depth: 700, restCz: 0 },
  mud: { depth: 450, restCz: 0 },
  caustics: { depth: 420, restCz: 0 },
  fishMid: { depth: 300, restCz: 0 },
  fishNear: { depth: -100, restCz: 0 },
  stemsNear: { depth: -150, restCz: 0 },
} as const satisfies Record<string, LayerOpts>
