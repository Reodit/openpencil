import { defineEventHandler, readBody, createError } from 'h3'
import { getSessionUser } from '../../utils/session'
import { getDB } from '../../utils/db'
import { broadcastCursor } from '../../utils/collab-state'

/** POST /api/collab/cursor — Broadcast cursor position to other clients. */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const body = await readBody(event) as Record<string, unknown>
  const documentId = body?.documentId as string
  const clientId = body?.clientId as string
  const x = body?.x as number
  const y = body?.y as number
  const pageId = body?.pageId as string

  if (!documentId || x === undefined || y === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'documentId, x, y required' })
  }

  // Verify workspace membership
  const db = getDB()
  const doc = db.query('SELECT workspace_id FROM documents WHERE id = ?').get(documentId) as { workspace_id: string } | null
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(doc.workspace_id, user.id)
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'No permission' })

  broadcastCursor(documentId, user.id, { x, y, pageId: pageId ?? '' }, clientId)
  return { ok: true }
})
