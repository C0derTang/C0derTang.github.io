import type { Quality } from '../../config/quality'
import type { Layer } from '../types'
import { paddyEngawaLayer } from './engawa'
import { groundLayer } from './ground'
import { houseLayer } from './house'
import { interiorFrameLayer, interiorRoomLayer } from './interior'
import { mtnFarLayer, mtnNearLayer } from './mountains'
import { norenLayer } from './noren'
import { paddyFarLayer, paddyPlaneLayer, paddyRiceNearLayer } from './paddy'
import { shojiLayer } from './shoji'
import { treelineLayer } from './treeline'
import { treesForeLayer } from './trees'

/** Air world layers, far -> near (DOM order = paint order). */
export function buildAirLayers(quality: Quality): Layer[] {
  const low = quality.tier === 'low'
  const layers: (Layer | null)[] = [
    low ? null : mtnFarLayer(quality),
    mtnNearLayer(),
    treelineLayer(),
    low ? null : paddyFarLayer(),
    paddyPlaneLayer(),
    paddyRiceNearLayer(),
    paddyEngawaLayer(),
    shojiLayer(),
    interiorRoomLayer(quality),
    interiorFrameLayer(),
    houseLayer(),
    low ? null : norenLayer(quality),
    groundLayer(),
    treesForeLayer(),
  ]
  return layers.filter((l): l is Layer => l !== null)
}
