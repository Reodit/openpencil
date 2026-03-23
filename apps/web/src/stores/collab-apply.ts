/**
 * Apply remote collaboration operations to the local document store.
 * Suppresses history pushes and collab re-emission during application.
 */

import type { PenDocument, PenNode } from '@/types/pen'
import { useDocumentStore } from '@/stores/document-store'
import { setCollabSuppressed, type CollabOperation } from '@/stores/collab-middleware'
import { setHistorySuppressed } from '@/stores/history-store'

export function applyCollabOperations(ops: CollabOperation[]): void {
  setCollabSuppressed(true)
  setHistorySuppressed(true)

  try {
    for (const op of ops) {
      switch (op.type) {
        case 'node:update':
          useDocumentStore.getState().updateNode(
            op.nodeId as string,
            op.updates as Partial<PenNode>,
          )
          break

        case 'node:add':
          useDocumentStore.getState().addNode(
            null, // add to root of current page
            op.node as PenNode,
          )
          break

        case 'node:remove':
          useDocumentStore.getState().removeNode(op.nodeId as string)
          break

        case 'doc:variables':
          // Apply all variables at once via full doc replace
          {
            const store = useDocumentStore.getState()
            const doc = { ...store.document, variables: op.variables as PenDocument['variables'] }
            store.applyExternalDocument(doc)
          }
          break

        case 'doc:full-replace':
          useDocumentStore.getState().applyExternalDocument(op.document as PenDocument)
          break

        default:
          // Unknown op type — skip
          break
      }
    }
  } finally {
    setCollabSuppressed(false)
    setHistorySuppressed(false)
  }
}
