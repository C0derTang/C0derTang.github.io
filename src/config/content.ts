import type { TrophyId } from '../three/world/trophies'
import type { ProjectId } from './projects'

/**
 * What an opened banner or trophy says. This module is only ever reached through a dynamic
 * `import()` (`ui/focus.ts`), so it is a chunk of its own: none of this text is in the served
 * page or in the DOM until a visitor opens the object it belongs to. Never import it statically.
 */

export interface ProjectContent {
  name: string
  line: string
  facts: readonly string[]
  link: { label: string; href: string } | null
}

export interface TrophyContent {
  title: string
  description: string
}

export const PROJECT_CONTENT: Record<ProjectId, ProjectContent> = {
  cph2h: {
    name: 'CPH2H',
    line: 'Head-to-head competitive programming: live 1v1 Codeforces matches, voice and video, Elo.',
    facts: ['Built at Rice Residency', 'Sponsored, FR8'],
    link: { label: 'cph2h.com', href: 'https://cph2h.com' },
  },
  'waifu-focus': {
    name: 'Waifu Focus',
    line: 'A Chrome extension that blocks distracting sites on your schedule, with themes.',
    facts: ['1,900+ installs', '4.8 / 5'],
    link: {
      label: 'Chrome Web Store',
      href: 'https://chromewebstore.google.com/detail/waifu-focus/oilebkjfhbkbmablbmhellicongmgbml',
    },
  },
  robotics: {
    name: 'Robotics',
    line: 'Captain of VEX Team 11475B, and founder of Bakersfield Robotics, a 501(c)(3) teaching free robotics to K–8 students in three schools.',
    facts: ['2× Worlds qualifier', '3 Excellence Awards', '100+ students taught'],
    link: null,
  },
}

export const TROPHY_CONTENT: Record<TrophyId, TrophyContent> = {
  vex: {
    title: 'VEX Robotics',
    description:
      'Captain of Team 11475B, 10+ competitions, twice qualified for the World Championship, three Excellence Awards.',
  },
  scibowl: { title: 'National Science Bowl', description: 'Top 16 in the nation, 2025.' },
  tedx: { title: 'TEDx', description: 'Speaker, 2025.' },
  usaco: { title: 'USACO', description: 'Silver division.' },
  half: { title: 'Half marathon', description: '1:58.' },
  muscleup: { title: 'Muscle ups', description: '4 in a row.' },
  bench: { title: 'Bench press', description: '225 lb.' },
  swim: { title: '100 yd freestyle', description: '50.8.' },
}

const own = <T>(table: Record<string, T>, id: string): T | undefined =>
  Object.hasOwn(table, id) ? table[id] : undefined

export const projectContent = (id: string): ProjectContent | undefined => own(PROJECT_CONTENT, id)
export const trophyContent = (id: string): TrophyContent | undefined => own(TROPHY_CONTENT, id)
