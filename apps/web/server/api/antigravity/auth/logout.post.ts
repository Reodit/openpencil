import { defineEventHandler } from 'h3'
import { deleteCredentials } from '../../../utils/antigravity'

/** POST /api/antigravity/auth/logout — Clear Antigravity credentials */
export default defineEventHandler(() => {
  deleteCredentials()
  return { ok: true }
})
