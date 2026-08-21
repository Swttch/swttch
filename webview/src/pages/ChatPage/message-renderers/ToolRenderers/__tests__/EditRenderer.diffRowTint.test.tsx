/**
 * Issue #179: in a diff card, the tint of an added/removed row stopped partway
 * along the line once you scrolled sideways.
 *
 * Each row is a block inside a horizontally scrolling <pre>, so its box resolves
 * against the container's visible width while the text runs past it. The rows
 * have to share one width — the longest line's — which `.diff-body` carries and
 * each row fills.
 */
import {describe, it, expect, vi, beforeAll} from 'vitest';
import {render, screen} from '@testing-library/react';
import {EditRenderer} from '../EditRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

vi.mock('@/adapters', () => ({
    getAdapter: () => ({openFile: vi.fn()}),
}));

vi.mock('@/contexts/SessionContext', () => ({
    useSessionContext: () => ({workingDirectory: '/repo'}),
}));

// The renderer only draws the diff once its container measures at least 400px.
// jsdom reports 0 for every box, so both the observer and the initial read have
// to report a real width or the diff never renders and the test asserts nothing.
beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
            this.cb([{contentRect: {width: 800}} as ResizeObserverEntry], this as never);
        }
        unobserve() {}
        disconnect() {}
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({width: 800} as DOMRect);
});

function makeToolUse(): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name: 'Edit',
        input: {file_path: '/repo/src/foo.ts', old_string: 'before', new_string: 'after'},
    });
}

function makeToolResult(lines: string[] = ['-before', '+after', ' context']): LoadedMessageDto {
    return {
        message: {content: [{type: ContentBlockType.ToolResult, content: 'ok'}]},
        toolUseResult: {structuredPatch: [{lines}]},
    } as unknown as LoadedMessageDto;
}

describe('EditRenderer diff rows — tint must span the full line (#179)', () => {
    it('marks the removed row so its tint follows the text', () => {
        render(<EditRenderer toolUse={makeToolUse()} toolResult={makeToolResult()} />);
        const row = screen.getByText('before').closest('div');
        expect(row).toHaveClass('diff-body-line');
        // Still tinted: the fix must not have traded the colour for the width.
        expect(row).toHaveClass('bg-state-error-bg');
    });

    it('marks the added row so its tint follows the text', () => {
        render(<EditRenderer toolUse={makeToolUse()} toolResult={makeToolResult()} />);
        const row = screen.getByText('after').closest('div');
        expect(row).toHaveClass('diff-body-line');
        expect(row).toHaveClass('bg-state-success-bg');
    });

    it('marks context rows too, so every row is sized alike', () => {
        render(<EditRenderer toolUse={makeToolUse()} toolResult={makeToolResult()} />);
        const row = screen.getByText('context').closest('div');
        expect(row).toHaveClass('diff-body-line');
    });

    it('sizes all rows off one box, not each off its own text', () => {
        // The bug this guards: sizing each row to its own text gives rows of
        // different lengths different widths, so a short row's tint stops early
        // while a long one runs on. They have to share the longest line's width,
        // which is what `.diff-body` carries — so every row must sit inside it.
        const {container} = render(
            <EditRenderer
                toolUse={makeToolUse()}
                toolResult={makeToolResult([
                    '-short',
                    '+a very much longer replacement line that runs far past the visible width',
                    ' ctx',
                ])}
            />,
        );

        const body = container.querySelector('.diff-body');
        expect(body).not.toBeNull();

        const rows = container.querySelectorAll('.diff-body-line');
        expect(rows.length).toBe(3);
        // Every row — regardless of its own length — hangs off the shared box.
        rows.forEach((row) => expect(body!.contains(row)).toBe(true));

        // And the box is the scroll container's child, so it can outgrow the
        // visible width instead of being clipped to it.
        expect(body!.parentElement?.tagName).toBe('PRE');
    });
});
