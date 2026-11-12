import { execFileSync } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { startRecording } from 'chrome-capture'
import { chromium, type Page } from 'playwright-core'

import { OUT, SITE } from './paths.ts'
import { LIVE } from './screenshots.ts'

const base = process.env.TOUR_BASE ?? LIVE
const dir = join(OUT, 'tour')
const clipDir = join(dir, 'clips')
const video = join(SITE, 'tour.mp4')
const poster = join(SITE, 'tour.jpg')
const posterAt = 28
const width = 1280
const height = 720
const fade = 0.5

const overlay = `
addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style')
  style.textContent = \`
    #tour-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px;
      border-radius: 50%; background: rgba(30,30,30,.35); border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.4);
      pointer-events: none; transition: transform .12s; left: -50px; top: -50px }
    #tour-cursor.down { transform: scale(.7); background: rgba(30,30,30,.6) }
    #tour-caption { position: fixed; z-index: 2147483646; left: 50%; top: 16px; transform: translateX(-50%);
      max-width: 1000px; padding: 14px 26px; border-radius: 14px; background: rgba(20,24,28,.88); color: #fff;
      font: 500 21px/1.35 system-ui, sans-serif; text-align: center; pointer-events: none;
      opacity: 0; transition: opacity .4s }
    #tour-caption.on { opacity: 1 }\`
  const cursor = Object.assign(document.createElement('div'), { id: 'tour-cursor' })
  const caption = Object.assign(document.createElement('div'), { id: 'tour-caption' })
  document.body.append(style, cursor, caption)
  addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px'
    cursor.style.top = e.clientY + 'px'
  }, true)
  addEventListener('mousedown', () => cursor.classList.add('down'), true)
  addEventListener('mouseup', () => cursor.classList.remove('down'), true)
})
window.tour = {
  caption(text) {
    const el = document.getElementById('tour-caption')
    if (el) {
      el.textContent = text
      el.classList.toggle('on', text !== '')
    }
  },
  scrollTo(target, duration) {
    return new Promise(resolve => {
      const start = scrollY
      const t0 = performance.now()
      const step = now => {
        const t = Math.min(1, (now - t0) / duration)
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
        window.scrollTo(0, start + (target - start) * eased)
        t < 1 ? requestAnimationFrame(step) : resolve()
      }
      requestAnimationFrame(step)
    })
  },
}
`

const wait = (page: Page, ms: number) => page.waitForTimeout(ms)

const caption = (page: Page, text: string) =>
  page.evaluate(`tour.caption(${JSON.stringify(text)})`)

const scrollTo = (page: Page, y: number, ms = 1500) =>
  page.evaluate(`tour.scrollTo(${y}, ${ms})`)

async function scrollToElement(
  page: Page,
  selector: string,
  offset = 90,
  ms = 1500,
) {
  const box = await page.locator(selector).first().boundingBox()
  const scrolled = Number(await page.evaluate('scrollY'))
  if (box) {
    await scrollTo(page, box.y + scrolled - offset, ms)
  }
}

async function moveTo(page: Page, selector: string, steps = 30) {
  const box = await page.locator(selector).first().boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps,
    })
  }
}

async function sweep(
  page: Page,
  selector: string,
  from: [number, number],
  to: [number, number],
  steps: number,
) {
  const box = await page.locator(selector).first().boundingBox()
  if (box) {
    await page.mouse.move(
      box.x + box.width * from[0],
      box.y + box.height * from[1],
      { steps: 20 },
    )
    await page.mouse.move(
      box.x + box.width * to[0],
      box.y + box.height * to[1],
      { steps },
    )
  }
}

async function drag(
  page: Page,
  selector: string,
  from: [number, number],
  dx: number,
  dy: number,
  steps = 25,
) {
  const box = await page.locator(selector).first().boundingBox()
  if (box) {
    const x = box.x + box.width * from[0]
    const y = box.y + box.height * from[1]
    await page.mouse.move(x, y, { steps: 20 })
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps })
    await page.mouse.up()
  }
}

async function ready3d(page: Page) {
  await page.locator('#structure canvas').first().waitFor({ timeout: 60_000 })
  await wait(page, 4000)
}

