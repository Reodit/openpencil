import { defineEventHandler, readBody } from 'h3'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIAG_DIR = join(homedir(), '.openpencil', 'diag')
let dirReady = false

export default defineEventHandler(async (event) => {
  const body = await readBody<{ data: string }>(event)
  if (!body?.data) return { ok: false }

  if (!dirReady) {
    try { await mkdir(DIAG_DIR, { recursive: true }) } catch { /* */ }
    dirReady = true
  }

  const date = new Date().toISOString().slice(0, 10)
  const path = join(DIAG_DIR, `generation-${date}.log`)
  await appendFile(path, body.data + '\n\n').catch(() => {})

  return { ok: true, path }
})
