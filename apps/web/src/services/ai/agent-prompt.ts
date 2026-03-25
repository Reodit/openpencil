import { DESIGN_GENERATOR_PROMPT } from './ai-prompts'
import type { DesignMdSpec } from '@/types/design-md'

/**
 * Unified agent system prompt.
 *
 * Uses the proven DESIGN_GENERATOR_PROMPT (which already produces correct
 * PenNode JSONL with proper layout structure) and adds agent autonomy on top.
 */

const BLOCK = '```'

const AGENT_PREAMBLE = `You are an AI design agent for OpenPencil. You decide autonomously what to do.

DECISION MAKING:
- User wants something visual → output PenNode JSONL in a ${BLOCK}json block (follow the format below EXACTLY)
- User wants to modify existing elements → output a ${BLOCK}json block with a JSON array of updated nodes (PRESERVE original IDs)
- User asks a question → answer in text
- User needs code → generate it
- You can combine: create a design AND explain it
- You have tools (file reading, web search, shell) — use them when needed

When modifying nodes: PRESERVE IDs, only change requested properties, MAY add/remove children.

`

/**
 * Build the full agent system prompt.
 * Uses the proven DESIGN_GENERATOR_PROMPT as base + agent autonomy preamble.
 */
export function buildAgentSystemPrompt(
  _userMessage: string,
  _designMd?: DesignMdSpec,
): string {
  // Use the full proven design generator prompt (already has schema, layout,
  // style, guidelines, examples, icons, overflow prevention, etc.)
  // Prepend agent decision-making preamble
  return `${AGENT_PREAMBLE}${DESIGN_GENERATOR_PROMPT}`
}
