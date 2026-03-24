import { defineEventHandler, sendRedirect } from 'h3'
import { buildOAuthUrl } from '../../../utils/antigravity'

/** GET /api/antigravity/auth — Start OAuth flow, redirects to Google login */
export default defineEventHandler((event) => {
  const { url } = buildOAuthUrl()
  return sendRedirect(event, url, 302)
})
