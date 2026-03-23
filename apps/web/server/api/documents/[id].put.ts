import { defineEventHandler, readBody, getRouterParam, createError } from 'h3'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** PUT /api/documents/:id — Update a document. Body: { name?, data?, thumbnail? } */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' })

  const body = await readBody(event) as Record<string, unknown>
  const db = getDB()

  const existing = db.query('SELECT id, workspace_id FROM documents WHERE id = ?').get(id) as Record<string, unknown> | null
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Document not found' })

  // Check user has edit permission
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(existing.workspace_id, user.id) as { role: string } | null
  if (!membership || membership.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'No permission to edit' })
  }

  const sets: string[] = ["updated_at = datetime('now')"]
  const params: unknown[] = []

  if (body?.name !== undefined) {
    sets.push('name = ?')
    params.push(body.name)
  }
  if (body?.data !== undefined) {
    sets.push('data = ?')
    params.push(typeof body.data === 'string' ? body.data : JSON.stringify(body.data))
  }
  if (body?.thumbnail !== undefined) {
    sets.push('thumbnail = ?')
    params.push(body.thumbnail)
  }

  params.push(id)
  db.run(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, params)

  return { ok: true }
})
