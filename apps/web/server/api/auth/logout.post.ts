import { defineEventHandler } from 'h3'
import { logoutUser } from '../../utils/session'

/** POST /api/auth/logout — Clear session cookie. */
export default defineEventHandler((event) => {
  logoutUser(event)
  return { ok: true }
})
