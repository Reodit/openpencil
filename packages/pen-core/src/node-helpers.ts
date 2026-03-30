import type { PenNode } from '@zseven-w/pen-types'

/**
 * Check if a node is a badge/overlay that uses absolute positioning
 * and should not participate in layout flow.
 *
 * Only matches nodes that are clearly small overlay indicators
 * (notification dots, floating badges) — NOT general UI elements
 * that happen to have "badge" in their name.
 *
 * Criteria: must have explicit x/y positioning AND be small (≤32px),
 * OR match very specific overlay names (indicator, notification dot).
 */
export function isBadgeOverlayNode(node: PenNode): boolean {
  const hasExplicitPosition = typeof node.x === 'number' && typeof node.y === 'number'
  const n = node as unknown as Record<string, unknown>
  const w = typeof n.width === 'number' ? n.width : 999
  const h = typeof n.height === 'number' ? n.height : 999
  const isSmall = w <= 32 && h <= 32

  // Only treat as overlay if it has explicit x/y AND is small
  // This prevents normal badge/tag UI elements from being pulled out of layout
  if (hasExplicitPosition && isSmall) {
    const name = (node.name ?? '').toLowerCase()
    if (/indicator|notification[-_\s]?dot|overlay|floating/i.test(name)) return true
    if ('role' in node) {
      const role = (node as { role?: string }).role
      if (role === 'badge' || role === 'pill') return true
    }
  }

  return false
}
