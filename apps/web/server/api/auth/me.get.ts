import { defineEventHandler } from 'h3'
import { getSessionUser } from '../../utils/session'

/** GET /api/auth/me — Get current user, or null if not logged in. */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  return { user }
})
