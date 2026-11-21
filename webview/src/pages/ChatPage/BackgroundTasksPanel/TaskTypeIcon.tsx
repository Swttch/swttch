/** The kind of a background task, as its icon says it. */
export type TaskKind = 'agent' | 'workflow' | 'command';

/** The icon at the left of a task's title: a robot for an agent, a tree of steps for a workflow, a prompt (`>_`) for a command. */
export function TaskTypeIcon({ kind, className = 'h-4 w-4' }: { kind: TaskKind; className?: string }) {
    const shared = `${className} flex-shrink-0 text-text-tertiary`;
    const svg = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: shared };
    if (kind === 'command') {
        // The prompt and its cursor with no box around them, as the desktop app draws its terminal.
        return (
            <svg {...svg}>
                <path d="M5 7.5 10.5 12 5 16.5" />
                <path d="M13 17h6.5" />
            </svg>
        );
    }
    if (kind === 'agent') {
        // A robot: head, antenna, ears and two eyes.
        return (
            <svg {...svg}>
                <rect x="4" y="8" width="16" height="11" rx="3" />
                <path d="M12 8V5" />
                <circle cx="12" cy="4" r="1" />
                <path d="M2 12v3M22 12v3" />
                <circle cx="9" cy="13.5" r="1" fill="currentColor" stroke="none" />
                <circle cx="15" cy="13.5" r="1" fill="currentColor" stroke="none" />
            </svg>
        );
    }
    // A workflow runs its steps in order, as a file tree lists them: a step with the ones that follow it indented below.
    return (
        <svg {...svg}>
            <rect x="3" y="3" width="7" height="4.5" rx="1" />
            <rect x="12" y="10" width="9" height="4.5" rx="1" />
            <rect x="12" y="17" width="9" height="4.5" rx="1" />
            <path d="M6.5 7.5v11.75M6.5 12.25H12M6.5 19.25H12" />
        </svg>
    );
}
