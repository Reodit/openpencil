import { defineEventHandler, readBody, createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** POST /api/workspaces — Create a new workspace. Body: { name } */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const body = await readBody(event) as Record<string, unknown>
  const name = (body?.name as string)?.trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const id = randomUUID()
  const db = getDB()
  db.run('INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)', [id, name, user.id])
  db.run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)', [id, user.id, 'owner'])

  return { id, name }
})
