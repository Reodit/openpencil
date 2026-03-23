import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** GET /api/documents/:id — Get a single document with full data. */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' })

  const db = getDB()
  const row = db.query('SELECT * FROM documents WHERE id = ?').get(id) as Record<string, unknown> | null
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Document not found' })

  // Check user is a member of the document's workspace
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(row.workspace_id, user.id)
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Not a member of this workspace' })

  return {
    id: row.id,
    name: row.name,
    data: JSON.parse(row.data as string),
    thumbnail: row.thumbnail,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
})
