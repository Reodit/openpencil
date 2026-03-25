import { DESIGN_GENERATOR_PROMPT } from './ai-prompts'
import type { DesignMdSpec } from '@/types/design-md'
import type { PlanStep } from './ai-types'

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

const PLAN_PREAMBLE = `You are an AI design agent for OpenPencil. The user wants you to CREATE A PLAN first before executing.

DO NOT generate any PenNode JSON yet. Instead, analyze the request and output a plan using <plan> tags.

OUTPUT FORMAT:
<plan>
<step id="step-1" title="Section name">Brief description of what will be created</step>
<step id="step-2" title="Section name">Brief description</step>
...
</plan>

After the plan, add a 1-2 sentence summary asking the user to approve.

PLAN GUIDELINES:
- Each step = one major section/component of the design
- Keep titles short (2-4 words): "Navigation Bar", "Hero Section", "Login Form"
- Descriptions should mention key elements: "Logo, nav links, CTA button"
- Order steps top-to-bottom as they appear in the design
- Typically 3-8 steps for a full page, 1-3 for simple components
- Include sizing info when relevant: "Mobile 390x844" or "Card 320px"

EXAMPLE:
User: "Design a mobile login screen"

<plan>
<step id="step-1" title="Screen Frame">Mobile root frame 390x844, light background</step>
<step id="step-2" title="Logo & Welcome">App logo, welcome heading, subtitle text</step>
<step id="step-3" title="Login Form">Email input, password input with labels</step>
<step id="step-4" title="Login Button">Primary CTA button, full width</step>
<step id="step-5" title="Social Login">Divider with "or", Google/Apple sign-in buttons</step>
<step id="step-6" title="Footer Link">Sign up link at bottom</step>
</plan>

Here's my plan for your mobile login screen. Shall I proceed?

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
