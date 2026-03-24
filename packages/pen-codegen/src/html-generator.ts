import type { PenDocument, PenNode, ContainerProps, TextNode } from '@zseven-w/pen-types'
import { getActivePageChildren } from '@zseven-w/pen-core'
import type { PenFill, PenStroke, PenEffect, ShadowEffect } from '@zseven-w/pen-types'
import { isVariableRef } from '@zseven-w/pen-core'
import { variableNameToCSS, generateCSSVariables } from './css-variables-generator.js'
import { buildEllipseArcPath, isArcEllipse } from '@zseven-w/pen-core'

/**
 * Converts PenDocument nodes to HTML + CSS.
 * $variable references are output as var(--name) CSS custom properties.
 */

function varOrLiteral(value: string): string {
  if (isVariableRef(value)) {
    return `var(${variableNameToCSS(value.slice(1))})`
  }
  return value
}

let classCounter = 0

function resetClassCounter() {
  classCounter = 0
}

function nextClassName(prefix: string): string {
  classCounter++
  return `${prefix}-${classCounter}`
}

function indent(depth: number): string {
  return '  '.repeat(depth)
}

function fillToCSS(fills: PenFill[] | undefined): Record<string, string> {
  if (!fills || fills.length === 0) return {}
  const fill = fills[0]
  if (fill.type === 'solid') {
    return { background: varOrLiteral(fill.color) }
  }
  if (fill.type === 'linear_gradient') {
    if (!fill.stops?.length) return {}
    const angle = fill.angle ?? 180
    const stops = fill.stops.map((s) => `${varOrLiteral(s.color)} ${Math.round(s.offset * 100)}%`).join(', ')
    return { background: `linear-gradient(${angle}deg, ${stops})` }
  }
  if (fill.type === 'radial_gradient') {
    if (!fill.stops?.length) return {}
    const stops = fill.stops.map((s) => `${varOrLiteral(s.color)} ${Math.round(s.offset * 100)}%`).join(', ')
    return { background: `radial-gradient(circle, ${stops})` }
  }
  return {}
}

function strokeToCSS(stroke: PenStroke | undefined): Record<string, string> {
  if (!stroke) return {}
  const css: Record<string, string> = {}
  if (typeof stroke.thickness === 'string' && isVariableRef(stroke.thickness)) {
    css['border-width'] = varOrLiteral(stroke.thickness)
  } else {
    const thickness = typeof stroke.thickness === 'number'
      ? stroke.thickness
      : stroke.thickness[0]
    css['border-width'] = `${thickness}px`
  }
  css['border-style'] = 'solid'
  if (stroke.fill && stroke.fill.length > 0) {
    const sf = stroke.fill[0]
    if (sf.type === 'solid') {
      css['border-color'] = varOrLiteral(sf.color)
    }
  }
  return css
}

function effectsToCSS(effects: PenEffect[] | undefined): Record<string, string> {
  if (!effects || effects.length === 0) return {}
  const shadows: string[] = []
  for (const effect of effects) {
    if (effect.type === 'shadow') {
      const s = effect as ShadowEffect
      const inset = s.inner ? 'inset ' : ''
      shadows.push(`${inset}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread}px ${s.color}`)
    }
  }
  if (shadows.length > 0) {
    return { 'box-shadow': shadows.join(', ') }
  }
  return {}
}

function cornerRadiusToCSS(
  cr: number | [number, number, number, number] | undefined,
): Record<string, string> {
  if (cr === undefined) return {}
  if (typeof cr === 'number') {
    return cr === 0 ? {} : { 'border-radius': `${cr}px` }
  }
  return { 'border-radius': `${cr[0]}px ${cr[1]}px ${cr[2]}px ${cr[3]}px` }
}

