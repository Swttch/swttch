import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ToolRenderer} from '../ToolRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';
import {buildUserDeclinedContent} from '@/shared';

vi.mock('@/adapters', () => ({getAdapter: () => ({openFile: vi.fn()})}));
vi.mock('@/contexts/SessionContext', () => ({
    useSessionContext: () => ({workingDirectory: '/repo'}),
}));

/**
 * A declined tool used to print its marker text into an ordinary result box —
 * the same place, font and colour a tool that ran prints its output — so on
 * screen a refusal read like a success. The CLI shows it in red instead.
 */

// ToolRenderer reads the result off the tool_use block, not from a prop.
function makeToolUse(
    name: string,
    input: Record<string, unknown>,
    toolResult?: LoadedMessageDto,
): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name,
        input,
        tool_result: toolResult,
    });
}

const SETTLED = {isStreaming: false} as unknown as LoadedMessageDto;

function declinedResult(instruction?: string): LoadedMessageDto {
    return {
        message: {
            content: [{
                type: ContentBlockType.ToolResult,
                content: buildUserDeclinedContent(instruction),
                is_error: true,
            }],
        },
    } as unknown as LoadedMessageDto;
}

function okResult(text: string): LoadedMessageDto {
    return {
        message: {content: [{type: ContentBlockType.ToolResult, content: text}]},
    } as unknown as LoadedMessageDto;
}

describe('a declined tool is presented as a refusal, not as output', () => {
    it('shows the decline in the error colour', () => {
        render(<ToolRenderer toolUse={makeToolUse('CronList', {}, declinedResult())} message={SETTLED} />);

        const note = screen.getByText(/User declined to run this tool/);
        expect(note.className).toContain('text-state-error-fg');
    });

    it('carries the instruction the user gave instead', () => {
        render(
            <ToolRenderer
                toolUse={makeToolUse('CronList', {}, declinedResult('leave the worktree alone'))}
                message={SETTLED}
            />,
        );

        expect(screen.getByText(/leave the worktree alone/)).toBeInTheDocument();
    });

    it('marks the bullet as an error, the way the CLI does', () => {
        const {container} = render(
            <ToolRenderer toolUse={makeToolUse('CronList', {}, declinedResult())} message={SETTLED} />,
        );

        const bullet = container.querySelector('[data-message-bullet]');
        expect(bullet?.className).toContain('text-state-error-fg');
    });

    // The raw marker must never reach a result box, whichever card is rendering.
    it.each(['CronList', 'CronDelete', 'ExitWorktree', 'RemoteTrigger', 'ReportFindings'])(
        'keeps the marker out of the %s result row',
        (name) => {
            const {container} = render(
                <ToolRenderer toolUse={makeToolUse(name, {}, declinedResult())} message={SETTLED} />,
            );

            // Shown as recorded, but never with the invisible sentinel that marks
            // it — that belongs to the wire format, not to what the user reads.
            expect(container.textContent).not.toMatch(/\u200B/);

            // Exactly once: the card must not also print it as a result row, which
            // is what made a refusal read like output in the first place.
            expect(screen.getAllByText(/User declined to run this tool/)).toHaveLength(1);
        },
    );

    // The control: an ordinary result still reaches its row, so the assertions
    // above are about the decline and not about results never rendering.
    it('still shows a normal result as output', () => {
        render(
            <ToolRenderer toolUse={makeToolUse('CronList', {}, okResult('No scheduled jobs.'))} message={SETTLED} />,
        );

        expect(screen.getByText(/No scheduled jobs\./)).toBeInTheDocument();
        expect(screen.queryByText(/User declined to run this tool/)).not.toBeInTheDocument();
    });
});
