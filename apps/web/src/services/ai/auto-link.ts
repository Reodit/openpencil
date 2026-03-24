import type { PenDocument, PenNode, PenPage } from '@/types/pen'
import { streamChat } from './ai-service'

const AUTO_LINK_SYSTEM_PROMPT = `You are a Design Link Mapper. You receive a design document with multiple pages and their node trees. Your job is to automatically detect interactive elements (buttons, navigation items, menu items, cards, links, tabs) and map them to the correct target page.

INPUT:
- List of pages with their IDs and names
- Node tree for each page (simplified: id, type, name, role, children)

OUTPUT:
A JSON array of link mappings:
\`\`\`json
[
  { "nodeId": "node-id-here", "pageId": "target-page-id" },
  ...
]
\`\`\`

RULES:
- Only link interactive elements: buttons, nav items, menu items, tabs, cards with navigation intent
- Match by name similarity: a button named "Home" should link to a page named "Home"
- Match by role: nodes with role "button", "nav-item", "tab", "link", "menu-item"
- Match by content: text nodes inside buttons that match page names
- Do NOT link decorative elements, images (unless they are clearly clickable), or layout containers
- Do NOT link elements to their own page
- If no clear match exists, skip that element
- Return ONLY the JSON array, no explanations`

interface LinkMapping {
  nodeId: string
  pageId: string
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
    return mappings.filter((m) => m.nodeId && m.pageId)
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
): { updatedNodes: Array<{ nodeId: string; pageId: string; pageName: string }> } {
  const pageMap = new Map(pages.map((p) => [p.id, p.name]))
  const mappingMap = new Map(mappings.map((m) => [m.nodeId, m.pageId]))
  const updated: Array<{ nodeId: string; pageId: string; pageName: string }> = []

  function walkAndLink(nodes: PenNode[]) {
    for (const node of nodes) {
      const targetPageId = mappingMap.get(node.id)
      if (targetPageId && pageMap.has(targetPageId)) {
        node.link = { type: 'page', pageId: targetPageId }
        updated.push({
          nodeId: node.id,
          pageId: targetPageId,
          pageName: pageMap.get(targetPageId) ?? '',
        })
      }
      const children = (node as { children?: PenNode[] }).children
      if (children) walkAndLink(children)
    }
  }

  for (const page of pages) {
    walkAndLink(page.children)
  }

  return { updatedNodes: updated }
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
