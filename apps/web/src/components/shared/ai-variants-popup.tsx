import { useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { X, RefreshCw, Check } from 'lucide-react'
import type { PenNode } from '@/types/pen'
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

  const cols = Math.min(variants.length + 1, 4)

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
                  <SkiaPreviewCanvas node={originalNode} />
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
      <div className="relative" style={{ paddingBottom: '75%' }}>
        <div className="absolute inset-0">
          {primaryNode ? (
            <SkiaPreviewCanvas node={primaryNode} />
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
 * Mini CanvasKit preview that renders a single PenNode to a static image.
 * Uses OffscreenCanvas + SW surface to avoid WebGL context limits.
 * Renders once and converts to a data URL for display.
 */
function SkiaPreviewCanvas({ node }: { node: PenNode }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const ck = getCanvasKit()
      if (!ck || !containerRef.current) return

      const { flattenToRenderNodes, premeasureTextHeights } = await import('@zseven-w/pen-renderer')
      const { SkiaNodeRenderer } = await import('@zseven-w/pen-renderer')
      if (cancelled) return

      const rect = containerRef.current.getBoundingClientRect()
      const w = Math.round(rect.width * 2)
      const h = Math.round(rect.height * 2)
      if (w <= 0 || h <= 0) return

      // Create offscreen surface (no WebGL)
      const surface = ck.MakeSurface(w, h)
      if (!surface) return

      try {
        const canvas = surface.getCanvas()
        const nodeRenderer = new SkiaNodeRenderer(ck, { fontBasePath: '/fonts/' })
        nodeRenderer.init()

        // Flatten node to render nodes
        const measured = premeasureTextHeights([node])
        const renderNodes = flattenToRenderNodes(measured)

        if (renderNodes.length === 0) return

        // Calculate bounds and zoom
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const rn of renderNodes) {
          minX = Math.min(minX, rn.absX)
          minY = Math.min(minY, rn.absY)
          maxX = Math.max(maxX, rn.absX + rn.absW)
          maxY = Math.max(maxY, rn.absY + rn.absH)
        }
        const contentW = maxX - minX
        const contentH = maxY - minY
        if (contentW <= 0 || contentH <= 0) return

        const pad = 20
        const zoom = Math.min((w - pad * 2) / contentW, (h - pad * 2) / contentH, 2)
        const panX = (w / zoom - contentW) / 2 - minX
        const panY = (h / zoom - contentH) / 2 - minY

        // Draw background
        canvas.clear(ck.Color(26, 26, 26, 255))

        // Apply viewport transform
        canvas.save()
        canvas.scale(zoom, zoom)
        canvas.translate(panX, panY)

        // Draw nodes
        nodeRenderer.devicePixelRatio = 2
        for (const rn of renderNodes) {
          nodeRenderer.drawNode(canvas, rn)
        }

        canvas.restore()
        surface.flush()

        // Convert to image
        const img = surface.makeImageSnapshot()
        if (img && !cancelled) {
          const bytes = img.encodeToBytes()
          if (bytes) {
            const blob = new Blob([bytes as BlobPart], { type: 'image/png' })
            const url = URL.createObjectURL(blob)
            setImageUrl(url)
          }
          img.delete()
        }

        nodeRenderer.dispose()
      } finally {
        surface.delete()
      }
    }

    // Delay to ensure container has layout
    const timer = setTimeout(render, 100)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [node])

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [imageUrl])

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full h-full object-contain" />
      ) : (
        <div className="text-[10px] text-muted-foreground">Loading...</div>
      )}
    </div>
  )
}
