import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { X, RefreshCw, Check } from 'lucide-react'
import type { PenNode } from '@/types/pen'
import { getCanvasKit } from '@/canvas/skia/skia-init'
import { useDocumentStore, getActivePageChildren } from '@/stores/document-store'
import { useCanvasStore } from '@/stores/canvas-store'

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

  const cols = Math.min(variants.length + 1, 4)

  // Get full page children for context rendering
  const activePageId = useCanvasStore((s) => s.activePageId)
  const pageChildren = useDocumentStore((s) => getActivePageChildren(s.document, activePageId))

  // Build full page trees: original + each variant with node swapped
  const replaceNodeInTree = (children: PenNode[], nodeId: string, replacement: PenNode): PenNode[] => {
    return children.map((child) => {
      if (child.id === nodeId) return replacement
      const ch = (child as { children?: PenNode[] }).children
      if (ch) {
        return { ...child, children: replaceNodeInTree(ch, nodeId, replacement) } as PenNode
      }
      return child
    })
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-[900px] max-w-[92vw] max-h-[85vh] rounded-lg border border-border bg-card shadow-2xl flex flex-col">
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
            <div className="rounded-lg border-2 border-dashed border-border bg-background overflow-hidden group hover:border-primary/50 transition-colors">
              <div className="relative" style={{ paddingBottom: '75%' }}>
                <div className="absolute inset-0">
                  <SkiaPreviewCanvas nodes={pageChildren} />
                </div>
                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-card/80 text-[9px] font-medium text-muted-foreground border border-border">
                  {t('aiModify.original')}
                </div>
              </div>
              <div className="p-2 flex items-center justify-end">
                <button
                  onClick={() => onApply([originalNode])}
                  className={cn(
                    'inline-flex items-center gap-1 h-6 px-2.5 rounded text-[10px] font-medium',
                    'border border-border text-foreground hover:bg-secondary/50 transition-colors',
                  )}
                >
                  <Check size={10} />
                  {t('aiModify.restoreOriginal')}
                </button>
              </div>
            </div>

            {/* Variant cards */}
            {variants.map((variantNodes, i) => {
              // Build full page tree with variant node swapped in
              const primaryVariant = variantNodes[0]
              const previewTree = primaryVariant
                ? replaceNodeInTree(pageChildren, originalNode.id, primaryVariant)
                : pageChildren
              return (
                <VariantCard
                  key={i}
                  index={i + 1}
                  previewNodes={previewTree}
                  onApply={() => onApply(variantNodes)}
                />
              )
            })}
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
  previewNodes,
  onApply,
}: {
  index: number
  previewNodes: PenNode[]
  onApply: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden group hover:border-primary/50 transition-colors">
      <div className="relative" style={{ paddingBottom: '75%' }}>
        <div className="absolute inset-0">
          {previewNodes.length > 0 ? (
            <SkiaPreviewCanvas nodes={previewNodes} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Empty</div>
          )}
        </div>
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
 * Live CanvasKit preview using PenRenderer (same rendering as main editor).
 * Uses SW fallback to avoid WebGL context limits.
 * Properly disposes on unmount to prevent resource leaks.
 */
function SkiaPreviewCanvas({ nodes }: { nodes: PenNode[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<import('@zseven-w/pen-renderer').PenRenderer | null>(null)

  useEffect(() => {
    let disposed = false

    async function init() {
      const container = containerRef.current
      const canvasEl = canvasRef.current
      if (!container || !canvasEl) return

      const ck = getCanvasKit()
      if (!ck) return

      const { PenRenderer } = await import('@zseven-w/pen-renderer')
      if (disposed) return

      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const dpr = 2
      canvasEl.width = Math.round(rect.width * dpr)
      canvasEl.height = Math.round(rect.height * dpr)
      canvasEl.style.width = `${rect.width}px`
      canvasEl.style.height = `${rect.height}px`

      const doc = { version: '0.5.0' as const, children: nodes }

      const renderer = new PenRenderer(ck, {
        fontBasePath: '/fonts/',
        devicePixelRatio: dpr,
      })
      renderer.init(canvasEl)
      renderer.setDocument(doc)
      rendererRef.current = renderer

      // Retry zoomToFit as fonts load
      for (const delay of [50, 200, 500, 1000]) {
        setTimeout(() => {
          if (!disposed && rendererRef.current) {
            rendererRef.current.zoomToFit(24)
          }
        }, delay)
      }
    }

    // Delay to ensure container has layout
    const timer = setTimeout(init, 50)

    return () => {
      disposed = true
      clearTimeout(timer)
      // Dispose renderer + surface to free WebGL context
      if (rendererRef.current) {
        rendererRef.current.dispose()
        rendererRef.current = null
      }
    }
  }, [nodes])

  return (
    <div ref={containerRef} className="w-full h-full bg-[#1a1a1a]">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
