/**
 * Pre-warm the Gemini CLI session pool on server start.
 * This avoids cold-start latency on the first request.
 */
export default () => {
  setTimeout(async () => {
    try {
      const { warmGeminiPool } = await import('../utils/cli-pool')
      warmGeminiPool()
    } catch (e) {
      console.warn('[CliPool] Failed to warm pool:', e)
    }
  }, 3000)
}
