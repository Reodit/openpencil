import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
import { getDB } from '../../../../utils/db'
import { getSessionUser } from '../../../../utils/session'

/** POST /api/ai/sessions/:id/messages — Save messages to a session */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })

  const body = await readBody(event) as {
    messages: Array<{
      id: string
      role: string
      content: string
      attachments?: unknown[]
      timestamp: number
    }>
    title?: string
  }

  if (!body?.messages?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Missing messages' })
  }

  const db = getDB()

  // Verify session belongs to user
  const session = db.query(
    `SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?`,
  ).get(sessionId, user.id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  // Upsert messages
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO chat_messages (id, session_id, role, content, attachments, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
  )

  for (const msg of body.messages) {
    stmt.run(
      msg.id,
      sessionId,
      msg.role,
      msg.content,
      msg.attachments ? JSON.stringify(msg.attachments) : null,
      msg.timestamp,
    )
  }

  // Update session title and timestamp
  if (body.title) {
    db.run(
      `UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`,
      [body.title, sessionId],
    )
  } else {
    db.run(
      `UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?`,
      [sessionId],
    )
  }

  return { saved: body.messages.length }
})
