import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import EditorLayout from '@/components/editor/editor-layout'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useBeforeUnload } from '@/hooks/use-before-unload'
import { useTranslation } from 'react-i18next'
import { useAutoSave } from '@/hooks/use-auto-save'
import { useCollab } from '@/hooks/use-collab'
import { useDocumentStore } from '@/stores/document-store'
import { getDocument } from '@/services/document-api'

export const Route = createFileRoute('/editor')({
  component: EditorPage,
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    doc: (search.doc as string) || null,
  }),
  head: () => ({
    meta: [{ title: 'OpenPencil Editor' }],
  }),
})

function EditorPage() {
  const { t } = useTranslation()
  const { doc: docId } = useSearch({ from: '/editor' })
  const [loading, setLoading] = useState(!!docId)

  useKeyboardShortcuts()
  useBeforeUnload()
  useAutoSave(docId ?? null)
  useCollab(docId ?? null)

  // Load document from server if doc= param is present
  useEffect(() => {
    if (!docId) return
    let cancelled = false
    setLoading(true)
    getDocument(docId)
      .then(({ data, meta }) => {
        if (cancelled) return
        useDocumentStore.getState().loadDocument(data, meta.name)
      })
      .catch((e) => {
        console.error('[Editor] Failed to load document:', e)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [docId])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        {t('editor.loadingDocument')}
      </div>
    )
  }

  return <EditorLayout />
}