function layoutToCSS(node: ContainerProps): Record<string, string> {
  const css: Record<string, string> = {}
  if (node.layout === 'vertical') {
    css.display = 'flex'
    css['flex-direction'] = 'column'
  } else if (node.layout === 'horizontal') {
    css.display = 'flex'
    css['flex-direction'] = 'row'
  }
  if (node.gap !== undefined) {
    if (typeof node.gap === 'string' && isVariableRef(node.gap)) {
      css.gap = varOrLiteral(node.gap)
    } else if (typeof node.gap === 'number') {
      css.gap = `${node.gap}px`
    }
  }
  if (node.padding !== undefined) {
    if (typeof node.padding === 'string' && isVariableRef(node.padding)) {
      css.padding = varOrLiteral(node.padding)
    } else if (typeof node.padding === 'number') {
      css.padding = `${node.padding}px`
    } else if (Array.isArray(node.padding)) {
      css.padding = node.padding.map((p) => `${p}px`).join(' ')
    }
  }
  if (node.justifyContent) {
    const map: Record<string, string> = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
      space_between: 'space-between',
      space_around: 'space-around',
    }
    css['justify-content'] = map[node.justifyContent] ?? node.justifyContent
  }
  if (node.alignItems) {
    const map: Record<string, string> = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
    }
    css['align-items'] = map[node.alignItems] ?? node.alignItems
  }
  if (node.clipContent) {
    css.overflow = 'hidden'
  }
  return css
}

interface CSSRule {
  className: string
  properties: Record<string, string>
}

