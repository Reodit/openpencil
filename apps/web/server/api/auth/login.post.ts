import { defineEventHandler, readBody, createError } from 'h3'
import { getSessionUser, createSessionUser } from '../../utils/session'

/** POST /api/auth/login — Create a user with a nickname. Body: { name } */
export default defineEventHandler(async (event) => {
  // If already logged in, return existing user
  const existing = getSessionUser(event)
  if (existing) return { user: existing }

  const body = await readBody(event) as Record<string, unknown>
  const name = (body?.name as string)?.trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const user = createSessionUser(event, name)
  return { user }
})
