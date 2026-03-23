import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { X, RefreshCw, Check } from 'lucide-react'
import type { PenNode } from '@/types/pen'
import NodePreviewSvg from '@/components/panels/node-preview-svg'

interface AiVariantsDialogProps {
  variants: PenNode[][]
  prompt: string
  onApply: (nodes: PenNode[]) => void
  onRegenerate: () => void
  onClose: () => void
}

export default function AiVariantsDialog({
  variants,
  prompt,
  onApply,
  onRegenerate,
  onClose,
}: AiVariantsDialogProps) {
  const { t } = useTranslation()
  const backdropRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-[700px] max-w-[90vw] max-h-[80vh] rounded-lg border border-border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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

        {/* Prompt display */}
        <div className="px-4 py-2 border-b border-border">
          <p className="text-xs text-muted-foreground truncate">"{prompt}"</p>
        </div>

        {/* Variants grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className={cn(
            'grid gap-4',
            variants.length <= 3 ? 'grid-cols-3' : 'grid-cols-3',
          )}>
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
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
      {/* Preview */}
      <div className="aspect-[4/3] bg-muted flex items-center justify-center p-2 relative">
        {primaryNode ? (
          <NodePreviewSvg node={primaryNode} maxWidth={180} maxHeight={120} />
        ) : (
          <span className="text-xs text-muted-foreground">Empty</span>
        )}
        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
          {index}
        </div>
      </div>

      {/* Info + apply */}
      <div className="p-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
        </span>
        <button
          onClick={onApply}
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium',
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
