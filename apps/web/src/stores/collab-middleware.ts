/**
 * Collaboration middleware — captures document changes by diffing
 * Zustand state snapshots and produces lightweight operations.
 */

import type { PenDocument, PenNode } from '@/types/pen'
import { useDocumentStore } from '@/stores/document-store'

export interface CollabOperation {
  type: string
  [key: string]: unknown
}

let _suppressed = false

export function setCollabSuppressed(v: boolean) {
  _suppressed = v
}

export function isCollabSuppressed(): boolean {
  return _suppressed
}

/**
 * Subscribe to document-store and emit operations when the document changes.
 * Returns an unsubscribe function.
 */
export function startCollabCapture(
  sendOperations: (ops: CollabOperation[]) => void,
): () => void {
  let prevDoc: PenDocument = useDocumentStore.getState().document
  let prevJson = JSON.stringify(prevDoc)

  return useDocumentStore.subscribe((state) => {
    if (_suppressed) {
      // Update prevDoc even when suppressed so we don't emit stale diffs later
      prevDoc = state.document
      prevJson = JSON.stringify(prevDoc)
      return
    }

    const nextDoc = state.document
    if (nextDoc === prevDoc) return

    const nextJson = JSON.stringify(nextDoc)
    if (nextJson === prevJson) {
      prevDoc = nextDoc
      return
    }

    const ops = diffDocuments(prevDoc, nextDoc)
    prevDoc = nextDoc
    prevJson = nextJson

    if (ops.length > 0) {
      sendOperations(ops)
    }
  })
}

/**
 * Diff two PenDocument snapshots and produce a list of operations.
 * Falls back to full-replace if diff is too complex (> 20 ops).
 */
function diffDocuments(prev: PenDocument, next: PenDocument): CollabOperation[] {
  const ops: CollabOperation[] = []

  // Diff pages
  const prevPages = prev.pages ?? []
  const nextPages = next.pages ?? []

  // Check page-level changes (add/remove)
  const prevPageIds = new Set(prevPages.map(p => p.id))
  const nextPageIds = new Set(nextPages.map(p => p.id))

  for (const page of nextPages) {
    if (!prevPageIds.has(page.id)) {
      ops.push({ type: 'page:add', page: { id: page.id, name: page.name } })
    }
  }
  for (const page of prevPages) {
    if (!nextPageIds.has(page.id)) {
      ops.push({ type: 'page:remove', pageId: page.id })
    }
  }

  // Diff nodes per page
  for (const nextPage of nextPages) {
    const prevPage = prevPages.find(p => p.id === nextPage.id)
    if (!prevPage) continue

    // Page name change
    if (prevPage.name !== nextPage.name) {
      ops.push({ type: 'page:rename', pageId: nextPage.id, name: nextPage.name })
    }

    const prevNodes = flattenTree(prevPage.children)
    const nextNodes = flattenTree(nextPage.children)

    // Find added/removed/updated nodes
    for (const [id, node] of nextNodes) {
      if (!prevNodes.has(id)) {
        ops.push({ type: 'node:add', pageId: nextPage.id, node })
      } else {
        const prevNode = prevNodes.get(id)!
        if (JSON.stringify(prevNode) !== JSON.stringify(node)) {
          // Compute shallow diff of changed properties
          const updates: Record<string, unknown> = {}
          for (const key of Object.keys(node)) {
            if (key === 'children') continue
            if (JSON.stringify((prevNode as unknown as Record<string, unknown>)[key]) !== JSON.stringify((node as unknown as Record<string, unknown>)[key])) {
              updates[key] = (node as unknown as Record<string, unknown>)[key]
            }
          }
          if (Object.keys(updates).length > 0) {
            ops.push({ type: 'node:update', pageId: nextPage.id, nodeId: id, updates })
          }
        }
      }
    }
    for (const [id] of prevNodes) {
      if (!nextNodes.has(id)) {
        ops.push({ type: 'node:remove', pageId: nextPage.id, nodeId: id })
      }
    }
  }

  // Diff variables
  if (JSON.stringify(prev.variables ?? {}) !== JSON.stringify(next.variables ?? {})) {
    ops.push({ type: 'doc:variables', variables: next.variables ?? {} })
  }

  // Diff themes
  if (JSON.stringify(prev.themes ?? {}) !== JSON.stringify(next.themes ?? {})) {
    ops.push({ type: 'doc:themes', themes: next.themes ?? {} })
  }

  // If too many ops, fall back to full replace
  if (ops.length > 20) {
    return [{ type: 'doc:full-replace', document: next }]
  }

  return ops
}

function flattenTree(nodes: PenNode[]): Map<string, PenNode> {
  const map = new Map<string, PenNode>()
  const queue = [...nodes]
  while (queue.length > 0) {
    const node = queue.shift()!
    map.set(node.id, node)
    if ('children' in node && Array.isArray((node as { children?: PenNode[] }).children)) {
      queue.push(...(node as { children: PenNode[] }).children)
    }
  }
  return map
}
