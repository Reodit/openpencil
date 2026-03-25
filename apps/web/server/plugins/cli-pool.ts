import { readdir, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Server startup tasks:
 * 1. Pre-warm Gemini CLI pool
 * 2. Clean up old attachment files (>24h)
 */
export default () => {
  setTimeout(async () => {
    try {
      const { warmGeminiPool } = await import('../utils/cli-pool')
      warmGeminiPool()
    } catch (e) {
      console.warn('[CliPool] Failed to warm pool:', e)
    }

    // Clean up old attachment dirs (>24h) from .openpencil-tmp/
    try {
      const tmpDir = join(process.cwd(), '.openpencil-tmp')
      const entries = await readdir(tmpDir).catch(() => [] as string[])
      const now = Date.now()
      const MAX_AGE_MS = 24 * 60 * 60 * 1000

      for (const entry of entries) {
        const fullPath = join(tmpDir, entry)
        try {
          const s = await stat(fullPath)
          if (s.isDirectory() && now - s.mtimeMs > MAX_AGE_MS) {
            await rm(fullPath, { recursive: true, force: true })
            console.log(`[Cleanup] Removed old attachment dir: ${entry}`)
          }
        } catch { /* skip */ }
      }
    } catch { /* tmp dir may not exist */ }
  }, 3000)
}
