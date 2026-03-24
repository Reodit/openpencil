import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useDocumentStore } from '@/stores/document-store'
import { useAIStore } from '@/stores/ai-store'
import { useDesignMdStore } from '@/stores/design-md-store'
import { useHistoryStore } from '@/stores/history-store'
import { generateDesignModification } from '@/services/ai/design-generator'
import { Sparkles, Loader2, ChevronLeft, ChevronRight, Check, X, Plus } from 'lucide-react'
import type { PenNode } from '@/types/pen'

interface AiModifySectionProps {
  node: PenNode
}

type Mode = 'idle' | 'loading' | 'preview'

export default function AiModifySection({ node }: AiModifySectionProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<Mode>('idle')
  const [error, setError] = useState('')

  // Variants stored as arrays of modified nodes
  const [variants, setVariants] = useState<PenNode[][]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Original node state (for restore on cancel)
  const originalRef = useRef<PenNode | null>(null)

  const getAIOptions = useCallback(() => {
    const model = useAIStore.getState().model
    const { document: doc } = useDocumentStore.getState()
    const provider = useAIStore.getState().modelGroups.find((g) =>
      g.models.some((m) => m.value === model),
    )?.provider
    return {
      variables: doc.variables,
      themes: doc.themes,
      designMd: useDesignMdStore.getState().designMd,
      model,
      provider,
    }
  }, [])

  // Apply a variant's nodes to the canvas (temporary, no history push)
  const applyToCanvas = useCallback((nodes: PenNode[]) => {
    for (const n of nodes) {
      const existing = useDocumentStore.getState().getNodeById(n.id)
      if (existing) {
        useDocumentStore.getState().updateNode(n.id, n)
      }
    }
  }, [])

  // Restore original node
  const restoreOriginal = useCallback(() => {
    if (originalRef.current) {
      useDocumentStore.getState().updateNode(originalRef.current.id, originalRef.current)
    }
  }, [])

  // Generate first variant
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || mode === 'loading') return
    setMode('loading')
    setError('')

    // Save original state
    originalRef.current = structuredClone(node)

    try {
      const { nodes } = await generateDesignModification(
        [node], prompt.trim(), getAIOptions(),
      )

      setVariants([nodes])
      setCurrentIndex(0)
      applyToCanvas(nodes)
      setMode('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMode('idle')
    }
  }, [node, prompt, mode, getAIOptions, applyToCanvas])

  // Add another variant
  const handleAddVariant = useCallback(async () => {
    if (mode === 'loading') return
    setMode('loading')
    setError('')

    // Restore original before generating (AI needs original as context)
    restoreOriginal()

    try {
      const { nodes } = await generateDesignModification(
        [originalRef.current!], prompt.trim(), getAIOptions(),
      )

      const newVariants = [...variants, nodes]
      const newIndex = newVariants.length - 1
      setVariants(newVariants)
      setCurrentIndex(newIndex)
      applyToCanvas(nodes)
      setMode('preview')
    } catch (e) {
      // Reapply current variant on failure
      if (variants[currentIndex]) applyToCanvas(variants[currentIndex])
      setError(e instanceof Error ? e.message : String(e))
      setMode('preview')
    }
  }, [variants, currentIndex, prompt, mode, getAIOptions, applyToCanvas, restoreOriginal])

  // Navigate between variants
  const handleNavigate = useCallback((direction: -1 | 1) => {
    const newIndex = currentIndex + direction
    if (newIndex < 0 || newIndex >= variants.length) return
    setCurrentIndex(newIndex)
    applyToCanvas(variants[newIndex])
  }, [currentIndex, variants, applyToCanvas])

  // Confirm current variant
  const handleConfirm = useCallback(() => {
    // Push to history (original → confirmed variant)
    if (originalRef.current) {
      const { document: doc } = useDocumentStore.getState()
      useHistoryStore.getState().pushState(doc)
    }
    // Current variant is already applied to canvas
    setVariants([])
    setCurrentIndex(0)
    setMode('idle')
    originalRef.current = null
  }, [])

  // Cancel and restore original
  const handleCancel = useCallback(() => {
    restoreOriginal()
    setVariants([])
    setCurrentIndex(0)
    setMode('idle')
    originalRef.current = null
  }, [restoreOriginal])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <Sparkles size={12} className="text-primary" />
        {t('aiModify.title')}
      </div>

      {/* Prompt input */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t('aiModify.placeholder')}
        rows={2}
        disabled={mode === 'preview'}
        className={cn(
          'w-full px-2 py-1.5 rounded-md text-[11px] resize-none',
          'border border-border bg-background text-foreground',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:opacity-50',
        )}
      />

      {error && <p className="text-[10px] text-destructive">{error}</p>}

      {mode === 'idle' && (
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim()}
          className={cn(
            'w-full h-7 rounded-md text-[11px] font-medium',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-1',
          )}
        >
          <Sparkles size={12} />
          {t('aiModify.generate')}
        </button>
      )}

      {mode === 'loading' && (
        <div className="flex items-center justify-center h-7 text-[11px] text-muted-foreground gap-1">
          <Loader2 size={12} className="animate-spin" />
          {t('aiModify.generating')}
        </div>
      )}

      {mode === 'preview' && (
        <div className="space-y-2">
          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => handleNavigate(-1)}
              disabled={currentIndex === 0}
              className="p-1 rounded hover:bg-secondary/50 disabled:opacity-30 text-muted-foreground"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11px] text-muted-foreground">
              {t('aiModify.variantOf', { current: currentIndex + 1, total: variants.length })}
            </span>
            <button
              onClick={() => handleNavigate(1)}
              disabled={currentIndex >= variants.length - 1}
              className="p-1 rounded hover:bg-secondary/50 disabled:opacity-30 text-muted-foreground"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-1">
            <button
              onClick={handleConfirm}
              className={cn(
                'flex-1 h-7 rounded-md text-[11px] font-medium',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'flex items-center justify-center gap-1',
              )}
            >
              <Check size={11} />
              {t('aiModify.confirm')}
            </button>
            <button
              onClick={handleAddVariant}
              className={cn(
                'h-7 px-2 rounded-md text-[11px]',
                'border border-border text-foreground hover:bg-secondary/50',
                'flex items-center justify-center gap-1',
              )}
            >
              <Plus size={11} />
              {t('aiModify.addVariant')}
            </button>
            <button
              onClick={handleCancel}
              className={cn(
                'h-7 px-2 rounded-md text-[11px]',
                'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                'flex items-center justify-center',
              )}
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
