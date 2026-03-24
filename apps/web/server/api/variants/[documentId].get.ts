import { defineEventHandler, getRouterParam, getQuery, createError } from 'h3'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** GET /api/variants/:documentId?nodeId=xxx — Get saved variants for a document/node. */
export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const documentId = getRouterParam(event, 'documentId')
  if (!documentId) throw createError({ statusCode: 400, statusMessage: 'Missing documentId' })

  const query = getQuery(event)
  const nodeId = query.nodeId as string | undefined

  const db = getDB()
  let rows: Array<Record<string, unknown>>

  if (nodeId) {
    rows = db.query(
      'SELECT id, node_id, prompt, model, variants, created_by, created_at FROM ai_variants WHERE document_id = ? AND node_id = ? ORDER BY created_at DESC',
    ).all(documentId, nodeId) as Array<Record<string, unknown>>
  } else {
    rows = db.query(
      'SELECT id, node_id, prompt, model, variants, created_by, created_at FROM ai_variants WHERE document_id = ? ORDER BY created_at DESC',
    ).all(documentId) as Array<Record<string, unknown>>
  }

  return {
    variants: rows.map((r) => ({
      ...r,
      variants: JSON.parse(r.variants as string),
    })),
  }
})
