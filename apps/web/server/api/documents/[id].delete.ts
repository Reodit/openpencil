import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getDB } from '../../utils/db'

/** DELETE /api/documents/:id — Delete a document. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' })

  const db = getDB()
  const result = db.run('DELETE FROM documents WHERE id = ?', [id])
  if (result.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }

  return { ok: true }
})
