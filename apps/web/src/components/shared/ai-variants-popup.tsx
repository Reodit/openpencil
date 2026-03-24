import { useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { X, RefreshCw, Check } from 'lucide-react'
import type { PenNode, PenDocument } from '@/types/pen'
import { getCanvasKit } from '@/canvas/skia/skia-init'

interface AiVariantsPopupProps {
  variants: PenNode[][]
  prompt: string
  originalNode: PenNode
  onApply: (nodes: PenNode[]) => void
  onRegenerate: () => void
  onClose: () => void
}

export default function AiVariantsPopup({
  variants,
  prompt,
  originalNode,
  onApply,
  onRegenerate,
  onClose,
}: AiVariantsPopupProps) {
  const { t } = useTranslation()
  const backdropRef = useRef<HTMLDivElement>(null)

  const cols = variants.length <= 3 ? variants.length + 1 : Math.min(variants.length + 1, 4)

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-[850px] max-w-[90vw] max-h-[85vh] rounded-lg border border-border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">
            {t('aiModify.variantsTitle')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-secondary/50 text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Prompt */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <p className="text-xs text-muted-foreground truncate">"{prompt}"</p>
        </div>

        {/* Variants grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {/* Original */}
            <div className="rounded-lg border-2 border-dashed border-border bg-background overflow-hidden">
              <div className="aspect-[4/3] relative bg-muted/30">
                <SkiaPreviewCanvas node={originalNode} />
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-card/80 text-[9px] font-medium text-muted-foreground border border-border">
                  {t('aiModify.original')}
                </div>
              </div>
            </div>

            {/* Variant cards */}
            {variants.map((nodes, i) => (
              <VariantCard
                key={i}
                index={i + 1}
                nodes={nodes}
                onApply={() => onApply(nodes)}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onRegenerate}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium',
              'border border-border text-foreground hover:bg-secondary/50 transition-colors',
            )}
          >
            <RefreshCw size={14} />
            {t('aiModify.regenerate')}
          </button>
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function VariantCard({
  index,
  nodes,
  onApply,
}: {
  index: number
  nodes: PenNode[]
  onApply: () => void
}) {
  const { t } = useTranslation()
  const primaryNode = nodes[0]

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden group hover:border-primary/50 transition-colors">
      <div className="aspect-[4/3] relative bg-muted/10">
        {primaryNode ? (
          <SkiaPreviewCanvas node={primaryNode} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Empty</div>
        )}
        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
          {index}
        </div>
      </div>
      <div className="p-2 flex items-center justify-end">
        <button
          onClick={onApply}
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2.5 rounded text-[10px] font-medium',
            'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
          )}
        >
          <Check size={10} />
          {t('aiModify.applyVariant')}
        </button>
      </div>
    </div>
  )
}

/**
 * Mini CanvasKit canvas that renders a single PenNode using
 * the standalone PenRenderer from pen-renderer package.
 */
function SkiaPreviewCanvas({ node }: { node: PenNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<import('@zseven-w/pen-renderer').PenRenderer | null>(null)

  const initRenderer = useCallback(async () => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return

    const ck = getCanvasKit()
    if (!ck) return

    // Lazy import to avoid circular deps
    const { PenRenderer } = await import('@zseven-w/pen-renderer')

    // Build a minimal document containing just this node
    const doc: PenDocument = {
      version: '0.5.0',
      children: [node],
    }

    const renderer = new PenRenderer(ck, {
      fontBasePath: '/fonts/',
      devicePixelRatio: 2,
    })
    renderer.init(canvasEl)
    renderer.setDocument(doc)

    // Wait a frame for fonts to load, then zoom to fit
    requestAnimationFrame(() => {
      renderer.zoomToFit(16)
    })

    rendererRef.current = renderer
  }, [node])

  useEffect(() => {
    initRenderer()
    return () => {
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
  }, [initRenderer])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  )
}
