import { defineEventHandler, readBody, createError } from 'h3'
import { getSessionUser } from '../../utils/session'
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

  const version = broadcastOperations(documentId, operations, clientId)
  return { version }
})
