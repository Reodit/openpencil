import { useEffect, useRef } from 'react'
import { useDocumentStore } from '@/stores/document-store'
import { saveDocument } from '@/services/document-api'

const SAVE_INTERVAL = 3000

/**
 * Auto-saves the document to the server every 3 seconds when dirty.
 * Only active when a server document ID is provided.
 */
export function useAutoSave(docId: string | null) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!docId) return

    timerRef.current = setInterval(async () => {
      const { document, isDirty } = useDocumentStore.getState()
      if (!isDirty || savingRef.current) return

      savingRef.current = true
      try {
        await saveDocument(docId, document, document.name)
        useDocumentStore.getState().markClean()
      } catch (e) {
        console.warn('[AutoSave] failed:', e)
      } finally {
        savingRef.current = false
      }
    }, SAVE_INTERVAL)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [docId])
}
