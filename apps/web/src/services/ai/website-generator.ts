import type { PenDocument, PenNode } from '@/types/pen'
import { streamChat } from './ai-service'
import { getCanvasKit } from '@/canvas/skia/skia-init'

const WEBSITE_SYSTEM_PROMPT = `You are an expert web developer. You receive a design document (JSON) containing pages with UI elements (frames, text, images, buttons, navigation, etc.) and you produce a COMPLETE, working single-page HTML website.

OUTPUT REQUIREMENTS:
- Return ONLY a complete HTML document (<!DOCTYPE html> to </html>). Nothing else.
- No markdown fences, no explanations, no comments outside the code.
- The HTML must work when opened directly in a browser (file:// protocol).
- Everything in ONE file: HTML + CSS (in <style>) + JS (in <script>).

DESIGN FIDELITY:
- Match the design exactly: colors, fonts, sizes, spacing, layout, border radius.
- Use the exact text content from the nodes.
- Use the exact colors from fill/stroke properties.
- Respect font families, font sizes, font weights, line heights.
- Match corner radius, shadows, and opacity values.
- Images: use the src from image nodes (data URLs or external URLs).

LAYOUT:
- Use modern CSS: flexbox, grid. NOT absolute positioning.
- Respect the node's layout property (horizontal → flex-row, vertical → flex-col).
- Respect gap, padding, justifyContent, alignItems from container nodes.
- Use proper sizing: width/height from nodes, fill_container → flex:1, fit_content → auto.

MULTI-PAGE (SPA):
- If there are multiple top-level frames, each one is a separate "page" in the SPA.
- Use hash-based routing (#page-name) for navigation.
- Show the first page by default.
- Navigation elements should link to the correct page using hash links.
- Detect buttons/nav items that match page names and auto-link them.
- For same-page sections, use anchor links with smooth scroll.

RESPONSIVE:
- Keep the design pixel-perfect at the design width.
- Center the content on larger screens.
- On smaller screens, allow horizontal scroll rather than breaking the layout.

INTERACTIVE ELEMENTS:
- Buttons should have hover effects (subtle opacity or color change).
- Links should be clickable with proper cursor.
- If a node has a "link" property, use it: type "page" → hash link, type "anchor" → #id scroll, type "url" → external link.

HTML QUALITY:
- Use semantic HTML (nav, header, main, section, footer, h1-h6, p, button, a).
- Use Google Fonts <link> for custom fonts referenced in the design.
- Include viewport meta tag.
- Include CSS reset (margin:0, padding:0, box-sizing:border-box).

NODE TYPE REFERENCE:
- frame: container div (may have layout, fill, stroke, cornerRadius, children)
- text: text element (content, fontSize, fontWeight, fontFamily, fill for color)
- rectangle: decorative box (fill, stroke, cornerRadius)
- ellipse: circle/oval (fill, cornerRadius:50%)
- image: img tag (src, objectFit)
- icon_font: icon (iconFontName = Lucide icon name, use SVG or emoji fallback)
- line: hr or border element
- group: transparent container (children)`

/**
 * Generate a complete website from a PenDocument using AI.
 * Returns a single HTML string ready to save as a file.
 */
export async function generateAIWebsite(
  doc: PenDocument,
  model: string,
  provider?: string,
  onProgress?: (status: string) => void,
  abortSignal?: AbortSignal,
): Promise<string> {
  onProgress?.('Capturing screenshots…')

  // Capture screenshots of each top-level frame
  const screenshots = await capturePageScreenshots(doc)

  onProgress?.('Preparing design data…')

  // Build the document context
  const context = buildDocumentContext(doc)

  // Build messages with screenshots as attachments
  const messages: Array<{ role: 'user' | 'assistant'; content: string; attachments?: Array<{ name: string; mediaType: string; data: string }> }> = []

  if (screenshots.length > 0) {
    messages.push({
      role: 'user',
      content: `Here are screenshots of each page in the design:\n${screenshots.map((s, i) => `Page ${i + 1}: "${s.name}"`).join('\n')}\n\nNow here is the full design data:\n\n${context}`,
      attachments: screenshots.map((s, i) => ({
        name: `page-${i + 1}-${s.name}.png`,
        mediaType: 'image/png',
        data: s.base64,
      })),
    })
  } else {
    messages.push({ role: 'user', content: context })
  }

  onProgress?.('Generating website…')

  let fullResponse = ''
  for await (const chunk of streamChat(
    WEBSITE_SYSTEM_PROMPT,
    messages,
    model,
    { thinkingMode: 'disabled', effort: 'high' },
    provider,
    abortSignal,
  )) {
    if (chunk.type === 'text') {
      fullResponse += chunk.content
    } else if (chunk.type === 'error') {
      throw new Error(chunk.content)
    }
  }

  // Extract HTML from response (strip markdown fences if present)
  const html = extractHTML(fullResponse)
  if (!html) {
    throw new Error('AI did not return valid HTML')
  }

  onProgress?.('Done!')
  return html
}

