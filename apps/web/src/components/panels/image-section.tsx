import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageNode, ImageFitMode } from '@/types/pen'
import SectionHeader from '@/components/shared/section-header'
import { Image as ImageIcon, Search, Sparkles, Loader2 } from 'lucide-react'
import ImageFillPopover from './image-fill-popover'
import ImageSearchPopover from './image-search-popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ImageSectionProps {
  node: ImageNode
  onUpdate: (updates: Partial<ImageNode>) => void
}

export default function ImageSection({ node, onUpdate }: ImageSectionProps) {
  const { t } = useTranslation()
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const fitMode = node.objectFit ?? 'fill'
  const hasImage = node.src && !node.src.startsWith('__')

  const handleClose = useCallback(() => setTriggerRect(null), [])

  const handleToggle = () => {
    if (triggerRect) {
      setTriggerRect(null)
    } else if (triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect())
    }
  }

  return (
    <div className="space-y-3">
      {/* Image preview + fit mode */}
      <div>
        <SectionHeader title={t('image.title')} />
        <button
          ref={triggerRef}
          type="button"
          onClick={handleToggle}
          className="w-full flex items-center gap-2 h-8 px-1.5 rounded border border-border hover:bg-accent/50 transition-colors cursor-pointer"
        >
          <div className="w-6 h-6 rounded border border-border shrink-0 bg-muted overflow-hidden flex items-center justify-center">
            {hasImage ? (
              <img src={node.src} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
          <span className="text-[11px] text-foreground flex-1 text-left truncate">
            {t(`image.${fitMode === 'fit' ? 'fitMode' : fitMode}`)}
          </span>
        </button>
      </div>

      {/* Image Search */}
      <div>
        <SectionHeader title={t('image.search')} />
        <ImageSearchPopover
          initialQuery={node.imageSearchQuery ?? node.name ?? ''}
          onSelect={(url: string) => onUpdate({ src: url })}
        >
          <Button size="sm" variant="outline" className="w-full h-7 text-xs">
            <Search className="h-3 w-3 mr-1" />
            {t('image.searchButton')}
          </Button>
        </ImageSearchPopover>
      </div>

      {/* Image Generate (single image) */}
      <div>
        <SectionHeader title={t('image.generate')} />
        <ImageGenerateInline
          initialPrompt={node.imagePrompt ?? node.name ?? ''}
          onGenerated={(url: string) => onUpdate({ src: url })}
          width={typeof node.width === 'number' ? node.width : undefined}
          height={typeof node.height === 'number' ? node.height : undefined}
        />
      </div>

      {triggerRect && (
        <ImageFillPopover
          imageSrc={node.src}
          fitMode={fitMode}
          triggerRect={triggerRect}
          adjustments={{
            exposure: node.exposure,
            contrast: node.contrast,
            saturation: node.saturation,
            temperature: node.temperature,
            tint: node.tint,
            highlights: node.highlights,
            shadows: node.shadows,
          }}
          onFitModeChange={(mode) => onUpdate({ objectFit: mode as ImageFitMode })}
          onAdjustmentChange={(key, value) => onUpdate({ [key]: value } as Partial<ImageNode>)}
          onResetAdjustments={() => onUpdate({ exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 } as Partial<ImageNode>)}
          onImageChange={(dataUrl) => onUpdate({ src: dataUrl })}
          onClose={handleClose}
        />
      )}
    </div>
  )
}

/**
 * Inline image generation — single image, uses Antigravity first, falls back to API key profile.
 */
function ImageGenerateInline({
  initialPrompt,
  onGenerated,
  width,
  height,
}: {
  initialPrompt: string
  onGenerated: (url: string) => void
  width?: number
  height?: number
}) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState(initialPrompt)
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError('')
    setPreviewUrl(null)

    try {
      // Use local API if configured, otherwise Antigravity
      const localApiUrl = localStorage.getItem('openpencil-local-image-api-url') || ''
      const provider = localApiUrl ? 'local' : 'gemini-cli'

      const res = await fetch('/api/ai/image-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          provider,
          ...(provider === 'local' ? { baseUrl: localApiUrl } : {}),
          ...(width && height ? { width, height } : {}),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${res.status}`)
      }

      const data = await res.json()
      if (!data.url) throw new Error('No image returned')
      setPreviewUrl(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    if (previewUrl) {
      onGenerated(previewUrl)
      setPreviewUrl(null)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t('image.generatePlaceholder')}
        rows={2}
        className={cn(
          'w-full px-2 py-1.5 rounded-md text-[11px] resize-none',
          'border border-border bg-background text-foreground',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring',
        )}
      />

      {error && <p className="text-[10px] text-destructive">{error}</p>}

      {previewUrl ? (
        <div className="space-y-2">
          <img
            src={previewUrl}
            alt="Generated"
            className="w-full rounded-md border border-border object-cover"
            style={{ maxHeight: 160 }}
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleApply}>
              {t('image.apply')}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={handleGenerate}>
              {t('image.retry')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={handleGenerate}
          disabled={!prompt.trim() || loading}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Sparkles className="h-3 w-3 mr-1" />
          )}
          {loading ? t('image.generating') : t('image.generateButton')}
        </Button>
      )}
    </div>
  )
}
