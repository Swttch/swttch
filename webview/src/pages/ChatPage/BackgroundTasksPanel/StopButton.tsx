import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';

/**
 * The button that stops a running task, as the desktop app draws it: a white square with softened corners in a
 * lighter rounded square. Sized from the desktop app's own (a 36px button around a 16px square at its 1.5 scale),
 * in the units of this window. It reaches past the line it sits in by a little (the negative margin), so a card that
 * can be stopped is as tall as one that cannot.
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
                className="-my-[0.14rem] flex h-[1.65rem] w-[1.65rem] shrink-0 items-center justify-center rounded-[6px] bg-white/15 transition-colors hover:bg-white/25"
            >
                <span className="block h-3 w-3 rounded-[2.5px] bg-white" />
            </button>
        </Tooltip>
    );
}
