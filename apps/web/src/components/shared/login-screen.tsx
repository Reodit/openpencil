import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/stores/user-store'
import { PenTool, ArrowRight, Loader2 } from 'lucide-react'

export default function LoginScreen() {
  const login = useUserStore((s) => s.login)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || loading) return
    setLoading(true)
    try {
      await login(name.trim())
    } catch {
      // retry
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-80">
        <div className="flex items-center justify-center gap-2 mb-8">
          <PenTool size={32} className="text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Open<span className="text-primary">Pencil</span>
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Nickname
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name…"
              autoFocus
              maxLength={30}
              className={cn(
                'w-full h-10 px-3 rounded-md text-sm',
                'border border-border bg-card text-foreground',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || loading}
            className={cn(
              'w-full h-10 rounded-md text-sm font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center justify-center gap-2',
            )}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                Get Started
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
