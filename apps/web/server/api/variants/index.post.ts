import { defineEventHandler, readBody, createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { getDB } from '../../utils/db'
import { getSessionUser } from '../../utils/session'

/** POST /api/variants — Save AI variants for a node. */
export default defineEventHandler(async (event) => {
  const user = getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })

  const body = await readBody(event) as Record<string, unknown>
  const documentId = body?.documentId as string
  const nodeId = body?.nodeId as string
  const prompt = body?.prompt as string
  const model = (body?.model as string) || null
  const variants = body?.variants as unknown[][]

  if (!documentId || !nodeId || !prompt || !variants?.length) {
    throw createError({ statusCode: 400, statusMessage: 'documentId, nodeId, prompt, variants required' })
  }

  const id = randomUUID()
  const db = getDB()
  db.run(
    'INSERT INTO ai_variants (id, document_id, node_id, prompt, model, variants, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, documentId, nodeId, prompt, model, JSON.stringify(variants), user.id],
  )

  return { id }
})
