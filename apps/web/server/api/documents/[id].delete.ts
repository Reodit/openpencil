import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** DELETE /api/documents/:id — Delete a document. */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' })

  const db = getDB()

  const existing = db.query('SELECT id, workspace_id FROM documents WHERE id = ?').get(id) as Record<string, unknown> | null
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Document not found' })

  // Check user has edit permission
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(existing.workspace_id, user.id) as { role: string } | null
  if (!membership || membership.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'No permission to delete' })
  }

  db.run('DELETE FROM documents WHERE id = ?', [id])
  return { ok: true }
})
