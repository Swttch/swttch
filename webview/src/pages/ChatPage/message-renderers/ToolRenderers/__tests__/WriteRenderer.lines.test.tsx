import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {WriteRenderer} from '../WriteRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

vi.mock('@/utils/openChatFile', () => ({openChatFile: vi.fn()}));

function writeOf(content: string): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse, id: 't1', name: 'Write', input: {file_path: '/a/hello.txt', content},
    });
}

describe('WriteRenderer — the written file as added lines', () => {
    it('numbers every line of a short file and marks it added', () => {
        render(<WriteRenderer toolUse={writeOf('hello\nsecond line\n')} />);
        expect(screen.getByText('hello')).toBeInTheDocument();
        expect(screen.getByText('second line')).toBeInTheDocument();
        expect(screen.getAllByText('+')).toHaveLength(2);
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows only the first 200 lines of a long file', () => {
        const content = Array.from({length: 250}, (_, i) => `line ${i + 1}`).join('\n');
        render(<WriteRenderer toolUse={writeOf(content)} />);
        expect(screen.getAllByText('+')).toHaveLength(200);
        expect(screen.queryByText('line 201')).toBeNull();
    });

    it('shows no box for an empty file', () => {
        render(<WriteRenderer toolUse={writeOf('')} />);
        expect(screen.queryByText('+')).toBeNull();
    });
});
