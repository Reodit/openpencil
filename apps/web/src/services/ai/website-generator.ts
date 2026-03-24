import type { PenDocument, PenNode } from '@/types/pen'
import { streamChat } from './ai-service'
import { getCanvasKit } from '@/canvas/skia/skia-init'

const WEBSITE_AGENT_PROMPT = `You are an expert web developer agent. You will be given design files and screenshots to read. Your job is to generate a COMPLETE, working single-file HTML website.

WORKFLOW:
1. First, read ALL the provided files (screenshots and design data files for each page).
2. Analyze the design: understand the layout, sections, navigation, colors, fonts, content.
3. Identify anchor links: which nav items should link to which sections.
4. Generate the complete HTML.

OUTPUT REQUIREMENTS:
- Output ONLY a complete HTML document (<!DOCTYPE html> to </html>).
- No markdown fences, no explanations, no preamble, no comments outside the code.
- Everything in ONE file: HTML + CSS (in <style>) + JS (in <script>).
- Must work when opened directly in a browser (file:// protocol).

ANCHOR LINKS (CRITICAL):
- Every major section (hero, services, portfolio, about, contact, footer, etc.) MUST have an id attribute.
- Nav text items MUST be <a href="#section-id"> linking to the matching section.
- CTA buttons should link to relevant sections by semantic meaning.
- Use scroll-behavior: smooth on html.

DESIGN FIDELITY:
- Match colors, fonts, sizes, spacing, border radius exactly from the design data.
- Use exact text content from nodes.
- Respect layout properties: horizontal → flex-row, vertical → flex-col.
- Respect gap, padding, justifyContent, alignItems.
- fill_container → flex:1, fit_content → auto.

MULTI-PAGE:
- If there are multiple top-level frames (pages), combine them into a single long-scroll page with distinct sections.
- Or use hash-based SPA routing if the pages are clearly separate (different navigation, different themes).
- Each page's content should be fully rendered — do NOT skip any page.

HTML QUALITY:
- Semantic HTML (nav, header, main, section, footer, h1-h6, p, button, a).
- Google Fonts <link> for referenced fonts.
- Viewport meta tag, CSS reset.
- Hover effects on buttons and links.

NODE TYPES:
- frame → div (may have layout, fill, stroke, cornerRadius, children)
- text → text element (content, fontSize, fontWeight, fontFamily, fill = color)
- rectangle → decorative box
- ellipse → circle/oval
- image → img (src, objectFit)
- icon_font → icon (iconFontName = Lucide icon name, use inline SVG or emoji)
- line → hr/border
- group → transparent container`

/**
 * Generate a complete website from a PenDocument using AI agent.
 * Saves design data as files, lets the AI agent read them via Read tool.
 */
export async function generateAIWebsite(
  doc: PenDocument,
  model: string,
  provider?: string,
  onProgress?: (status: string) => void,
  abortSignal?: AbortSignal,
): Promise<string> {
  console.log('[WebsiteGenerator] Starting…')
  onProgress?.('Capturing screenshots…')

  const screenshots = await capturePageScreenshots(doc)
  console.log(`[WebsiteGenerator] Screenshots captured: ${screenshots.length}`)

  onProgress?.('Preparing design data…')

  // Build per-page design data files
  const pageFiles = buildPerPageData(doc)
  console.log(`[WebsiteGenerator] Page data files: ${pageFiles.length}`)

  // Build attachments: screenshots (images) + page data (text files)
  const attachments: Array<{ name: string; mediaType: string; data: string }> = []

  for (let i = 0; i < screenshots.length; i++) {
    attachments.push({
      name: `screenshot-page-${i + 1}.png`,
      mediaType: 'image/png',
      data: screenshots[i].base64,
    })
  }

  for (let i = 0; i < pageFiles.length; i++) {
    attachments.push({
      name: pageFiles[i].name,
      mediaType: 'text/plain',
      data: btoa(unescape(encodeURIComponent(pageFiles[i].content))),
    })
  }

  // Build a lightweight prompt — the heavy data is in files
  const summary = buildSummary(doc, pageFiles)
  const userMessage = `${summary}

Read all the attached files (screenshots and design data) and generate a complete HTML website.
Make sure to include ALL ${pageFiles.length} pages worth of content. Do NOT skip any page.
Every section must have an id for anchor navigation.`

  const messages: Array<{ role: 'user' | 'assistant'; content: string; attachments?: typeof attachments }> = [
    { role: 'user', content: userMessage, attachments },
  ]

  console.log(`[WebsiteGenerator] Prompt: ${userMessage.length} chars, ${attachments.length} attachments`)

  onProgress?.('Generating website…')

  let fullResponse = ''
  for await (const chunk of streamChat(
    WEBSITE_AGENT_PROMPT,
    messages,
    model,
    { thinkingMode: 'enabled', effort: 'medium', maxTurns: 20, firstTextTimeoutMs: 180_000, hardTimeoutMs: 600_000 },
    provider,
    abortSignal,
  )) {
    if (chunk.type === 'text') {
      fullResponse += chunk.content
    } else if (chunk.type === 'error') {
      console.error('[WebsiteGenerator] Stream error:', chunk.content)
      throw new Error(chunk.content)
    }
  }

  console.log(`[WebsiteGenerator] Response length: ${fullResponse.length}`)

  const html = extractHTML(fullResponse)
  if (!html) {
    console.error('[WebsiteGenerator] Parse failed. Response starts with:', fullResponse.slice(0, 500))
    throw new Error(`AI did not return valid HTML. Response starts with: "${fullResponse.slice(0, 300)}"`)
  }

  onProgress?.('Done!')
  return html
}

