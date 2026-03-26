import { useState, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { useAIStore } from '@/stores/ai-store'
import { useCanvasStore } from '@/stores/canvas-store'
import { useDocumentStore } from '@/stores/document-store'
import { useDesignMdStore } from '@/stores/design-md-store'
import { streamChat, generateCompletion } from '@/services/ai/ai-service'
import {
  buildGeneratePrompt, buildModifyPrompt, buildChatPrompt,
  buildPlanSystemPrompt, buildExecutePlanSystemPrompt,
  getDecisionPrompt,
  type AgentMode,
} from '@/services/ai/agent-prompt'
import {
  animateNodesToCanvas,
  extractAndApplyDesignModification,
} from '@/services/ai/design-generator'
import {
  insertStreamingNode,
  resetGenerationRemapping,
} from '@/services/ai/design-canvas-ops'
import { trimChatHistory } from '@/services/ai/context-optimizer'
import type { ChatMessage as ChatMessageType } from '@/services/ai/ai-types'

/**
 * Build canvas context string for decision routing.
 * Lightweight summary for the decision LLM call.
 */
export function buildContextString(): string {
  const selectedIds = useCanvasStore.getState().selection.selectedIds
  const { getFlatNodes, document: doc } = useDocumentStore.getState()
  const flatNodes = getFlatNodes()

  const parts: string[] = []

  if (flatNodes.length > 0) {
    const summary = flatNodes
      .slice(0, 20)
      .map((n) => `${n.type}:${n.name ?? n.id}`)
      .join(', ')
    parts.push(`Document has ${flatNodes.length} nodes: ${summary}`)
  }

  if (selectedIds.length > 0) {
    const selectedNodes = selectedIds
      .map((id) => useDocumentStore.getState().getNodeById(id))
      .filter(Boolean)
    const selectedSummary = selectedNodes
      .map((n) => {
        const dims = 'width' in n! && 'height' in n!
          ? ` (${n!.width}x${n!.height})`
          : ''
        return `${n!.type}:${n!.name ?? n!.id}${dims}`
      })
      .join(', ')
    parts.push(`Selected: ${selectedSummary}`)
  }

  if (doc.variables && Object.keys(doc.variables).length > 0) {
    const varNames = Object.entries(doc.variables)
      .map(([n, d]) => `$${n}(${d.type})`)
      .join(', ')
    parts.push(`Variables: ${varNames}`)
  }

  return parts.length > 0 ? `\n\n[Canvas context: ${parts.join('. ')}]` : ''
}

/**
 * Build full context for MODIFY mode.
 * Includes selected nodes as full JSON tree for the modifier prompt.
 */
function buildModifyContext(): string {
  const selectedIds = useCanvasStore.getState().selection.selectedIds
  if (selectedIds.length === 0) return ''

  const selectedNodes = selectedIds
    .map((id) => useDocumentStore.getState().getNodeById(id))
    .filter(Boolean)

  if (selectedNodes.length === 0) return ''

  const json = JSON.stringify(selectedNodes, null, 2)
  // Limit to ~8000 chars to avoid context overflow
  const truncated = json.length > 8000 ? json.slice(0, 8000) + '\n... (truncated)' : json
  return `\n\nCONTEXT NODES:\n${truncated}`
}

/**
 * Decision call — route to generate/modify/chat.
 */
async function decideMode(
  messageText: string,
  contextString: string,
  model: string,
  provider?: string,
): Promise<AgentMode> {
  try {
    const response = await generateCompletion(
      getDecisionPrompt(),
      messageText + contextString,
      model,
      provider,
    )
    const trimmed = response.trim()
    // Parse JSON from response
    const jsonMatch = trimmed.match(/\{[^}]+\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const mode = parsed.mode
      if (mode === 'generate' || mode === 'modify' || mode === 'chat') {
        console.log(`[Decision] mode=${mode}, reason=${parsed.reason ?? ''}`)
        return mode
      }
    }
    // Fallback
    console.log(`[Decision] Could not parse: ${trimmed.slice(0, 100)}, defaulting to generate`)
    return 'generate'
  } catch (e) {
    console.log(`[Decision] Error: ${e}, defaulting to generate`)
    return 'generate'
  }
}

/** Try to parse tool input JSON and format key fields for display */
function tryFormatToolInput(raw: string): string {
  if (!raw.trim()) return ''
  try {
    const obj = JSON.parse(raw)
    const parts: string[] = []
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.length > 0) {
        parts.push(`${k}: ${v.length > 80 ? v.slice(0, 80) + '...' : v}`)
      }
    }
    return parts.join('\n')
  } catch {
    // Partial JSON — show raw (truncated)
    return raw.length > 100 ? raw.slice(0, 100) + '...' : raw
  }
}

