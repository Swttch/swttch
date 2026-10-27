import {describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {ReadRenderer} from '../ReadRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

vi.mock('@/utils/openChatFile', () => ({openChatFile: vi.fn()}));
vi.mock('@/components/SessionGalleryViewer', () => ({
    SessionGalleryViewer: (p: {localSrcs: string[]; openedIndex: number; entryUuid?: string; localKeys?: string[]}) => (
        <div data-testid="lightbox">{p.openedIndex}/{p.localSrcs.length}/{p.entryUuid ?? '-'}/{p.localKeys?.join(',') ?? '-'}</div>
    ),
}));

const toolUse = Object.assign(new ToolUseBlockDto(), {
    type: ContentBlockType.ToolUse,
    id: 'tool_1',
    name: 'Read',
    input: {file_path: '/repo/picture.png'},
});

function resultWith(inner: unknown): LoadedMessageDto {
    return {uuid: 'e1', message: {content: [{type: ContentBlockType.ToolResult, tool_use_id: 'tool_1', content: inner}]}} as unknown as LoadedMessageDto;
}

describe('ReadRenderer — a picture the CLI read is drawn under the row', () => {
    it('draws an image block as an <img> with a data URL', () => {
        const result = resultWith([{type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'QUJD'}}]);
        render(<ReadRenderer toolUse={toolUse} toolResult={result} />);
        expect(screen.getByRole('img', {name: 'picture.png'})).toHaveAttribute('src', 'data:image/png;base64,QUJD');
    });

    it('opens the viewer when the picture is clicked', () => {
        const result = resultWith([{type: 'text', text: 'note'}, {type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'QUJD'}}]);
        render(<ReadRenderer toolUse={toolUse} toolResult={result} />);
        expect(screen.queryByTestId('lightbox')).toBeNull();
        fireEvent.click(screen.getByRole('img', {name: 'picture.png'}));
        expect(screen.getByTestId('lightbox')).toHaveTextContent('0/1/e1/e1:0:1');
    });

    it('shows the text of a text result in a box and draws no picture', () => {
        render(<ReadRenderer toolUse={toolUse} toolResult={resultWith('1\thello')} />);
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByText(/hello/)).toBeInTheDocument();
    });

    it('shows no box for a picture result or an error', () => {
        const picture = resultWith([{type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'QUJD'}}]);
        const {container, rerender} = render(<ReadRenderer toolUse={toolUse} toolResult={picture} />);
        expect(container.querySelector('.monospace-block')).toBeNull();
        const failed = {message: {content: [{type: 'tool_result', content: 'File does not exist', is_error: true}]}} as never;
        rerender(<ReadRenderer toolUse={toolUse} toolResult={failed} />);
        expect(container.querySelector('.monospace-block')).toBeNull();
    });

    it('draws nothing while the call has no result', () => {
        render(<ReadRenderer toolUse={toolUse} />);
        expect(screen.queryByRole('img')).toBeNull();
    });
});
