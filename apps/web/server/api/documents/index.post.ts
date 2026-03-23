import { defineEventHandler, readBody } from 'h3'
import { randomUUID } from 'node:crypto'
import { getDB } from '../../utils/db'

/** POST /api/documents — Create a new document. Body: { name?, data } */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown>
  const id = randomUUID()
  const name = (body?.name as string) || 'Untitled'
  const data = typeof body?.data === 'string' ? body.data : JSON.stringify(body?.data ?? { version: '0.5.0', children: [] })

  const db = getDB()
  db.run('INSERT INTO documents (id, name, data) VALUES (?, ?, ?)', [id, name, data])

  return { id, name }
})
