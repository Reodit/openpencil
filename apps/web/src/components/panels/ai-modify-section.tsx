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

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError('')

    try {
      const model = useAIStore.getState().model
      const { document: doc } = useDocumentStore.getState()
      const provider = useAIStore.getState().modelGroups.find((g) =>
        g.models.some((m) => m.value === model),
      )?.provider

      // Ask AI for N variants in a single call
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

      // Try to parse multiple variants from response
      const parsed = parseVariants(rawResponse, nodes, VARIANT_COUNT)
      setVariants(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [node, prompt, loading])

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
          disabled={!prompt.trim() || loading}
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

/**
 * Parse AI response to extract multiple variants.
 * The AI might return:
 * 1. A nested array [[nodes...], [nodes...]] — ideal
 * 2. A flat array [nodes...] — treat as single variant, duplicate with variations
 */
function parseVariants(rawResponse: string, fallbackNodes: PenNode[], targetCount: number): PenNode[][] {
  // Try to find nested JSON arrays in the response
  try {
    const jsonMatch = rawResponse.match(/\[\s*\[[\s\S]*?\]\s*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as PenNode[][]
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
        return parsed.slice(0, targetCount)
      }
    }
  } catch { /* fall through */ }

  // Try to find multiple ```json blocks
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

  // Fallback: use the single result as the only variant
  return [fallbackNodes]
}
