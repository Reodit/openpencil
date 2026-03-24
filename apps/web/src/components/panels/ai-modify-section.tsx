import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useDocumentStore } from '@/stores/document-store'
import { useAIStore } from '@/stores/ai-store'
import { useHistoryStore } from '@/stores/history-store'
import { streamChat } from '@/services/ai/ai-service'
import { DESIGN_STREAM_TIMEOUTS } from '@/services/ai/ai-runtime-config'
import { Sparkles, Loader2, ChevronDown, History } from 'lucide-react'
import type { PenNode } from '@/types/pen'
import AiVariantsPopup from '@/components/shared/ai-variants-popup'

const VARIANT_COUNT = 5

interface AiModifySectionProps {
  node: PenNode
}

function buildVariantsSystemPrompt(count: number): string {
  return `You are a Design Variant Generator. You receive a PenNode JSON and a modification instruction. Your job is to generate exactly ${count} DIFFERENT design variations of the same node.

RULES:
- Each variant MUST keep the same node ID as the input.
- Each variant should be a distinctly different interpretation of the instruction.
- Vary colors, sizes, styles, fonts, spacing, corner radius, opacity, etc.
- Return ONLY valid PenNode JSON — no explanations between blocks.
- Do NOT change the node "type" or "id".

PenNode properties you can modify:
- fill: [{type:"solid", color:"#hex"}] — background color
- stroke: {color, width, style} — border
- cornerRadius: number or [tl,tr,br,bl] — rounded corners
- width, height: number — dimensions
- opacity: 0-1 — transparency
- fontSize, fontWeight, fontFamily, lineHeight, letterSpacing — text styling
- content: string — text content
- padding: number or [v,h] or [t,r,b,l] — inner spacing
- gap: number — child spacing
- layout: "none"|"vertical"|"horizontal" — auto layout
- effects: [{type:"shadow", offsetX, offsetY, blur, spread, color}] — shadows

RESPONSE FORMAT:
Return exactly ${count} JSON code blocks, each containing a single variant as a JSON array.
Label each with "Variant N:".

Variant 1:
\`\`\`json
[{...modified node...}]
\`\`\`

Variant 2:
\`\`\`json
[{...modified node...}]
\`\`\`

... and so on for all ${count} variants.`
}

/** Get document ID from URL query param */
function getDocId(): string | null {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('doc')
  } catch { return null }
}

interface SavedVariantSet {
  id: string
  prompt: string
  model: string | null
  variants: PenNode[][]
  created_at: string
}

export default function AiModifySection({ node }: AiModifySectionProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [variants, setVariants] = useState<PenNode[][] | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [savedSets, setSavedSets] = useState<SavedVariantSet[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const modelGroups = useAIStore((s) => s.modelGroups)
  const defaultModel = useAIStore((s) => s.model)
  const [selectedModel, setSelectedModel] = useState('')
  const model = selectedModel || defaultModel

  const allModels = modelGroups.flatMap((g) =>
    g.models.map((m) => ({ value: m.value, label: m.displayName, provider: g.provider }))
  )

  // Load saved variants for this node
  useEffect(() => {
    const docId = getDocId()
    if (!docId) return
    fetch(`/api/variants/${docId}?nodeId=${node.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.variants) setSavedSets(data.variants)
      })
      .catch(() => {})
  }, [node.id])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError('')

    try {
      const provider = modelGroups.find((g) =>
        g.models.some((m) => m.value === model),
      )?.provider

      const contextJson = JSON.stringify(node, null, 2)
      const userMessage = `INPUT NODE:\n${contextJson}\n\nINSTRUCTION:\n${prompt.trim()}`
      const systemPrompt = buildVariantsSystemPrompt(VARIANT_COUNT)

      let fullResponse = ''
      for await (const chunk of streamChat(
        systemPrompt,
        [{ role: 'user', content: userMessage }],
        model,
        DESIGN_STREAM_TIMEOUTS,
        provider,
      )) {
        if (chunk.type === 'text') {
          fullResponse += chunk.content
        } else if (chunk.type === 'error') {
          throw new Error(chunk.content)
        }
      }

      const parsed = parseVariantBlocks(fullResponse)
      if (parsed.length > 0) {
        setVariants(parsed)
        setShowPopup(true)

        // Save to server
        const docId = getDocId()
        if (docId) {
          fetch('/api/variants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documentId: docId,
              nodeId: node.id,
              prompt: prompt.trim(),
              model,
              variants: parsed,
            }),
          })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
              if (data?.id) {
                setSavedSets((prev) => [{
                  id: data.id,
                  prompt: prompt.trim(),
                  model,
                  variants: parsed,
                  created_at: new Date().toISOString(),
                }, ...prev])
              }
            })
            .catch(() => {})
        }
      } else {
        setError(t('aiModify.noResults'))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [node, prompt, loading, model, modelGroups, t])

  const handleApplyVariant = useCallback((variantNodes: PenNode[]) => {
    const { document: doc } = useDocumentStore.getState()
    useHistoryStore.getState().pushState(doc)
    for (const n of variantNodes) {
      const existing = useDocumentStore.getState().getNodeById(n.id)
      if (existing) {
        useDocumentStore.getState().updateNode(n.id, n)
      }
    }
    setShowPopup(false)
  }, [])

  const handleRegenerate = useCallback(() => {
    setShowPopup(false)
    setVariants(null)
    handleGenerate()
  }, [handleGenerate])

  const handleOpenSaved = useCallback((saved: SavedVariantSet) => {
    setVariants(saved.variants)
    setPrompt(saved.prompt)
    setShowPopup(true)
    setShowHistory(false)
  }, [])

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <Sparkles size={12} className="text-primary" />
            {t('aiModify.title')}
          </div>
          {savedSets.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                'flex items-center gap-1.5 h-5 px-2 rounded-full text-[10px] font-medium transition-colors',
                showHistory
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              <History size={10} />
              {t('aiModify.history')} ({savedSets.length})
            </button>
          )}
        </div>

        {/* History */}
        {showHistory && savedSets.length > 0 && (
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {savedSets.map((s) => (
              <button
                key={s.id}
                onClick={() => handleOpenSaved(s)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-[10px]',
                  'border border-border hover:bg-secondary/50 transition-colors',
                )}
              >
                <span className="text-foreground truncate block">"{s.prompt}"</span>
                <span className="text-muted-foreground">
                  {s.variants.length} variants · {new Date(s.created_at).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}

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

        <div className="flex gap-1.5">
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading || allModels.length === 0}
            className={cn(
              'flex-1 h-7 rounded-md text-[11px] font-medium',
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

          {variants && !showPopup && (
            <button
              onClick={() => setShowPopup(true)}
              className={cn(
                'h-7 px-2 rounded-md text-[11px] font-medium',
                'border border-border text-foreground',
                'hover:bg-secondary/50 transition-colors',
                'flex items-center justify-center gap-1',
              )}
            >
              {t('aiModify.viewVariants')}
            </button>
          )}
        </div>
      </div>

      {variants && showPopup && (
        <AiVariantsPopup
          variants={variants}
          prompt={prompt}
          originalNode={node}
          onApply={handleApplyVariant}
          onRegenerate={handleRegenerate}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  )
}

function parseVariantBlocks(response: string): PenNode[][] {
  const variants: PenNode[][] = []
  const regex = /```json\s*([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (Array.isArray(parsed) && parsed.length > 0) {
        variants.push(parsed)
      }
    } catch { /* skip */ }
  }
  return variants
}
