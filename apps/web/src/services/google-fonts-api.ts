/**
 * Google Fonts metadata search.
 * Uses the public metadata endpoint (no API key required).
 */

export interface GoogleFontMeta {
  family: string
  category: string
  variants: string[]
}

const METADATA_URL = 'https://fonts.google.com/metadata/fonts'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
const CACHE_KEY = 'openpencil-google-fonts-cache'

let memoryCache: GoogleFontMeta[] | null = null

interface CachedData {
  fonts: GoogleFontMeta[]
  ts: number
}

function readLocalCache(): GoogleFontMeta[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached: CachedData = JSON.parse(raw)
    if (Date.now() - cached.ts > CACHE_TTL) return null
    return cached.fonts
  } catch {
    return null
  }
}

function writeLocalCache(fonts: GoogleFontMeta[]) {
  try {
    const data: CachedData = { fonts, ts: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // localStorage full or unavailable
  }
}

async function fetchFontList(): Promise<GoogleFontMeta[]> {
  if (memoryCache) return memoryCache

  const cached = readLocalCache()
  if (cached) {
    memoryCache = cached
    return cached
  }

  const resp = await fetch(METADATA_URL)
  if (!resp.ok) throw new Error(`Google Fonts metadata fetch failed: ${resp.status}`)

  const text = await resp.text()
  // The response has a ")]}'" prefix for XSS protection
  const jsonStr = text.startsWith(")]}'") ? text.slice(5) : text
  const data = JSON.parse(jsonStr)

  const fonts: GoogleFontMeta[] = (data.familyMetadataList ?? []).map(
    (item: { family: string; category: string; fonts: Record<string, unknown> }) => ({
      family: item.family,
      category: item.category ?? 'sans-serif',
      variants: Object.keys(item.fonts ?? {}),
    }),
  )

  memoryCache = fonts
  writeLocalCache(fonts)
  return fonts
}

export async function searchGoogleFonts(query: string): Promise<GoogleFontMeta[]> {
  const fonts = await fetchFontList()
  if (!query.trim()) return fonts.slice(0, 50)

  const q = query.toLowerCase()
  return fonts
    .filter(f => f.family.toLowerCase().includes(q))
    .slice(0, 50)
}

/**
 * Download a Google Font's woff2 binary data for the given weights.
 * Returns an array of { weight, data } objects.
 */
export async function downloadGoogleFont(
  family: string,
  weights: number[] = [400, 700],
): Promise<Array<{ weight: number; data: ArrayBuffer }>> {
  const weightStr = weights.join(';')
  const encoded = encodeURIComponent(family)
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weightStr}&display=swap`

  const cssResp = await fetch(cssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })
  if (!cssResp.ok) throw new Error(`Failed to fetch Google Font CSS: ${cssResp.status}`)

  const css = await cssResp.text()
  const urlRegex = /url\((https?:\/\/[^)]+\.woff2)\)/g
  const urls: string[] = []
  let match: RegExpExecArray | null
  while ((match = urlRegex.exec(css)) !== null) {
    urls.push(match[1])
  }

  const results: Array<{ weight: number; data: ArrayBuffer }> = []
  // For simplicity, assign the closest weight to each subset chunk
  // Google Fonts may return multiple subsets; we collect them all
  const allBuffers = await Promise.all(
    urls.map(async (url) => {
      try {
        const resp = await fetch(url)
        return resp.ok ? resp.arrayBuffer() : null
      } catch {
        return null
      }
    }),
  )

  for (const buf of allBuffers) {
    if (buf) results.push({ weight: 400, data: buf })
  }

  return results
}
