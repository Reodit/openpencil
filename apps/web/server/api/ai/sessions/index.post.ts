import { defineEventHandler, readBody, createError } from 'h3'
import { getDB } from '../../../utils/db'
import { getSessionUser } from '../../../utils/session'
import { nanoid } from 'nanoid'

/** POST /api/ai/sessions — Create a new chat session */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event) as { title?: string; workspaceId?: string; agentSessionId?: string }
  const id = nanoid()
  const title = body?.title?.trim() || 'New Chat'

  const db = getDB()
  db.run(
    `INSERT INTO chat_sessions (id, workspace_id, user_id, title, agent_session_id) VALUES (?, ?, ?, ?, ?)`,
    [id, body?.workspaceId ?? null, user.id, title, body?.agentSessionId ?? null],
  )

  return { id, title }
})
