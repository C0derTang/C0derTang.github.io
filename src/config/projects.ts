import { BEATS, BEAT_IDS } from './beats'

/** The middle of the banner hold: the turn faces the +x wall there (`faces` in camera.ts). */
export const BANNER_T = 0.364

/**
 * The projects hung as banners on the +x wall, in order along it (back of the room first).
 * `t` is where a fragment starts: the banner hold, the same for all three. The banners show
 * an image each and no name (`world/scrolls.ts`); what they are is told only by the panel text
 * (`config/content.ts`, a lazy chunk), so nothing here names them.
 */
export const PROJECTS = [
  { id: 'cph2h', t: BANNER_T },
  { id: 'waifu-focus', t: BANNER_T },
  { id: 'robotics', t: BANNER_T },
] as const satisfies readonly {
  id: string
  t: number
}[]

export type ProjectId = (typeof PROJECTS)[number]['id']

/** The story position a URL fragment names: a project's hold or the start of a beat. */
export function deepLinkT(hash: string): number | undefined {
  const id = hash.replace(/^#/, '')
  const project = PROJECTS.find((p) => p.id === id)
  if (project) return project.t
  const beat = BEAT_IDS.find((b) => b === id)
  return beat ? BEATS[beat][0] : undefined
}

/** The project a URL fragment names, if it names one: its banner opens on arrival. */
export function deepLinkProject(hash: string): ProjectId | undefined {
  const id = hash.replace(/^#/, '')
  return PROJECTS.find((p) => p.id === id)?.id
}
