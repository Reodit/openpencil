import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getDB } from '../../utils/db'

/** GET /api/documents/:id — Get a single document with full data. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing document id' })

  const db = getDB()
  const row = db.query('SELECT * FROM documents WHERE id = ?').get(id) as Record<string, unknown> | null
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Document not found' })

  return {
    id: row.id,
    name: row.name,
    data: JSON.parse(row.data as string),
    thumbnail: row.thumbnail,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
})