const PLATFORM_HINTS: Record<string, string> = {
  iphone: '\n[Platform: iPhone — root frame 393×852, mobile UI]',
  android: '\n[Platform: Android — root frame 360×800, mobile UI]',
  ipad: '\n[Platform: iPad — root frame 1024×1366, tablet UI]',
  desktop: '\n[Platform: Desktop — root frame 1440×900, desktop UI]',
  web: '\n[Platform: Web — root frame 1200×auto, responsive web page]',
  component: '\n[Platform: Component — auto-sized, standalone component]',
}

function getPlatformHint(platform: string): string {
  return PLATFORM_HINTS[platform] ?? ''
}

/**
 * Clean message content for chat history.
 * Replace large JSON blocks with summaries, strip internal markers.
 */
function cleanMessageForHistory(content: string, role: string): string {
  let cleaned = content

  // Strip <!-- APPLIED --> marker
  cleaned = cleaned.replace(/<!-- APPLIED -->/g, '')

  // Strip <step> tags (thinking content)
  cleaned = cleaned.replace(/<step[^>]*>[\s\S]*?<\/step>/g, '')

  // Replace ```json blocks with summary (keep the conversation context, not raw JSON)
  cleaned = cleaned.replace(/```json\s*\n[\s\S]*?```/g, (match) => {
    const lineCount = match.split('\n').length - 2
    return `[Design JSON: ${lineCount} nodes generated]`
  })

  // Replace <plan> blocks with summary
  cleaned = cleaned.replace(/<plan>[\s\S]*?<\/plan>/g, '[Design plan created]')

  // Collapse excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()

  return cleaned
}

/**
 * Unified agent chat handler.
 *
 * No classification step — the agent decides autonomously what to do:
 * create designs, modify nodes, generate code, or answer questions.
 *
 * The agent uses its built-in tools (Read, Bash, WebSearch, etc.)
 * and outputs PenNode JSON when design work is needed.
 */