/** Build a short summary for the prompt (not the full data) */
function buildSummary(doc: PenDocument, pageFiles: Array<{ name: string; content: string }>): string {
  const pages = doc.pages ?? []
  const allFrames: Array<{ name: string; node: PenNode }> = []

  if (pages.length === 0) {
    for (const node of doc.children) {
      allFrames.push({ name: node.name ?? node.type, node })
    }
  } else {
    for (const page of pages) {
      for (const node of page.children) {
        allFrames.push({ name: node.name ?? page.name, node })
      }
    }
  }

  const lines = [`DESIGN: "${doc.name ?? 'Untitled'}" — ${allFrames.length} page(s)\n`]

  for (let i = 0; i < allFrames.length; i++) {
    const { name, node } = allFrames[i]
    const w = 'width' in node && typeof node.width === 'number' ? node.width : '?'
    const h = 'height' in node && typeof node.height === 'number' ? node.height : '?'

    // List top-level sections
    const children = (node as { children?: PenNode[] }).children ?? []
    const sections = children.map((ch) => ch.name ?? ch.type).join(', ')

    lines.push(`Page ${i + 1}: "${name}" (${w}x${h})`)
    lines.push(`  Sections: ${sections}`)
    lines.push(`  Data file: ${pageFiles[i]?.name ?? 'N/A'}`)
    lines.push(`  Screenshot: screenshot-page-${i + 1}.png`)
  }

  return lines.join('\n')
}

/** Build per-page design data as separate text files */
function buildPerPageData(doc: PenDocument): Array<{ name: string; content: string }> {
  const pages = doc.pages ?? []
  const allFrames: Array<{ pageName: string; node: PenNode }> = []

  if (pages.length === 0) {
    for (const node of doc.children) {
      allFrames.push({ pageName: node.name ?? 'Page', node })
    }
  } else {
    for (const page of pages) {
      for (const node of page.children) {
        allFrames.push({ pageName: page.name, node })
      }
    }
  }

  const result: Array<{ name: string; content: string }> = []

  for (let i = 0; i < allFrames.length; i++) {
    const { node } = allFrames[i]
    const pageName = node.name ?? `Page-${i + 1}`
    const content = serializeNode(node, 0)

    // Add variables if on first page
    let extra = ''
    if (i === 0 && doc.variables && Object.keys(doc.variables).length > 0) {
      extra = '\n\n--- DESIGN VARIABLES ---\n'
      for (const [name, def] of Object.entries(doc.variables)) {
        extra += `  $${name}: ${JSON.stringify(def)}\n`
      }
    }

    result.push({
      name: `page-${i + 1}-design-data.txt`,
      content: `=== PAGE ${i + 1}: "${pageName}" ===\n${content}${extra}`,
    })
  }

  return result
}

function serializeNode(node: PenNode, depth: number): string {
  const pad = '  '.repeat(depth)
  const props: string[] = []

  props.push(`type: "${node.type}"`)
  if (node.name) props.push(`name: "${node.name}"`)
  if (node.role) props.push(`role: "${node.role}"`)

  if ('width' in node && node.width !== undefined) props.push(`width: ${JSON.stringify(node.width)}`)
  if ('height' in node && node.height !== undefined) props.push(`height: ${JSON.stringify(node.height)}`)

  const c = node as unknown as Record<string, unknown>
  if (c.layout) props.push(`layout: "${c.layout}"`)
  if (c.gap !== undefined) props.push(`gap: ${c.gap}`)
  if (c.padding !== undefined) props.push(`padding: ${JSON.stringify(c.padding)}`)
  if (c.justifyContent) props.push(`justifyContent: "${c.justifyContent}"`)
  if (c.alignItems) props.push(`alignItems: "${c.alignItems}"`)
  if (c.cornerRadius !== undefined) props.push(`cornerRadius: ${JSON.stringify(c.cornerRadius)}`)
  if (c.clipContent) props.push(`clipContent: true`)

  if (c.fill && Array.isArray(c.fill) && c.fill.length > 0) {
    const f = c.fill[0] as Record<string, unknown>
    if (f.type === 'solid') props.push(`fill: "${f.color}"`)
    else props.push(`fill: ${JSON.stringify(c.fill[0])}`)
  }

  if (c.stroke) props.push(`stroke: ${JSON.stringify(c.stroke)}`)

  if (c.effects && Array.isArray(c.effects) && c.effects.length > 0) {
    props.push(`effects: ${JSON.stringify(c.effects)}`)
  }

  if (node.type === 'text') {
    if (c.content) props.push(`content: ${JSON.stringify(c.content)}`)
    if (c.fontSize) props.push(`fontSize: ${c.fontSize}`)
    if (c.fontWeight) props.push(`fontWeight: ${c.fontWeight}`)
    if (c.fontFamily) props.push(`fontFamily: "${c.fontFamily}"`)
    if (c.lineHeight) props.push(`lineHeight: ${c.lineHeight}`)
    if (c.letterSpacing) props.push(`letterSpacing: ${c.letterSpacing}`)
    if (c.textAlign) props.push(`textAlign: "${c.textAlign}"`)
  }

  if (node.type === 'image') {
    if (c.src) {
      const src = String(c.src)
      props.push(`src: "${src.length > 100 ? src.slice(0, 100) + '...' : src}"`)
    }
    if (c.objectFit) props.push(`objectFit: "${c.objectFit}"`)
  }

  if (node.type === 'icon_font') {
    if (c.iconFontName) props.push(`icon: "${c.iconFontName}"`)
  }

  if (node.opacity !== undefined && node.opacity !== 1) props.push(`opacity: ${node.opacity}`)
  if (node.link) props.push(`link: ${JSON.stringify(node.link)}`)

  let result = `${pad}{ ${props.join(', ')} }`

  const children = (node as { children?: PenNode[] }).children
  if (children && children.length > 0) {
    const childStr = children.map((ch) => serializeNode(ch, depth + 1)).join('\n')
    result += ` [\n${childStr}\n${pad}]`
  }

  return result
}

