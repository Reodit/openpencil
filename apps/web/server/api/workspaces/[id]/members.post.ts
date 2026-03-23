import { defineEventHandler, readBody, getRouterParam, createError } from 'h3'
import { getDB } from '../../../utils/db'
import { getSessionUser } from '../../../utils/session'

/** POST /api/workspaces/:id/members — Invite a user by username. Body: { username, role? } */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const wsId = getRouterParam(event, 'id')
  if (!wsId) throw createError({ statusCode: 400, statusMessage: 'Missing workspace id' })

  const db = getDB()

  // Only owner/editor can invite
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(wsId, user.id) as { role: string } | null
  if (!membership || membership.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'No permission to invite' })
  }

  const body = await readBody(event) as Record<string, unknown>
  const username = (body?.username as string)?.trim()
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Username is required' })

  const targetUser = db.query('SELECT id FROM users WHERE username = ?').get(username) as { id: string } | null
  if (!targetUser) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const existing = db.query(
    'SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(wsId, targetUser.id)
  if (existing) throw createError({ statusCode: 409, statusMessage: 'Already a member' })

  const role = (body?.role as string) || 'editor'
  db.run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)', [wsId, targetUser.id, role])

  return { ok: true }
})
