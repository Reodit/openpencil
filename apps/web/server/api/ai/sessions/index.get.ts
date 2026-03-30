import { defineEventHandler, createError } from 'h3'
import { getDB } from '../../../utils/db'
import { getSessionUser } from '../../../utils/session'

/** GET /api/ai/sessions — List chat sessions for current user */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const db = getDB()
  const sessions = db.query(`
    SELECT s.id, s.title, s.agent_session_id, s.workspace_id, s.created_at, s.updated_at,
           (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) as message_count
    FROM chat_sessions s
    WHERE s.user_id = ?
    ORDER BY s.updated_at DESC
    LIMIT 50
  `).all(user.id)

  return { sessions }
})
