import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getDB } from '../../../utils/db'
import { getSessionUser } from '../../../utils/session'

/** GET /api/workspaces/:id — Get workspace details with members. */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })

  const db = getDB()

  // Check membership
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(id, user.id) as { role: string } | null
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Not a member' })

  const workspace = db.query('SELECT id, name, owner_id, created_at FROM workspaces WHERE id = ?').get(id)
  if (!workspace) throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })

  const members = db.query(`
    SELECT u.id, u.username, u.name, u.color, wm.role, wm.joined_at
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
    ORDER BY wm.joined_at
  `).all(id)

  const documents = db.query(`
    SELECT id, name, thumbnail, created_by, created_at, updated_at
    FROM documents WHERE workspace_id = ?
    ORDER BY updated_at DESC
  `).all(id)

  return { workspace, members, documents, role: membership.role }
})
