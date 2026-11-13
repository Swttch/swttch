import { useEffect, useState } from 'react';
import { useOptionalWorkflowState } from '@/contexts/WorkflowStateContext';
import { ActivityGlyph, useFormatElapsed } from './TranscriptActivity';

/**
 * What the Transcript view modes show at the end of the chat while the model's own turn is over but a background
 * task it started is still running (a subagent, a workflow), as the desktop app does: the working dots and the time
 * the longest-running task has taken. Without it the end of the chat looks finished while work is going on, until
 * the task's notification starts the next turn (#673).
 *
 * Nothing is drawn while no task runs, or while a permission card waits for the person (the card says so).
 */
export function TranscriptBackgroundWorking({ hidden }: { hidden: boolean }) {
  const workflow = useOptionalWorkflowState();
  const formatElapsed = useFormatElapsed();
  const started = (workflow?.runningTasks ?? [])
    .map((task) => task.startedAt)
    .filter((at) => at > 0)
    .reduce<number | null>((oldest, at) => (oldest === null || at < oldest ? at : oldest), null);
  const showing = !hidden && started !== null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!showing) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [showing]);
  if (!showing || started === null) return null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-[17px] text-[0.9375rem] text-[var(--tr-muted)]" role="status" data-transcript-background-working>
      <ActivityGlyph />
      <span>{formatElapsed(Math.max(0, Math.floor((now - started) / 1000)))}</span>
    </div>
  );
}
