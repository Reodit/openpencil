import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  getAllUserFonts,
  addUserFont,
  removeUserFont as removeFromDB,
  type StoredFont,
} from '@/utils/font-db'
import { parseFontFamilyName, familyNameFromFilename } from '@/utils/font-parser'
import {
  searchGoogleFonts as searchGF,
  downloadGoogleFont,
  type GoogleFontMeta,
} from '@/services/google-fonts-api'

export interface UserFont {
  id: string
  family: string
  source: 'google' | 'custom'
  weights: number[]
  addedAt: number
  isLoaded: boolean
}

interface FontStoreState {
  userFonts: UserFont[]
  isHydrated: boolean
  searchQuery: string
  searchResults: GoogleFontMeta[]
  isSearching: boolean
  dialogOpen: boolean

  hydrate: () => Promise<void>
  addGoogleFont: (family: string, weights?: number[]) => Promise<void>
  addCustomFont: (file: File) => Promise<void>
  removeFont: (id: string) => Promise<void>
  searchGoogleFonts: (query: string) => Promise<void>
  setDialogOpen: (open: boolean) => void
  registerAllWithEngine: () => Promise<void>
}

/**
 * Reference to the SkiaFontManager — set once the engine initializes.
 * This avoids a circular dependency with the canvas module.
 */
let fontManagerRef: {
  registerFont: (data: ArrayBuffer, familyName: string) => boolean
  clearFailedFamily: (family: string) => void
  ensureFont: (family: string, weights?: number[]) => Promise<boolean>
} | null = null

export function setFontManagerRef(ref: typeof fontManagerRef) {
  fontManagerRef = ref
}

export const useFontStore = create<FontStoreState>((set, get) => ({
  userFonts: [],
  isHydrated: false,
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  dialogOpen: false,

  setDialogOpen: (open) => set({ dialogOpen: open }),

  hydrate: async () => {
    try {
      const stored = await getAllUserFonts()
      const fonts: UserFont[] = stored.map((s) => ({
        id: s.id,
        family: s.family,
        source: s.source,
        weights: s.weights,
        addedAt: s.addedAt,
        isLoaded: false,
      }))

      // Register each stored font with the engine
      for (const stored_ of stored) {
        if (!fontManagerRef) break
        for (const file of stored_.files) {
          fontManagerRef.registerFont(file.data, stored_.family)
        }
        const idx = fonts.findIndex((f) => f.id === stored_.id)
        if (idx >= 0) fonts[idx].isLoaded = true
      }

      set({ userFonts: fonts, isHydrated: true })
    } catch (e) {
      console.warn('[FontStore] hydrate failed:', e)
      set({ isHydrated: true })
    }
  },

  addGoogleFont: async (family, weights = [400, 700]) => {
    const { userFonts } = get()
    if (userFonts.some((f) => f.family.toLowerCase() === family.toLowerCase())) return

    // Register with engine immediately via ensureFont (uses Google Fonts CDN)
    if (fontManagerRef) {
      fontManagerRef.clearFailedFamily(family)
      await fontManagerRef.ensureFont(family, weights)
    }

    // Download binary data for IndexedDB persistence
    try {
      const downloaded = await downloadGoogleFont(family, weights)
      const storedFont: StoredFont = {
        id: nanoid(),
        family,
        source: 'google',
        weights,
        addedAt: Date.now(),
        files: downloaded.map((d) => ({
          weight: d.weight,
          format: 'woff2' as const,
          data: d.data,
        })),
      }
      await addUserFont(storedFont)
      set({
        userFonts: [
          ...get().userFonts,
          {
            id: storedFont.id,
            family,
            source: 'google',
            weights,
            addedAt: storedFont.addedAt,
            isLoaded: true,
          },
        ],
      })
    } catch (e) {
      console.warn('[FontStore] addGoogleFont persistence failed:', e)
    }
  },

  addCustomFont: async (file) => {
    const buffer = await file.arrayBuffer()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'ttf'
    const format = ext === 'woff2' ? 'woff2' : ext === 'otf' ? 'otf' : ('ttf' as const)

    const family =
      parseFontFamilyName(buffer) ?? familyNameFromFilename(file.name)

    const { userFonts } = get()
    if (userFonts.some((f) => f.family.toLowerCase() === family.toLowerCase())) return

    // Register with engine
    if (fontManagerRef) {
      fontManagerRef.clearFailedFamily(family)
      fontManagerRef.registerFont(buffer, family)
    }

    const storedFont: StoredFont = {
      id: nanoid(),
      family,
      source: 'custom',
      weights: [400],
      addedAt: Date.now(),
      files: [{ weight: 400, format, data: buffer }],
    }
    await addUserFont(storedFont)
    set({
      userFonts: [
        ...get().userFonts,
        {
          id: storedFont.id,
          family,
          source: 'custom',
          weights: [400],
          addedAt: storedFont.addedAt,
          isLoaded: true,
        },
      ],
    })
  },

  removeFont: async (id) => {
    await removeFromDB(id)
    set({ userFonts: get().userFonts.filter((f) => f.id !== id) })
  },

  searchGoogleFonts: async (query) => {
    set({ searchQuery: query, isSearching: true })
    try {
      const results = await searchGF(query)
      set({ searchResults: results, isSearching: false })
    } catch {
      set({ searchResults: [], isSearching: false })
    }
  },

  registerAllWithEngine: async () => {
    if (!fontManagerRef) return
    try {
      const stored = await getAllUserFonts()
      for (const font of stored) {
        for (const file of font.files) {
          fontManagerRef.registerFont(file.data, font.family)
        }
      }
    } catch (e) {
      console.warn('[FontStore] registerAllWithEngine failed:', e)
    }
  },
}))
