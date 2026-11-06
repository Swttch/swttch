import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';
const looked = vi.hoisted(() => ({value: undefined as string | undefined}));
vi.mock('@/hooks/useDesktopSession', () => ({
    useDesktopSession: () => (looked.value === undefined ? undefined : {title: looked.value}),
}));

// The registry first: it is the entry the app reaches the renderers through, and entering from them instead
// walks the module cycle the other way round.
import '../index';
import {SendMessageRenderer, parseSessionDelivery} from '../SendMessageRenderer';

function makeToolUse(input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {type: ContentBlockType.ToolUse, id: 'tool_1', name: 'SendMessage', input});
}

function makeToolResult(content: string): LoadedMessageDto {
    return {message: {content: [{type: ContentBlockType.ToolResult, content}]}} as unknown as LoadedMessageDto;
}

const SESSION_RESULT =
    'Forwarded to Claude Desktop\'s session messaging: Message delivered to session local_2722d284-a8d1 ("2026.11.06 Fri - v0.36.0"); ' +
    'its turn has started on it. (delivery: delivered; message_id: 783b47b2; not confirmed read)';

describe('parseSessionDelivery', () => {
    it('reads the receiving session\'s title and how the delivery went', () => {
        expect(parseSessionDelivery(SESSION_RESULT)).toEqual({title: '2026.11.06 Fri - v0.36.0', delivery: 'delivered'});
    });

    it('finds nothing in an answer of another shape', () => {
        expect(parseSessionDelivery('{"message":"Resuming agent ad4bd1a"}')).toEqual({});
        expect(parseSessionDelivery('')).toEqual({});
    });
});

describe('SendMessageRenderer', () => {
    it('names the receiving session by its title, with the delivery and the message, as Desktop does', () => {
        const {container} = render(
            <SendMessageRenderer
                toolUse={makeToolUse({to: 'local_2722d284-a8d1', message: 'Issue 596 is done.'})}
                toolResult={makeToolResult(SESSION_RESULT)}
            />,
        );
        expect(screen.getByText('Message sent')).toBeInTheDocument();
        expect(screen.getByText('2026.11.06 Fri - v0.36.0')).toBeInTheDocument();
        expect(screen.getByText('Delivered')).toBeInTheDocument();
        expect(screen.getByText('Issue 596 is done.')).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/local_2722d284/);
    });

    it('never shows the id: with no title it says it was another session', () => {
        const {container} = render(<SendMessageRenderer toolUse={makeToolUse({to: 'local_2722d284-a8d1', message: 'hi'})} />);
        expect(screen.getByText('another session')).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/local_2722d284/);
        expect(screen.queryByText('Delivered')).not.toBeInTheDocument();
    });

    it('takes the title from Desktop\'s session file when its answer names none', () => {
        looked.value = 'Release 0.36.0 manager';
        try {
            const {container} = render(
                <SendMessageRenderer
                    toolUse={makeToolUse({to: 'local_d7b9f181', message: 'hi'})}
                    toolResult={makeToolResult('Message queued for session local_d7b9f181 (delivery: queued)')}
                />,
            );
            expect(screen.getByText('Release 0.36.0 manager')).toBeInTheDocument();
            expect(container.textContent).not.toMatch(/local_d7b9f181/);
        } finally {
            looked.value = undefined;
        }
    });

    it('puts the message in a card of its own', () => {
        const {container} = render(
            <SendMessageRenderer toolUse={makeToolUse({to: 'local_x', message: 'Issue 596 is done.'})} toolResult={makeToolResult(SESSION_RESULT)} />,
        );
        const card = screen.getByText('Issue 596 is done.').closest('.border');
        expect(card).not.toBeNull();
        expect(container.querySelector('[data-testid=session-message-card]')?.contains(card)).toBe(true);
    });

    it('keeps the old card for a message to an agent', () => {
        render(
            <SendMessageRenderer
                toolUse={makeToolUse({to: 'researcher', message: 'look into it'})}
                toolResult={makeToolResult('{"message":"Resuming agent ad4bd1a"}')}
            />,
        );
        expect(screen.getByText('SendMessage')).toBeInTheDocument();
        expect(screen.queryByText('Message sent')).not.toBeInTheDocument();
    });
});
