import type { PenDocument } from '@/types/pen'

export interface DocumentMeta {
  id: string
  name: string
  thumbnail: string | null
  created_at: string
  updated_at: string
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const res = await fetch('/api/documents')
  if (!res.ok) throw new Error('Failed to list documents')
  const data = await res.json()
  return data.documents
}

export async function getDocument(id: string): Promise<{ meta: DocumentMeta; data: PenDocument }> {
  const res = await fetch(`/api/documents/${id}`)
  if (!res.ok) throw new Error('Failed to get document')
  const row = await res.json()
  return {
    meta: { id: row.id, name: row.name, thumbnail: row.thumbnail, created_at: row.created_at, updated_at: row.updated_at },
    data: row.data as PenDocument,
  }
}

export async function createDocument(name?: string, data?: PenDocument): Promise<{ id: string; name: string }> {
  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  })
  if (!res.ok) throw new Error('Failed to create document')
  return res.json()
}

export async function saveDocument(id: string, data: PenDocument, name?: string): Promise<void> {
  const body: Record<string, unknown> = { data }
  if (name) body.name = name
  const res = await fetch(`/api/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Failed to save document')
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete document')
}
