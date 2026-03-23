import { defineEventHandler, createError } from 'h3'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** GET /api/workspaces — List workspaces the current user belongs to. */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const db = getDB()
  const rows = db.query(`
    SELECT w.id, w.name, w.owner_id, w.created_at, wm.role,
      (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as member_count,
      (SELECT COUNT(*) FROM documents WHERE workspace_id = w.id) as doc_count
    FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ?
    ORDER BY w.created_at DESC
  `).all(user.id)

  return { workspaces: rows }
})
