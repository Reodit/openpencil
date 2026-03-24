import { defineEventHandler } from 'h3'
import { isAuthenticated, loadCredentials, getValidAccessToken, fetchAvailableImageModels } from '../../utils/antigravity'

/** GET /api/antigravity/status — Check Antigravity auth status and quota */
export default defineEventHandler(async () => {
  if (!isAuthenticated()) {
    return { authenticated: false }
  }

  loadCredentials() // ensure credentials are loaded
  let email = ''
  let models: string[] = []
  let quota: number | null = null

  try {
    // Read email from auth file
    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')
    const authPath = path.join(os.homedir(), '.config', 'artifex-mcp', 'auth.json')
    const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'))
    email = authData.email || ''

    // Get valid token and fetch models + quota
    const token = await getValidAccessToken()
    models = await fetchAvailableImageModels(token)

    // Fetch quota info
    const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'antigravity/1.15.8 darwin/arm64',
        'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
      },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>
      const modelsMap = data.models as Record<string, { quotaInfo?: { remainingFraction?: number } }> | undefined
      if (modelsMap && models[0] && modelsMap[models[0]]) {
        quota = modelsMap[models[0]].quotaInfo?.remainingFraction ?? null
      }
    }
  } catch {
    // partial info is fine
  }

  return {
    authenticated: true,
    email,
    models,
    quota,
  }
})
