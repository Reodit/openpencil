import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useDocumentStore } from '@/stores/document-store'
import { useAIStore } from '@/stores/ai-store'
import { useDesignMdStore } from '@/stores/design-md-store'
import { useHistoryStore } from '@/stores/history-store'
import { generateDesignModification } from '@/services/ai/design-generator'
import { Sparkles, Loader2, ChevronDown } from 'lucide-react'
import type { PenNode } from '@/types/pen'
import AiVariantsPopup from '@/components/shared/ai-variants-popup'

const VARIANT_COUNT = 5

interface AiModifySectionProps {
  node: PenNode
}

export default function AiModifySection({ node }: AiModifySectionProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [variants, setVariants] = useState<PenNode[][] | null>(null)

  // Model selection — default to AI store's current model
  const modelGroups = useAIStore((s) => s.modelGroups)
  const defaultModel = useAIStore((s) => s.model)
  const [selectedModel, setSelectedModel] = useState('')

  // Effective model: selected or default
  const model = selectedModel || defaultModel

  // Build flat list of available models
  const allModels = modelGroups.flatMap((g) =>
    g.models.map((m) => ({ value: m.value, label: `${m.displayName}`, provider: g.provider }))
  )

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError('')

    try {
      const { document: doc } = useDocumentStore.getState()
      const provider = modelGroups.find((g) =>
        g.models.some((m) => m.value === model),
      )?.provider

      const variantPrompt = `${prompt.trim()}\n\nIMPORTANT: Generate exactly ${VARIANT_COUNT} different design variations. Return them as a JSON array of arrays: [[variant1_nodes...], [variant2_nodes...], ...]. Each variant should be a distinctly different interpretation while following the same instruction. Keep all node IDs the same as the input.`

      const { nodes, rawResponse } = await generateDesignModification(
        [node], variantPrompt, {
          variables: doc.variables,
          themes: doc.themes,
          designMd: useDesignMdStore.getState().designMd,
          model,
          provider,
        },
      )

      const parsed = parseVariants(rawResponse, nodes, VARIANT_COUNT)
      setVariants(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [node, prompt, loading, model, modelGroups])

  const handleApplyVariant = useCallback((variantNodes: PenNode[]) => {
    const { document: doc } = useDocumentStore.getState()
    useHistoryStore.getState().pushState(doc)
    for (const n of variantNodes) {
      const existing = useDocumentStore.getState().getNodeById(n.id)
      if (existing) {
        useDocumentStore.getState().updateNode(n.id, n)
      }
    }
    setVariants(null)
  }, [])

  const handleRegenerate = useCallback(() => {
    setVariants(null)
    handleGenerate()
  }, [handleGenerate])

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Sparkles size={12} className="text-primary" />
          {t('aiModify.title')}
        </div>

        {/* Model selector */}
        <div className="relative">
          <select
            value={model}
            onChange={(e) => setSelectedModel(e.target.value)}
            className={cn(
              'w-full h-6 px-2 pr-6 rounded text-[10px] appearance-none cursor-pointer',
              'border border-border bg-secondary text-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          >
            {allModels.length === 0 && (
              <option value="">{t('aiModify.noModels')}</option>
            )}
            {modelGroups.map((group) => (
              <optgroup key={group.provider} label={group.providerName}>
                {group.models.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.displayName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
        </div>

        {/* Prompt */}
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

        {error && <p className="text-[10px] text-destructive">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || loading || allModels.length === 0}
          className={cn(
            'w-full h-7 rounded-md text-[11px] font-medium',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center gap-1',
          )}
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          {loading ? t('aiModify.generating') : t('aiModify.generate')}
        </button>
      </div>

      {variants && (
        <AiVariantsPopup
          variants={variants}
          prompt={prompt}
          originalNode={node}
          onApply={handleApplyVariant}
          onRegenerate={handleRegenerate}
          onClose={() => setVariants(null)}
        />
      )}
    </>
  )
}

function parseVariants(rawResponse: string, fallbackNodes: PenNode[], targetCount: number): PenNode[][] {
  try {
    const jsonMatch = rawResponse.match(/\[\s*\[[\s\S]*?\]\s*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as PenNode[][]
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
        return parsed.slice(0, targetCount)
      }
    }
  } catch { /* fall through */ }

  const jsonBlocks = rawResponse.match(/```json\s*([\s\S]*?)```/g)
  if (jsonBlocks && jsonBlocks.length > 1) {
    const variants: PenNode[][] = []
    for (const block of jsonBlocks) {
      try {
        const json = block.replace(/```json\s*/, '').replace(/```/, '').trim()
        const parsed = JSON.parse(json)
        if (Array.isArray(parsed)) {
          variants.push(parsed)
        }
      } catch { /* skip */ }
    }
    if (variants.length > 0) return variants.slice(0, targetCount)
  }

  return [fallbackNodes]
}
