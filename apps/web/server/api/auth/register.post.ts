import { defineEventHandler, readBody, createError } from 'h3'
import { registerUser } from '../../utils/session'

/** POST /api/auth/register — Create a new account. Body: { username, password, name } */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown>
  const username = (body?.username as string)?.trim()
  const password = body?.password as string
  const name = (body?.name as string)?.trim() || username
  if (!username || !password) throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  if (username.length < 3) throw createError({ statusCode: 400, statusMessage: 'Username must be at least 3 characters' })
  if (password.length < 4) throw createError({ statusCode: 400, statusMessage: 'Password must be at least 4 characters' })

  const result = registerUser(event, username, password, name)
  if ('error' in result) throw createError({ statusCode: 409, statusMessage: result.error })

  return { user: result }
})
