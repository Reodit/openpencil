import { useState } from 'react'
import { Check, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ParsedQuestion {
  title: string
  description: string
  options: string[]
  type: 'single' | 'multi' | 'yesno' | 'open'
}

interface ClarifyingQuestionsProps {
  questions: ParsedQuestion[]
  onSubmit: (answers: string) => void
}

/** Parse clarifying questions from markdown text */
export function parseClarifyingQuestions(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []

  // Match numbered questions: "1. **Title** — description"
  const qRegex = /^\d+\.\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)/gm
  let match
  while ((match = qRegex.exec(text)) !== null) {
    const title = match[1].trim()
    const desc = match[2].trim()
    const q: ParsedQuestion = { title, description: desc, options: [], type: 'open' }

    // Extract (a)/(b)/(c) options
    const letterOpts = desc.match(/\(([a-z])\)\s*([^,(]+)/g)
    if (letterOpts) {
      q.options = letterOpts.map(o => {
        const m = o.match(/\(([a-z])\)\s*(.+)/)
        return m ? m[2].trim() : o.trim()
      })
      q.type = 'single'
    }

    // Extract "X, Y, Z, or W?" pattern
    if (q.options.length === 0) {
      const commaPattern = desc.match(/[—–-]\s*(.+?\?)$/) || desc.match(/:\s*(.+?\?)$/)
      if (commaPattern) {
        const optText = commaPattern[1].replace(/\?$/, '')
        // Split by comma and "or"
        const parts = optText.split(/,\s*|\s+or\s+/).map(s => s.trim()).filter(s => s && s.length > 1)
        if (parts.length >= 2 && parts.length <= 6) {
          q.options = parts
          q.type = parts.length === 2 ? 'yesno' : 'single'
        }
      }
    }

    // Extract "X or Y?" binary pattern
    if (q.options.length === 0) {
      const orPattern = desc.match(/(.+?)\s+or\s+(.+?)\??$/)
      if (orPattern) {
        const a = orPattern[1].replace(/^.*[—–-]\s*/, '').trim()
        const b = orPattern[2].replace(/\?$/, '').trim()
        if (a.length > 2 && b.length > 2 && a.length < 60 && b.length < 60) {
          q.options = [a, b]
          q.type = 'yesno'
        }
      }
    }

    questions.push(q)
  }

  return questions
}

/** Check if text contains a "Clarifying Questions" section */
export function hasClarifyingQuestions(text: string): boolean {
  return /clarifying questions|before (proceeding|I build|we start)/i.test(text)
}

export default function ClarifyingQuestions({ questions, onSubmit }: ClarifyingQuestionsProps) {
  const [selections, setSelections] = useState<Record<string, string>>({})

  const toggleSelection = (title: string, option: string) => {
    setSelections(prev => ({
      ...prev,
      [title]: prev[title] === option ? '' : option,
    }))
  }

  const handleSubmit = () => {
    const answers: string[] = []
    for (const q of questions) {
      const sel = selections[q.title]
      if (sel) {
        answers.push(`${q.title}: ${sel}`)
      }
    }
    if (answers.length > 0) {
      onSubmit(answers.join('\n'))
    } else {
      onSubmit('Proceed with defaults')
    }
  }

  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="mt-2 space-y-2">
      {questions.map((q) => (
        <div key={q.title} className="space-y-1">
          <div className="text-[11px] font-medium text-foreground">{q.title}</div>
          {q.options.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {q.options.map((opt) => {
                const isSelected = selections[q.title] === opt
                return (
                  <button
                    key={opt}
                    onClick={() => toggleSelection(q.title, opt)}
                    className={cn(
                      'px-2 py-1 text-[10px] rounded-md border transition-colors',
                      isSelected
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                    )}
                  >
                    {isSelected && <Check size={8} className="inline mr-1" />}
                    {opt.length > 35 ? opt.slice(0, 35) + '...' : opt}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground/70">{q.description}</div>
          )}
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 text-[11px] gap-1"
          onClick={handleSubmit}
        >
          <Send size={10} />
          {answeredCount > 0 ? `Submit (${answeredCount} answered)` : 'Proceed with defaults'}
        </Button>
      </div>
    </div>
  )
}
