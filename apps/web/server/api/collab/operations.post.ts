import { defineEventHandler, readBody, createError } from 'h3'
import { getSessionUser } from '../../utils/session'
import { getDB } from '../../utils/db'
import { broadcastOperations } from '../../utils/collab-state'

/** POST /api/collab/operations — Broadcast operations to other clients in the room. */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const body = await readBody(event) as Record<string, unknown>
  const documentId = body?.documentId as string
  const clientId = body?.clientId as string
  const operations = body?.operations as Array<{ type: string;[key: string]: unknown }>

  if (!documentId || !operations?.length) {
    throw createError({ statusCode: 400, statusMessage: 'documentId and operations required' })
  }

  // Verify workspace membership
  const db = getDB()
  const doc = db.query('SELECT workspace_id FROM documents WHERE id = ?').get(documentId) as { workspace_id: string } | null
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(doc.workspace_id, user.id) as { role: string } | null
  if (!membership || membership.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'No permission' })
  }

  const version = broadcastOperations(documentId, operations, clientId)
  return { version }
})
