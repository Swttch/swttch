import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {RemoteTriggerRenderer} from '../RemoteTriggerRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

function makeToolUse(input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name: 'RemoteTrigger',
        input,
    });
}

function makeToolResult(text: string): LoadedMessageDto {
    return {
        message: {content: [{type: ContentBlockType.ToolResult, content: text}]},
    } as unknown as LoadedMessageDto;
}

describe('RemoteTriggerRenderer', () => {
    it('shows the action', () => {
        render(<RemoteTriggerRenderer toolUse={makeToolUse({action: 'list'})} />);
        expect(screen.getByText('list')).toBeInTheDocument();
    });

    it('shows the trigger it acted on', () => {
        render(<RemoteTriggerRenderer toolUse={makeToolUse({action: 'run', trigger_id: 'trg_123'})} />);
        expect(screen.getByText('trg_123')).toBeInTheDocument();
    });

    // Only one id is ever set: get_run_log targets a session, the rest a trigger.
    it('shows the session id when that is what the action targets', () => {
        render(<RemoteTriggerRenderer toolUse={makeToolUse({action: 'get_run_log', session_id: 'cse_456'})} />);
        expect(screen.getByText('cse_456')).toBeInTheDocument();
    });

    it('shows the request body', () => {
        render(<RemoteTriggerRenderer toolUse={makeToolUse({
            action: 'create',
            body: {name: 'nightly'},
        })} />);

        expect(screen.getByText(/nightly/)).toBeInTheDocument();
    });

    it('omits the body box when the body is empty', () => {
        render(<RemoteTriggerRenderer toolUse={makeToolUse({action: 'list', body: {}})} />);
        expect(screen.queryByText('IN')).not.toBeInTheDocument();
    });

    it('shows the response', () => {
        render(
            <RemoteTriggerRenderer
                toolUse={makeToolUse({action: 'list'})}
                toolResult={makeToolResult('{"triggers":[]}')}
            />,
        );

        expect(screen.getByText(/"triggers"/)).toBeInTheDocument();
    });
});
