import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {SendUserFileRenderer} from '../SendUserFileRenderer';
import {_resetSentMediaCache, formatSentSize, sentFilesOf} from '../sendUserFile';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

const {request, openChatFile} = vi.hoisted(() => ({request: vi.fn(), openChatFile: vi.fn()}));

vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
    getBridge: () => ({request}),
}));
vi.mock('@/utils/openChatFile', () => ({openChatFile: (p: string) => openChatFile(p)}));
vi.mock('@/components/ImageLightbox', () => ({
    ImageLightbox: (p: {srcs: (string | null)[]; initialIndex: number}) => (
        <div data-testid="lightbox">{p.initialIndex}/{p.srcs.length}</div>
    ),
}));

function toolUse(files: string[], display?: string): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse, id: 't1', name: 'SendUserFile', input: {files, display, status: 'normal'},
    });
}

function result(attachments: object[], display?: string): LoadedMessageDto {
    return {
        message: {content: [{type: ContentBlockType.ToolResult, content: 'ok'}]},
        toolUseResult: {display, attachments},
    } as unknown as LoadedMessageDto;
}

const PNG = {kind: 'image', mimeType: 'image/png', base64: 'QUJD'};

beforeEach(() => {
    request.mockReset();
    openChatFile.mockReset();
    _resetSentMediaCache();
});

describe('sendUserFile helpers', () => {
    it('writes sizes the way Desktop does', () => {
        expect(formatSentSize(217)).toBe('217BYTE');
        expect(formatSentSize(4608)).toBe('4.5KB');
    });

    it('takes the picture verdict from the result, not from the extension', () => {
        const {files} = sentFilesOf({files: ['/a/x.svg']}, result([{path: '/a/x.svg', size: 9, isImage: false}]));
        expect(files[0]).toMatchObject({name: 'x.svg', badge: 'SVG', size: 9, isImage: false});
    });

    it('falls back to the call while there is no result', () => {
        const {files} = sentFilesOf({files: ['/a/p.png']}, undefined);
        expect(files[0]).toMatchObject({name: 'p.png', isImage: true});
    });
});

describe('SendUserFileRenderer', () => {
    it('draws a non-picture as a card with its badge, name and size, and opens it on click', () => {
        const r = result([{path: '/a/page.html', size: 217, isImage: false}]);
        render(<SendUserFileRenderer toolUse={toolUse(['/a/page.html'])} toolResult={r}/>);
        expect(screen.getByText('HTML')).toBeInTheDocument();
        expect(screen.getByText('217BYTE')).toBeInTheDocument();
        fireEvent.click(screen.getByText('page.html'));
        expect(openChatFile).toHaveBeenCalledWith('/a/page.html');
    });

    it('draws pictures as thumbnails that open the viewer at the clicked one', async () => {
        request.mockResolvedValue(PNG);
        const r = result([
            {path: '/a/1.png', size: 5, isImage: true},
            {path: '/a/2.png', size: 5, isImage: true},
        ]);
        render(<SendUserFileRenderer toolUse={toolUse(['/a/1.png', '/a/2.png'])} toolResult={r}/>);
        const images = await screen.findAllByRole('img');
        expect(images).toHaveLength(2);
        expect(images[0].className).toContain('w-[120px]');
        fireEvent.click(images[1]);
        expect(await screen.findByTestId('lightbox')).toHaveTextContent('1/2');
        await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    });

    it('draws one picture sent with display render at full width', async () => {
        request.mockResolvedValue(PNG);
        const r = result([{path: '/a/1.png', size: 5, isImage: true}], 'render');
        render(<SendUserFileRenderer toolUse={toolUse(['/a/1.png'], 'render')} toolResult={r}/>);
        const image = await screen.findByRole('img');
        expect(image.className).not.toContain('w-[120px]');
    });

    it('falls back to a card when the backend has no picture to give', async () => {
        request.mockResolvedValue({kind: 'none'});
        const r = result([{path: '/a/big.png', size: 99999999, isImage: true}]);
        render(<SendUserFileRenderer toolUse={toolUse(['/a/big.png'])} toolResult={r}/>);
        await waitFor(() => expect(screen.getByText('PNG')).toBeInTheDocument());
    });

    it('keeps pictures and cards in the order they were sent, in one block', async () => {
        request.mockResolvedValue(PNG);
        const r = result([
            {path: '/a/t.csv', size: 1, isImage: false},
            {path: '/a/p.png', size: 1, isImage: true},
        ]);
        const {container} = render(<SendUserFileRenderer toolUse={toolUse(['/a/t.csv', '/a/p.png'])} toolResult={r}/>);
        await screen.findByRole('img');
        const grid = container.querySelector('.flex-wrap') as HTMLElement;
        expect(grid.children).toHaveLength(2);
        expect(grid.children[0]).toHaveTextContent('t.csv');
    });

    it('plays a video in a player', async () => {
        URL.createObjectURL = vi.fn(() => 'blob:x');
        request.mockResolvedValue({kind: 'video', mimeType: 'video/mp4', base64: 'QUJD'});
        const r = result([{path: '/a/c.mp4', size: 3, isImage: false, media_type: 'video/mp4'}]);
        const {container} = render(<SendUserFileRenderer toolUse={toolUse(['/a/c.mp4'])} toolResult={r}/>);
        await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
        expect(container.querySelector('video')).toHaveAttribute('src', 'blob:x');
    });
});
