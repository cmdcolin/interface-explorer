import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function text(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

export function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function records(value: unknown) {
  return list(value).filter(isRecord)
}

export function record(value: unknown) {
  return isRecord(value) ? value : {}
}

export function parseJson(content: string) {
  const value: unknown = JSON.parse(content)
  return value
}

export function readJson(path: string) {
  return parseJson(readFileSync(path, 'utf8'))
}

export function writeAtomically(path: string, content: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true })
  const partial = `${path}.${process.pid}.part`
  writeFileSync(partial, content)
  renameSync(partial, path)
}

export function writeJson(path: string, value: unknown, indent?: number) {
  writeAtomically(path, JSON.stringify(value, undefined, indent))
}
