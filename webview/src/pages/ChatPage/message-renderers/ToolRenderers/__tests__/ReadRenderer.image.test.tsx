import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ReadRenderer} from '../ReadRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

vi.mock('@/utils/openChatFile', () => ({openChatFile: vi.fn()}));

const toolUse = Object.assign(new ToolUseBlockDto(), {
    type: ContentBlockType.ToolUse,
    id: 'tool_1',
    name: 'Read',
    input: {file_path: '/repo/picture.png'},
});

function resultWith(inner: unknown): LoadedMessageDto {
    return {message: {content: [{type: ContentBlockType.ToolResult, content: inner}]}} as unknown as LoadedMessageDto;
}

describe('ReadRenderer — a picture the CLI read is drawn under the row', () => {
    it('draws an image block as an <img> with a data URL', () => {
        const result = resultWith([{type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'QUJD'}}]);
        render(<ReadRenderer toolUse={toolUse} toolResult={result} />);
        expect(screen.getByRole('img', {name: 'picture.png'})).toHaveAttribute('src', 'data:image/png;base64,QUJD');
    });

    it('draws nothing extra for a text result', () => {
        render(<ReadRenderer toolUse={toolUse} toolResult={resultWith('1\thello')} />);
        expect(screen.queryByRole('img')).toBeNull();
    });

    it('draws nothing while the call has no result', () => {
        render(<ReadRenderer toolUse={toolUse} />);
        expect(screen.queryByRole('img')).toBeNull();
    });
});
