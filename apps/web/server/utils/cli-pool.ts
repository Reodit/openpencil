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

// Gemini CLI processes are spawned per-request with -p flag.
// No persistent pool needed — each process handles one request then exits.
// stdin stays open for multi-turn tool use.
// Parallel requests = parallel processes (no limit beyond system resources).

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
 * Spawn a Gemini CLI process.
 * Prompt is piped via stdin (avoids shell arg length limits + escaping issues).
 * `-p ' '` tells CLI to run in non-interactive mode; stdin content is the actual prompt.
 * stdin stays open after writing prompt so the CLI can run multi-turn tools.
 */
function spawnGemini(prompt: string, model?: string): ChildProcess | null {
  const binPath = resolveGeminiCli()
  if (!binPath) return null

  const args = [
    '-o', 'stream-json',
    '--approval-mode', 'yolo',
    '--sandbox',
    '-p', ' ',
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

  // Write prompt to stdin — Gemini CLI prepends stdin content to -p value
  // Close stdin to signal prompt submission. Tools run internally (no stdin needed).
  if (child.stdin?.writable) {
    child.stdin.write(prompt)
    child.stdin.end()
  }

  return child
}

/** No-op — kept for backward compat with cli-pool plugin */
export function warmGeminiPool(_model?: string): void {
  console.log('[CliPool] Gemini uses per-request spawn with -p flag (no pre-warm needed)')
}

/**
 * Stream a prompt through Gemini CLI.
 * Uses -p flag for prompt delivery so stdin stays open for tool use.
 * Concurrency: multiple calls run in parallel (separate processes).
 */
export async function* streamGeminiPooled(
  prompt: string,
  model?: string,
): AsyncGenerator<StreamEvent> {
  const child = spawnGemini(prompt, model)
  if (!child) {
    yield { type: 'error', content: 'Gemini CLI not found.' }
    return
  }

  console.log(`[CliPool] Gemini spawned pid=${child.pid}, prompt=${prompt.length} chars`)

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
    if (!child.killed) child.kill('SIGTERM')
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

export function getPoolStatus(): { info: string } {
  return { info: 'Per-request spawn mode (no persistent pool)' }
}

export function shutdownPool(): void {
  // No persistent pool to shut down
}
