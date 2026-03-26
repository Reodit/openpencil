import { Check, Circle, Loader2, Play, X, SkipForward, ListChecks, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { PlanStep, PlanStatus } from '@/services/ai/ai-types'

interface PlanCardProps {
  steps: PlanStep[]
  status: PlanStatus
  onApprove: () => void
  onCancel: () => void
  onSkipStep: (stepId: string) => void
}

const STATUS_ICON: Record<PlanStep['status'], React.ReactNode> = {
  pending: <Circle size={12} className="text-muted-foreground/40" />,
  active: <Loader2 size={12} className="text-primary animate-spin" />,
  done: <Check size={12} className="text-emerald-500" />,
  error: <Circle size={12} className="text-destructive" />,
  skipped: <SkipForward size={10} className="text-muted-foreground/30" />,
}

export default function PlanCard({ steps, status, onApprove, onCancel, onSkipStep }: PlanCardProps) {
  const isAwaiting = status === 'awaiting'
  const isExecuting = status === 'executing'
  const isDone = status === 'done'
  const completedCount = steps.filter((s) => s.status === 'done').length
  const totalActive = steps.filter((s) => s.status !== 'skipped').length

  return (
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/30 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold',
            isExecuting ? 'bg-primary/10 text-primary' :
            isDone ? 'bg-emerald-500/10 text-emerald-500' :
            'bg-secondary text-muted-foreground',
          )}>
            {isDone ? <Check size={10} /> : isExecuting ? <ChevronRight size={10} /> : <ListChecks size={10} />}
          </div>
          <span className="text-[11px] font-semibold text-foreground">
            {isDone ? 'Plan Complete' : isExecuting ? 'Executing Plan' : 'Design Plan'}
          </span>
        </div>
        {isExecuting && (
          <span className="text-[10px] text-muted-foreground">
            {completedCount}/{totalActive}
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="px-3 py-2 space-y-1">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-2 py-1 group',
              step.status === 'skipped' && 'opacity-40 line-through',
              step.status === 'active' && 'bg-primary/5 -mx-2 px-2 rounded',
            )}
          >
            <div className="mt-0.5 flex-shrink-0">{STATUS_ICON[step.status]}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-foreground leading-tight">
                {step.title}
              </div>
              {step.description && (
                <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
                  {step.description}
                </div>
              )}
            </div>
            {/* Skip button — only in awaiting mode */}
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

      {/* Action buttons — only in awaiting mode */}
      {isAwaiting && (
        <div className="flex gap-2 px-3 py-2 border-t border-border bg-secondary/20">
          <Button
            size="sm"
            className="flex-1 h-7 text-[11px] gap-1"
            onClick={onApprove}
          >
            <Play size={12} />
            Execute Plan
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