function getTextContent(node: TextNode): string {
  if (typeof node.content === 'string') return node.content
  return node.content.map((s) => s.text).join('')
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function generateNodeHTML(
  node: PenNode,
  depth: number,
  rules: CSSRule[],
): string {
  const pad = indent(depth)
  const css: Record<string, string> = {}

  // Position
  if (node.x !== undefined || node.y !== undefined) {
    css.position = 'absolute'
    if (node.x !== undefined) css.left = `${node.x}px`
    if (node.y !== undefined) css.top = `${node.y}px`
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity !== 1) {
    if (typeof node.opacity === 'string' && isVariableRef(node.opacity)) {
      css.opacity = varOrLiteral(node.opacity)
    } else if (typeof node.opacity === 'number') {
      css.opacity = String(node.opacity)
    }
  }

  // Rotation
  if (node.rotation) {
    css.transform = `rotate(${node.rotation}deg)`
  }

  switch (node.type) {
    case 'frame':
    case 'rectangle':
    case 'group': {
      if (typeof node.width === 'number') css.width = `${node.width}px`
      if (typeof node.height === 'number') css.height = `${node.height}px`
      Object.assign(css, fillToCSS(node.fill))
      Object.assign(css, strokeToCSS(node.stroke))
      Object.assign(css, cornerRadiusToCSS(node.cornerRadius))
      Object.assign(css, effectsToCSS(node.effects))
      Object.assign(css, layoutToCSS(node))

      const className = nextClassName(node.name?.replace(/\s+/g, '-').toLowerCase() ?? node.type)
      rules.push({ className, properties: css })

      const children = node.children ?? []
      if (children.length === 0) {
        return `${pad}<div class="${className}"></div>`
      }
      const childrenHTML = children
        .map((c) => {
          const h = generateNodeHTML(c, depth + 1, rules)
          return wrapWithLink(h, c, indent(depth + 1))
        })
        .join('\n')
      return `${pad}<div class="${className}">\n${childrenHTML}\n${pad}</div>`
    }

    case 'ellipse': {
      if (isArcEllipse(node.startAngle, node.sweepAngle, node.innerRadius)) {
        const w = typeof node.width === 'number' ? node.width : 100
        const h = typeof node.height === 'number' ? node.height : 100
        const d = buildEllipseArcPath(w, h, node.startAngle ?? 0, node.sweepAngle ?? 360, node.innerRadius ?? 0)
        const fill = node.fill?.[0]?.type === 'solid' ? varOrLiteral(node.fill[0].color) : '#000'
        Object.assign(css, effectsToCSS(node.effects))
        const className = nextClassName(node.name?.replace(/\s+/g, '-').toLowerCase() ?? 'arc')
        rules.push({ className, properties: css })
        return `${pad}<svg class="${className}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="${fill}" /></svg>`
      }
      if (typeof node.width === 'number') css.width = `${node.width}px`
      if (typeof node.height === 'number') css.height = `${node.height}px`
      css['border-radius'] = '50%'
      Object.assign(css, fillToCSS(node.fill))
      Object.assign(css, strokeToCSS(node.stroke))
      Object.assign(css, effectsToCSS(node.effects))

      const className = nextClassName(node.name?.replace(/\s+/g, '-').toLowerCase() ?? 'ellipse')
      rules.push({ className, properties: css })
      return `${pad}<div class="${className}"></div>`
    }

    case 'text': {
      if (typeof node.width === 'number') css.width = `${node.width}px`
      if (typeof node.height === 'number') css.height = `${node.height}px`
      if (node.fill) {
        const fill = node.fill[0]
        if (fill?.type === 'solid') css.color = varOrLiteral(fill.color)
      }
      if (node.fontSize) css['font-size'] = `${node.fontSize}px`
      if (node.fontWeight) css['font-weight'] = String(node.fontWeight)
      if (node.fontStyle === 'italic') css['font-style'] = 'italic'
      if (node.textAlign) css['text-align'] = node.textAlign
      if (node.fontFamily) css['font-family'] = `'${node.fontFamily}', sans-serif`
      if (node.lineHeight) css['line-height'] = String(node.lineHeight)
      if (node.letterSpacing) css['letter-spacing'] = `${node.letterSpacing}px`
      if (node.textAlignVertical === 'middle') css['vertical-align'] = 'middle'
      else if (node.textAlignVertical === 'bottom') css['vertical-align'] = 'bottom'
      if (node.textGrowth === 'auto') css['white-space'] = 'nowrap'
      else if (node.textGrowth === 'fixed-width-height') css.overflow = 'hidden'
      if (node.underline) css['text-decoration'] = 'underline'
      if (node.strikethrough) css['text-decoration'] = 'line-through'
      Object.assign(css, effectsToCSS(node.effects))

      const className = nextClassName(node.name?.replace(/\s+/g, '-').toLowerCase() ?? 'text')
      rules.push({ className, properties: css })

      const size = node.fontSize ?? 16
      const tag = size >= 32 ? 'h1' : size >= 24 ? 'h2' : size >= 20 ? 'h3' : 'p'
      const text = escapeHTML(getTextContent(node))
      return `${pad}<${tag} class="${className}">${text}</${tag}>`
    }

    case 'line': {
      const w = node.x2 !== undefined ? Math.abs(node.x2 - (node.x ?? 0)) : 0
      css.width = `${w}px`
      if (node.stroke) {
        const thickness = typeof node.stroke.thickness === 'number'
          ? node.stroke.thickness
          : node.stroke.thickness[0]
        css['border-top-width'] = `${thickness}px`
        css['border-top-style'] = 'solid'
        if (node.stroke.fill && node.stroke.fill.length > 0) {
          const sf = node.stroke.fill[0]
          if (sf.type === 'solid') css['border-top-color'] = varOrLiteral(sf.color)
        }
      }
      const className = nextClassName(node.name?.replace(/\s+/g, '-').toLowerCase() ?? 'line')
      rules.push({ className, properties: css })
      return `${pad}<hr class="${className}" />`
    }

    case 'polygon':
    case 'path': {
      if (typeof node.width === 'number') css.width = `${node.width}px`
      if (typeof node.height === 'number') css.height = `${node.height}px`
      Object.assign(css, fillToCSS(node.fill))
      const className = nextClassName(node.name?.replace(/\s+/g, '-').toLowerCase() ?? node.type)
      rules.push({ className, properties: css })
      if (node.type === 'path') {
        const w = typeof node.width === 'number' ? node.width : 100
        const h = typeof node.height === 'number' ? node.height : 100
        const fillColor = node.fill?.[0]?.type === 'solid' ? varOrLiteral(node.fill[0].color) : 'currentColor'
        return `${pad}<svg class="${className}" viewBox="0 0 ${w} ${h}">\n${pad}  <path d="${node.d}" fill="${fillColor}" />\n${pad}</svg>`
      }
      return `${pad}<div class="${className}"></div>`
    }

    case 'image': {
      if (typeof node.width === 'number') css.width = `${node.width}px`
      if (typeof node.height === 'number') css.height = `${node.height}px`
      const fit = node.objectFit === 'fit' ? 'contain' : node.objectFit === 'crop' ? 'cover' : 'fill'
      css['object-fit'] = fit
      Object.assign(css, cornerRadiusToCSS(node.cornerRadius))
      Object.assign(css, effectsToCSS(node.effects))
      const className = nextClassName(node.name?.replace(/\s+/g, '-').toLowerCase() ?? 'image')
      rules.push({ className, properties: css })
      return `${pad}<img class="${className}" src="${node.src}" alt="${escapeHTML(node.name ?? 'image')}" />`
    }

    case 'icon_font': {
      const size = typeof node.width === 'number' ? node.width : 24
      css.width = `${size}px`
      css.height = `${size}px`
      if (node.fill?.[0]?.type === 'solid') css.color = varOrLiteral(node.fill[0].color)
      const className = nextClassName(node.name?.replace(/\s+/g, '-').toLowerCase() ?? 'icon')
      rules.push({ className, properties: css })
      return `${pad}<i class="${className}" data-lucide="${escapeHTML(node.iconFontName ?? 'circle')}"></i>`
    }

    case 'ref':
      return `${pad}<!-- Ref: ${node.ref} -->`

    default:
      return `${pad}<!-- Unknown node -->`
  }
}

/** Wrap HTML output in <a> tag if node has a link property */
function wrapWithLink(html: string, node: PenNode, pad: string, pageNames?: Map<string, string>): string {
  if (!node.link) return html
  const aStyle = 'style="text-decoration:none;color:inherit;display:contents;"'
  if (node.link.type === 'url') {
    return `${pad}<a href="${escapeHTML(node.link.url)}" ${aStyle}>\n${html}\n${pad}</a>`
  }
  if (node.link.type === 'page' && pageNames) {
    const pageName = pageNames.get(node.link.pageId)
    const href = pageName ? `${pageName.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '')}.html` : '#'
    return `${pad}<a href="${escapeHTML(href)}" ${aStyle}>\n${html}\n${pad}</a>`
  }
  if (node.link.type === 'anchor') {
    const anchorId = node.link.nodeId.replace(/[^a-zA-Z0-9-_]/g, '')
    return `${pad}<a href="#${anchorId}" ${aStyle}>\n${html}\n${pad}</a>`
  }
  return html
}

/** Add id attribute to a node's HTML if it's an anchor target */
function addAnchorId(html: string, node: PenNode): string {
  if (!node.id) return html
  // Add id to the first tag in the HTML
  return html.replace(/<(\w+)(\s)/, `<$1 id="${node.id.replace(/[^a-zA-Z0-9-_]/g, '')}"$2`)
}

function cssRulesToString(rules: CSSRule[]): string {
  return rules
    .map((r) => {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n')
      return `.${r.className} {\n${props}\n}`
    })
    .join('\n\n')
}

export function generateHTMLCode(nodes: PenNode[]): { html: string; css: string } {
  resetClassCounter()
  const rules: CSSRule[] = []

  if (nodes.length === 0) {
    return {
      html: '<div class="container"></div>',
      css: '.container {\n  position: relative;\n}',
    }
  }

  // Compute wrapper size
  let maxW = 0
  let maxH = 0
  for (const node of nodes) {
    const x = node.x ?? 0
    const y = node.y ?? 0
    const w = 'width' in node && typeof node.width === 'number' ? node.width : 0
    const h = 'height' in node && typeof node.height === 'number' ? node.height : 0
    maxW = Math.max(maxW, x + w)
    maxH = Math.max(maxH, y + h)
  }

  const containerCSS: Record<string, string> = { position: 'relative' }
  if (maxW > 0) containerCSS.width = `${maxW}px`
  if (maxH > 0) containerCSS.height = `${maxH}px`
  rules.push({ className: 'container', properties: containerCSS })

  const childrenHTML = nodes
    .map((n) => {
      const html = generateNodeHTML(n, 1, rules)
      return wrapWithLink(html, n, indent(1))
    })
    .join('\n')

  const html = `<div class="container">\n${childrenHTML}\n</div>`
  const css = cssRulesToString(rules)

  return { html, css }
}

export function generateHTMLFromDocument(doc: PenDocument, activePageId?: string | null): { html: string; css: string } {
  const children = activePageId !== undefined
    ? getActivePageChildren(doc, activePageId)
    : doc.children
  const result = generateHTMLCode(children)
  const varsCSS = doc.variables && Object.keys(doc.variables).length > 0
    ? generateCSSVariables(doc)
    : ''
  return {
    html: result.html,
    css: varsCSS ? `${varsCSS}\n${result.css}` : result.css,
  }
}

/**
 * Generate a complete multi-page HTML website from a PenDocument.
 * Each page becomes a separate HTML file with navigation links between pages.
 * Returns a map of filename → full HTML content.
 */
export function generateMultiPageHTML(doc: PenDocument): Map<string, string> {
  // Collect all top-level frames across all pages — each becomes its own HTML file
  const allFrames: Array<{ node: PenNode; pageName: string }> = []

  const pages = doc.pages ?? []
  if (pages.length === 0) {
    // No pages — use doc.children directly
    for (const node of doc.children) {
      allFrames.push({ node, pageName: node.name ?? node.type })
    }
  } else {
    for (const page of pages) {
      for (const node of page.children) {
        allFrames.push({ node, pageName: node.name ?? page.name })
      }
    }
  }

  if (allFrames.length === 0) {
    return new Map([['index.html', buildFullHTML('Design', '<div></div>', '')]])
  }

  // Build frame name → filename map for link resolution
  const frameNames = new Map<string, string>()
  for (const { node } of allFrames) {
    frameNames.set(node.id, node.name ?? node.type)
  }
  // Also map page IDs for backward compatibility with page links
  for (const page of pages) {
    if (!frameNames.has(page.id)) {
      // Map page ID to its first child frame
      const firstChild = page.children[0]
      if (firstChild) frameNames.set(page.id, firstChild.name ?? page.name)
    }
  }

  // Collect anchor target node IDs
  const anchorTargetIds = new Set<string>()
  function collectAnchors(nodes: PenNode[]) {
    for (const node of nodes) {
      if (node.link?.type === 'anchor') anchorTargetIds.add(node.link.nodeId)
      const ch = (node as { children?: PenNode[] }).children
      if (ch) collectAnchors(ch)
    }
  }
  for (const { node } of allFrames) {
    collectAnchors((node as { children?: PenNode[] }).children ?? [])
  }

  const varsCSS = doc.variables && Object.keys(doc.variables).length > 0
    ? generateCSSVariables(doc)
    : ''

  const files = new Map<string, string>()
  const usedFilenames = new Set<string>()

  for (let i = 0; i < allFrames.length; i++) {
    const { node, pageName } = allFrames[i]
    resetClassCounter()
    const rules: CSSRule[] = []

    // Reset position to (0,0) — each frame is its own page
    const frameNode = { ...node, x: 0, y: 0 } as PenNode

    // Container matches frame size
    const w = 'width' in frameNode && typeof frameNode.width === 'number' ? frameNode.width : 0
    const h = 'height' in frameNode && typeof frameNode.height === 'number' ? frameNode.height : 0
    const containerCSS: Record<string, string> = { position: 'relative' }
    if (w > 0) containerCSS.width = `${w}px`
    if (h > 0) containerCSS['min-height'] = `${h}px`
    rules.push({ className: 'container', properties: containerCSS })

    let html = generateNodeHTML(frameNode, 1, rules)
    if (anchorTargetIds.has(node.id)) html = addAnchorId(html, node)
    html = wrapWithLink(html, node, indent(1), frameNames)

    const bodyHTML = `<div class="container">\n${html}\n</div>`
    const css = varsCSS
      ? `${varsCSS}\n${cssRulesToString(rules)}`
      : cssRulesToString(rules)

    // Generate unique filename
    let filename: string
    if (i === 0) {
      filename = 'index.html'
    } else {
      const base = pageName.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '')
      filename = `${base || 'page'}.html`
      let suffix = 2
      while (usedFilenames.has(filename)) {
        filename = `${base}-${suffix}.html`
        suffix++
      }
    }
    usedFilenames.add(filename)

    files.set(filename, buildFullHTML(pageName, bodyHTML, css))
  }

  return files
}

