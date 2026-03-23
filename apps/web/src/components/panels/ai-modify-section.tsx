import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useDocumentStore } from '@/stores/document-store'
import { useAIStore } from '@/stores/ai-store'
import { useDesignMdStore } from '@/stores/design-md-store'
import { useHistoryStore } from '@/stores/history-store'
import { generateDesignModification } from '@/services/ai/design-generator'
import { Sparkles, Loader2 } from 'lucide-react'
import type { PenNode } from '@/types/pen'
import AiVariantsDialog from '@/components/shared/ai-variants-dialog'

interface AiModifySectionProps {
  node: PenNode
}

export default function AiModifySection({ node }: AiModifySectionProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [variantCount, setVariantCount] = useState(3)
  const [loading, setLoading] = useState(false)
  const [variants, setVariants] = useState<PenNode[][] | null>(null)

  const handleQuickModify = useCallback(async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    try {
      const model = useAIStore.getState().model
      const { document: doc } = useDocumentStore.getState()
      const provider = useAIStore.getState().modelGroups.find((g) =>
        g.models.some((m) => m.value === model),
      )?.provider

      const { nodes } = await generateDesignModification([node], prompt.trim(), {
        variables: doc.variables,
        themes: doc.themes,
        designMd: useDesignMdStore.getState().designMd,
        model,
        provider,
      })

      // Apply directly
      useHistoryStore.getState().pushState(doc)
      for (const n of nodes) {
        const existing = useDocumentStore.getState().getNodeById(n.id)
        if (existing) {
          useDocumentStore.getState().updateNode(n.id, n)
        }
      }
    } catch (e) {
      console.error('[AI Modify] failed:', e)
    } finally {
      setLoading(false)
    }
  }, [node, prompt, loading])

  const handleGenerateVariants = useCallback(async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    try {
      const model = useAIStore.getState().model
      const { document: doc } = useDocumentStore.getState()
      const provider = useAIStore.getState().modelGroups.find((g) =>
        g.models.some((m) => m.value === model),
      )?.provider

      const opts = {
        variables: doc.variables,
        themes: doc.themes,
        designMd: useDesignMdStore.getState().designMd,
        model,
        provider,
      }

      // Generate N variants in parallel
      const promises = Array.from({ length: variantCount }, () =>
        generateDesignModification([node], prompt.trim(), opts)
          .then((r) => r.nodes)
          .catch(() => null),
      )
      const results = await Promise.all(promises)
      const validVariants = results.filter((r): r is PenNode[] => r !== null && r.length > 0)

      if (validVariants.length > 0) {
        setVariants(validVariants)
      }
    } catch (e) {
      console.error('[AI Variants] failed:', e)
    } finally {
      setLoading(false)
    }
  }, [node, prompt, variantCount, loading])

  const handleApplyVariant = useCallback((nodes: PenNode[]) => {
    const { document: doc } = useDocumentStore.getState()
    useHistoryStore.getState().pushState(doc)
    for (const n of nodes) {
      const existing = useDocumentStore.getState().getNodeById(n.id)
      if (existing) {
        useDocumentStore.getState().updateNode(n.id, n)
      }
    }
    setVariants(null)
  }, [])

  const handleRegenerate = useCallback(() => {
    setVariants(null)
    handleGenerateVariants()
  }, [handleGenerateVariants])

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Sparkles size={12} className="text-primary" />
          {t('aiModify.title')}
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('aiModify.placeholder')}
          rows={2}
          className={cn(
            'w-full px-2 py-1.5 rounded-md text-[11px] resize-none',
            'border border-border bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />

        {/* Variant count selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{t('aiModify.variants')}:</span>
          {[1, 3, 5].map((n) => (
            <button
              key={n}
              onClick={() => setVariantCount(n)}
              className={cn(
                'w-6 h-6 rounded text-[10px] font-medium transition-colors',
                variantCount === n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <button
            onClick={handleQuickModify}
            disabled={!prompt.trim() || loading}
            className={cn(
              'flex-1 h-7 rounded-md text-[11px] font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center justify-center gap-1',
            )}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {t('aiModify.apply')}
          </button>
          <button
            onClick={handleGenerateVariants}
            disabled={!prompt.trim() || loading}
            className={cn(
              'flex-1 h-7 rounded-md text-[11px] font-medium',
              'border border-border text-foreground',
              'hover:bg-secondary/50 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center justify-center gap-1',
            )}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : null}
            {t('aiModify.compare')}
          </button>
        </div>
      </div>

      {/* Variants comparison dialog */}
      {variants && (
        <AiVariantsDialog
          variants={variants}
          prompt={prompt}
          onApply={handleApplyVariant}
          onRegenerate={handleRegenerate}
          onClose={() => setVariants(null)}
        />
      )}
    </>
  )
}
