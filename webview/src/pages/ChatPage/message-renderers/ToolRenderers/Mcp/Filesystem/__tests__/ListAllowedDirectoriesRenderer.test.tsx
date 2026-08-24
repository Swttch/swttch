import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListAllowedDirectoriesRenderer } from '../ListAllowedDirectoriesRenderer';
import { ToolUseBlockDto, ContentBlockType } from '@/dto';
import { LoadedMessageDto, MessageDto } from '@/types';
import { MessageRole } from '@/dto/common';

vi.mock('@/adapters', () => ({
    getAdapter: () => ({ openFile: vi.fn() }),
}));

function makeToolUse(): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name: 'list_allowed_directories',
        input: {},
    });
}

function makeResult(text: string): LoadedMessageDto {
    const msg = Object.assign(new MessageDto(), {
        role: MessageRole.User,
        content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: text }],
    });
    return Object.assign(new LoadedMessageDto(), { message: msg });
}

describe('ListAllowedDirectoriesRenderer', () => {
    it('renders tool name in the header', () => {
        render(<ListAllowedDirectoriesRenderer toolUse={makeToolUse()} />);
        expect(screen.getByText('list_allowed_directories')).toBeInTheDocument();
    });

    it('renders IN row with empty object when input is empty', () => {
        render(<ListAllowedDirectoriesRenderer toolUse={makeToolUse()} />);
        expect(screen.getByText('IN')).toBeInTheDocument();
        expect(screen.getByText('{}')).toBeInTheDocument();
    });

    it('does not render OUT row when toolResult is absent', () => {
        render(<ListAllowedDirectoriesRenderer toolUse={makeToolUse()} />);
        expect(screen.queryByText('OUT')).not.toBeInTheDocument();
    });

    it('renders OUT row with raw text when toolResult is provided', () => {
        const text = 'Allowed directories:\n- /repo/a\n- /repo/b';
        render(<ListAllowedDirectoriesRenderer toolUse={makeToolUse()} toolResult={makeResult(text)} />);
        expect(screen.getByText('OUT')).toBeInTheDocument();
        expect(screen.getByText((_, el) => el?.textContent === text)).toBeInTheDocument();
    });

    it('does not render directory chips (plain text only)', () => {
        const text = '/repo/a\n/repo/b';
        const { container } = render(
            <ListAllowedDirectoriesRenderer toolUse={makeToolUse()} toolResult={makeResult(text)} />
        );
        // Every button except the block's own soft-wrap toggle (#179), which is
        // chrome on the box rather than a rendering of the payload.
        const chips = Array.from(container.querySelectorAll('button'))
            .filter((b) => !b.getAttribute('aria-label')?.match(/wrap/i));
        expect(chips).toHaveLength(0);
    });
});
