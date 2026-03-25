import { spawn, type ChildProcess } from 'node:child_process'
import { resolveGeminiCli } from './resolve-gemini-cli'
import { resolveClaudeCli } from './resolve-claude-cli'

/**
 * CLI Session Pool — keeps CLI processes alive in interactive mode
 * to avoid cold-start latency (MCP init, model loading, etc.)
 *
 * Gemini CLI: Interactive mode with stream-json output.
 * Claude Agent SDK: Each query() spawns a new process (SDK limitation).
 *   → Pre-warm not effective. Skip pooling.
 * Codex CLI: exec is single-shot. Already fast (<5s). Skip pooling.
 */

// ─── Types ───────────────────────────────────────────────

export interface StreamEvent {
  type: 'text' | 'thinking' | 'error' | 'done'
  content: string
}

interface PooledSession {
  process: ChildProcess
  busy: boolean
  model: string | undefined
  createdAt: number
  buffer: string
  /** Resolvers for pending prompt responses */
  onLine?: (line: string) => void
}

// ─── Config ──────────────────────────────────────────────

const MAX_POOL_SIZE = 2
const SESSION_TTL_MS = 10 * 60 * 1000 // 10 min

// ─── Gemini Pool ─────────────────────────────────────────

let geminiPool: PooledSession[] = []

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

/** Spawn a Gemini CLI process in interactive stream-json mode */
function spawnGeminiSession(model?: string): PooledSession | null {
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

  const session: PooledSession = {
    process: child,
    busy: false,
    model,
    createdAt: Date.now(),
    buffer: '',
  }

  // Wire up stdout line parser
  child.stdout?.on('data', (chunk: Buffer) => {
    session.buffer += chunk.toString('utf-8')
    let idx = session.buffer.indexOf('\n')
    while (idx >= 0) {
      const line = session.buffer.slice(0, idx).trim()
      session.buffer = session.buffer.slice(idx + 1)
      if (line && session.onLine) {
        session.onLine(line)
      }
      idx = session.buffer.indexOf('\n')
    }
  })

  child.on('exit', () => {
    geminiPool = geminiPool.filter((s) => s !== session)
  })

  return session
}

/** Clean expired sessions from pool */
function cleanPool(): void {
  const now = Date.now()
  geminiPool = geminiPool.filter((s) => {
    if (now - s.createdAt > SESSION_TTL_MS || s.process.killed) {
      if (!s.process.killed) s.process.kill('SIGTERM')
      return false
    }
    return true
  })
}

/** Pre-warm Gemini pool on server start */
export function warmGeminiPool(model?: string): void {
  cleanPool()
  while (geminiPool.length < MAX_POOL_SIZE) {
    const session = spawnGeminiSession(model)
    if (!session) break
    geminiPool.push(session)
    console.log(`[CliPool] Gemini session pre-warmed (pool: ${geminiPool.length}/${MAX_POOL_SIZE})`)
  }
}

/**
 * Send a prompt to a pooled Gemini session and stream responses.
 * Uses interactive mode — stdin stays open, process is reused.
 */
export async function* streamGeminiPooled(
  prompt: string,
  model?: string,
): AsyncGenerator<StreamEvent> {
  cleanPool()

  // Find an idle session with matching model
  let session = geminiPool.find((s) => !s.busy && !s.process.killed && s.model === model)
  if (!session) {
    // Try any idle session (model mismatch = spawn new)
    session = geminiPool.find((s) => !s.busy && !s.process.killed)
  }
  if (!session) {
    session = spawnGeminiSession(model)
    if (session) geminiPool.push(session)
  }
  if (!session) {
    yield { type: 'error', content: 'Gemini CLI not found or pool exhausted.' }
    return
  }

  session.busy = true

  try {
    // Send prompt via stdin (interactive mode accepts newline-terminated input)
    if (!session.process.stdin?.writable) {
      yield { type: 'error', content: 'Gemini session stdin closed.' }
      return
    }

    // Set up line-by-line response collection
    const lineQueue: string[] = []
    let resolveWait: (() => void) | null = null
    let done = false

    session.onLine = (line: string) => {
      lineQueue.push(line)
      if (resolveWait) {
        const fn = resolveWait
        resolveWait = null
        fn()
      }
    }

    // Send the prompt
    session.process.stdin.write(prompt + '\n')

    // Read lines until we see a 'result' event
    const timeout = setTimeout(() => {
      done = true
      if (resolveWait) {
        const fn = resolveWait
        resolveWait = null
        fn()
      }
    }, 5 * 60 * 1000) // 5 min max

    while (!done) {
      if (lineQueue.length === 0) {
        await new Promise<void>((resolve) => { resolveWait = resolve })
        continue
      }

      const line = lineQueue.shift()!
      if (!line.startsWith('{')) continue

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(line)
      } catch { continue }

      const type = typeof parsed.type === 'string' ? parsed.type : ''

      if (type === 'message' && parsed.role === 'assistant') {
        const content = typeof parsed.content === 'string' ? parsed.content : ''
        if (content) yield { type: 'text', content }
      } else if (type === 'tool_use') {
        const toolName = typeof parsed.tool_name === 'string' ? parsed.tool_name : 'tool'
        yield { type: 'thinking', content: `Using tool: ${toolName}` }
      } else if (type === 'tool_result') {
        yield { type: 'thinking', content: 'Tool completed' }
      } else if (type === 'result') {
        if (parsed.status === 'error' && parsed.error) {
          const errObj = parsed.error as Record<string, unknown>
          const msg = typeof errObj.message === 'string' ? errObj.message : 'Unknown error'
          yield { type: 'error', content: msg }
        }
        done = true
      } else if (type === 'error') {
        const content = typeof parsed.message === 'string' ? parsed.message : 'Unknown error'
        yield { type: 'error', content }
        done = true
      }
    }

    clearTimeout(timeout)
    yield { type: 'done', content: '' }
  } finally {
    session.onLine = undefined
    session.busy = false

    // Replenish pool
    const idleCount = geminiPool.filter((s) => !s.busy && !s.process.killed).length
    if (idleCount < 1) {
      const replacement = spawnGeminiSession(model)
      if (replacement) {
        geminiPool.push(replacement)
        console.log(`[CliPool] Gemini session replenished (pool: ${geminiPool.length})`)
      }
    }
  }
}

/** Get pool status */
export function getPoolStatus(): { gemini: { total: number; idle: number; busy: number } } {
  const alive = geminiPool.filter((s) => !s.process.killed)
  return {
    gemini: {
      total: alive.length,
      idle: alive.filter((s) => !s.busy).length,
      busy: alive.filter((s) => s.busy).length,
    },
  }
}

/** Shutdown all pooled sessions */
export function shutdownPool(): void {
  for (const s of geminiPool) {
    if (!s.process.killed) s.process.kill('SIGTERM')
  }
  geminiPool = []
}
