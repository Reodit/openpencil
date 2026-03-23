import { create } from 'zustand'

export interface User {
  id: string
  name: string
  color: string
}

interface UserStoreState {
  user: User | null
  isLoading: boolean
  isHydrated: boolean

  hydrate: () => Promise<void>
  login: (name: string) => Promise<User>
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
      // offline or server error
    } finally {
      set({ isLoading: false, isHydrated: true })
    }
  },

  login: async (name) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error('Login failed')
    const data = await res.json()
    set({ user: data.user })
    return data.user
  },

  updateName: async (name) => {
    const res = await fetch('/api/auth/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error('Update failed')
    const data = await res.json()
    set({ user: data.user })
  },
}))