interface Scene {
  name: string
  setup: (page: Page) => Promise<void>
  play: (page: Page) => Promise<void>
}

const scenes: Scene[] = [
  {
    name: '01-home',
    setup: async page => {
      await page.goto(base)
      await wait(page, 1500)
    },
    play: async page => {
      await page.mouse.move(700, 600)
      await caption(
        page,
        'Interface explorer: where disease variants meet predicted protein partners',
      )
      await wait(page, 3500)
      await caption(
        page,
        'Pathogenic missense variants sit at a predicted interface 2.4× as often as benign ones',
      )
      await moveTo(page, '.tile >> nth=1')
      await wait(page, 3000)
      await caption(page, '')
      await scrollToElement(page, 'h2:has-text("Every gene in the")', 40, 2200)
      await caption(
        page,
        'Every disease gene with a confident partner, as one dot',
      )
      await sweep(page, 'svg.scatter', [0.3, 0.7], [0.8, 0.2], 110)
      await wait(page, 2000)
    },
  },
  {
    name: '02-genes',
    setup: async page => {
      await page.goto(`${base}genes/`)
      await wait(page, 1500)
    },
    play: async page => {
      await caption(
        page,
        'Every gene with a confident partner, searchable by gene or partner',
      )
      await wait(page, 1500)
      await moveTo(page, 'input[placeholder^="Filter genes"]')
      await page.locator('input[placeholder^="Filter genes"]').click()
      await page.keyboard.type('GNAO1', { delay: 180 })
      await wait(page, 1200)
      await moveTo(page, '#genes tbody tr:visible a >> nth=0')
      await wait(page, 1500)
    },
  },
  {
    name: '03-gene',
    setup: async page => {
      await page.goto(`${base}gene/GNAO1/?partner=GNB1`)
      await ready3d(page)
      await scrollTo(page, 0, 0)
      await wait(page, 500)
    },
    play: async page => {
      await caption(
        page,
        'Each gene opens on its predicted complex, one partner at a time',
      )
      await wait(page, 2500)
      await scrollToElement(page, '.partner-picks', 20, 1800)
      await caption(
        page,
        'GNAO1 grey, partner GNB1 green, interface residues blue, ClinVar variants by class',
      )
      await drag(page, '#structure canvas', [0.35, 0.5], 300, 40)
      await wait(page, 800)
      await drag(page, '#structure canvas', [0.55, 0.55], -220, -60, 22)
      await wait(page, 1500)
      await caption(
        page,
        'GNB1 is a disease protein too, so its side of the interface is painted as well',
      )
      await wait(page, 3500)
      await caption(
        page,
        'Hover the protein map and the residue lights up in 3D',
      )
      await scrollToElement(page, '#protein-map', 380, 1500)
      await sweep(page, '#protein-map svg', [0.1, 0.05], [0.75, 0.05], 45)
      await wait(page, 1000)
      await caption(
        page,
        'Click a variant to zoom to it; the address keeps the view so it can be shared',
      )
      await scrollToElement(page, '#variants', 120, 1500)
      const row = '#variants tbody tr[data-partners*="GNB1"] >> nth=0'
      await moveTo(page, row)
      await wait(page, 600)
      await page.locator(row).locator('td').first().click()
      await wait(page, 3500)
      await caption(page, 'Switch partners: GNAO1 against its RGS regulators')
      await scrollToElement(page, '.partner-picks', 20, 1500)
      const rgs = '.partner-pick:has-text("RGS4")'
      await moveTo(page, rgs, 20)
      await page.locator(rgs).first().click()
      await wait(page, 4000)
    },
  },
  {
    name: '04-leads',
    setup: async page => {
      await page.goto(`${base}leads/`)
      await wait(page, 1500)
    },
    play: async page => {
      await caption(
        page,
        'Leads: uncertain variants on an interface residue where another change is pathogenic',
      )
      await wait(page, 2500)
      await scrollToElement(page, '#leads', 120, 1800)
      await moveTo(page, '#leads tbody tr >> nth=1')
      await page.mouse.move(800, 700, { steps: 60 })
      await wait(page, 2500)
    },
  },
  {
    name: '05-isoforms',
    setup: async page => {
      await page.goto(`${base}isoforms/GNAO1/`)
      await wait(page, 1500)
    },
    play: async page => {
      await caption(
        page,
        'Isoforms: where each alternative protein differs, and which interfaces it loses',
      )
      await wait(page, 2500)
      await scrollToElement(page, 'main svg', 160, 1800)
      await sweep(page, 'main svg', [0.25, 0.6], [0.95, 0.6], 120)
      await wait(page, 2500)
    },
  },
  {
    name: '06-gpcr',
    setup: async page => {
      await page.goto(`${base}gpcr/`)
      await page.locator('main canvas').first().waitFor({ timeout: 60_000 })
      await wait(page, 4000)
    },
    play: async page => {
      await caption(
        page,
        'The blog writes up findings with live 3D: GPCR disease variants sit on Gαs',
      )
      await wait(page, 1500)
      await drag(page, 'main canvas', [0.4, 0.5], 260, 30)
      await wait(page, 2000)
      await scrollToElement(page, 'h2:has-text("complexes")', 100, 2500)
      await wait(page, 2500)
    },
  },
  {
    name: '07-jbrowse',
    setup: async page => {
      await page.goto(`${base}gene/GNAO1/?partner=GNB1`)
      const href = await page
        .locator('tr:has(a:text-is("GNB1")) a:has-text("3D + genome")')
        .first()
        .getAttribute('href')
      await page.goto(new URL(href ?? '', page.url()).href)
      await wait(page, 20000)
    },
    play: async page => {
      await caption(
        page,
        'Every interface opens in JBrowse: codons on the genome beside residues in the complex',
      )
      await page.mouse.move(950, 450, { steps: 20 })
      await page.mouse.down()
      await page.mouse.move(1150, 480, { steps: 25 })
      await page.mouse.up()
      await wait(page, 6000)
      await caption(page, base.replace(/^https?:\/\//, '').replace(/\/$/, ''))
      await wait(page, 3500)
    },
  },
]

async function record(names: string[]) {
  await mkdir(clipDir, { recursive: true })
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-gpu', '--use-angle=gl-egl'],
  })
  const context = await browser.newContext({ viewport: { width, height } })
  await context.addInitScript({ content: overlay })
  const page = await context.newPage()
  for (const scene of scenes.filter(
    s => names.length === 0 || names.some(n => s.name.includes(n)),
  )) {
    console.log(scene.name)
    await scene.setup(page)
    await page.mouse.move(width / 2, height / 2)
    const recording = await startRecording(page, {
      outputPath: join(clipDir, `${scene.name}.mp4`),
      frameRate: 60,
      maxWidth: width,
      maxHeight: height,
    })
    await scene.play(page)
    await recording.stop()
  }
  await browser.close()
}

