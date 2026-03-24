import { defineEventHandler, getQuery } from 'h3'
import { exchangeCodeForTokens } from '../../../utils/antigravity'

/** GET /api/antigravity/auth/callback — OAuth callback from Google */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string

  if (!code) {
    return '<html><body><h2>Error</h2><p>No authorization code received.</p></body></html>'
  }

  try {
    const { email, projectId } = await exchangeCodeForTokens(code)
    return `<html><body><h2>Authentication successful!</h2><p>Logged in as: ${email}</p><p>Project: ${projectId || 'auto-detected'}</p><p>You can close this tab.</p></body></html>`
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `<html><body><h2>Authentication failed</h2><p>${msg}</p></body></html>`
  }
})
