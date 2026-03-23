import { useEffect, useRef } from 'react'
import { useCollabStore } from '@/stores/collab-store'
import { startCollabCapture, type CollabOperation } from '@/stores/collab-middleware'
import { applyCollabOperations } from '@/stores/collab-apply'

const OP_FLUSH_MS = 50
const CURSOR_INTERVAL_MS = 100
const RECONNECT_DELAY_MS = 3000

/**
 * Hook that manages real-time collaboration for a document.
 * Connects via SSE to receive remote changes and sends local changes via POST.
 */
export function useCollab(docId: string | null) {
  const opBufferRef = useRef<CollabOperation[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!docId) return

    let disposed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (disposed) return

      const es = new EventSource(`/api/collab/events?doc=${docId}`)
      eventSourceRef.current = es
      useCollabStore.getState().setConnected(true)

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const store = useCollabStore.getState()

          switch (data.type) {
            case 'client:id':
              store.setClientId(data.clientId)
              break
            case 'presence:init':
              store.initPeers(data.peers)
              break
            case 'presence:join':
              store.addPeer(data.user)
              break
            case 'presence:leave':
              store.removePeer(data.userId)
              break
            case 'operations':
              applyCollabOperations(data.operations)
              break
            case 'cursor:move':
              store.updatePeerCursor(data.userId, {
                x: data.x,
                y: data.y,
                pageId: data.pageId,
              })
              break
          }
        } catch {
          // Ignore parse errors (heartbeats, etc.)
        }
      }

      es.onerror = () => {
        es.close()
        useCollabStore.getState().setConnected(false)
        if (!disposed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }
    }

    connect()

    // Operation capture — diff local changes and batch-send
    const unsub = startCollabCapture((ops) => {
      opBufferRef.current.push(...ops)
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushOps, OP_FLUSH_MS)
      }
    })

    function flushOps() {
      flushTimerRef.current = null
      const ops = opBufferRef.current
      if (ops.length === 0) return
      opBufferRef.current = []

      const clientId = useCollabStore.getState().clientId
      fetch('/api/collab/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, clientId, operations: ops }),
      }).catch(() => {})
    }

    // Cursor broadcast — only when cursor actually moves (throttled)
    let lastCursorJson = ''
    let cursorThrottleTimer: ReturnType<typeof setTimeout> | null = null
    const unsubCursor = useCollabStore.subscribe((state) => {
      if (!state.localCursor || !state.clientId) return
      const json = `${state.localCursor.x},${state.localCursor.y},${state.localCursor.pageId}`
      if (json === lastCursorJson) return
      lastCursorJson = json

      if (cursorThrottleTimer) return // already scheduled
      cursorThrottleTimer = setTimeout(() => {
        cursorThrottleTimer = null
        const { localCursor, clientId } = useCollabStore.getState()
        if (!localCursor || !clientId) return
        fetch('/api/collab/cursor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: docId,
            clientId,
            x: localCursor.x,
            y: localCursor.y,
            pageId: localCursor.pageId,
          }),
        }).catch(() => {})
      }, CURSOR_INTERVAL_MS)
    })

    return () => {
      disposed = true
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      unsub()
      unsubCursor()
      if (cursorThrottleTimer) clearTimeout(cursorThrottleTimer)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      useCollabStore.getState().reset()
    }
  }, [docId])
}
