/**
 * Issue #508: a diff card in an Edit tool call shows a line number gutter, and
 * a number jumps to that line of the edited file.
 */
import {describe, it, expect, vi, beforeAll, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {EditRenderer} from '../EditRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

const openFile = vi.fn();

vi.mock('@/adapters', () => ({
    getAdapter: () => ({openFile}),
}));

vi.mock('@/contexts/SessionContext', () => ({
    useSessionContext: () => ({workingDirectory: '/repo'}),
}));

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

beforeEach(() => openFile.mockClear());

function makeToolUse(): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name: 'Edit',
        input: {file_path: '/repo/src/foo.ts', old_string: 'before', new_string: 'after'},
    });
}

function makeToolResult(structuredPatch: unknown[]): LoadedMessageDto {
    return {
        message: {content: [{type: ContentBlockType.ToolResult, content: 'ok'}]},
        toolUseResult: {structuredPatch},
    } as unknown as LoadedMessageDto;
}

const patch = [{
    oldStart: 9, oldLines: 3, newStart: 9, newLines: 3,
    lines: [' keep', '-before', '+after', ' tail'],
}];

function gutterOf(text: string): HTMLElement {
    return screen.getByText(text).closest('div')!.firstElementChild as HTMLElement;
}

describe('EditRenderer line numbers (#508)', () => {
    it('counts from the hunk start, a context line taking one step in both files', () => {
        render(<EditRenderer toolUse={makeToolUse()} toolResult={makeToolResult(patch)} />);
        expect(gutterOf('keep')).toHaveTextContent('9');
        // The removed line sits at old line 10, the added line at new line 10.
        expect(gutterOf('before')).toHaveTextContent('10');
        expect(gutterOf('after')).toHaveTextContent('10');
        expect(gutterOf('tail')).toHaveTextContent('11');
    });

    it('opens the edited file at the clicked line', () => {
        render(<EditRenderer toolUse={makeToolUse()} toolResult={makeToolResult(patch)} />);
        fireEvent.click(gutterOf('after'));
        expect(openFile).toHaveBeenCalledWith('/repo/src/foo.ts', 10);
    });

    it('does not jump from a removed line, which the edited file no longer has', () => {
        render(<EditRenderer toolUse={makeToolUse()} toolResult={makeToolResult(patch)} />);
        fireEvent.click(gutterOf('before'));
        expect(openFile).not.toHaveBeenCalled();
    });

    it('starts each hunk from its own start line', () => {
        const hunks = [
            {oldStart: 1, newStart: 1, lines: ['+one']},
            {oldStart: 40, newStart: 41, lines: [' far']},
        ];
        render(<EditRenderer toolUse={makeToolUse()} toolResult={makeToolResult(hunks)} />);
        expect(gutterOf('one')).toHaveTextContent('1');
        expect(gutterOf('far')).toHaveTextContent('41');
    });

    it('draws no gutter when the patch carries no start lines', () => {
        render(<EditRenderer toolUse={makeToolUse()} toolResult={makeToolResult([{lines: ['-before', '+after']}])} />);
        const row = screen.getByText('after').closest('div')!;
        // First child is the +/- marker, not a number.
        expect(row.firstElementChild).toHaveTextContent('+');
    });
});
