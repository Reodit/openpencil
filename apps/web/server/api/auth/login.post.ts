import { defineEventHandler, readBody, createError } from 'h3'
import { loginUser } from '../../utils/session'

/** POST /api/auth/login — Login with username and password. Body: { username, password } */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown>
  const username = (body?.username as string)?.trim()
  const password = body?.password as string
  if (!username || !password) throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })

  const result = loginUser(event, username, password)
  if ('error' in result) throw createError({ statusCode: 401, statusMessage: result.error })

  return { user: result }
})
