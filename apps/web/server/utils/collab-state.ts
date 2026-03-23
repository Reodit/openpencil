/**
 * In-memory collaboration state for real-time document editing.
 * Manages per-document rooms with connected clients, cursor positions,
 * and operation broadcast via SSE.
 */

import type { ServerResponse } from 'node:http'

export interface CollabClient {
  id: string           // connection UUID
  userId: string       // user.id from session
  userName: string
  userColor: string
  documentId: string
  res: ServerResponse
}

export interface CollabOperation {
  type: string
  [key: string]: unknown
}

interface DocumentRoom {
  documentId: string
  clients: Map<string, CollabClient>
  version: number
}

const rooms = new Map<string, DocumentRoom>()

function getOrCreateRoom(documentId: string): DocumentRoom {
  let room = rooms.get(documentId)
  if (!room) {
    room = { documentId, clients: new Map(), version: 0 }
    rooms.set(documentId, room)
  }
  return room
}

export function joinRoom(client: CollabClient): void {
  const room = getOrCreateRoom(client.documentId)
  room.clients.set(client.id, client)

  // Notify others that someone joined
  broadcastToRoom(client.documentId, {
    type: 'presence:join',
    user: { userId: client.userId, name: client.userName, color: client.userColor },
  }, client.id)
}

export function leaveRoom(documentId: string, clientId: string): void {
  const room = rooms.get(documentId)
  if (!room) return

  const client = room.clients.get(clientId)
  room.clients.delete(clientId)

  // Notify others that someone left
  if (client) {
    broadcastToRoom(documentId, {
      type: 'presence:leave',
      userId: client.userId,
    }, clientId)
  }

  // Cleanup empty rooms
  if (room.clients.size === 0) {
    rooms.delete(documentId)
  }
}

export function broadcastOperations(
  documentId: string,
  operations: CollabOperation[],
  excludeClientId?: string,
): number {
  const room = getOrCreateRoom(documentId)
  room.version++
  broadcastToRoom(documentId, {
    type: 'operations',
    operations,
    version: room.version,
  }, excludeClientId)
  return room.version
}

export function broadcastCursor(
  documentId: string,
  userId: string,
  cursor: { x: number; y: number; pageId: string },
  excludeClientId?: string,
): void {
  broadcastToRoom(documentId, {
    type: 'cursor:move',
    userId,
    ...cursor,
  }, excludeClientId)
}

export function getRoomPeers(documentId: string): Array<{ userId: string; name: string; color: string }> {
  const room = rooms.get(documentId)
  if (!room) return []
  const seen = new Set<string>()
  const peers: Array<{ userId: string; name: string; color: string }> = []
  for (const client of room.clients.values()) {
    if (seen.has(client.userId)) continue
    seen.add(client.userId)
    peers.push({ userId: client.userId, name: client.userName, color: client.userColor })
  }
  return peers
}

export function getRoomVersion(documentId: string): number {
  return rooms.get(documentId)?.version ?? 0
}

export function broadcastToRoomRaw(
  documentId: string,
  payload: Record<string, unknown>,
  excludeClientId?: string,
): void {
  broadcastToRoom(documentId, payload, excludeClientId)
}

function broadcastToRoom(
  documentId: string,
  payload: Record<string, unknown>,
  excludeClientId?: string,
): void {
  const room = rooms.get(documentId)
  if (!room) return
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const [id, client] of room.clients) {
    if (id === excludeClientId) continue
    try {
      if (!client.res.closed) client.res.write(data)
    } catch {
      room.clients.delete(id)
    }
  }
}