function buildFullHTML(title: string, bodyHTML: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHTML(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
${css.split('\n').map((l) => `    ${l}`).join('\n')}
  </style>
</head>
<body>
${bodyHTML.split('\n').map((l) => `  ${l}`).join('\n')}
</body>
</html>`
}

/**
 * Generate a single-page application (SPA) HTML file from a PenDocument.
 * All top-level frames become pages in one HTML file with hash-based routing.
 * No server required — works from file:// protocol.
 */
export function generateSPAWebsite(doc: PenDocument): string {
  // Collect all top-level frames
  const allFrames: Array<{ node: PenNode; name: string; slug: string }> = []
  const pages = doc.pages ?? []

  if (pages.length === 0) {
    for (const node of doc.children) {
      const name = node.name ?? node.type
      allFrames.push({ node, name, slug: toSlug(name) })
    }
  } else {
    for (const page of pages) {
      for (const node of page.children) {
        const name = node.name ?? page.name
        allFrames.push({ node, name, slug: toSlug(name) })
      }
    }
  }

  // Deduplicate slugs
  const slugCounts = new Map<string, number>()
  for (const frame of allFrames) {
    const count = slugCounts.get(frame.slug) ?? 0
    if (count > 0) frame.slug = `${frame.slug}-${count + 1}`
    slugCounts.set(frame.slug, count + 1)
  }

  // Collect anchor targets
  const anchorTargetIds = new Set<string>()
  function collectAnchors(nodes: PenNode[]) {
    for (const node of nodes) {
      if (node.link?.type === 'anchor') anchorTargetIds.add(node.link.nodeId)
      const ch = (node as { children?: PenNode[] }).children
      if (ch) collectAnchors(ch)
    }
  }
  for (const { node } of allFrames) {
    collectAnchors((node as { children?: PenNode[] }).children ?? [])
  }

  // Build frame ID map for link resolution
  const frameSlugMap = new Map<string, string>()
  for (const frame of allFrames) {
    frameSlugMap.set(frame.node.id, frame.slug)
  }
  for (const page of pages) {
    if (!frameSlugMap.has(page.id) && page.children[0]) {
      frameSlugMap.set(page.id, allFrames.find(f => f.node.id === page.children[0].id)?.slug ?? '')
    }
  }

  const varsCSS = doc.variables && Object.keys(doc.variables).length > 0
    ? generateCSSVariables(doc)
    : ''

  // Generate each page section
  const pageSections: string[] = []
  const allCSS: string[] = []

  for (let i = 0; i < allFrames.length; i++) {
    const { node, slug } = allFrames[i]
    resetClassCounter()
    const rules: CSSRule[] = []

    const frameNode = { ...node, x: 0, y: 0 } as PenNode
    const w = 'width' in frameNode && typeof frameNode.width === 'number' ? frameNode.width : 0
    const h = 'height' in frameNode && typeof frameNode.height === 'number' ? frameNode.height : 0

    const containerClass = `page-${slug}`
    const containerCSS: Record<string, string> = { position: 'relative' }
    if (w > 0) containerCSS.width = `${w}px`
    if (h > 0) containerCSS['min-height'] = `${h}px`
    rules.push({ className: containerClass, properties: containerCSS })

    let html = generateNodeHTML(frameNode, 2, rules)
    if (anchorTargetIds.has(node.id)) html = addAnchorId(html, node)

    // Convert page links to hash links
    const children = (frameNode as { children?: PenNode[] }).children ?? []
    function walkAndConvertLinks(nodes: PenNode[]) {
      for (const n of nodes) {
        if (n.link?.type === 'page') {
          const targetSlug = frameSlugMap.get(n.link.pageId)
          if (targetSlug) {
            (n as any).link = { type: 'url', url: `#${targetSlug}` }
          }
        }
        const ch = (n as { children?: PenNode[] }).children
        if (ch) walkAndConvertLinks(ch)
      }
    }
    walkAndConvertLinks(children)

    pageSections.push(
      `    <div class="spa-page ${containerClass}" data-page="${slug}">\n${html}\n    </div>`
    )
    allCSS.push(cssRulesToString(rules))
  }

  const firstSlug = allFrames[0]?.slug ?? ''
  const combinedCSS = varsCSS
    ? `${varsCSS}\n${allCSS.join('\n\n')}`
    : allCSS.join('\n\n')

  const title = doc.name ?? allFrames[0]?.name ?? 'Website'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHTML(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { background: #ffffff; }
    .spa-page { display: none; }
    .spa-page.active { display: block; }
${combinedCSS.split('\n').map((l) => `    ${l}`).join('\n')}
  </style>
</head>
<body>
  <div id="app">
${pageSections.join('\n')}
  </div>
  <script>
    function navigate(hash) {
      var pages = document.querySelectorAll('.spa-page');
      var target = hash.replace('#', '') || '${firstSlug}';
      for (var i = 0; i < pages.length; i++) {
        pages[i].classList.toggle('active', pages[i].dataset.page === target);
      }
    }
    window.addEventListener('hashchange', function() { navigate(location.hash); });
    document.addEventListener('click', function(e) {
      var link = e.target.closest('a[href^="#"]');
      if (link) {
        e.preventDefault();
        location.hash = link.getAttribute('href');
      }
    });
    navigate(location.hash);
  </script>
</body>
</html>`
}

function toSlug(name: string): string {
  return name.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'page'
}
