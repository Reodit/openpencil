import { defineEventHandler, readBody, createError } from 'h3'
import { getSessionUser } from '../../utils/session'
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

  broadcastCursor(documentId, user.id, { x, y, pageId: pageId ?? '' }, clientId)
  return { ok: true }
})