export function useChatHandlers() {
  const [input, setInput] = useState('')
  const messages = useAIStore((s) => s.messages)
  const isStreaming = useAIStore((s) => s.isStreaming)
  const model = useAIStore((s) => s.model)
  const availableModels = useAIStore((s) => s.availableModels)
  const isLoadingModels = useAIStore((s) => s.isLoadingModels)
  const addMessage = useAIStore((s) => s.addMessage)
  const updateLastMessage = useAIStore((s) => s.updateLastMessage)
  const setStreaming = useAIStore((s) => s.setStreaming)

  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = text ?? input.trim()
      const pendingAttachments = useAIStore.getState().pendingAttachments
      const hasAttachments = pendingAttachments.length > 0
      if ((!messageText && !hasAttachments) || isStreaming || isLoadingModels || availableModels.length === 0) return

      setInput('')
      useAIStore.getState().clearPendingAttachments()

      // Build context with platform preset
      const context = buildContextString()
      const designPlatform = useAIStore.getState().designPlatform
      const platformHint = designPlatform ? getPlatformHint(designPlatform) : ''
      const fullUserMessage = messageText + platformHint + context

      // Add user message
      const userMsg: ChatMessageType = {
        id: nanoid(),
        role: 'user',
        content: messageText || '',
        timestamp: Date.now(),
        ...(hasAttachments ? { attachments: pendingAttachments } : {}),
      }
      addMessage(userMsg)

      // Add empty assistant message for streaming
      const assistantMsg: ChatMessageType = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      }
      addMessage(assistantMsg)
      setStreaming(true)

      // Set chat title from first message
      if (messages.length === 0) {
        const cleanText = messageText.replace(/^(Design|Create|Generate|Make)\s+/i, '')
        const words = cleanText.split(' ').slice(0, 4).join(' ')
        const title = words.length > 30 ? words.slice(0, 30) + '...' : words
        useAIStore.getState().setChatTitle(title || 'New Chat')
      }

      // Build chat history — clean up design JSON and internal markers
      // to keep context focused on the conversation
      const chatHistory = messages.map((m) => ({
        role: m.role,
        content: cleanMessageForHistory(m.content, m.role),
        ...(m.attachments?.length ? { attachments: m.attachments } : {}),
      }))
      chatHistory.push({
        role: 'user',
        content: fullUserMessage,
        ...(hasAttachments ? { attachments: pendingAttachments } : {}),
      })

      const currentProvider = useAIStore.getState().modelGroups.find((g) =>
        g.models.some((m) => m.value === model),
      )?.provider

      let accumulated = ''
      let thinkingContent = ''
      let appliedCount = 0
      let lastProcessedLength = 0
      let generationStarted = false
      let currentToolName = ''
      let currentToolInput = ''

      const abortController = new AbortController()
      useAIStore.getState().setAbortController(abortController)

      try {
        const designMd = useDesignMdStore.getState().designMd
        const planMode = useAIStore.getState().planMode
        const existingPlan = useAIStore.getState().pendingPlan
        const planStatus = useAIStore.getState().planStatus

        // Route to correct prompt based on plan state or decision
        let agentPrompt: string
        let userMessageForLLM = fullUserMessage

        if (planStatus === 'executing' && existingPlan) {
          // Execute approved plan
          agentPrompt = buildExecutePlanSystemPrompt(existingPlan)
        } else if (planStatus === 'idle' && planMode && !existingPlan) {
          // Create a plan first
          agentPrompt = buildPlanSystemPrompt()
          useAIStore.getState().setPlanStatus('planning')
        } else {
          // Reset plan status if answering questions
          if (planStatus === 'awaiting') {
            useAIStore.getState().setPlanStatus('idle')
          }

          // Decision call — route to generate/modify/chat
          const mode = await decideMode(messageText, context, model, currentProvider)

          if (mode === 'modify') {
            agentPrompt = buildModifyPrompt()
            // Append full selected nodes JSON for modification
            userMessageForLLM = fullUserMessage + buildModifyContext()
          } else if (mode === 'chat') {
            agentPrompt = buildChatPrompt()
          } else {
            agentPrompt = buildGeneratePrompt()
          }
        }

        // Update last user message with mode-specific context (e.g., CONTEXT NODES for modify)
        if (chatHistory.length > 0) {
          const last = chatHistory[chatHistory.length - 1]
          if (last.role === 'user') {
            last.content = userMessageForLLM
          }
        }

        // Trim history to prevent context overflow
        const trimmedHistory = trimChatHistory(chatHistory)

        // Get existing session ID for conversation continuity
        const currentSessionId = useAIStore.getState().sessionId ?? undefined

        // Single streaming call — agent decides what to do
        for await (const chunk of streamChat(
          agentPrompt,
          trimmedHistory,
          model,
          {
            thinkingMode: useAIStore.getState().thinkingEnabled ? 'enabled' : 'disabled',
            effort: 'medium',
            maxTurns: 15,
            firstTextTimeoutMs: 180_000,
            hardTimeoutMs: 600_000,
            sessionId: currentSessionId,
          },
          currentProvider,
          abortController.signal,
        )) {
          if (chunk.type === 'session_id') {
            useAIStore.getState().setSessionId(chunk.content)
          } else if (chunk.type === 'tool_use') {
            // Flush previous tool step if exists
            if (currentToolName) {
              const input = tryFormatToolInput(currentToolInput)
              accumulated += `\n<step title="Tool: ${currentToolName}">${input}</step>\n`
            }
            currentToolName = chunk.content
            currentToolInput = ''
            updateLastMessage(accumulated + `\n<step title="Tool: ${currentToolName}" status="streaming"></step>\n`)
          } else if (chunk.type === 'tool_input') {
            currentToolInput += chunk.content
            const input = tryFormatToolInput(currentToolInput)
            updateLastMessage(accumulated + `\n<step title="Tool: ${currentToolName}" status="streaming">${input}</step>\n`)
          } else if (chunk.type === 'thinking') {
            thinkingContent += chunk.content
            const thinkingStep = `<step title="Thinking">${thinkingContent}</step>`
            updateLastMessage(thinkingStep + (accumulated ? '\n' + accumulated : ''))
          } else if (chunk.type === 'text') {
            // Flush pending tool step when text starts
            if (currentToolName) {
              const input = tryFormatToolInput(currentToolInput)
              accumulated += `\n<step title="Tool: ${currentToolName}">${input}</step>\n`
              currentToolName = ''
              currentToolInput = ''
            }
            accumulated += chunk.content

            // Real-time JSONL extraction: scan accumulated text for complete lines
            // inside ```json blocks and insert nodes as they arrive
            const result = extractAndInsertStreamingNodes(
              accumulated, lastProcessedLength, generationStarted, appliedCount,
            )
            lastProcessedLength = result.processedUpTo
            appliedCount = result.totalApplied
            generationStarted = result.generationStarted

            const thinkingPrefix = thinkingContent
              ? `<step title="Thinking">${thinkingContent}</step>\n`
              : ''
            updateLastMessage(thinkingPrefix + accumulated)
          } else if (chunk.type === 'error') {
            accumulated += `\n\n**Error:** ${chunk.content}`
            updateLastMessage(accumulated)
          }
        }

        // After streaming — check if this was a plan response
        const currentPlanStatus = useAIStore.getState().planStatus
        if (currentPlanStatus === 'planning') {
          // Parse plan from response and store it
          const planMatch = accumulated.match(/<plan>([\s\S]*?)<\/plan>/)
          if (planMatch) {
            const steps: import('@/services/ai/ai-types').PlanStep[] = []
            const stepRegex = /<step\s+id="([^"]*)"\s+title="([^"]*)">([\s\S]*?)<\/step>/g
            let m
            while ((m = stepRegex.exec(planMatch[1])) !== null) {
              steps.push({ id: m[1], title: m[2], description: m[3].trim() || undefined, status: 'pending' })
            }
            if (steps.length > 0) {
              useAIStore.getState().setPendingPlan(steps)
              useAIStore.getState().setPlanStatus('awaiting')
            }
          }
        } else if (currentPlanStatus === 'executing') {
          // Plan execution complete
          useAIStore.getState().setPlanStatus('done')
        }

        // Apply any remaining design JSON not caught during streaming
        console.log(`[Design] Stream done. accumulated=${accumulated.length}ch, applied=${appliedCount}, hasJson=${accumulated.includes('\`\`\`json')}`)
        console.log(`[Design] First 300ch: ${accumulated.slice(0, 300)}`)
        if (appliedCount === 0) {
          console.log(`[Design] No streaming inserts, trying fallback.`)
          appliedCount = tryApplyDesignFromResponse(accumulated)
          console.log(`[Design] Fallback applied: ${appliedCount}`)
        } else {
          console.log(`[Design] Streaming inserted ${appliedCount} nodes`)
        }

      } catch (error) {
        if (!abortController.signal.aborted) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error'
          accumulated += `\n\n**Error:** ${errMsg}`
          updateLastMessage(accumulated)
        }
      } finally {
        useAIStore.getState().setAbortController(null)
        setStreaming(false)
      }

      // Mark as applied if design was generated
      if (appliedCount > 0) {
        accumulated += `\n\n<!-- APPLIED -->`
      }

      // Force update last message
      useAIStore.setState((s) => {
        const msgs = [...s.messages]
        const last = msgs.find(m => m.id === assistantMsg.id)
        if (last) {
          last.content = accumulated
          last.isStreaming = false
        }
        return { messages: msgs }
      })
    },
    [input, isStreaming, isLoadingModels, model, availableModels, messages, addMessage, updateLastMessage, setStreaming],
  )

  return { input, setInput, handleSend, isStreaming }
}