function duration(file: string) {
  return Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        file,
      ],
      {
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ),
  )
}

async function assemble() {
  const clips = (await readdir(clipDir))
    .filter(f => f.endsWith('.mp4'))
    .sort()
    .map(f => join(clipDir, f))
  const prepare = clips.map(
    (_, i) => `[${i}:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`,
  )
  const durations = clips.slice(0, -1).map(duration)
  const fades = durations.map((_, i) => {
    const offset = durations
      .slice(0, i + 1)
      .reduce((sum, d) => sum + d - fade, 0)
    const previous = i === 0 ? 'v0' : `x${i}`
    return `[${previous}][v${i + 1}]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[x${i + 1}]`
  })
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      ...clips.flatMap(c => ['-i', c]),
      '-filter_complex',
      [...prepare, ...fades].join(';'),
      '-map',
      `[x${clips.length - 1}]`,
      '-c:v',
      'libx264',
      '-crf',
      '30',
      '-preset',
      'slow',
      '-movflags',
      '+faststart',
      '-an',
      video,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-i',
      video,
      '-ss',
      String(posterAt),
      '-frames:v',
      '1',
      '-q:v',
      '3',
      poster,
    ],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
  console.log(video, poster)
}

const args = process.argv.slice(2)
if (!args.includes('--join-only')) {
  await record(args.filter(a => !a.startsWith('--')))
}
await assemble()
