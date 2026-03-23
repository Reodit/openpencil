import { create } from 'zustand'

export interface PeerUser {
  userId: string
  name: string
  color: string
  cursor: { x: number; y: number; pageId: string } | null
  selectedIds: string[]
}

interface CollabStoreState {
  isConnected: boolean
  clientId: string | null
  peers: Map<string, PeerUser>
  localCursor: { x: number; y: number; pageId: string } | null

  setConnected: (v: boolean) => void
  setClientId: (id: string) => void
  initPeers: (peers: Array<{ userId: string; name: string; color: string }>) => void
  addPeer: (user: { userId: string; name: string; color: string }) => void
  removePeer: (userId: string) => void
  updatePeerCursor: (userId: string, cursor: { x: number; y: number; pageId: string }) => void
  updatePeerSelection: (userId: string, selectedIds: string[]) => void
  setLocalCursor: (cursor: { x: number; y: number; pageId: string }) => void
  reset: () => void
}

export const useCollabStore = create<CollabStoreState>((set) => ({
  isConnected: false,
  clientId: null,
  peers: new Map(),
  localCursor: null,

  setConnected: (v) => set({ isConnected: v }),
  setClientId: (id) => set({ clientId: id }),

  initPeers: (peers) => {
    const map = new Map<string, PeerUser>()
    for (const p of peers) {
      map.set(p.userId, { ...p, cursor: null, selectedIds: [] })
    }
    set({ peers: map })
  },

  addPeer: (user) => set((s) => {
    const peers = new Map(s.peers)
    peers.set(user.userId, { ...user, cursor: null, selectedIds: [] })
    return { peers }
  }),

  removePeer: (userId) => set((s) => {
    const peers = new Map(s.peers)
    peers.delete(userId)
    return { peers }
  }),

  updatePeerCursor: (userId, cursor) => set((s) => {
    const peers = new Map(s.peers)
    const existing = peers.get(userId)
    if (existing) {
      peers.set(userId, { ...existing, cursor })
    }
    return { peers }
  }),

  updatePeerSelection: (userId, selectedIds) => set((s) => {
    const peers = new Map(s.peers)
    const existing = peers.get(userId)
    if (existing) {
      peers.set(userId, { ...existing, selectedIds })
    }
    return { peers }
  }),

  setLocalCursor: (cursor) => set({ localCursor: cursor }),

  reset: () => set({
    isConnected: false,
    clientId: null,
    peers: new Map(),
    localCursor: null,
  }),
}))
