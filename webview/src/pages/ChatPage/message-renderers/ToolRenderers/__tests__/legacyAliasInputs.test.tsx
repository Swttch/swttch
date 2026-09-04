import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {TaskOutputRenderer} from '../TaskOutputRenderer';
import {TaskStopRenderer} from '../TaskStopRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

// TaskOutput reads the working directory and the bridge to offer "open the
// output file"; neither is what these tests are about.
vi.mock('@/contexts/WorkingDirContext', () => ({
    useWorkingDir: () => ({workingDirectory: '/repo'}),
}));

vi.mock('@/contexts/BridgeContext', () => ({
    useBridgeContext: () => ({send: vi.fn()}),
}));

/**
 * Registering a legacy name against the current renderer is only half the job:
 * the older names carry their id under a different field. `KillShell`/`KillBash`
 * use `shell_id` (still in the current TaskStop schema, marked deprecated) and
 * `BashOutput`/`BashOutputTool` use `bash_id`.
 *
 * Reading only `task_id` rendered those rows with an empty id — caught by
 * replaying a transcript recorded under an older CLI, since the current one
 * translates the names away before they reach us.
 */

function makeToolUse(name: string, input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name,
        input,
    });
}

describe('TaskStop reads the id whichever field carries it', () => {
    it('reads task_id', () => {
        render(<TaskStopRenderer toolUse={makeToolUse('TaskStop', {task_id: 'b5a3bdzoi'})} />);
        expect(screen.getByText(/b5a3bdzoi/)).toBeInTheDocument();
    });

    it.each(['KillShell', 'KillBash'])('reads shell_id when called as %s', (name) => {
        render(<TaskStopRenderer toolUse={makeToolUse(name, {shell_id: 'b5a3bdzoi'})} />);
        expect(screen.getByText(/b5a3bdzoi/)).toBeInTheDocument();
    });

    // The CLI resolves `task_id ?? shell_id`, so the current field wins.
    it('prefers task_id when both are present', () => {
        render(<TaskStopRenderer toolUse={makeToolUse('TaskStop', {
            task_id: 'current',
            shell_id: 'legacy',
        })} />);

        expect(screen.getByText(/current/)).toBeInTheDocument();
        expect(screen.queryByText(/legacy/)).not.toBeInTheDocument();
    });
});

describe('TaskOutput reads the id whichever field carries it', () => {
    it('reads task_id', () => {
        render(<TaskOutputRenderer toolUse={makeToolUse('TaskOutput', {task_id: 'agent_77'})} />);
        expect(screen.getByText(/agent_77/)).toBeInTheDocument();
    });

    it.each(['BashOutput', 'BashOutputTool'])('reads bash_id when called as %s', (name) => {
        render(<TaskOutputRenderer toolUse={makeToolUse(name, {bash_id: 'b5a3bdzoi'})} />);
        expect(screen.getByText(/b5a3bdzoi/)).toBeInTheDocument();
    });

    it('prefers task_id when both are present', () => {
        render(<TaskOutputRenderer toolUse={makeToolUse('TaskOutput', {
            task_id: 'current',
            bash_id: 'legacy',
        })} />);

        expect(screen.getByText(/current/)).toBeInTheDocument();
        expect(screen.queryByText(/legacy/)).not.toBeInTheDocument();
    });
});
