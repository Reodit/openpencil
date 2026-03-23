import { defineEventHandler, getQuery, createError } from 'h3'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** GET /api/documents?workspace=<id> — List documents in a workspace. */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const query = getQuery(event)
  const wsId = query.workspace as string
  if (!wsId) throw createError({ statusCode: 400, statusMessage: 'workspace query param required' })

  const db = getDB()

  // Check membership
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(wsId, user.id)
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Not a member' })

  const rows = db.query(
    `SELECT id, name, thumbnail, created_by, created_at, updated_at
     FROM documents WHERE workspace_id = ? ORDER BY updated_at DESC`,
  ).all(wsId)

  return { documents: rows }
})
