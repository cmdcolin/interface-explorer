import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { ROOT } from './paths.ts'

const siteDir = join(ROOT, 'dist')
const base = '/interface-explorer/'
export const LIVE = 'https://cmdcolin.github.io/interface-explorer/'
const chrome = process.env.CHROME ?? 'google-chrome'

const contentTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

export interface Shot {
  name: string
  url: (local: string) => string
  follow?: string
  clip?: string
  height: number
  wait: number
}

interface Output {
  dir: string
  format: 'png' | 'jpeg'
}

function serveSite() {
  const server = createServer((request, response) => {
    const path = normalize(
      decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname),
    )
    const inside = path.startsWith(base) ? path.slice(base.length - 1) : path
    const file = join(
      siteDir,
      inside.endsWith('/') ? `${inside}index.html` : inside,
    )
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
            ? `http://127.0.0.1:${address.port}${base}`
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

async function waitForLoaded(browser: Browser, session: string) {
  for (let second = 0; second < 120; second += 1) {
    const { result } = await browser.send(
      'Runtime.evaluate',
      {
        expression: `/\\bLoading\\b/.test(document.body.innerText)`,
        returnByValue: true,
      },
      session,
    )
    if (!(
      result &&
      typeof result === 'object' &&
      'value' in result &&
      result.value
    )) {
      return
    }
    await sleep(1000)
  }
  throw new Error('still loading after two minutes')
}

async function clipTo(browser: Browser, session: string, selector: string) {
  const { result } = await browser.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
        return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height, scale: 1 }
      })()`,
      returnByValue: true,
    },
    session,
  )
  return result && typeof result === 'object' && 'value' in result
    ? result.value
    : undefined
}

async function capture(
  browser: Browser,
  shot: Shot,
  local: string,
  output: Output,
) {
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
        expression: `location.href = document.querySelector(${JSON.stringify(shot.follow)}).href.replace(${JSON.stringify(local)}, ${JSON.stringify(LIVE)})`,
      },
      session,
    )
  }
  await sleep(shot.wait * 1000)
  await waitForLoaded(browser, session)
  const { data } = await browser.send(
    'Page.captureScreenshot',
    {
      format: output.format,
      quality: output.format === 'jpeg' ? 85 : undefined,
      clip: shot.clip ? await clipTo(browser, session, shot.clip) : undefined,
      captureBeyondViewport: Boolean(shot.clip),
    },
    session,
  )
  const file = join(
    output.dir,
    `${shot.name}.${output.format === 'jpeg' ? 'jpg' : 'png'}`,
  )
  await writeFile(file, Buffer.from(String(data), 'base64'))
  await browser.send('Target.closeTarget', { targetId })
  console.log(file)
}

export async function screenshots(
  shots: Shot[],
  output: Output,
  wanted: string[],
) {
  const site = await serveSite()
  const chromeProcess = await launchChrome()
  const browser = await connect(chromeProcess.endpoint)
  await mkdir(output.dir, { recursive: true })
  try {
    for (const shot of shots.filter(
      shot => wanted.length === 0 || wanted.includes(shot.name),
    )) {
      await capture(browser, shot, site.origin, output)
    }
  } finally {
    browser.close()
    await chromeProcess.close()
    site.close()
  }
}
