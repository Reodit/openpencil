import { useState, useCallback, useRef } from 'react'
import { Search, Loader2, Image as ImageIcon, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAgentSettingsStore } from '@/stores/agent-settings-store'
import { useTranslation } from 'react-i18next'
import type { ImageSearchResult, ImageSearchResponse } from '@/types/image-service'

interface ImageSearchPopoverProps {
  initialQuery: string
  onSelect: (url: string) => void
  children: React.ReactNode
}

export default function ImageSearchPopover({ initialQuery, onSelect, children }: ImageSearchPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [results, setResults] = useState<ImageSearchResult[]>([])
  const [source, setSource] = useState<'openverse' | 'wikimedia' | 'pexels' | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastQueryRef = useRef('')

  const openverseOAuth = useAgentSettingsStore((s) => s.openverseOAuth)

  const fetchImages = useCallback(async (searchQuery: string, pageNum: number, append: boolean) => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setHasSearched(true)
    }

    try {
      const body: Record<string, unknown> = { query: trimmed, count: 12, page: pageNum }
      if (openverseOAuth) {
        body.openverseClientId = openverseOAuth.clientId
        body.openverseClientSecret = openverseOAuth.clientSecret
      }

      const res = await fetch('/api/ai/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = (await res.json()) as ImageSearchResponse
        const newResults = data.results ?? []
        if (append) {
          setResults((prev) => [...prev, ...newResults])
        } else {
          setResults(newResults)
        }
        setSource(data.source ?? null)
        setHasMore(newResults.length >= 12)
        setPage(pageNum)
        lastQueryRef.current = trimmed
      } else {
        if (!append) {
          setResults([])
          setSource(null)
        }
        setHasMore(false)
      }
    } catch {
      if (!append) {
        setResults([])
        setSource(null)
      }
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [openverseOAuth])

  const handleSearch = useCallback(() => {
    fetchImages(query, 1, false)
  }, [query, fetchImages])

  const handleLoadMore = useCallback(() => {
    fetchImages(lastQueryRef.current, page + 1, true)
  }, [page, fetchImages])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSearch()
      }
    },
    [handleSearch],
  )

  const handleSelect = useCallback(
    (url: string) => {
      onSelect(url)
      setOpen(false)
    },
    [onSelect],
  )

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (next) {
      setHasSearched(false)
      setResults([])
      setSource(null)
      setPage(1)
      setHasMore(false)
    }
  }, [])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>

      <PopoverContent
        className="w-80 p-3"
        side="left"
        align="start"
        sideOffset={8}
      >
        {/* Search bar */}
        <div className="flex gap-1.5 mb-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('image.searchPlaceholder')}
            className="flex-1 h-7 px-2 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="h-7 w-7 flex items-center justify-center rounded border border-border bg-background hover:bg-accent/50 text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('image.searching')}</span>
          </div>
        ) : results.length > 0 ? (
          <div>
            <div className="grid grid-cols-3 gap-1.5 max-h-[280px] overflow-y-auto">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => handleSelect(result.thumbUrl)}
                  className="aspect-square w-full overflow-hidden rounded border border-border hover:border-primary transition-colors cursor-pointer"
                  title={result.attribution ?? result.license}
                >
                  <img
                    src={result.thumbUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full mt-2 h-7 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                {t('image.loadMore')}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <ImageIcon className="w-6 h-6 text-muted-foreground opacity-50" />
            <span className="text-xs text-muted-foreground">
              {hasSearched ? t('image.noResults') : t('image.searchPrompt')}
            </span>
          </div>
        )}

        {/* Footer */}
        {results.length > 0 && source && (
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground leading-snug">
              {t('image.sourceAttribution', {
                source: source === 'openverse' ? 'Openverse' : 'Wikimedia Commons',
              })}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
