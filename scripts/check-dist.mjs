// Fails when private text leaked into the built site: the owner's address anywhere, a phone
// number in any text file, the résumé outside its lazy chunk, the banner and trophy text outside
// the lazy chunks, and a project or trophy named in the served HTML or any other non-script file.
// Usage: node scripts/check-dist.mjs [distDir]   (default: dist)
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = process.argv[2] ?? 'dist'
// Built from parts so the address is not one literal in this repository either.
const email = [...'ude.drofnats@csgnat'].reverse().join('')
const resumePhrase = 'Paradigm Study'
const resumeChunk = /^assets\/resume-content-[^/]*\.js$/
const contentChunk = /^assets\/content-[^/]*\.js$/

// The same list as SECRETS in e2e/portfolio.spec.ts: none of it may be in the served page or
// any other text file a crawler can fetch (scripts are checked with PANEL_TEXT below instead,
// since short tokens like "225" can occur in minified code).
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
// Panel text (config/content.ts): no script but its chunk may carry it. The résumé chunk is
// exempt too: it is lazy as well, and the résumé names the same projects and awards.
const PANEL_TEXT = [
  'Science Bowl',
  'Waifu Focus',
  'Bakersfield',
  'Head-to-head competitive programming',
  'Excellence Awards',
  'Rice Residency',
  'Cal State grant',
  'Muscle ups',
  'Half marathon',
  '100 yd freestyle',
  '1:58',
]
// A US-style phone number (as in e2e/portfolio.spec.ts).
const PHONE = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/

const TEXT = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.md',
  '.txt',
  '.svg',
  '.xml',
  '.map',
])
const SCRIPT = new Set(['.js', '.mjs'])

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )

const problems = []
let checked = 0
for (const file of walk(root)) {
  const rel = relative(root, file).split('\\').join('/')
  const text = readFileSync(file, 'latin1')
  if (text.includes(email)) problems.push(`${rel}: contains the email address`)
  if (!resumeChunk.test(rel) && text.includes(resumePhrase))
    problems.push(`${rel}: contains résumé text`)

  const ext = extname(rel).toLowerCase()
  if (!TEXT.has(ext)) continue
  checked++
  // Read as UTF-8 for the text checks (latin1 above is enough for ASCII needles in binaries).
  const utf8 = readFileSync(file, 'utf8')
  if (PHONE.test(utf8)) problems.push(`${rel}: contains something like a phone number`)
  if (SCRIPT.has(ext)) {
    if (contentChunk.test(rel) || resumeChunk.test(rel)) continue
    for (const needle of PANEL_TEXT)
      if (utf8.includes(needle)) problems.push(`${rel}: contains panel text ("${needle}")`)
  } else {
    for (const secret of SECRETS)
      if (secret.test(utf8)) problems.push(`${rel}: names a project or trophy (${secret})`)
  }
}

if (checked === 0) problems.push(`no text files under ${root}: build first`)
if (problems.length) {
  console.error(`check:dist failed\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`check:dist ok (${root}, ${checked} text files)`)
