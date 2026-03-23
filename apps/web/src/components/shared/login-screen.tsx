import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/stores/user-store'
import { PenTool, ArrowRight, Loader2 } from 'lucide-react'

type Mode = 'login' | 'register'

export default function LoginScreen() {
  const { login, register } = useUserStore()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password || loading) return
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(username.trim(), password)
      } else {
        await register(username.trim(), password, displayName.trim() || username.trim())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
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

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoFocus
              maxLength={30}
              className={cn(
                'w-full h-9 px-3 rounded-md text-sm',
                'border border-border bg-card text-foreground',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••"
              className={cn(
                'w-full h-9 px-3 rounded-md text-sm',
                'border border-border bg-card text-foreground',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring',
              )}
            />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Display Name <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How others see you"
                maxLength={30}
                className={cn(
                  'w-full h-9 px-3 rounded-md text-sm',
                  'border border-border bg-card text-foreground',
                  'placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={!username.trim() || !password || loading}
            className={cn(
              'w-full h-9 rounded-md text-sm font-medium',
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
                {mode === 'login' ? 'Sign In' : 'Create Account'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button
                onClick={() => { setMode('register'); setError('') }}
                className="text-primary hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError('') }}
                className="text-primary hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
