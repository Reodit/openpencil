import { spawn, type ChildProcess } from 'node:child_process'
import { resolveGeminiCli } from './resolve-gemini-cli'

/**
 * CLI Session Pool — pre-spawns Gemini CLI processes with `-p` flag.
 * Stdin stays open until a prompt arrives. MCP/model init happens at spawn
 * time so the actual request only needs to write stdin + read stdout.
 *
 * Flow:
 * 1. Server start: spawn N processes (`gemini -o stream-json -p ' ' --yolo --sandbox`)
 *    → process starts, loads MCP, waits for stdin
 * 2. Request arrives: write prompt to stdin, close stdin, stream stdout
 * 3. Process exits after response → spawn replacement
 */

export interface StreamEvent {
  type: 'text' | 'thinking' | 'error' | 'done'
  content: string
}

interface PrewarmedProcess {
  process: ChildProcess
  model: string | undefined
  busy: boolean
  createdAt: number
}

const MAX_POOL_SIZE = 3
const SESSION_TTL_MS = 5 * 60 * 1000 // 5 min (before the process gets stale)

let pool: PrewarmedProcess[] = []

function filterGeminiEnv(): Record<string, string | undefined> {
  const allowlist = new Set([
    'PATH', 'HOME', 'TERM', 'LANG', 'SHELL', 'TMPDIR',
    'SYSTEMROOT', 'COMSPEC', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'PATHEXT', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'HOMEDRIVE', 'HOMEPATH',
  ])
  const result: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (allowlist.has(k) || k.startsWith('GOOGLE_') || k.startsWith('GEMINI_') || k.startsWith('GCLOUD_')) {
      result[k] = v
    }
  }
  return result
}

/**
 * Spawn a Gemini CLI process that waits for stdin input.
 * `-p ' '` makes it non-interactive but stdin piped content becomes the prompt.
 */
function spawnWarm(model?: string): PrewarmedProcess | null {
  const binPath = resolveGeminiCli()
  if (!binPath) return null

  const args = [
    '-o', 'stream-json',
    '--approval-mode', 'yolo',
    '--sandbox',
  ]
  if (model && model !== 'default') {
    args.push('-m', model)
  }

  const child = spawn(binPath, args, {
    env: filterGeminiEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(process.platform === 'win32' && { shell: true }),
  })

  child.stderr?.on('data', () => { /* discard */ })

  const entry: PrewarmedProcess = {
    process: child,
    model,
    busy: false,
    createdAt: Date.now(),
  }

  child.on('exit', () => {
    pool = pool.filter((e) => e !== entry)
    // Auto-replenish
    if (pool.filter((e) => !e.busy).length < 1) {
      const replacement = spawnWarm(model)
      if (replacement) {
        pool.push(replacement)
        console.log(`[CliPool] Replenished (pool: ${pool.length})`)
      }
    }
  })

  return entry
}

function cleanExpired(): void {
  const now = Date.now()
  pool = pool.filter((e) => {
    if (now - e.createdAt > SESSION_TTL_MS && !e.busy) {
      e.process.kill('SIGTERM')
      return false
    }
    return !e.process.killed
  })
}

/** Pre-warm pool on server start */
export function warmGeminiPool(model?: string): void {
  cleanExpired()
  while (pool.length < MAX_POOL_SIZE) {
    const entry = spawnWarm(model)
    if (!entry) break
    pool.push(entry)
    console.log(`[CliPool] Pre-warmed (pool: ${pool.length}/${MAX_POOL_SIZE})`)
  }
}

/**
 * Stream a prompt through a pooled Gemini process.
 * Writes prompt to stdin, closes stdin, streams stdout lines.
 * Process exits after response → auto-replenished.
 */
export async function* streamGeminiPooled(
  prompt: string,
  model?: string,
): AsyncGenerator<StreamEvent> {
  cleanExpired()

  // Acquire an idle process
  let entry = pool.find((e) => !e.busy && !e.process.killed)
  if (!entry) {
    // No idle process — spawn on demand (cold start)
    entry = spawnWarm(model)
    if (entry) pool.push(entry)
  }
  if (!entry) {
    yield { type: 'error', content: 'Gemini CLI not found or pool exhausted.' }
    return
  }

  entry.busy = true
  const child = entry.process
  console.log(`[CliPool] Using pid=${child.pid}, prompt=${prompt.length} chars`)

  // Write prompt and close stdin → triggers Gemini to process
  if (child.stdin?.writable) {
    child.stdin.write(prompt)
    child.stdin.end()
  } else {
    yield { type: 'error', content: 'Gemini process stdin not writable.' }
    return
  }

  // Stream stdout line by line
  let buffer = ''
  const timeoutMs = 5 * 60 * 1000

  const timer = setTimeout(() => {
    child.kill('SIGTERM')
  }, timeoutMs)

  try {
    for await (const chunk of child.stdout!) {
      buffer += chunk.toString('utf-8')
      let idx = buffer.indexOf('\n')
      while (idx >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line) {
          const event = parseLine(line)
          if (event) {
            yield event
            if (event.type === 'done' || event.type === 'error') {
              clearTimeout(timer)
              return
            }
          }
        }
        idx = buffer.indexOf('\n')
      }
    }

    // Flush remaining
    const tail = buffer.trim()
    if (tail) {
      const event = parseLine(tail)
      if (event) yield event
    }

    yield { type: 'done', content: '' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stream error'
    yield { type: 'error', content: msg }
  } finally {
    clearTimeout(timer)
    // Process will exit after stdin closed → auto-replenish via 'exit' handler
  }
}

function parseLine(line: string): StreamEvent | null {
  if (!line.startsWith('{')) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line)
  } catch { return null }

  const type = typeof parsed.type === 'string' ? parsed.type : ''

  if (type === 'message' && parsed.role === 'assistant') {
    const content = typeof parsed.content === 'string' ? parsed.content : ''
    if (content) return { type: 'text', content }
  }

  if (type === 'tool_use') {
    const toolName = typeof parsed.tool_name === 'string' ? parsed.tool_name : 'tool'
    return { type: 'thinking', content: `Using tool: ${toolName}` }
  }
  if (type === 'tool_result') {
    return { type: 'thinking', content: 'Tool completed' }
  }

  if (type === 'result') {
    if (parsed.status === 'error' && parsed.error) {
      const errObj = parsed.error as Record<string, unknown>
      const msg = typeof errObj.message === 'string' ? errObj.message : 'Unknown error'
      return { type: 'error', content: msg }
    }
    return { type: 'done', content: '' }
  }

  if (type === 'error') {
    const content = typeof parsed.message === 'string' ? parsed.message : 'Unknown error'
    return { type: 'error', content }
  }

  return null
}

export function getPoolStatus(): { total: number; idle: number; busy: number } {
  const alive = pool.filter((e) => !e.process.killed)
  return {
    total: alive.length,
    idle: alive.filter((e) => !e.busy).length,
    busy: alive.filter((e) => e.busy).length,
  }
}

export function shutdownPool(): void {
  for (const e of pool) {
    if (!e.process.killed) e.process.kill('SIGTERM')
  }
  pool = []
}
