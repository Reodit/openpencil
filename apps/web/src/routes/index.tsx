import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { PenTool, Plus, Trash2, Loader2 } from 'lucide-react'
import { listDocuments, createDocument, deleteDocument, type DocumentMeta } from '@/services/document-api'
import { useUserStore } from '@/stores/user-store'

export const Route = createFileRoute('/')({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: 'OpenPencil - Dashboard' }],
  }),
})

function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    listDocuments()
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleNew = async () => {
    setCreating(true)
    try {
      const { id } = await createDocument('Untitled')
      navigate({ to: '/editor', search: { doc: id } })
    } catch (e) {
      console.error('Failed to create document:', e)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await deleteDocument(id)
      setDocuments((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool size={24} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">
              {t('landing.open')}
              <span className="text-primary">{t('landing.pencil')}</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleNew}
              disabled={creating}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {t('landing.newDesign')}
            </button>
            <UserBadge />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
            <Loader2 size={16} className="animate-spin" />
            Loading…
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <PenTool size={48} className="mb-4 opacity-30" />
            <p className="text-sm mb-4">No documents yet</p>
            <button
              onClick={handleNew}
              disabled={creating}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} />
              Create your first design
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                to="/editor"
                search={{ doc: doc.id }}
                className="group relative rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
              >
                {/* Thumbnail */}
                <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                  {doc.thumbnail ? (
                    <img src={doc.thumbnail} alt={doc.name} className="w-full h-full object-cover" />
                  ) : (
                    <PenTool size={24} className="text-muted-foreground/30" />
                  )}
                </div>

                {/* Info */}
                <div className="px-3 py-2">
                  <p className="text-xs font-medium text-foreground truncate">{doc.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(doc.updated_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(doc.id, e)}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function UserBadge() {
  const user = useUserStore((s) => s.user)
  if (!user) return null
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ backgroundColor: user.color }}
      >
        {user.name[0].toUpperCase()}
      </div>
      <span className="text-xs text-muted-foreground hidden sm:inline">{user.name}</span>
    </div>
  )
}