async function capturePageScreenshots(doc: PenDocument): Promise<Array<{ name: string; base64: string }>> {
  const ck = getCanvasKit()
  if (!ck) return []

  try {
    const { flattenToRenderNodes, premeasureTextHeights } = await import('@zseven-w/pen-renderer')
    const { SkiaNodeRenderer } = await import('@zseven-w/pen-renderer')

    const pages = doc.pages ?? []
    const allFrames: Array<{ name: string; node: PenNode }> = []

    if (pages.length === 0) {
      for (const node of doc.children) {
        allFrames.push({ name: node.name ?? node.type, node })
      }
    } else {
      for (const page of pages) {
        for (const node of page.children) {
          allFrames.push({ name: node.name ?? page.name, node })
        }
      }
    }

    const results: Array<{ name: string; base64: string }> = []

    for (const { name, node } of allFrames) {
      const frameNode = { ...node, x: 0, y: 0 } as PenNode
      const measured = premeasureTextHeights([frameNode])
      const renderNodes = flattenToRenderNodes(measured)
      if (renderNodes.length === 0) continue

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const rn of renderNodes) {
        minX = Math.min(minX, rn.absX)
        minY = Math.min(minY, rn.absY)
        maxX = Math.max(maxX, rn.absX + rn.absW)
        maxY = Math.max(maxY, rn.absY + rn.absH)
      }
      const contentW = maxX - minX
      const contentH = maxY - minY
      if (contentW <= 0 || contentH <= 0) continue

      const maxDim = 1200
      const scale = Math.min(1, maxDim / Math.max(contentW, contentH))
      const w = Math.ceil(contentW * scale)
      const h = Math.ceil(contentH * scale)

      const surface = ck.MakeSurface(w, h)
      if (!surface) continue

      try {
        const canvas = surface.getCanvas()
        const nodeRenderer = new SkiaNodeRenderer(ck, { fontBasePath: '/fonts/' })
        nodeRenderer.init()
        nodeRenderer.devicePixelRatio = scale

        canvas.clear(ck.WHITE)
        canvas.save()
        canvas.scale(scale, scale)
        canvas.translate(-minX, -minY)

        for (const rn of renderNodes) {
          nodeRenderer.drawNode(canvas, rn)
        }

        canvas.restore()
        surface.flush()

        const img = surface.makeImageSnapshot()
        if (img) {
          const encoded = img.encodeToBytes()
          if (encoded) {
            const binary = Array.from(encoded).map(b => String.fromCharCode(b)).join('')
            const base64 = btoa(binary)
            results.push({ name, base64 })
          }
          img.delete()
        }
        nodeRenderer.dispose()
      } finally {
        surface.delete()
      }
    }

    return results
  } catch (e) {
    console.warn('[WebsiteGenerator] Screenshot capture failed:', e)
    return []
  }
}

function extractHTML(response: string): string | null {
  let html = response.trim()

  // Strip markdown fences
  if (html.startsWith('```')) {
    const firstNewline = html.indexOf('\n')
    const lastFence = html.lastIndexOf('```')
    if (lastFence > firstNewline) {
      html = html.slice(firstNewline + 1, lastFence).trim()
    }
  }

  if (html.startsWith('<!DOCTYPE') || html.startsWith('<!doctype') || html.startsWith('<html')) {
    return html
  }

  const match = html.match(/<!DOCTYPE[\s\S]*<\/html>/i)
  if (match) return match[0]

  return null
}
