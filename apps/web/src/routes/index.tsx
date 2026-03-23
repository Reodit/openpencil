import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { PenTool, Plus, Loader2, Users, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listWorkspaces, createWorkspace, type WorkspaceMeta } from '@/services/workspace-api'
import { useUserStore } from '@/stores/user-store'

export const Route = createFileRoute('/')({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: 'OpenPencil - Dashboard' }],
  }),
})

function DashboardPage() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    listWorkspaces()
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      const ws = await createWorkspace(newName.trim())
      setNewName('')
      setShowCreate(false)
      navigate({ to: '/workspace/$id', params: { id: ws.id } })
    } catch (err) {
      console.error('Failed to create workspace:', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool size={24} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">
              Open<span className="text-primary">Pencil</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} />
              New Workspace
            </button>
            <UserBadge />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Create workspace dialog */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-6 flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name…"
              autoFocus
              className={cn(
                'h-9 px-3 rounded-md text-sm flex-1',
                'border border-border bg-card text-foreground',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
            <button
              type="submit"
              disabled={!newName.trim() || creating}
              className="h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewName('') }}
              className="h-9 px-3 rounded-md text-sm text-muted-foreground hover:bg-secondary/50"
            >
              Cancel
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
            <Loader2 size={16} className="animate-spin" />
            Loading…
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Users size={48} className="mb-4 opacity-30" />
            <p className="text-sm mb-4">No workspaces yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus size={16} />
              Create your first workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {workspaces.map((ws) => (
              <Link
                key={ws.id}
                to="/workspace/$id"
                params={{ id: ws.id }}
                className="group rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderOpen size={20} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{ws.name}</p>
                    <p className="text-[10px] text-muted-foreground">{ws.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {ws.member_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderOpen size={12} /> {ws.doc_count} docs
                  </span>
                </div>
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
  const logout = useUserStore((s) => s.logout)
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
      <button onClick={logout} className="text-[10px] text-muted-foreground hover:text-foreground">
        logout
      </button>
    </div>
  )
}
