import React from 'react';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_STAGES = [
  { id: 'Concept', label: 'Concept' },
  { id: 'Pre-FEED', label: 'Pre-FEED' },
  { id: 'FEED', label: 'FEED' },
  { id: 'Execution', label: 'Execution' },
  { id: 'Close-out', label: 'Close-out' },
];

// Senior test T1 (2026-09-27): the tracker drew Concept to Close-out for
// every project and was handed a stage from the project's own template
// (Prospecting, Appraisal Planning, Planning), which it never found, so
// every project of every type sat on "Concept" for ever. Nothing in the
// studio advances projects.stage either. With a template the tracker draws
// that template's stages, and the current one is the first stage with an
// unfinished task, which is what the stage table beside it measures.
// A stage's progress is the mean of its tasks' percent complete (a task
// marked Done counts as 100). Counting only Done tasks read a stage with
// every task half finished as 0 percent and Pending.
export function stageProgress(stageTasks = []) {
  if (!stageTasks.length) return 0;
  const pct = (t) => (t.status === 'Done' ? 100 : Math.min(100, Math.max(0, Number(t.percent_complete) || 0)));
  return Math.round(stageTasks.reduce((a, t) => a + pct(t), 0) / stageTasks.length);
}

export function currentStageOf(names, tasks = [], fallback) {
  const staged = (tasks || []).filter((t) => t.type !== 'milestone' && names.includes(t.task_category));
  if (staged.length) {
    const open = names.find((n) => staged.some((t) => t.task_category === n && t.status !== 'Done'));
    return open || names[names.length - 1];
  }
  return names.includes(fallback) ? fallback : names[0];
}

const StageTracker = ({ currentStage, template, tasks }) => {
  const stages = template?.stages?.length
    ? template.stages.map((s) => ({ id: s.name, label: s.name }))
    : DEFAULT_STAGES;
  const current = template?.stages?.length
    ? currentStageOf(stages.map((s) => s.id), tasks, currentStage)
    : currentStage;
  const found = stages.findIndex((s) => s.id === current);
  const currentIndex = found !== -1 ? found : 0;

  return (
    <div className="w-full overflow-x-auto rounded-lg bg-pl-surface border border-pl-border p-4 mb-4">
      <div className="flex items-center justify-between max-w-4xl min-w-[560px] mx-auto px-6">
        {stages.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <div key={stage.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center relative z-10">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors duration-300",
                  isCompleted ? "bg-pl-primary border-pl-primary text-pl-primary-fg" :
                  isCurrent ? "bg-pl-surface border-pl-primary text-pl-primary-text" :
                  "bg-pl-surface border-pl-border-strong text-pl-muted"
                )}>
                  {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : 
                   isCurrent ? <Circle className="w-5 h-5 fill-pl-primary/20" /> :
                   <Circle className="w-5 h-5" />}
                </div>
                <span className={cn(
                  "text-xs font-medium mt-2 absolute -bottom-6 whitespace-nowrap",
                  isCurrent ? "text-pl-primary-text font-semibold" : isCompleted ? "text-pl-text" : "text-pl-muted"
                )}>
                  {stage.label}
                </span>
              </div>
              
              {index < stages.length - 1 && (
                <div className={cn(
                  "h-0.5 w-full mx-2 flex-1 transition-colors duration-300",
                  isCompleted ? "bg-pl-primary" : "bg-pl-border"
                )} />
              )}
            </div>
          );
        })}
      </div>
      <div className="h-4"></div> {/* Spacer for labels */}
    </div>
  );
};

export default StageTracker;