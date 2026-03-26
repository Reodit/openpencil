import { useState } from 'react'
import { Check, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface ParsedQuestion {
  title: string
  options: string[]        // checkbox options
  isTextInput: boolean     // true for "Other requests" with > blockquote
}

interface ClarifyingQuestionsProps {
  questions: ParsedQuestion[]
  onSubmit: (answers: string) => void
}

/**
 * Parse ## Clarifying Questions section from markdown.
 * Expected format:
 *   1. **Title**
 *      - [ ] Option A
 *      - [ ] Option B
 *
 *   N. **Other requests**
 *      > (free text)
 */
export function parseClarifyingQuestions(text: string): ParsedQuestion[] {
  // Find the Clarifying Questions section
  const sectionMatch = text.match(/##\s*Clarifying Questions([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i)
  if (!sectionMatch) return []

  const section = sectionMatch[1]
  const questions: ParsedQuestion[] = []

  // Split by numbered questions: "1. **Title**"
  const qBlocks = section.split(/\n\d+\.\s+\*\*/).filter(Boolean)

  for (const block of qBlocks) {
    // Extract title (first line, before **)
    const titleMatch = block.match(/^(.+?)\*\*/)
    if (!titleMatch) continue
    const title = titleMatch[1].trim()

    // Check if this is a text input question (has > blockquote)
    if (block.includes('> ')) {
      questions.push({ title, options: [], isTextInput: true })
      continue
    }

    // Extract checkbox options: "- [ ] Option"
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

/** Check if text contains a Clarifying Questions section */
export function hasClarifyingQuestions(text: string): boolean {
  return /##\s*Clarifying Questions/i.test(text)
}

export default function ClarifyingQuestions({ questions, onSubmit }: ClarifyingQuestionsProps) {
  const [selections, setSelections] = useState<Record<string, Set<string>>>({})
  const [textInputs, setTextInputs] = useState<Record<string, string>>({})

  const toggleOption = (title: string, option: string) => {
    setSelections(prev => {
      const current = new Set(prev[title] ?? [])
      if (current.has(option)) current.delete(option)
      else current.add(option)
      return { ...prev, [title]: current }
    })
  }

  const handleSubmit = () => {
    const answers: string[] = []
    for (const q of questions) {
      if (q.isTextInput) {
        const txt = textInputs[q.title]?.trim()
        if (txt) answers.push(`${q.title}: ${txt}`)
      } else {
        const sel = selections[q.title]
        if (sel && sel.size > 0) {
          answers.push(`${q.title}: ${[...sel].join(', ')}`)
        }
      }
    }
    onSubmit(answers.length > 0
      ? 'My answers:\n' + answers.join('\n') + '\n\nProceed with these choices.'
      : 'Proceed with the plan using your suggested defaults.')
  }

  const totalAnswered = Object.values(selections).reduce((n, s) => n + (s.size > 0 ? 1 : 0), 0) +
    Object.values(textInputs).filter(s => s?.trim()).length

  return (
    <div className="mt-3 rounded-lg border border-border bg-card/50 overflow-hidden">
      <div className="px-3 py-1.5 bg-secondary/30 border-b border-border">
        <span className="text-[11px] font-semibold text-foreground">Questions</span>
        {totalAnswered > 0 && (
          <span className="ml-1.5 text-[10px] text-muted-foreground">{totalAnswered} answered</span>
        )}
      </div>

      <div className="px-3 py-2 space-y-3">
        {questions.map((q) => (
          <div key={q.title}>
            <div className="text-[11px] font-medium text-foreground mb-1">{q.title}</div>
            {q.isTextInput ? (
              <input
                type="text"
                value={textInputs[q.title] ?? ''}
                onChange={(e) => setTextInputs(prev => ({ ...prev, [q.title]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                placeholder="Type here..."
                className="w-full h-7 px-2 text-[10px] rounded-md border border-border bg-background text-foreground placeholder-muted-foreground/40 outline-none focus:border-primary/50"
              />
            ) : (
              <div className="flex flex-wrap gap-1">
                {q.options.map((opt) => {
                  const isSelected = selections[q.title]?.has(opt)
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleOption(q.title, opt)}
                      className={cn(
                        'px-2 py-1 text-[10px] rounded-md border transition-colors leading-tight',
                        isSelected
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                      )}
                    >
                      {isSelected && <Check size={8} className="inline mr-0.5 -mt-0.5" />}
                      {opt}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 px-3 py-2 border-t border-border bg-secondary/20">
        <Button
          size="sm"
          className="flex-1 h-7 text-[11px] gap-1"
          onClick={handleSubmit}
        >
          <Send size={10} />
          {totalAnswered > 0 ? 'Submit answers' : 'Proceed with defaults'}
        </Button>
      </div>
    </div>
  )
}
