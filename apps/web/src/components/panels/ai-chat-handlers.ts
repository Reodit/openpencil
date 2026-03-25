import { useState, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { useAIStore } from '@/stores/ai-store'
import { useCanvasStore } from '@/stores/canvas-store'
import { useDocumentStore } from '@/stores/document-store'
import { useDesignMdStore } from '@/stores/design-md-store'
import { streamChat } from '@/services/ai/ai-service'
import { buildAgentSystemPrompt } from '@/services/ai/agent-prompt'
import {
  animateNodesToCanvas,
  extractAndApplyDesignModification,
} from '@/services/ai/design-generator'
import { trimChatHistory } from '@/services/ai/context-optimizer'
import type { ChatMessage as ChatMessageType } from '@/services/ai/ai-types'

/**
 * Build canvas context string for the agent.
 * Provides the agent with current document state so it can make informed decisions.
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

      // Build context
      const context = buildContextString()
      const fullUserMessage = messageText + context

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

      // Build chat history
      const chatHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
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

      const abortController = new AbortController()
      useAIStore.getState().setAbortController(abortController)

      try {
        // Build agent system prompt (auto-detects needed sections)
        const designMd = useDesignMdStore.getState().designMd
        const agentPrompt = buildAgentSystemPrompt(messageText, designMd)

        // Trim history to prevent context overflow
        const trimmedHistory = trimChatHistory(chatHistory)

        // Single streaming call — agent decides what to do
        for await (const chunk of streamChat(
          agentPrompt,
          trimmedHistory,
          model,
          {
            thinkingMode: 'enabled',
            effort: 'medium',
            maxTurns: 15,
            firstTextTimeoutMs: 180_000,
            hardTimeoutMs: 600_000,
          },
          currentProvider,
          abortController.signal,
        )) {
          if (chunk.type === 'thinking') {
            thinkingContent += chunk.content
            const thinkingStep = `<step title="Thinking">${thinkingContent}</step>`
            updateLastMessage(thinkingStep + (accumulated ? '\n' + accumulated : ''))
          } else if (chunk.type === 'text') {
            accumulated += chunk.content
            const thinkingPrefix = thinkingContent
              ? `<step title="Thinking">${thinkingContent}</step>\n`
              : ''
            updateLastMessage(thinkingPrefix + accumulated)
          } else if (chunk.type === 'error') {
            accumulated += `\n\n**Error:** ${chunk.content}`
            updateLastMessage(accumulated)
          }
        }

        // After streaming complete — try to apply any design JSON from the response
        appliedCount = tryApplyDesignFromResponse(accumulated)

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

function tryApplyJsonBlock(block: string): number {
  try {
    // Try as JSONL (flat format with _parent)
    const lines = block.split('\n').filter(l => l.trim().startsWith('{'))
    if (lines.length > 1 && lines[0].includes('"_parent"')) {
      const nodes = lines.map(l => JSON.parse(l))
      if (nodes.length > 0) {
        animateNodesToCanvas(nodes)
        return nodes.length
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
