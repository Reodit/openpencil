import type { PenDocument } from '@/types/pen'
import { streamChat } from './ai-service'
import { getCanvasKit } from '@/canvas/skia/skia-init'
import type { PenNode } from '@/types/pen'

const WEBSITE_ENHANCE_PROMPT = `You are an expert web developer. You receive a working HTML website and screenshots of the original design.

Your job: ENHANCE the HTML by adding navigation links, anchor scrolling, hover effects, and interactivity. Do NOT rewrite the layout or styles — they are already correct.

TASKS:
1. ANCHOR LINKS: Add id attributes to major sections (hero, about, services, portfolio, contact, footer, etc.). Match nav text items to sections and wrap them in <a href="#section-id">.
2. CTA BUTTONS: Make CTA buttons link to relevant sections (e.g. "View Portfolio" → #portfolio, "Get Started" → #contact, "Our Process" → #services).
3. HOVER EFFECTS: Add CSS hover states to buttons (opacity change or slight color shift) and links (underline or color change).
4. SMOOTH SCROLL: Ensure html { scroll-behavior: smooth; } is present.
5. NAVIGATION FIX: If the SPA hash routing hides pages, convert to a single long-scroll page where all sections are visible. Remove the SPA show/hide JS if needed.
6. FOOTER LINKS: Connect footer nav links to matching sections too.

RULES:
- Output ONLY the complete modified HTML (<!DOCTYPE html> to </html>).
- No markdown fences, no explanations, no preamble.
- Do NOT change existing CSS classes, colors, fonts, sizes, or layout.
- Do NOT remove any existing content.
- Keep ALL pages/sections — do not skip any.
- The HTML must work when opened directly in a browser (file:// protocol).`

/**
 * Generate a complete website from a PenDocument.
 * Uses pen-codegen for static HTML, then AI enhances with links/interactivity.
 */
export async function generateAIWebsite(
  doc: PenDocument,
  model: string,
  provider?: string,
  onProgress?: (status: string) => void,
  abortSignal?: AbortSignal,
): Promise<string> {
  console.log('[WebsiteGenerator] Starting…')

  // Step 1: Generate static HTML from codegen
  onProgress?.('Generating static HTML…')
  const { generateSPAWebsite } = await import('@zseven-w/pen-codegen')
  const staticHTML = generateSPAWebsite(doc)
  console.log(`[WebsiteGenerator] Static HTML: ${staticHTML.length} chars`)

  // Step 2: Capture screenshots
  onProgress?.('Capturing screenshots…')
  const screenshots = await capturePageScreenshots(doc)
  console.log(`[WebsiteGenerator] Screenshots: ${screenshots.length}`)

  // Step 3: Send to AI for enhancement
  onProgress?.('AI enhancing links & interactivity…')

  const attachments: Array<{ name: string; mediaType: string; data: string }> = []

  // Screenshots as image attachments
  for (let i = 0; i < screenshots.length; i++) {
    attachments.push({
      name: `screenshot-page-${i + 1}.png`,
      mediaType: 'image/png',
      data: screenshots[i].base64,
    })
  }

  // Static HTML as text attachment
  attachments.push({
    name: 'website.html',
    mediaType: 'text/html',
    data: btoa(unescape(encodeURIComponent(staticHTML))),
  })

  const userMessage = `Here is a static HTML website generated from a design tool. It has ${screenshots.length} page(s) of content but NO navigation links or interactivity.

Read the HTML file and screenshots, then enhance it:
- Add anchor ids to all major sections
- Connect all nav items and CTA buttons to the correct sections
- Add hover effects to buttons and links
- Convert SPA routing to single long-scroll page if there are multiple pages
- Ensure smooth scrolling

Output the complete enhanced HTML.`

  const messages: Array<{ role: 'user' | 'assistant'; content: string; attachments?: typeof attachments }> = [
    { role: 'user', content: userMessage, attachments },
  ]

  let fullResponse = ''
  for await (const chunk of streamChat(
    WEBSITE_ENHANCE_PROMPT,
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

  console.log(`[WebsiteGenerator] AI response: ${fullResponse.length} chars`)

  const html = extractHTML(fullResponse)
  if (!html) {
    // Fallback: return static HTML if AI fails
    console.warn('[WebsiteGenerator] AI enhancement failed, returning static HTML')
    return staticHTML
  }

  onProgress?.('Done!')
  return html
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
