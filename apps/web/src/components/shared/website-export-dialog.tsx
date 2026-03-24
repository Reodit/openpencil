import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { Loader2, Globe, X, Download } from 'lucide-react'
import { useDocumentStore } from '@/stores/document-store'
import { useAIStore } from '@/stores/ai-store'
import { generateAIWebsite } from '@/services/ai/website-generator'

export default function WebsiteExportDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [progressText, setProgressText] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const handleGenerate = useCallback(async () => {
    setStatus('generating')
    setErrorMsg('')
    setResult(null)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const doc = useDocumentStore.getState().document
      const model = useAIStore.getState().model
      const provider = useAIStore.getState().modelGroups.find((g) =>
        g.models.some((m) => m.value === model),
      )?.provider

      if (!model || !provider) {
        throw new Error('No AI model connected')
      }

      const html = await generateAIWebsite(
        doc,
        model,
        provider,
        (text) => setProgressText(text),
        abort.signal,
      )

      setResult(html)
      setStatus('done')
    } catch (e) {
      if (abort.signal.aborted) {
        setStatus('idle')
      } else {
        setErrorMsg(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    } finally {
      abortRef.current = null
    }
  }, [])

  const handleDownload = useCallback(() => {
    if (!result) return
    const doc = useDocumentStore.getState().document
    const blob = new Blob([result], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.name ?? 'website'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }, [result])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
  }, [])

  const handleClose = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
    setResult(null)
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === backdropRef.current) handleClose() }}
    >
      <div className="w-[420px] rounded-lg border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">{t('website.title')}</h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded-md hover:bg-secondary/50 text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-6">
          {status === 'idle' && (
            <div className="text-center space-y-4">
              <p className="text-xs text-muted-foreground">{t('website.description')}</p>
              <button
                onClick={handleGenerate}
                className={cn(
                  'w-full h-9 rounded-md text-sm font-medium',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'flex items-center justify-center gap-2',
                )}
              >
                <Globe size={16} />
                {t('website.generate')}
              </button>
            </div>
          )}

          {status === 'generating' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">{progressText}</p>
              <button
                onClick={handleCancel}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}

          {status === 'done' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-500 justify-center">
                <Globe size={16} />
                <span className="text-sm font-medium">{t('website.done')}</span>
              </div>
              <button
                onClick={handleDownload}
                className={cn(
                  'w-full h-9 rounded-md text-sm font-medium',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'flex items-center justify-center gap-2',
                )}
              >
                <Download size={16} />
                {t('website.download')}
              </button>
              <button
                onClick={handleGenerate}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                {t('website.regenerate')}
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <p className="text-xs text-destructive text-center">{errorMsg}</p>
              <button
                onClick={handleGenerate}
                className={cn(
                  'w-full h-9 rounded-md text-sm font-medium',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'flex items-center justify-center gap-2',
                )}
              >
                {t('website.retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