/**
 * Try to extract and apply PenNode JSON from agent response.
 * Returns the number of nodes applied.
 */
/**
 * Scan accumulated text for complete JSONL lines inside ```json blocks.
 * Insert nodes to canvas in real-time as they stream in.
 */
function extractAndInsertStreamingNodes(
  accumulated: string,
  processedUpTo: number,
  generationStarted: boolean,
  totalApplied: number,
): { processedUpTo: number; totalApplied: number; generationStarted: boolean } {
  // Find ```json block boundaries in the accumulated text
  // Handle both ```json\n and ```json\r\n
  let jsonStart = accumulated.indexOf('```json\n')
  if (jsonStart < 0) jsonStart = accumulated.indexOf('```json\r\n')
  if (jsonStart < 0) return { processedUpTo, totalApplied, generationStarted }

  const markerEnd = accumulated.indexOf('\n', jsonStart + 3)
  const contentStart = markerEnd >= 0 ? markerEnd + 1 : jsonStart + 8
  // Find closing ``` (must be on its own or after newline)
  const jsonEnd = accumulated.indexOf('\n```', contentStart)

  // Determine the range to scan for new lines
  const scanFrom = Math.max(contentStart, processedUpTo)
  const scanTo = jsonEnd > 0 ? jsonEnd : accumulated.length

  if (scanFrom >= scanTo) return { processedUpTo: scanFrom, totalApplied, generationStarted }

  const newContent = accumulated.slice(scanFrom, scanTo)
  const lines = newContent.split('\n')

  // Don't process the last line unless the block is closed (it may be incomplete)
  const linesToProcess = jsonEnd > 0 ? lines : lines.slice(0, -1)

  for (const line of linesToProcess) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('{')) continue
    try {
      const node = JSON.parse(trimmed)
      if (node.type && node.id) {
        if (!generationStarted) {
          resetGenerationRemapping()
          generationStarted = true
        }
        const parentId = node._parent ?? null
        delete node._parent
        console.log(`[StreamInsert] ${node.type}:${node.name ?? node.id} parent=${parentId}`)
        insertStreamingNode(node, parentId)
        totalApplied++
      }
    } catch {
      // Incomplete JSON line — will be retried next chunk
    }
  }

  // Update processedUpTo to avoid re-processing
  const lastNewline = accumulated.lastIndexOf('\n', scanTo - 1)
  const newProcessedUpTo = jsonEnd > 0 ? jsonEnd : (lastNewline > scanFrom ? lastNewline + 1 : scanFrom)

  return { processedUpTo: newProcessedUpTo, totalApplied, generationStarted }
}

