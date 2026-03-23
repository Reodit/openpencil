import { createFileRoute, Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { PenTool, Plus, Trash2, Loader2, ArrowLeft, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { getWorkspace, inviteMember, type WorkspaceMember } from '@/services/workspace-api'
import { createDocument, deleteDocument, type DocumentMeta } from '@/services/document-api'

export const Route = createFileRoute('/workspace/$id')({
  component: WorkspacePage,
  ssr: false,
})

function WorkspacePage() {
  const { t } = useTranslation()
  const { id: wsId } = useParams({ from: '/workspace/$id' })
  const navigate = useNavigate()
  const [wsName, setWsName] = useState('')
  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [showInvite, setShowInvite] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    getWorkspace(wsId)
      .then((data) => {
        setWsName(data.workspace.name)
        setDocuments(data.documents as DocumentMeta[])
        setMembers(data.members)
        setRole(data.role)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [wsId])

  useEffect(() => { refresh() }, [refresh])

  const handleNewDoc = async () => {
    setCreating(true)
    try {
      const { id } = await createDocument(wsId, 'Untitled')
      navigate({ to: '/editor', search: { doc: id } })
    } catch (e) {
      console.error('Failed to create document:', e)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await deleteDocument(docId)
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteUsername.trim()) return
    setInviteError('')
    try {
      await inviteMember(wsId, inviteUsername.trim())
      setInviteUsername('')
      setShowInvite(false)
      refresh()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm gap-2">
        <Loader2 size={16} className="animate-spin" /> {t('dashboard.loading')}
      </div>
    )
  }

  const canEdit = role === 'owner' || role === 'editor'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="p-1.5 rounded-md hover:bg-secondary/50 text-muted-foreground">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-lg font-semibold">{wsName}</h1>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <button
                  onClick={() => setShowInvite(!showInvite)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs border border-border hover:bg-secondary/50 transition-colors"
                >
                  <UserPlus size={14} /> {t('workspace.invite')}
                </button>
                <button
                  onClick={handleNewDoc}
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {t('workspace.newDesign')}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Invite form */}
        {showInvite && (
          <form onSubmit={handleInvite} className="mb-4 flex items-center gap-2">
            <input
              type="text"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder={t('workspace.invitePlaceholder')}
              autoFocus
              className={cn(
                'h-8 px-3 rounded-md text-xs flex-1',
                'border border-border bg-card text-foreground',
                'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
            <button type="submit" className="h-8 px-3 rounded-md bg-primary text-xs text-primary-foreground hover:bg-primary/90">
              {t('workspace.send')}
            </button>
            {inviteError && <span className="text-xs text-destructive">{inviteError}</span>}
          </form>
        )}

        {/* Members */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-muted-foreground">{t('workspace.members')}</span>
          {members.map((m) => (
            <div
              key={m.id}
              title={`${m.name} (${m.role})`}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: m.color }}
            >
              {m.name[0].toUpperCase()}
            </div>
          ))}
        </div>

        {/* Documents */}
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <PenTool size={48} className="mb-4 opacity-30" />
            <p className="text-sm mb-4">{t('workspace.noDocuments')}</p>
            {canEdit && (
              <button
                onClick={handleNewDoc}
                disabled={creating}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus size={16} /> {t('workspace.createFirstDesign')}
              </button>
            )}
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
                <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                  {doc.thumbnail ? (
                    <img src={doc.thumbnail} alt={doc.name} className="w-full h-full object-cover" />
                  ) : (
                    <PenTool size={24} className="text-muted-foreground/30" />
                  )}
                </div>
                <div className="px-3 py-2">
                  <p className="text-xs font-medium text-foreground truncate">{doc.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(doc.updated_at).toLocaleDateString()}
                  </p>
                </div>
                {canEdit && (
                  <button
                    onClick={(e) => handleDelete(doc.id, e)}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
