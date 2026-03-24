import type { PenDocument, PenNode, PenPage } from '@/types/pen'
import { streamChat } from './ai-service'

const AUTO_LINK_SYSTEM_PROMPT = `You are a Design Link Mapper. You receive a design document with pages and their node trees. Your job is to detect interactive elements and map them to:
1. Target PAGES (cross-page navigation)
2. Target ANCHORS (same-page scroll to a section)

INPUT:
- List of pages with their IDs and names
- Node tree for each page (simplified: id, type, name, role, children)

OUTPUT:
A JSON array of link mappings:
\`\`\`json
[
  { "nodeId": "source-node-id", "type": "page", "targetId": "target-page-id" },
  { "nodeId": "source-node-id", "type": "anchor", "targetId": "target-section-node-id" },
  ...
]
\`\`\`

RULES FOR PAGE LINKS:
- Match buttons/nav items to pages by name similarity
- A button "Home" → page named "Home"
- Do NOT link elements to their own page

RULES FOR ANCHOR LINKS (same-page scroll):
- Navigation items that match a section/frame NAME on the SAME page → anchor link
- Example: nav item "Menu" on page "Home" → frame "Menu Section" on page "Home" → anchor
- Example: nav item "Contact" → frame "Contact" on same page → anchor
- Only anchor to top-level frames or named sections, not small child elements
- Match by name similarity between the interactive element text and the section name

GENERAL RULES:
- Only link interactive elements: buttons, nav items, menu items, tabs, cards, links
- Match by role: "button", "nav-item", "tab", "link", "menu-item"
- Match by content: text inside buttons that match page/section names
- Do NOT link decorative elements or layout containers
- If no clear match exists, skip that element
- Return ONLY the JSON array, no explanations`

interface LinkMapping {
  nodeId: string
  type: 'page' | 'anchor'
  targetId: string
}

/**
 * Use AI to automatically detect interactive elements and link them to pages.
 */
export async function autoLinkPages(
  document: PenDocument,
  model: string,
  provider?: string,
): Promise<LinkMapping[]> {
  const pages = document.pages ?? []
  if (pages.length < 2) return [] // Need at least 2 pages for linking

  // Build simplified page summaries
  const pageSummaries = pages.map((page) => ({
    id: page.id,
    name: page.name,
    nodes: simplifyNodes(page.children, 3), // max depth 3
  }))

  const userMessage = `PAGES:\n${JSON.stringify(pageSummaries, null, 2)}`

  let fullResponse = ''
  for await (const chunk of streamChat(
    AUTO_LINK_SYSTEM_PROMPT,
    [{ role: 'user', content: userMessage }],
    model,
    { thinkingMode: 'disabled', effort: 'high' },
    provider,
  )) {
    if (chunk.type === 'text') {
      fullResponse += chunk.content
    } else if (chunk.type === 'error') {
      throw new Error(chunk.content)
    }
  }

  // Parse JSON from response
  const jsonMatch = fullResponse.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const mappings = JSON.parse(jsonMatch[0]) as LinkMapping[]
    return mappings.filter((m) => m.nodeId && m.targetId && m.type)
  } catch {
    return []
  }
}

/**
 * Apply link mappings to the document — sets link property on matched nodes.
 */
export function applyLinkMappings(
  pages: PenPage[],
  mappings: LinkMapping[],
): { updatedCount: number } {
  const pageMap = new Map(pages.map((p) => [p.id, p.name]))
  const mappingMap = new Map(mappings.map((m) => [m.nodeId, m]))
  let updatedCount = 0

  function walkAndLink(nodes: PenNode[]) {
    for (const node of nodes) {
      const mapping = mappingMap.get(node.id)
      if (mapping) {
        if (mapping.type === 'page' && pageMap.has(mapping.targetId)) {
          node.link = { type: 'page', pageId: mapping.targetId }
          updatedCount++
        } else if (mapping.type === 'anchor') {
          node.link = { type: 'anchor', nodeId: mapping.targetId }
          updatedCount++
        }
      }
      const children = (node as { children?: PenNode[] }).children
      if (children) walkAndLink(children)
    }
  }

  for (const page of pages) {
    walkAndLink(page.children)
  }

  return { updatedCount }
}

/** Simplify node tree for AI context (reduce token usage) */
function simplifyNodes(nodes: PenNode[], maxDepth: number, depth = 0): unknown[] {
  if (depth >= maxDepth) return []
  return nodes.map((node) => {
    const simple: Record<string, unknown> = {
      id: node.id,
      type: node.type,
    }
    if (node.name) simple.name = node.name
    if (node.role) simple.role = node.role
    if (node.type === 'text' && 'content' in node) {
      simple.content = String((node as { content?: string }).content ?? '').slice(0, 50)
    }
    const children = (node as { children?: PenNode[] }).children
    if (children?.length) {
      simple.children = simplifyNodes(children, maxDepth, depth + 1)
    }
    return simple
  })
}
