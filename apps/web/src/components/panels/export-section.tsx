import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import SectionHeader from '@/components/shared/section-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useDocumentStore } from '@/stores/document-store'
import { getCanvasKit } from '@/canvas/skia/skia-init'

const SCALE_OPTIONS = [
  { value: '1', label: '1x' },
  { value: '2', label: '2x' },
  { value: '3', label: '3x' },
]

const FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WEBP' },
]

interface ExportSectionProps {
  nodeId: string
  nodeName: string
}

export default function ExportSection({ nodeId, nodeName }: ExportSectionProps) {
  const { t } = useTranslation()
  const [scale, setScale] = useState('2')
  const [format, setFormat] = useState('png')
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    const node = useDocumentStore.getState().getNodeById(nodeId)
    if (!node) return

    setExporting(true)
    try {
      const ck = getCanvasKit()
      if (!ck) throw new Error('CanvasKit not loaded')

      const { flattenToRenderNodes, premeasureTextHeights } = await import('@zseven-w/pen-renderer')
      const { SkiaNodeRenderer } = await import('@zseven-w/pen-renderer')

      const dpr = Number(scale)
      const measured = premeasureTextHeights([node])
      const renderNodes = flattenToRenderNodes(measured)
      if (renderNodes.length === 0) throw new Error('No renderable nodes')

      // Calculate bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const rn of renderNodes) {
        minX = Math.min(minX, rn.absX)
        minY = Math.min(minY, rn.absY)
        maxX = Math.max(maxX, rn.absX + rn.absW)
        maxY = Math.max(maxY, rn.absY + rn.absH)
      }
      const contentW = maxX - minX
      const contentH = maxY - minY
      if (contentW <= 0 || contentH <= 0) throw new Error('Invalid node dimensions')

      const w = Math.ceil(contentW * dpr)
      const h = Math.ceil(contentH * dpr)

      const surface = ck.MakeSurface(w, h)
      if (!surface) throw new Error('Failed to create surface')

      try {
        const canvas = surface.getCanvas()
        const nodeRenderer = new SkiaNodeRenderer(ck, { fontBasePath: '/fonts/' })
        nodeRenderer.init()
        nodeRenderer.devicePixelRatio = dpr

        // Transparent background for PNG, white for JPEG
        if (format === 'png' || format === 'webp') {
          canvas.clear(ck.Color(0, 0, 0, 0))
        } else {
          canvas.clear(ck.WHITE)
        }

        canvas.save()
        canvas.scale(dpr, dpr)
        canvas.translate(-minX, -minY)

        for (const rn of renderNodes) {
          nodeRenderer.drawNode(canvas, rn)
        }

        canvas.restore()
        surface.flush()

        // Encode
        const img = surface.makeImageSnapshot()
        if (!img) throw new Error('Failed to snapshot')

        let encoded: Uint8Array | null = null
        if (format === 'png') {
          encoded = img.encodeToBytes()
        } else if (format === 'jpeg') {
          encoded = img.encodeToBytes(ck.ImageFormat.JPEG, 92)
        } else if (format === 'webp') {
          encoded = img.encodeToBytes(ck.ImageFormat.WEBP, 90)
        }
        img.delete()

        if (!encoded) throw new Error('Failed to encode image')

        // Download
        const mimeType = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp'
        const blob = new Blob([encoded as BlobPart], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${nodeName || 'export'}-${scale}x.${format}`
        a.click()
        URL.revokeObjectURL(url)

        nodeRenderer.dispose()
      } finally {
        surface.delete()
      }
    } catch (e) {
      console.error('[Export] failed:', e)
    } finally {
      setExporting(false)
    }
  }, [nodeId, nodeName, scale, format])

  return (
    <div className="space-y-1.5">
      <SectionHeader title={t('export.title')} />
      <div className="flex gap-1.5">
        <Select value={scale} onValueChange={setScale}>
          <SelectTrigger className="flex-1 h-6 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCALE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="flex-1 h-6 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMAT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
        {t('export.exportLayer')}
      </Button>
    </div>
  )
}
