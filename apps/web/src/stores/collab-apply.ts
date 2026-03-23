/**
 * Apply remote collaboration operations to the local document store.
 * Suppresses history pushes and collab re-emission during application.
 */

import type { PenDocument, PenNode } from '@/types/pen'
import { useDocumentStore } from '@/stores/document-store'
import { useCanvasStore } from '@/stores/canvas-store'
import { setCollabSuppressed, type CollabOperation } from '@/stores/collab-middleware'
import { setHistorySuppressed } from '@/stores/history-store'

export function applyCollabOperations(ops: CollabOperation[]): void {
  setCollabSuppressed(true)
  setHistorySuppressed(true)

  try {
    const activePageId = useCanvasStore.getState().activePageId

    for (const op of ops) {
      switch (op.type) {
        case 'node:update':
          useDocumentStore.getState().updateNode(
            op.nodeId as string,
            op.updates as Partial<PenNode>,
          )
          break

        case 'node:add': {
          const opPageId = op.pageId as string | undefined
          // If the op targets a different page than what we're viewing,
          // apply via direct document manipulation
          if (opPageId && opPageId !== activePageId) {
            applyNodeAddToPage(opPageId, op.parentId as string | null, op.node as PenNode)
          } else {
            useDocumentStore.getState().addNode(
              (op.parentId as string | null) ?? null,
              op.node as PenNode,
            )
          }
          break
        }

        case 'node:remove':
          useDocumentStore.getState().removeNode(op.nodeId as string)
          break

        case 'page:add': {
          useDocumentStore.getState().addPage()
          break
        }

        case 'page:remove': {
          useDocumentStore.getState().removePage(op.pageId as string)
          break
        }

        case 'page:rename': {
          useDocumentStore.getState().renamePage(op.pageId as string, op.name as string)
          break
        }

        case 'doc:variables': {
          const store = useDocumentStore.getState()
          const doc = { ...store.document, variables: op.variables as PenDocument['variables'] }
          store.applyExternalDocument(doc)
          break
        }

        case 'doc:themes': {
          const store = useDocumentStore.getState()
          const doc = { ...store.document, themes: op.themes as PenDocument['themes'] }
          store.applyExternalDocument(doc)
          break
        }

        case 'doc:full-replace':
          useDocumentStore.getState().applyExternalDocument(op.document as PenDocument)
          break
      }
    }
  } finally {
    setCollabSuppressed(false)
    setHistorySuppressed(false)
  }
}

/**
 * Add a node to a specific page (not the active page).
 * Directly manipulates the document to target the correct page.
 */
function applyNodeAddToPage(pageId: string, parentId: string | null, node: PenNode): void {
  const store = useDocumentStore.getState()
  const doc = store.document
  if (!doc.pages) return

  const pageIndex = doc.pages.findIndex(p => p.id === pageId)
  if (pageIndex < 0) return

  const page = doc.pages[pageIndex]
  const newChildren = parentId
    ? insertIntoParent([...page.children], parentId, node)
    : [node, ...page.children]

  const newPages = [...doc.pages]
  newPages[pageIndex] = { ...page, children: newChildren }
  store.applyExternalDocument({ ...doc, pages: newPages })
}

function insertIntoParent(children: PenNode[], parentId: string, node: PenNode): PenNode[] {
  return children.map(child => {
    if (child.id === parentId) {
      const existing = (child as { children?: PenNode[] }).children ?? []
      return { ...child, children: [node, ...existing] } as PenNode
    }
    const childChildren = (child as { children?: PenNode[] }).children
    if (childChildren) {
      return { ...child, children: insertIntoParent(childChildren, parentId, node) } as PenNode
    }
    return child
  })
}
