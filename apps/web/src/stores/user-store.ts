import { create } from 'zustand'

export interface User {
  id: string
  username: string
  name: string
  color: string
}

interface UserStoreState {
  user: User | null
  isLoading: boolean
  isHydrated: boolean

  hydrate: () => Promise<void>
  login: (username: string, password: string) => Promise<User>
  register: (username: string, password: string, name: string) => Promise<User>
  logout: () => Promise<void>
  updateName: (name: string) => Promise<void>
}

export const useUserStore = create<UserStoreState>((set) => ({
  user: null,
  isLoading: false,
  isHydrated: false,

  hydrate: async () => {
    set({ isLoading: true })
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        set({ user: data.user ?? null })
      }
    } catch {
      // offline
    } finally {
      set({ isLoading: false, isHydrated: true })
    }
  },

  login: async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.statusMessage || 'Login failed')
    }
    const data = await res.json()
    set({ user: data.user })
    return data.user
  },

  register: async (username, password, name) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.statusMessage || 'Registration failed')
    }
    const data = await res.json()
    set({ user: data.user })
    return data.user
  },

  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    set({ user: null })
  },

  updateName: async (name) => {
    const res = await fetch('/api/auth/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const data = await res.json()
      set({ user: data.user })
    }
  },
}))
