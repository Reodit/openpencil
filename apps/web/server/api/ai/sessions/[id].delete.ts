import { defineEventHandler, createError, getRouterParam } from 'h3'
import { getDB } from '../../../utils/db'
import { getSessionUser } from '../../../utils/session'

/** DELETE /api/ai/sessions/:id — Delete a chat session and its messages */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })

  const db = getDB()
  const result = db.run(
    `DELETE FROM chat_sessions WHERE id = ? AND user_id = ?`,
    [id, user.id],
  )

  return { deleted: result.changes > 0 }
})
