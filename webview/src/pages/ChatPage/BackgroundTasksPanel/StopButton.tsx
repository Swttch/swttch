import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';

/**
 * The button that stops a running task: a white square with softened corners in a lighter circle, with a blue arc
 * turning around the circle's edge like a spinner, to say the task is still going. Sized from the desktop app's own
 * button (36px around a 16px square at its 1.5 scale), in the units of this window. It reaches past the line it sits
 * in by a little (the negative margin), so a card that can be stopped is as tall as one that cannot. Every place a task
 * can be stopped draws this one button.
 */
export function StopButton({ task, onCancel }: { task: WorkflowTask; onCancel: (task: WorkflowTask) => void }) {
    const { t } = useTranslation('chat');
    return (
        <Tooltip content={t('backgroundTasks.cancelRunning')} placement="bottom">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onCancel(task);
                }}
                aria-label={t('backgroundTasks.cancelRunning')}
                className="relative -my-[0.14rem] flex h-[1.65rem] w-[1.65rem] shrink-0 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
            >
                <span
                    aria-hidden
                    className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 border-r-blue-400 animate-spin"
                    style={{ animationDuration: '0.9s' }}
                />
                <span className="block h-3 w-3 rounded-[2.5px] bg-white" />
            </button>
        </Tooltip>
    );
}
