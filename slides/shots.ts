import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const here = import.meta.dirname
const siteDir = join(here, '..', 'site')
const outDir = join(here, 'shots')
const live = 'https://cmdcolin.github.io/interface-atlas/'
const chrome = process.env.CHROME ?? 'google-chrome'

const contentTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
}

interface Shot {
  name: string
  url: (local: string) => string
  follow?: string
  height: number
  wait: number
}

const shots: Shot[] = [
  { name: 'home', url: local => `${local}#/`, height: 1000, wait: 2 },
  {
    name: 'gene_GNAO1',
    url: local => `${local}#/gene/GNAO1`,
    height: 1000,
    wait: 2,
  },
  {
    name: 'isoforms_APP',
    url: local => `${local}#/isoforms/APP`,
    height: 1000,
    wait: 2,
  },
  { name: 'gpcr', url: local => `${local}#/gpcr`, height: 1000, wait: 2 },
  {
    name: 'variant3d',
    url: local => `${local}#/gene/VHL`,
    follow: '#variants tr:has(.chip.pathogenic) td:last-child a',
    height: 800,
    wait: 45,
  },
]

function serveSite() {
  const server = createServer((request, response) => {
    const path = normalize(
      decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname),
    )
    const file = join(siteDir, path.endsWith('/') ? `${path}index.html` : path)
    readFile(file).then(
      body => {
        response.writeHead(200, {
          'content-type':
            contentTypes[extname(file)] ?? 'application/octet-stream',
        })
        response.end(body)
      },
      () => {
        response.writeHead(404)
        response.end()
      },
    )
  })
  return new Promise<{ origin: string; close: () => void }>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        origin:
          address && typeof address === 'object'
            ? `http://127.0.0.1:${address.port}/`
            : '',
        close: () => server.close(),
      })
    })
  })
}

async function launchChrome() {
  const profile = await mkdtemp(join(tmpdir(), 'atlas-shots-'))
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--hide-scrollbars',
      '--enable-unsafe-swiftshader',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  const endpoint = await new Promise<string>((resolve, reject) => {
    let log = ''
    child.stderr.on('data', (chunk: Buffer) => {
      log += chunk.toString()
      const match = /DevTools listening on (ws:\S+)/.exec(log)
      if (match?.[1]) {
        resolve(match[1])
      }
    })
    child.on('exit', () => reject(new Error(`${chrome} exited:\n${log}`)))
  })
  return {
    endpoint,
    close: async () => {
      child.kill()
      await new Promise(resolve => child.once('exit', resolve))
      await rm(profile, { recursive: true, force: true, maxRetries: 5 })
    },
  }
}

async function connect(endpoint: string) {
  const socket = new WebSocket(endpoint)
  const pending = new Map<number, (result: Record<string, unknown>) => void>()
  let nextId = 0
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    pending.get(message.id)?.(message.result ?? {})
    pending.delete(message.id)
  })
  await new Promise(resolve => socket.addEventListener('open', resolve))
  return {
    send: (method: string, params: object = {}, sessionId?: string) =>
      new Promise<Record<string, unknown>>(resolve => {
        nextId += 1
        pending.set(nextId, resolve)
        socket.send(JSON.stringify({ id: nextId, method, params, sessionId }))
      }),
    close: () => socket.close(),
  }
}

type Browser = Awaited<ReturnType<typeof connect>>

async function capture(browser: Browser, shot: Shot, local: string) {
  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
  })
  const { sessionId } = await browser.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  const session = String(sessionId)
  await browser.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1400, height: shot.height, deviceScaleFactor: 2, mobile: false },
    session,
  )
  await browser.send('Page.navigate', { url: shot.url(local) }, session)
  if (shot.follow) {
    await sleep(5000)
    await browser.send(
      'Runtime.evaluate',
      {
        expression: `location.href = document.querySelector(${JSON.stringify(shot.follow)}).href.replace(location.origin + '/', ${JSON.stringify(live)})`,
      },
      session,
    )
  }
  await sleep(shot.wait * 1000)
  const { data } = await browser.send(
    'Page.captureScreenshot',
    { format: 'png' },
    session,
  )
  await writeFile(
    join(outDir, `${shot.name}.png`),
    Buffer.from(String(data), 'base64'),
  )
  await browser.send('Target.closeTarget', { targetId })
  console.log(`shots/${shot.name}.png`)
}

const wanted = process.argv.slice(2)
const site = await serveSite()
const chromeProcess = await launchChrome()
const browser = await connect(chromeProcess.endpoint)
await mkdir(outDir, { recursive: true })
try {
  await Promise.all(
    shots
      .filter(shot => wanted.length === 0 || wanted.includes(shot.name))
      .map(shot => capture(browser, shot, site.origin)),
  )
} finally {
  browser.close()
  await chromeProcess.close()
  site.close()
}
