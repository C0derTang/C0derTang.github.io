import type { TrophyId } from '../three/world/trophies'
import type { ProjectId } from './projects'

/**
 * What an opened banner or trophy says. This module is only ever reached through a dynamic
 * `import()` (`ui/focus.ts`), so it is a chunk of its own: none of this text is in the served
 * page or in the DOM until a visitor opens the object it belongs to. Never import it statically.
 */

export interface ProjectContent {
  /** the eyebrow above the name: what kind of project, and when */
  kicker: string
  name: string
  line: string
  /** a few short sentences, shown as a list */
  points: readonly string[]
  facts: readonly string[]
  link: { label: string; href: string } | null
}

export interface TrophyContent {
  title: string
  description: string
}

export const PROJECT_CONTENT: Record<ProjectId, ProjectContent> = {
  cph2h: {
    kicker: 'Head-to-head coding platform · 2026',
    name: 'CPH2H',
    line: 'Head-to-head competitive programming: live 1v1 Codeforces matches, voice and video, Elo.',
    points: [
      'Live 1v1 Codeforces matches with voice and video chat and Elo ratings.',
      'Built and launched during Rice Residency.',
      'Won $500 in sponsorship from FR8 for the launch tournament.',
    ],
    facts: ['Built at Rice Residency', 'Sponsored, FR8'],
    link: { label: 'cph2h.com', href: 'https://cph2h.com' },
  },
  'waifu-focus': {
    kicker: 'Productivity Chrome extension · 2024 – 2025',
    name: 'Waifu Focus',
    line: 'A Chrome extension that blocks distracting sites on your schedule, with themes.',
    points: [
      'Blocks distracting websites on schedules you set.',
      'Custom themes for the block screen and settings.',
      'Built and launched on the Chrome Web Store.',
    ],
    facts: ['1,900+ installs', '4.8 / 5'],
    link: {
      label: 'Chrome Web Store',
      href: 'https://chromewebstore.google.com/detail/waifu-focus/oilebkjfhbkbmablbmhellicongmgbml',
    },
  },
  robotics: {
    kicker: 'VEX Team 11475B · Bakersfield Robotics · 2023 – 2026',
    name: 'Robotics',
    line: 'Captain of VEX Team 11475B, and founder of Bakersfield Robotics, a 501(c)(3) teaching free robotics to K–8 students in three schools.',
    points: [
      'Captained a six-member VEX team through 10+ competitions.',
      'Qualified twice for the VEX World Championship and earned three Excellence Awards.',
      'Founded Bakersfield Robotics, a 501(c)(3) teaching free robotics to 100+ K–8 students in three schools.',
      'Secured a Cal State grant for teaching resources and classroom space.',
    ],
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
