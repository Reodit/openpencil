import { useState } from 'react'
import { Check, Send, ChevronRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface ParsedQuestion {
  title: string
  options: string[]
  isTextInput: boolean
}

interface ClarifyingQuestionsProps {
  questions: ParsedQuestion[]
  onSubmit: (answers: string) => void
}

/**
 * Parse ## Clarifying Questions section.
 * Format:
 *   1. **Title**
 *      - [ ] Option A
 *      - [ ] Option B
 *   N. **Other requests**
 *      > (free text)
 */
export function parseClarifyingQuestions(text: string): ParsedQuestion[] {
  const sectionMatch = text.match(/##\s*Clarifying Questions([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i)
  if (!sectionMatch) return []

  const section = sectionMatch[1]
  const questions: ParsedQuestion[] = []
  const qBlocks = section.split(/\n\d+\.\s+\*\*/).filter(Boolean)

  for (const block of qBlocks) {
    const titleMatch = block.match(/^(.+?)\*\*/)
    if (!titleMatch) continue
    const title = titleMatch[1].trim()

    if (block.includes('> ')) {
      questions.push({ title, options: [], isTextInput: true })
      continue
    }

    const options: string[] = []
    const optRegex = /- \[ \]\s+(.+)/g
    let m
    while ((m = optRegex.exec(block)) !== null) {
      options.push(m[1].trim())
    }

    if (options.length > 0) {
      questions.push({ title, options, isTextInput: false })
    }
  }

  return questions
}

export function hasClarifyingQuestions(text: string): boolean {
  return /##\s*Clarifying Questions/i.test(text)
}

export default function ClarifyingQuestions({ questions, onSubmit }: ClarifyingQuestionsProps) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selections, setSelections] = useState<Record<number, Set<string>>>({})
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({})

  const total = questions.length
  const current = questions[currentIdx]
  const isLast = currentIdx === total - 1

  const currentSelections = selections[currentIdx] ?? new Set()
  const currentCustom = customInputs[currentIdx] ?? ''
  const hasAnswer = currentSelections.size > 0 || currentCustom.trim().length > 0

  const toggleOption = (option: string) => {
    setSelections(prev => {
      const s = new Set(prev[currentIdx] ?? [])
      if (s.has(option)) s.delete(option)
      else s.add(option)
      return { ...prev, [currentIdx]: s }
    })
  }

  const handleNext = () => {
    if (isLast) {
      handleSubmit()
    } else {
      setCurrentIdx(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentIdx > 0) setCurrentIdx(prev => prev - 1)
  }

  const handleSubmit = () => {
    const answers: string[] = []
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const sel = selections[i]
      const custom = customInputs[i]?.trim()

      const parts: string[] = []
      if (sel && sel.size > 0) parts.push([...sel].join(', '))
      if (custom) parts.push(custom)

      if (parts.length > 0) {
        answers.push(`${q.title}: ${parts.join('. Also: ')}`)
      }
    }
    onSubmit(answers.length > 0
      ? 'My answers:\n' + answers.join('\n') + '\n\nNow generate the design based on the plan and my choices above. Output PenNode JSONL.'
      : 'Proceed with your suggested defaults and generate the design now. Output PenNode JSONL.')
  }

  if (!current) return null

  return (
    <div className="mt-3 rounded-lg border border-border bg-card/50 overflow-hidden">
      {/* Header with progress */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/30 border-b border-border">
        <span className="text-[11px] font-semibold text-foreground">
          {current.title}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {currentIdx + 1} / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / total) * 100}%` }}
        />
      </div>

      <div className="px-3 py-3">
        {/* Options */}
        {!current.isTextInput && current.options.length > 0 && (
          <div className="space-y-1 mb-3">
            {current.options.map((opt) => {
              const isSelected = currentSelections.has(opt)
              return (
                <button
                  key={opt}
                  onClick={() => toggleOption(opt)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-[11px] rounded-md border transition-colors text-left',
                    isSelected
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'border-border bg-background text-foreground hover:bg-secondary/30',
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                    isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30',
                  )}>
                    {isSelected && <Check size={10} className="text-primary-foreground" />}
                  </div>
                  {opt}
                </button>
              )
            })}
          </div>
        )}

        {/* Custom input — always present */}
        <div>
          {!current.isTextInput && (
            <div className="text-[10px] text-muted-foreground mb-1">Or type your own:</div>
          )}
          <input
            type="text"
            value={currentCustom}
            onChange={(e) => setCustomInputs(prev => ({ ...prev, [currentIdx]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter' && hasAnswer) handleNext() }}
            placeholder={current.isTextInput ? 'Type your request...' : 'Other...'}
            className="w-full h-8 px-2.5 text-[11px] rounded-md border border-border bg-background text-foreground placeholder-muted-foreground/40 outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-secondary/20">
        <div>
          {currentIdx > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] gap-1 text-muted-foreground"
              onClick={handleBack}
            >
              <ArrowLeft size={10} />
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {!isLast && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-muted-foreground"
              onClick={handleNext}
            >
              Skip
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={handleNext}
          >
            {isLast ? (
              <>
                <Send size={10} />
                Submit
              </>
            ) : (
              <>
                Next
                <ChevronRight size={10} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
