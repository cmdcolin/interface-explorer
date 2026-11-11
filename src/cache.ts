import { existsSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { gunzipSync, gzipSync } from 'node:zlib'

import { parseJson, readJson, writeAtomically } from './json.ts'

const ATTEMPTS = 9
const TIMEOUT = 300_000

async function request(
  url: URL,
  absentStatuses: number[],
  attempt = 0,
): Promise<Uint8Array | undefined> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch(() => undefined)
  return response?.ok
    ? new Uint8Array(await response.arrayBuffer())
    : response && absentStatuses.includes(response.status)
      ? undefined
      : attempt + 1 < ATTEMPTS
        ? sleep(1000 * 2 ** attempt).then(() =>
            request(url, absentStatuses, attempt + 1),
          )
        : Promise.reject(
            new Error(
              `${url.href}: ${response ? `HTTP ${response.status}` : 'no response'}`,
            ),
          )
}

function withParams(url: string, params: Record<string, string>) {
  const full = new URL(url)
  for (const [key, value] of Object.entries(params)) {
    full.searchParams.set(key, value)
  }
  return full
}

export async function getJson(
  url: string,
  path: string,
  params: Record<string, string> = {},
  keep = (data: unknown) => data,
) {
  if (!existsSync(path)) {
    const body = await request(withParams(url, params), [400, 404])
    const kept = body ? keep(parseJson(new TextDecoder().decode(body))) : null
    writeAtomically(path, JSON.stringify(kept))
  }
  return readJson(path)
}

export async function getText(url: string, path: string) {
  if (!existsSync(path)) {
    const body = await request(new URL(url), [])
    if (body) {
      writeAtomically(path, gzipSync(body))
    }
  }
  return gunzipSync(readFileSync(path)).toString('utf8')
}
