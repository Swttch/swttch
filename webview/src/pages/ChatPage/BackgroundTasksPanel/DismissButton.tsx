import { XMarkIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import type { WorkflowTask } from '@/shared';

/** The ✕ that takes a finished task out of the list, at the right of its time. */
export function DismissButton({ task, onDismiss }: { task: WorkflowTask; onDismiss: (toolUseId: string) => void }) {
    const { t } = useTranslation('chat');
    return (
        <Tooltip content={t('backgroundTasks.dismiss')} placement="bottom">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(task.toolUseId);
                }}
                aria-label={t('backgroundTasks.dismiss')}
                className="shrink-0 rounded p-0.5 hover:bg-surface-pressed transition-colors"
            >
                <XMarkIcon className="h-3.5 w-3.5 text-text-tertiary hover:text-text-secondary" />
            </button>
        </Tooltip>
    );
}
