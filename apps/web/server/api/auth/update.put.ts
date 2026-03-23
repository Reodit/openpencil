import { defineEventHandler, readBody, createError } from 'h3'
import { updateSessionUser } from '../../utils/session'

/** PUT /api/auth/update — Update user name. Body: { name } */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown>
  const name = (body?.name as string)?.trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const user = updateSessionUser(event, name)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  return { user }
})