function tryApplyDesignFromResponse(response: string): number {
  const jsonBlocks = extractJsonBlocks(response)
  let totalApplied = 0

  for (const block of jsonBlocks) {
    const count = tryApplyJsonBlock(block)
    totalApplied += count
  }

  // Fallback: if no ```json blocks found, try to find raw JSON in the response
  if (totalApplied === 0) {
    const rawJson = extractRawJson(response)
    if (rawJson) {
      totalApplied += tryApplyJsonBlock(rawJson)
    }
  }

  return totalApplied
}

/** Convert flat JSONL nodes with _parent fields into a tree structure with children */
function flatToTree(flatNodes: Array<Record<string, unknown>>): import('@/types/pen').PenNode[] {
  const nodeMap = new Map<string, Record<string, unknown>>()
  const roots: Record<string, unknown>[] = []

  // Index all nodes
  for (const node of flatNodes) {
    nodeMap.set(node.id as string, { ...node })
  }

  // Build tree
  for (const node of flatNodes) {
    const parentId = node._parent as string | null
    const current = nodeMap.get(node.id as string)!
    delete current._parent

    if (!parentId) {
      roots.push(current)
    } else {
      const parent = nodeMap.get(parentId)
      if (parent) {
        if (!Array.isArray(parent.children)) parent.children = []
        ;(parent.children as unknown[]).push(current)
      } else {
        roots.push(current) // orphan → treat as root
      }
    }
  }

  return roots as import('@/types/pen').PenNode[]
}

function tryApplyJsonBlock(block: string): number {
  try {
    // Try as JSONL (flat format with _parent)
    const lines = block.split('\n').filter(l => l.trim().startsWith('{'))
    if (lines.length > 1 && lines[0].includes('"_parent"')) {
      const flatNodes = lines.map(l => JSON.parse(l))
      if (flatNodes.length > 0) {
        const tree = flatToTree(flatNodes)
        animateNodesToCanvas(tree)
        return flatNodes.length
      }
    }

    const parsed = JSON.parse(block)

    // JSON array of nodes
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
      const count = extractAndApplyDesignModification(block)
      return count
    }

    // Single node object (wrap in array)
    if (parsed && typeof parsed === 'object' && parsed.type && !Array.isArray(parsed)) {
      const wrapped = JSON.stringify([parsed])
      const count = extractAndApplyDesignModification(wrapped)
      return count
    }
  } catch {
    // Not valid JSON
  }
  return 0
}

/** Extract all ```json code blocks from text */
function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = []
  const regex = /```json\s*\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim())
  }
  return blocks
}

/** Try to find raw JSON (no code fences) in the response */
function extractRawJson(text: string): string | null {
  // Find first { that looks like a PenNode
  const start = text.indexOf('{\n')
  if (start < 0) return null

  // Find matching closing }
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        const candidate = text.slice(start, i + 1)
        try {
          const parsed = JSON.parse(candidate)
          if (parsed.type) return candidate
        } catch { /* continue */ }
      }
    }
  }
  return null
}
