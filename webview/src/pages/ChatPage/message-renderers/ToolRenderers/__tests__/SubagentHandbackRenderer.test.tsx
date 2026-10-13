import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {SubagentHandbackRenderer} from '../SubagentHandbackRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

function makeToolUse(input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name: 'SubagentHandback',
        input,
    });
}

/**
 * `SubagentHandback` is how a subagent delivers its final report to the agent
 * that spawned it (#535). Left unregistered it rendered as a bare row labelled
 * "unknown", with the report itself nowhere on screen.
 */
describe('SubagentHandbackRenderer', () => {
    it('renders the report the subagent hands back', () => {
        render(<SubagentHandbackRenderer toolUse={makeToolUse({
            message: 'README mentions build twice.',
        })} />);

        expect(screen.getByText(/README mentions build twice\./)).toBeInTheDocument();
    });

    it('titles the row with the tool name and not with "unknown"', () => {
        render(<SubagentHandbackRenderer toolUse={makeToolUse({message: 'Done.'})} />);

        expect(screen.getByText('SubagentHandback')).toBeInTheDocument();
        expect(screen.queryByText('unknown')).not.toBeInTheDocument();
    });

    it('still renders the row when the report is not there yet', () => {
        render(<SubagentHandbackRenderer toolUse={makeToolUse({})} />);

        expect(screen.getByText('SubagentHandback')).toBeInTheDocument();
    });
});
