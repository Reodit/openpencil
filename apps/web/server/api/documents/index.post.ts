import { defineEventHandler, readBody, createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** POST /api/documents — Create a new document. Body: { workspace_id, name?, data? } */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const body = await readBody(event) as Record<string, unknown>
  const wsId = body?.workspace_id as string
  if (!wsId) throw createError({ statusCode: 400, statusMessage: 'workspace_id is required' })

  const db = getDB()

  // Check membership (must be owner or editor)
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(wsId, user.id) as { role: string } | null
  if (!membership || membership.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'No permission' })
  }

  const id = randomUUID()
  const name = (body?.name as string) || 'Untitled'
  const data = typeof body?.data === 'string' ? body.data : JSON.stringify(body?.data ?? { version: '0.5.0', children: [] })

  db.run(
    'INSERT INTO documents (id, workspace_id, name, data, created_by) VALUES (?, ?, ?, ?, ?)',
    [id, wsId, name, data, user.id],
  )

  return { id, name }
})
