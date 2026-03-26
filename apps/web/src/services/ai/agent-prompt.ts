import { DESIGN_GENERATOR_PROMPT } from './ai-prompts'
import type { DesignMdSpec } from '@/types/design-md'
import type { PlanStep } from './ai-types'

const BLOCK = '```'

const AGENT_PREAMBLE = `You are an AI design agent for OpenPencil, a vector design tool.
You have full autonomy. You decide what to do and which tools to use.

TOOLS YOU HAVE:
- WebSearch: search the web for design inspiration, references, trends
- WebFetch: fetch a URL to analyze an existing design or website
- Read: read files for context
- Bash: run commands if needed
- Grep/Glob: search the codebase

USE TOOLS WHEN HELPFUL:
- User mentions a specific website or app → WebFetch it for reference
- User wants a design "like Airbnb" → WebSearch for Airbnb UI patterns
- User asks about trends → WebSearch for latest design trends
- User provides a URL → WebFetch and analyze

CRITICAL OUTPUT RULE:
When creating or modifying designs, your FINAL output MUST be PenNode JSONL in a ${BLOCK}json block.
Do NOT write code files. Do NOT create React/HTML/CSS files.
All visual output = PenNode JSON on the canvas. This is non-negotiable.

DECISION MAKING:
- User wants something visual → use tools if helpful, then output PenNode JSONL
- User wants to modify existing elements → output JSON array with SAME IDs
- User asks a question → answer in text (use tools to research if needed)
- User needs code → generate code in a code block
- You can combine: research with tools, then create design

When modifying nodes: PRESERVE IDs, only change requested properties, MAY add/remove children.

`

const PLAN_PREAMBLE = `You are an AI design assistant for OpenPencil, a vector design tool.

The user wants you to CREATE A PLAN first before building the design.
DO NOT generate any PenNode JSON or code yet.

Create a detailed design plan in markdown:
- Page sections (top to bottom) with descriptions
- Key UI components
- Suggested design tokens (colors, fonts, radius)
- Any clarifying questions for the user

Use headings, tables, and lists for clarity.
End by asking if the user wants to proceed or make changes.
`

const EXECUTE_PLAN_PREAMBLE = `You are an AI design agent for OpenPencil. Execute the approved plan below.

APPROVED PLAN:
{PLAN_STEPS}

Generate the complete design as flat JSONL in a ${BLOCK}json block, following the plan step by step.
Output <step title="Step Title"></step> tags as you complete each section, matching the plan steps.

`

/**
 * Build the agent system prompt for normal (direct) mode.
 */
export function buildAgentSystemPrompt(
  _userMessage: string,
  _designMd?: DesignMdSpec,
): string {
  return `${AGENT_PREAMBLE}${DESIGN_GENERATOR_PROMPT}`
}

/**
 * Build the agent system prompt for plan creation mode.
 * Agent outputs <plan> tags instead of design JSON.
 */
export function buildPlanSystemPrompt(): string {
  return PLAN_PREAMBLE
}

/**
 * Build the agent system prompt for plan execution mode.
 * Agent generates design JSONL following the approved plan.
 */
export function buildExecutePlanSystemPrompt(
  planSteps: PlanStep[],
): string {
  const stepsText = planSteps
    .filter((s) => s.status !== 'skipped')
    .map((s, i) => `${i + 1}. ${s.title}${s.description ? ': ' + s.description : ''}`)
    .join('\n')

  const prompt = EXECUTE_PLAN_PREAMBLE.replace('{PLAN_STEPS}', stepsText)
  return `${prompt}${DESIGN_GENERATOR_PROMPT}`
}