function buildDocumentContext(doc: PenDocument): string {
  const pages = doc.pages ?? []
  const parts: string[] = []

  parts.push(`DESIGN DOCUMENT: "${doc.name ?? 'Untitled'}"`)

  if (pages.length === 0) {
    // Single page
    parts.push('\nPAGES: 1 (single page)')
    parts.push('\nTOP-LEVEL FRAMES:')
    for (const node of doc.children) {
      parts.push(serializeNode(node, 0))
    }
  } else {
    // Collect all top-level frames
    const allFrames: Array<{ pageName: string; node: PenNode }> = []
    for (const page of pages) {
      for (const node of page.children) {
        allFrames.push({ pageName: page.name, node })
      }
    }

    parts.push(`\nPAGES: ${allFrames.length} top-level frames (each is a page in the SPA)`)
    parts.push('\nPAGE LIST:')
    for (let i = 0; i < allFrames.length; i++) {
      const { node } = allFrames[i]
      const w = 'width' in node && typeof node.width === 'number' ? node.width : '?'
      const h = 'height' in node && typeof node.height === 'number' ? node.height : '?'
      parts.push(`  ${i + 1}. "${node.name ?? 'Untitled'}" (${w}x${h})`)
    }

    parts.push('\n--- FULL NODE TREES ---')
    for (let i = 0; i < allFrames.length; i++) {
      const { node } = allFrames[i]
      parts.push(`\n=== PAGE ${i + 1}: "${node.name ?? 'Untitled'}" ===`)
      parts.push(serializeNode(node, 0))
    }
  }

  // Variables
  if (doc.variables && Object.keys(doc.variables).length > 0) {
    parts.push('\n--- DESIGN VARIABLES ---')
    for (const [name, def] of Object.entries(doc.variables)) {
      parts.push(`  $${name}: ${JSON.stringify(def)}`)
    }
  }

  return parts.join('\n')
}

function serializeNode(node: PenNode, depth: number): string {
  const pad = '  '.repeat(depth)
  const props: string[] = []

  props.push(`type: "${node.type}"`)
  if (node.name) props.push(`name: "${node.name}"`)
  if (node.role) props.push(`role: "${node.role}"`)

  // Dimensions
  if ('width' in node && node.width !== undefined) props.push(`width: ${JSON.stringify(node.width)}`)
  if ('height' in node && node.height !== undefined) props.push(`height: ${JSON.stringify(node.height)}`)

  // Layout
  const c = node as unknown as Record<string, unknown>
  if (c.layout) props.push(`layout: "${c.layout}"`)
  if (c.gap !== undefined) props.push(`gap: ${c.gap}`)
  if (c.padding !== undefined) props.push(`padding: ${JSON.stringify(c.padding)}`)
  if (c.justifyContent) props.push(`justifyContent: "${c.justifyContent}"`)
  if (c.alignItems) props.push(`alignItems: "${c.alignItems}"`)
  if (c.cornerRadius !== undefined) props.push(`cornerRadius: ${JSON.stringify(c.cornerRadius)}`)
  if (c.clipContent) props.push(`clipContent: true`)

  // Fill
  if (c.fill && Array.isArray(c.fill) && c.fill.length > 0) {
    const f = c.fill[0] as Record<string, unknown>
    if (f.type === 'solid') props.push(`fill: "${f.color}"`)
    else props.push(`fill: ${JSON.stringify(c.fill[0])}`)
  }

  // Stroke
  if (c.stroke) props.push(`stroke: ${JSON.stringify(c.stroke)}`)

  // Effects
  if (c.effects && Array.isArray(c.effects) && c.effects.length > 0) {
    props.push(`effects: ${JSON.stringify(c.effects)}`)
  }

  // Text
  if (node.type === 'text') {
    if (c.content) props.push(`content: ${JSON.stringify(c.content)}`)
    if (c.fontSize) props.push(`fontSize: ${c.fontSize}`)
    if (c.fontWeight) props.push(`fontWeight: ${c.fontWeight}`)
    if (c.fontFamily) props.push(`fontFamily: "${c.fontFamily}"`)
    if (c.lineHeight) props.push(`lineHeight: ${c.lineHeight}`)
    if (c.letterSpacing) props.push(`letterSpacing: ${c.letterSpacing}`)
    if (c.textAlign) props.push(`textAlign: "${c.textAlign}"`)
  }

  // Image
  if (node.type === 'image') {
    if (c.src) {
      const src = String(c.src)
      props.push(`src: "${src.length > 100 ? src.slice(0, 100) + '...' : src}"`)
    }
    if (c.objectFit) props.push(`objectFit: "${c.objectFit}"`)
  }

  // Icon
  if (node.type === 'icon_font') {
    if (c.iconFontName) props.push(`icon: "${c.iconFontName}"`)
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity !== 1) props.push(`opacity: ${node.opacity}`)

  // Link
  if (node.link) props.push(`link: ${JSON.stringify(node.link)}`)

  let result = `${pad}{ ${props.join(', ')} }`

  // Children
  const children = (node as { children?: PenNode[] }).children
  if (children && children.length > 0) {
    const childStr = children.map((ch) => serializeNode(ch, depth + 1)).join('\n')
    result += ` [\n${childStr}\n${pad}]`
  }

  return result
}

/**
 * Capture a screenshot of each top-level frame using CanvasKit SW surface.
 */
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

      // Cap at reasonable size for AI context
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
            // Convert to base64
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

  // Must start with <!DOCTYPE or <html
  if (html.startsWith('<!DOCTYPE') || html.startsWith('<!doctype') || html.startsWith('<html')) {
    return html
  }

  // Try to find HTML within the response
  const match = html.match(/<!DOCTYPE[\s\S]*<\/html>/i)
  if (match) return match[0]

  return null
}
