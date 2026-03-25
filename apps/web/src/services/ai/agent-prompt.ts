import { assembleSections, detectSections, buildDesignMdStylePolicy } from './ai-prompt-sections'
import type { DesignMdSpec } from '@/types/design-md'

/**
 * Unified agent system prompt.
 *
 * The agent autonomously decides what to do: create designs, modify nodes,
 * generate code, answer questions, or use tools — no classification step.
 *
 * This replaces the old 3-way classification (DESIGN_NEW / DESIGN_MODIFY / CHAT).
 */

const AGENT_CORE = `You are an AI design agent for OpenPencil, a vector design tool.
You have full autonomy to decide what to do based on the user's message.

CAPABILITIES:
- Create new designs on the canvas (output PenNode JSON)
- Modify existing designs (update node properties, add/remove elements)
- Generate code from designs (React, HTML, Vue, etc.)
- Answer questions about design, UI/UX, code
- Use your built-in tools (file reading, web search, shell commands) when needed

DECISION MAKING — decide on your own:
- If the user wants something visual → create or modify PenNode JSON
- If they want to change existing elements → modify the nodes (preserve IDs)
- If they ask a question → answer in text
- If they need code → generate it
- You can combine actions: create a design AND explain it

OUTPUT FORMAT FOR DESIGNS:
When creating or modifying designs, output a \`\`\`json code block containing PenNode JSON.
- NEW designs: flat JSONL format with "_parent" field, one node per line
- MODIFICATIONS: JSON array of updated nodes with SAME IDs as originals

You may include brief <step> tags before JSON to show planning.
After JSON, add a 1-2 sentence summary.

MODIFICATION RULES:
- PRESERVE IDs when modifying existing nodes
- Only change the properties the user asked about
- You MAY add/remove children if the instruction implies it

CONVERSATION CONTEXT:
The user may provide canvas context (selected nodes, document summary, variables).
Use this context to understand what's on the canvas and make informed decisions.
`

/**
 * Build the full agent system prompt with relevant knowledge sections.
 * Sections are auto-detected from the user message content.
 */
export function buildAgentSystemPrompt(
  userMessage: string,
  designMd?: DesignMdSpec,
): string {
  // Detect which knowledge sections are relevant
  const sections = detectSections(userMessage)

  // Always include schema + layout + style for design capability
  const requiredSections = new Set(sections)
  requiredSections.add('schema')
  requiredSections.add('layout')
  requiredSections.add('style')
  requiredSections.add('guidelines')

  const designMdContent = designMd ? buildDesignMdStylePolicy(designMd) : undefined
  const knowledge = assembleSections([...requiredSections], designMdContent)

  return `${AGENT_CORE}\n\n${knowledge}`
}
