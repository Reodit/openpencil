import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useFontStore, type UserFont } from '@/stores/font-store'
import type { GoogleFontMeta } from '@/services/google-fonts-api'
import { Search, Upload, X, Loader2, Check, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Tab = 'google' | 'custom'

export default function FontManagementDialog() {
  const { t } = useTranslation()
  const {
    dialogOpen,
    setDialogOpen,
    userFonts,
    searchResults,
    isSearching,
    searchGoogleFonts,
    addGoogleFont,
    addCustomFont,
    removeFont,
  } = useFontStore()
  const [activeTab, setActiveTab] = useState<Tab>('google')
  const [searchInput, setSearchInput] = useState('')
  const [addingFont, setAddingFont] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      searchGoogleFonts(searchInput)
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchInput, searchGoogleFonts])

  // Load initial results when opening Google tab
  useEffect(() => {
    if (dialogOpen && activeTab === 'google' && searchResults.length === 0) {
      searchGoogleFonts('')
    }
  }, [dialogOpen, activeTab, searchResults.length, searchGoogleFonts])

  const handleAddGoogle = useCallback(async (font: GoogleFontMeta) => {
    setAddingFont(font.family)
    try {
      await addGoogleFont(font.family)
    } finally {
      setAddingFont(null)
    }
  }, [addGoogleFont])

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(woff2?|ttf|otf)$/i.test(f.name),
    )
    for (const file of files) {
      await addCustomFont(file)
    }
  }, [addCustomFont])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      await addCustomFont(file)
    }
    e.target.value = ''
  }, [addCustomFont])

  const isAdded = useCallback(
    (family: string) => userFonts.some((f) => f.family.toLowerCase() === family.toLowerCase()),
    [userFonts],
  )

  if (!dialogOpen) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === backdropRef.current) setDialogOpen(false) }}
    >
      <div className="w-[520px] max-h-[600px] rounded-lg border border-border bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            {t('text.font.manageFonts')}
          </h2>
          <button
            onClick={() => setDialogOpen(false)}
            className="p-1 rounded-md hover:bg-secondary/50 text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <TabButton
            active={activeTab === 'google'}
            onClick={() => setActiveTab('google')}
            label={t('text.font.googleFonts')}
          />
          <TabButton
            active={activeTab === 'custom'}
            onClick={() => setActiveTab('custom')}
            label={t('text.font.customFonts')}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'google' ? (
            <GoogleFontsTab
              searchInput={searchInput}
              onSearchChange={setSearchInput}
              results={searchResults}
              isSearching={isSearching}
              addingFont={addingFont}
              isAdded={isAdded}
              onAdd={handleAddGoogle}
              t={t}
            />
          ) : (
            <CustomFontsTab
              fileInputRef={fileInputRef}
              onFileDrop={handleFileDrop}
              onFileSelect={handleFileSelect}
              t={t}
            />
          )}

          {/* Your Fonts */}
          <YourFonts userFonts={userFonts} onRemove={removeFont} t={t} />
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 px-4 py-2 text-xs font-medium transition-colors',
        active
          ? 'text-foreground border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

function GoogleFontsTab({
  searchInput,
  onSearchChange,
  results,
  isSearching,
  addingFont,
  isAdded,
  onAdd,
  t,
}: {
  searchInput: string
  onSearchChange: (v: string) => void
  results: GoogleFontMeta[]
  isSearching: boolean
  addingFont: string | null
  isAdded: (family: string) => boolean
  onAdd: (font: GoogleFontMeta) => void
  t: (key: string) => string
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('text.font.searchGoogle')}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto max-h-[200px] py-1">
        {isSearching ? (
          <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('text.font.loading')}
          </div>
        ) : results.length === 0 ? (
          <div className="py-6 text-xs text-muted-foreground text-center">
            {t('text.font.noResults')}
          </div>
        ) : (
          results.map((font) => (
            <div
              key={font.family}
              className="flex items-center justify-between px-4 py-1.5 hover:bg-secondary/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-foreground truncate">{font.family}</span>
                <span className="text-[9px] text-muted-foreground shrink-0">
                  {font.category}
                </span>
              </div>
              {isAdded(font.family) ? (
                <span className="flex items-center gap-1 text-[10px] text-primary shrink-0">
                  <Check className="w-3 h-3" />
                  {t('text.font.added_badge')}
                </span>
              ) : (
                <button
                  onClick={() => onAdd(font)}
                  disabled={addingFont === font.family}
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-md shrink-0 transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:opacity-50',
                  )}
                >
                  {addingFont === font.family ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    t('text.font.add')
                  )}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function CustomFontsTab({
  fileInputRef,
  onFileDrop,
  onFileSelect,
  t,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileDrop: (e: React.DragEvent) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  t: (key: string) => string
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className="p-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); onFileDrop(e) }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/50',
        )}
      >
        <Upload className="w-6 h-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{t('text.font.dropzone')}</p>
        <p className="text-[10px] text-muted-foreground/60">{t('text.font.dropzoneFormats')}</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".woff2,.woff,.ttf,.otf"
        multiple
        onChange={onFileSelect}
        className="hidden"
      />
    </div>
  )
}

function YourFonts({
  userFonts,
  onRemove,
  t,
}: {
  userFonts: UserFont[]
  onRemove: (id: string) => Promise<void>
  t: (key: string) => string
}) {
  if (userFonts.length === 0) return null

  return (
    <div className="border-t border-border">
      <div className="px-4 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {t('text.font.yourFonts')} ({userFonts.length})
      </div>
      <div className="overflow-y-auto max-h-[120px] pb-2">
        {userFonts.map((font) => (
          <div
            key={font.id}
            className="flex items-center justify-between px-4 py-1 hover:bg-secondary/30"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-foreground truncate" style={{ fontFamily: font.family }}>
                {font.family}
              </span>
              <span
                className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded-full shrink-0',
                  font.source === 'google'
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'bg-purple-500/10 text-purple-400',
                )}
              >
                {font.source === 'google' ? 'Google' : 'Custom'}
              </span>
            </div>
            <button
              onClick={() => onRemove(font.id)}
              className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
