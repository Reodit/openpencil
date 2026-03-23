import { defineEventHandler } from 'h3'
import { getDB } from '../../utils/db'

/** GET /api/documents — List all documents (metadata only, no data blob). */
export default defineEventHandler(() => {
  const db = getDB()
  const rows = db.query(
    `SELECT id, name, thumbnail, created_at, updated_at
     FROM documents ORDER BY updated_at DESC`,
  ).all()
  return { documents: rows }
})
