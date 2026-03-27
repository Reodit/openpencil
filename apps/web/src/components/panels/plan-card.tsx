import { useState } from 'react'
import { Check, Circle, Loader2, Play, X, SkipForward, ListChecks, ChevronRight, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { PlanStep, PlanStatus } from '@/services/ai/ai-types'

export interface PlanChoice {
  question: string
  options: Array<{ key: string; label: string }>
}

interface PlanCardProps {
  steps: PlanStep[]
  status: PlanStatus
  /** Text after the plan block (agent's question to user) */
  followUpText?: string
  /** Parsed choice questions from agent */
  choices?: PlanChoice[]
  onApprove: () => void
  onCancel: () => void
  onSkipStep: (stepId: string) => void
  /** Send feedback to regenerate the plan */
  onFeedback: (feedback: string) => void
}

const STATUS_ICON: Record<PlanStep['status'], React.ReactNode> = {
  pending: <Circle size={12} className="text-muted-foreground/40" />,
  active: <Loader2 size={12} className="text-primary animate-spin" />,
  done: <Check size={12} className="text-emerald-500" />,
  error: <Circle size={12} className="text-destructive" />,
  skipped: <SkipForward size={10} className="text-muted-foreground/30" />,
}

export default function PlanCard({
  steps, status, followUpText, choices, onApprove, onCancel, onSkipStep, onFeedback,
}: PlanCardProps) {
  const isAwaiting = status === 'awaiting'
  const isExecuting = status === 'executing'
  const isDone = status === 'done'
  const isPlanning = status === 'planning'
  const completedCount = steps.filter((s) => s.status === 'done').length
  const totalActive = steps.filter((s) => s.status !== 'skipped').length
  const [feedbackText, setFeedbackText] = useState('')

  const handleFeedbackSubmit = () => {
    if (!feedbackText.trim()) return
    onFeedback(feedbackText.trim())
    setFeedbackText('')
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/30 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-5 h-5 rounded-md flex items-center justify-center',
            isExecuting ? 'bg-primary/10 text-primary' :
            isDone ? 'bg-emerald-500/10 text-emerald-500' :
            isPlanning ? 'bg-secondary text-muted-foreground' :
            'bg-secondary text-muted-foreground',
          )}>
            {isDone ? <Check size={10} /> :
             isExecuting ? <Loader2 size={10} className="animate-spin" /> :
             isPlanning ? <Loader2 size={10} className="animate-spin" /> :
             <ListChecks size={10} />}
          </div>
          <span className="text-[11px] font-semibold text-foreground">
            {isDone ? 'Plan Complete' :
             isExecuting ? 'Executing Plan' :
             isPlanning ? 'Creating Plan...' :
             'Design Plan'}
          </span>
        </div>
        {isExecuting && totalActive > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {completedCount}/{totalActive}
          </span>
        )}
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div className="px-3 py-2 space-y-0.5">
          {steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                'flex items-start gap-2 py-1 group rounded',
                step.status === 'skipped' && 'opacity-40',
                step.status === 'active' && 'bg-primary/5 -mx-1 px-1',
              )}
            >
              <div className="mt-0.5 flex-shrink-0">{STATUS_ICON[step.status]}</div>
              <div className="flex-1 min-w-0">
                <div className={cn(
                  'text-[11px] font-medium leading-tight',
                  step.status === 'skipped' ? 'line-through text-muted-foreground' : 'text-foreground',
                )}>
                  {step.title}
                </div>
                {step.description && (
                  <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
                    {step.description}
                  </div>
                )}
              </div>
              {isAwaiting && step.status === 'pending' && (
                <button
                  onClick={() => onSkipStep(step.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-secondary"
                  title="Skip this step"
                >
                  <X size={10} className="text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Follow-up text from agent */}
      {isAwaiting && followUpText && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
            {followUpText}
          </p>
        </div>
      )}

      {/* Choices from agent — clickable options */}
      {isAwaiting && choices && choices.length > 0 && (
        <div className="px-3 pb-2 space-y-2">
          {choices.map((choice, qi) => (
            <div key={qi}>
              <div className="text-[10px] font-medium text-foreground mb-1">{choice.question}</div>
              <div className="flex flex-wrap gap-1">
                {choice.options.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => onFeedback(`${choice.question} ${opt.key}) ${opt.label}`)}
                    className="px-2 py-0.5 text-[10px] rounded-md border border-border bg-background text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                  >
                    {opt.key}) {opt.label.length > 30 ? opt.label.slice(0, 30) + '...' : opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Feedback input — only in awaiting mode */}
      {isAwaiting && (
        <div className="px-3 pb-2">
          <div className="flex gap-1.5 items-center">
            <input
              type="text"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFeedbackSubmit() }}
              placeholder="Modify plan..."
              className="flex-1 h-7 px-2 text-[11px] rounded-md border border-border bg-background text-foreground placeholder-muted-foreground/50 outline-none focus:border-primary/50"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7 shrink-0"
              onClick={handleFeedbackSubmit}
              disabled={!feedbackText.trim()}
              title="Send feedback"
            >
              <Send size={11} />
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons — only in awaiting mode */}
      {isAwaiting && (
        <div className="flex gap-2 px-3 py-2 border-t border-border bg-secondary/20">
          <Button
            size="sm"
            className="flex-1 h-7 text-[11px] gap-1"
            onClick={onApprove}
          >
            <Play size={12} />
            Execute
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1 text-muted-foreground"
            onClick={() => onFeedback('Regenerate this plan with a different approach')}
          >
            <RefreshCw size={10} />
            Redo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Progress bar during execution */}
      {isExecuting && totalActive > 0 && (
        <div className="h-1 bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(completedCount / totalActive) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
