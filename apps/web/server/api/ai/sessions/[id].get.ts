import { defineEventHandler, createError, getRouterParam } from 'h3'
import { getDB } from '../../../utils/db'
import { getSessionUser } from '../../../utils/session'

/** GET /api/ai/sessions/:id — Get session with all messages */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })

  const db = getDB()
  const session = db.query(
    `SELECT id, title, agent_session_id, workspace_id, created_at, updated_at FROM chat_sessions WHERE id = ? AND user_id = ?`,
  ).get(id, user.id) as Record<string, unknown> | null

  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  const messages = db.query(
    `SELECT id, role, content, attachments, timestamp FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC`,
  ).all(id) as Array<{ id: string; role: string; content: string; attachments: string | null; timestamp: number }>

  return {
    ...session,
    messages: messages.map((m) => ({
      ...m,
      attachments: m.attachments ? JSON.parse(m.attachments) : undefined,
    })),
  }
})
