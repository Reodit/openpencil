import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Copy, Check, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useCanvasStore } from '@/stores/canvas-store'
import { useDocumentStore, getActivePageChildren } from '@/stores/document-store'
import { generateReactCode } from '@/services/codegen/react-generator'
import { generateHTMLCode } from '@/services/codegen/html-generator'
import { generateVueCode } from '@/services/codegen/vue-generator'
import { generateSvelteCode } from '@/services/codegen/svelte-generator'
import { generateSwiftUICode } from '@/services/codegen/swiftui-generator'
import { generateComposeCode } from '@/services/codegen/compose-generator'
import { generateFlutterCode } from '@/services/codegen/flutter-generator'
import { generateReactNativeCode } from '@/services/codegen/react-native-generator'
import { generateCSSVariables } from '@/services/codegen/css-variables-generator'
import { highlightCode } from '@/utils/syntax-highlight'
import type { PenNode } from '@/types/pen'

type CodeTab = 'react' | 'vue' | 'svelte' | 'html' | 'swiftui' | 'compose' | 'flutter' | 'react-native' | 'css-vars'

export default function CodePanel() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<CodeTab>('react')
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)
  const selectedIds = useCanvasStore((s) => s.selection.selectedIds)
  const activePageId = useCanvasStore((s) => s.activePageId)
  const children = useDocumentStore((s) => getActivePageChildren(s.document, activePageId))
  const getNodeById = useDocumentStore((s) => s.getNodeById)

  void children

  const targetNodes: PenNode[] = useMemo(() => {
    if (selectedIds.length > 0) {
      return selectedIds
        .map((id) => getNodeById(id))
        .filter((n): n is PenNode => n !== undefined)
    }
    return children
  }, [selectedIds, children, getNodeById])

  const document = useDocumentStore((s) => s.document)

  const generatedCode = useMemo(() => {
    switch (activeTab) {
      case 'css-vars': return generateCSSVariables(document)
      case 'react': return generateReactCode(targetNodes)
      case 'vue': return generateVueCode(targetNodes)
      case 'svelte': return generateSvelteCode(targetNodes)
      case 'swiftui': return generateSwiftUICode(targetNodes)
      case 'compose': return generateComposeCode(targetNodes)
      case 'flutter': return generateFlutterCode(targetNodes)
      case 'react-native': return generateReactNativeCode(targetNodes)
      case 'html': {
        const { html, css } = generateHTMLCode(targetNodes)
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Design</title>\n  <style>\n${css.split('\n').map((l) => `    ${l}`).join('\n')}\n  </style>\n</head>\n<body>\n${html.split('\n').map((l) => `  ${l}`).join('\n')}\n</body>\n</html>`
      }
    }
  }, [activeTab, targetNodes, document])

  const highlightedHTML = useMemo(() => {
    const langMap: Record<CodeTab, Parameters<typeof highlightCode>[1]> = {
      react: 'jsx',
      vue: 'html',
      svelte: 'html',
      swiftui: 'swift',
      compose: 'kotlin',
      flutter: 'dart',
      'react-native': 'jsx',
      'css-vars': 'css',
      html: 'html',
    }
    if (activeTab === 'html' || activeTab === 'vue' || activeTab === 'svelte') {
      const styleIdx = generatedCode.indexOf('<style')
      if (styleIdx !== -1) {
        const templatePart = generatedCode.slice(0, styleIdx)
        const stylePart = generatedCode.slice(styleIdx)
        const styleTagEnd = stylePart.indexOf('>\n')
        if (styleTagEnd !== -1) {
          const styleTag = stylePart.slice(0, styleTagEnd + 1)
          const styleBody = stylePart.slice(styleTagEnd + 1)
          const closingIdx = styleBody.lastIndexOf('</style>')
          if (closingIdx !== -1) {
            const cssContent = styleBody.slice(0, closingIdx)
            const closingTag = styleBody.slice(closingIdx)
            return (
              highlightCode(templatePart, 'html') +
              highlightCode(styleTag, 'html') + '\n' +
              highlightCode(cssContent, 'css') +
              highlightCode(closingTag, 'html')
            )
          }
        }
        return highlightCode(templatePart, 'html') + highlightCode(stylePart, 'css')
      }
    }
    return highlightCode(generatedCode, langMap[activeTab])
  }, [activeTab, generatedCode])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }, [generatedCode])

  const handleDownload = useCallback(() => {
    const extMap: Record<CodeTab, string> = {
      react: 'tsx',
      vue: 'vue',
      svelte: 'svelte',
      html: 'html',
      swiftui: 'swift',
      compose: 'kt',
      flutter: 'dart',
      'react-native': 'tsx',
      'css-vars': 'css',
    }
    const ext = extMap[activeTab]
    const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = globalThis.document.createElement('a')
    a.href = url
    a.download = `design.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }, [activeTab, generatedCode])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const tabs: { key: CodeTab; label: string }[] = [
    { key: 'react', label: 'React' },
    { key: 'vue', label: 'Vue' },
    { key: 'svelte', label: 'Svelte' },
    { key: 'html', label: 'HTML' },
    { key: 'swiftui', label: 'SwiftUI' },
    { key: 'compose', label: 'Compose' },
    { key: 'flutter', label: 'Flutter' },
    { key: 'react-native', label: 'RN' },
    { key: 'css-vars', label: t('code.cssVariables') },
  ]

  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = tabsScrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = tabsScrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      ro.disconnect()
    }
  }, [updateScrollState])

  const scrollTabs = useCallback((dir: 'left' | 'right') => {
    tabsScrollRef.current?.scrollBy({ left: dir === 'left' ? -80 : 80, behavior: 'smooth' })
  }, [])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Framework tabs + action buttons */}
      <div className="flex items-center pl-1 pr-2 py-1 border-b border-border shrink-0 gap-0.5">
        {canScrollLeft && (
          <button type="button" onClick={() => scrollTabs('left')} className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground">
            <ChevronLeft size={10} />
          </button>
        )}
        <div ref={tabsScrollRef} className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none px-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded transition-colors shrink-0 whitespace-nowrap',
                activeTab === tab.key
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {canScrollRight && (
          <button type="button" onClick={() => scrollTabs('right')} className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground">
            <ChevronRight size={10} />
          </button>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleDownload}
                className="h-5 w-5"
              >
                <Download size={12} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('code.download')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleCopy}
                className="h-5 w-5"
              >
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? t('code.copied') : t('code.copyClipboard')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto p-2">
        <pre className="text-[10px] leading-relaxed font-mono text-foreground/80 whitespace-pre-wrap break-all">
          <code dangerouslySetInnerHTML={{ __html: highlightedHTML }} />
        </pre>
      </div>

      {/* Footer info */}
      <div className="h-5 flex items-center px-2 border-t border-border shrink-0">
        <span className="text-[9px] text-muted-foreground">
          {activeTab === 'css-vars'
            ? t('code.genCssVars')
            : selectedIds.length > 0
              ? t('code.genSelected', { count: selectedIds.length })
              : t('code.genDocument')}
        </span>
      </div>
    </div>
  )
}
