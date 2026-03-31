import { defineEventHandler, readBody, setResponseHeaders } from 'h3'
import { getSyncDocument } from '../../utils/mcp-sync-state'

interface SearchQuery {
  query?: string    // name/content text search (regex)
  type?: string     // node type filter: frame, text, image, etc.
  role?: string     // role filter: navbar, button, card, etc.
  parentId?: string // search within a specific parent
  limit?: number    // max results (default 20)
}

interface SearchResult {
  id: string
  name?: string
  type: string
  role?: string
  parentId?: string
  parentName?: string
  width?: unknown
  height?: unknown
  // Text-specific
  content?: string
  fontSize?: number
  // Summary
  childCount?: number
}

function searchNodesRecursive(
  nodes: Record<string, unknown>[],
  query: SearchQuery,
  parentId: string | null,
  parentName: string | null,
  results: SearchResult[],
  limit: number,
): void {
  for (const node of nodes) {
    if (results.length >= limit) return

    const id = node.id as string
    const name = (node.name as string) ?? ''
    const type = node.type as string
    const role = (node.role as string) ?? undefined
    const content = (node.content as string) ?? ''
    const children = (node.children as Record<string, unknown>[]) ?? []

    let matches = true

    if (query.type && type !== query.type) matches = false
    if (query.role && role !== query.role) matches = false
    if (query.parentId && parentId !== query.parentId) matches = false
    if (query.query) {
      const regex = new RegExp(query.query, 'i')
      if (!regex.test(name) && !regex.test(content) && !regex.test(id)) {
        matches = false
      }
    }

    if (matches) {
      results.push({
        id,
        name: name || undefined,
        type,
        role,
        parentId: parentId ?? undefined,
        parentName: parentName ?? undefined,
        width: node.width,
        height: node.height,
        ...(type === 'text' ? { content: content.slice(0, 100), fontSize: node.fontSize as number } : {}),
        childCount: children.length || undefined,
      })
    }

    if (children.length > 0) {
      searchNodesRecursive(children, query, id, name, results, limit)
    }
  }
}

/**
 * POST /api/ai/nodes-search
 * Search canvas nodes by name, type, role, or text content.
 * Uses the live-synced document from mcp-sync-state.
 */
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'Content-Type': 'application/json' })

  const body = await readBody<SearchQuery>(event)
  const { doc } = getSyncDocument()

  if (!doc) {
    return { error: 'No document loaded', results: [] }
  }

  const limit = Math.min(body?.limit ?? 20, 100)
  const results: SearchResult[] = []

  // Search across all pages
  const pages = doc.pages ?? [{ children: doc.children }]
  for (const page of pages) {
    const children = (page as Record<string, unknown>).children as Record<string, unknown>[] ?? []
    searchNodesRecursive(children, body ?? {}, null, null, results, limit)
  }

  return { results, total: results.length }
})
