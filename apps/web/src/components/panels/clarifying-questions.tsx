import { useState } from 'react'
import { Check, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface ParsedQuestion {
  title: string
  description: string
  options: string[]
}

interface ClarifyingQuestionsProps {
  questions: ParsedQuestion[]
  onSubmit: (answers: string) => void
}

/** Parse clarifying questions from markdown text */
export function parseClarifyingQuestions(text: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []

  // Match: "1. **Title** — description"
  const regex = /\d+\.\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const title = match[1].trim()
    const desc = match[2].trim()
    const options = extractOptions(desc)
    questions.push({ title, description: desc, options })
  }

  return questions
}

function extractOptions(desc: string): string[] {
  // Pattern 1: (a) X, (b) Y, (c) Z — letter options
  {
    const opts = desc.match(/\(([a-z])\)\s*([^,(]+)/g)
    if (opts && opts.length >= 2) {
      return opts.map(o => {
        const m = o.match(/\(([a-z])\)\s*(.+)/)
        return m ? m[2].trim() : o.trim()
      })
    }
  }

  // Pattern 2: "Do you want X, Y, or Z?" — extract clean list
  {
    const m = desc.match(/(?:Do you want|prefer)\s+(.+?)\?/i)
    if (m) {
      // Split by comma and "or", clean "or" prefix from last item
      const raw = m[1]
      const parts = raw.split(/,\s+/).map(s => s.replace(/^or\s+/i, '').trim()).filter(s => s.length > 1 && s.length < 30)
      if (parts.length >= 2 && parts.length <= 5) {
        return parts
      }
    }
  }

  // Pattern 3: "Should ... ?" — yes/no
  if (/^should\b/i.test(desc) && desc.endsWith('?')) {
    return ['Yes', 'No']
  }

  // Pattern 4: "Do you have ... ?"
  if (/^do you have/i.test(desc)) {
    return ['Yes', 'No, use defaults']
  }

  // Pattern 5: Simple "X or Y?" binary at the end — extract short labels
  {
    const m = desc.match(/\b(\w[\w\s]{1,25}?)\s+or\s+(\w[\w\s]{1,25}?)\??$/)
    if (m) {
      return [m[1].trim(), m[2].trim()]
    }
  }

  // No options found — will show text input
  return []
}

/** Check if text contains clarifying questions */
export function hasClarifyingQuestions(text: string): boolean {
  return /clarifying questions|before (proceeding|I build|we start)/i.test(text) &&
    /\d+\.\s+\*\*.+?\*\*\s*[—–-]/.test(text)
}

export default function ClarifyingQuestions({ questions, onSubmit }: ClarifyingQuestionsProps) {
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [textInputs, setTextInputs] = useState<Record<string, string>>({})

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
      const txt = textInputs[q.title]?.trim()
      if (sel) {
        answers.push(`${q.title}: ${sel}`)
      } else if (txt) {
        answers.push(`${q.title}: ${txt}`)
      }
    }
    onSubmit(answers.length > 0 ? answers.join('\n') : 'Proceed with the plan as-is')
  }

  const answeredCount = Object.values(selections).filter(Boolean).length +
    Object.values(textInputs).filter(s => s?.trim()).length

  return (
    <div className="mt-3 rounded-lg border border-border bg-card/50 overflow-hidden">
      <div className="px-3 py-1.5 bg-secondary/30 border-b border-border">
        <span className="text-[11px] font-semibold text-foreground">Questions</span>
      </div>
      <div className="px-3 py-2 space-y-3">
        {questions.map((q) => (
          <div key={q.title}>
            <div className="text-[11px] font-medium text-foreground mb-1">{q.title}</div>
            {q.options.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {q.options.map((opt) => {
                  const isSelected = selections[q.title] === opt
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleSelection(q.title, opt)}
                      className={cn(
                        'px-2 py-1 text-[10px] rounded-md border transition-colors leading-tight',
                        isSelected
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                      )}
                    >
                      {isSelected && <Check size={8} className="inline mr-0.5 -mt-0.5" />}
                      {opt.length > 30 ? opt.slice(0, 30) + '...' : opt}
                    </button>
                  )
                })}
              </div>
            ) : (
              <input
                type="text"
                value={textInputs[q.title] ?? ''}
                onChange={(e) => setTextInputs(prev => ({ ...prev, [q.title]: e.target.value }))}
                placeholder={q.description.length > 60 ? q.description.slice(0, 60) + '...' : q.description}
                className="w-full h-7 px-2 text-[10px] rounded-md border border-border bg-background text-foreground placeholder-muted-foreground/40 outline-none focus:border-primary/50"
              />
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
          {answeredCount > 0 ? `Answer & proceed` : 'Proceed as-is'}
        </Button>
      </div>
    </div>
  )
}
