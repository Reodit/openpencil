import { defineEventHandler, getQuery, createError } from 'h3'
import { randomUUID } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { getSessionUser } from '../../utils/session'
import { getDB } from '../../utils/db'
import { joinRoom, leaveRoom, getRoomPeers, getRoomVersion } from '../../utils/collab-state'

/** GET /api/collab/events?doc=<documentId> — SSE stream for real-time collaboration. */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const query = getQuery(event)
  const documentId = query.doc as string
  if (!documentId) throw createError({ statusCode: 400, statusMessage: 'doc query param required' })

  // Verify workspace membership
  const db = getDB()
  const doc = db.query('SELECT workspace_id FROM documents WHERE id = ?').get(documentId) as { workspace_id: string } | null
  if (!doc) throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  const membership = db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  ).get(doc.workspace_id, user.id)
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Not a member' })

  const clientId = randomUUID()
  const res = event.node!.res! as ServerResponse

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  // Send client ID
  res.write(`data: ${JSON.stringify({ type: 'client:id', clientId })}\n\n`)

  // Send current peers
  const peers = getRoomPeers(documentId)
  res.write(`data: ${JSON.stringify({ type: 'presence:init', peers })}\n\n`)

  // Send current version
  const version = getRoomVersion(documentId)
  res.write(`data: ${JSON.stringify({ type: 'version', version })}\n\n`)

  // Join the room
  joinRoom({
    id: clientId,
    userId: user.id,
    userName: user.name,
    userColor: user.color,
    documentId,
    res,
  })

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (!res.closed) res.write(': heartbeat\n\n')
  }, 30_000)

  res.on('close', () => {
    clearInterval(heartbeat)
    leaveRoom(documentId, clientId)
  })

  return new Promise<void>((resolve) => {
    res.on('close', resolve)
  })
})
