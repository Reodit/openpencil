import { defineNitroPlugin } from 'nitropack/runtime'

/**
 * Pre-warm the Gemini CLI session pool on server start.
 * This avoids cold-start latency on the first request.
 */
export default defineNitroPlugin(() => {
  // Delay warmup to avoid blocking server startup
  setTimeout(async () => {
    try {
      const { warmGeminiPool } = await import('../utils/cli-pool')
      warmGeminiPool()
    } catch (e) {
      console.warn('[CliPool] Failed to warm pool:', e)
    }
  }, 2000)
})
