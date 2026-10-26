import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {SendUserFileRenderer} from '../SendUserFileRenderer';
import {_resetSentMediaCache, formatSentSize, sentFilesOf} from '../sendUserFile';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

const {request, openChatFile, toastError} = vi.hoisted(() => ({request: vi.fn(), openChatFile: vi.fn(), toastError: vi.fn()}));

vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
    getBridge: () => ({request}),
}));
vi.mock('react-hot-toast', () => ({default: {error: toastError}}));
vi.mock('@/utils/openChatFile', () => ({openSentFile: (p: string) => openChatFile(p)}));
// The tooltip's content is what is under test, not Tippy's popper: expose it.
vi.mock('@/components/Tooltip', () => ({
    Tooltip: (p: {content: React.ReactNode; children: React.ReactElement}) => (
        <div data-testid="tooltip-wrap" data-path={String((p.content as {props?: {children?: unknown}})?.props?.children ?? '')}>{p.children}</div>
    ),
}));
vi.mock('@/components/SessionGalleryViewer', () => ({
    SessionGalleryViewer: (p: {localSrcs: string[]; openedIndex: number; entryUuid?: string; localKeys?: string[]}) => (
        <div data-testid="lightbox">{p.openedIndex}/{p.localSrcs.length}/{p.entryUuid ?? '-'}/{p.localKeys?.join(',') ?? '-'}</div>
    ),
}));

function toolUse(files: string[]): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse, id: 't1', name: 'SendUserFile', input: {files, status: 'normal'},
    });
}

function result(attachments: {path: string; size?: number}[]): LoadedMessageDto {
    return {
        uuid: 'e9',
        message: {content: [{type: ContentBlockType.ToolResult, tool_use_id: 't1', content: 'ok'}]},
        toolUseResult: {attachments},
    } as unknown as LoadedMessageDto;
}

const draw = (attachments: {path: string; size?: number}[]) =>
    render(<SendUserFileRenderer toolUse={toolUse(attachments.map((a) => a.path))} toolResult={result(attachments)}/>);

const PNG = {kind: 'image', mimeType: 'image/png', base64: 'QUJD'};

beforeEach(() => {
    request.mockReset();
    openChatFile.mockReset();
    toastError.mockReset();
    _resetSentMediaCache();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
});

describe('SendUserFileRenderer while the CLI has not answered', () => {
    it('says the files are being shared, as Claude Desktop does, instead of drawing nothing', () => {
        render(<SendUserFileRenderer toolUse={toolUse(['/tmp/a.bin'])} toolResult={undefined}/>);
        expect(screen.getByText('Sharing files…')).toBeInTheDocument();
    });
});

describe('sendUserFile helpers', () => {
    it('writes sizes the way Desktop does, in units of 1000', () => {
        expect(formatSentSize(217)).toBe('217BYTE');
        expect(formatSentSize(9170)).toBe('9.2KB');
        expect(formatSentSize(41322937)).toBe('41.3MB');
        expect(formatSentSize(0)).toBe('0BYTE');
    });

    it('decides how each file is drawn by its extension, not by the CLI verdict', () => {
        const names = ['a.png', 'b.webp', 'c.bmp', 'd.avif', 'e.svg', 'f.m4v', 'g.mov', 'h.mp3', 'i.wav', 'j.zip', 'k.mp4'];
        const kinds = sentFilesOf({files: names.map((n) => `/x/${n}`)}, undefined).files.map((f) => [f.name, f.kind]);
        expect(kinds).toEqual([
            ['a.png', 'picture'], ['b.webp', 'picture'], ['c.bmp', 'picture'], ['d.avif', 'picture'], ['e.svg', 'file'],
            ['f.m4v', 'file'], ['g.mov', 'video'], ['h.mp3', 'audio'], ['i.wav', 'audio'], ['j.zip', 'file'], ['k.mp4', 'video'],
        ]);
    });
});

describe('SendUserFileRenderer', () => {
    it('draws several files in one block that wraps, a card each with badge, name and size, and opens one on click', () => {
        const {container} = draw([{path: '/a/page.html', size: 142}, {path: '/a/t.csv', size: 55}]);
        expect(screen.getByText('HTML')).toBeInTheDocument();
        expect(screen.getByText('142BYTE')).toBeInTheDocument();
        const block = container.querySelector('.flex-wrap') as HTMLElement;
        expect(block.className).not.toMatch(/max-w/);
        expect(block.children).toHaveLength(2);
        fireEvent.click(screen.getByText('page.html'));
        expect(openChatFile).toHaveBeenCalledWith('/a/page.html');
    });

    it('draws a file sent alone as a one-line chip', () => {
        draw([{path: '/a/big40mb.mp4.bin', size: 41322937}]);
        expect(screen.getByText('41.3MB')).toBeInTheDocument();
        expect(screen.getByText('big40mb.mp4.bin').closest('button')?.className).toContain('rounded-xl');
        expect(screen.getByText('big40mb.mp4.bin').closest('button')?.className).not.toContain('h-full');
        // The size gives way to the download button on hover.
        expect(screen.getByText('41.3MB').className).toContain('group-hover/sent:opacity-0');
    });

    it('draws pictures as thumbnails, side by side with the cards, in the order they were sent', async () => {
        request.mockResolvedValue(PNG);
        const {container} = draw([{path: '/a/t.csv', size: 1}, {path: '/a/p.webp', size: 1}, {path: '/a/q.bmp', size: 1}]);
        await screen.findAllByRole('img');
        const block = container.querySelector('.flex-wrap') as HTMLElement;
        expect(block.children).toHaveLength(3);
        expect(block.children[0]).toHaveTextContent('t.csv');
        expect(screen.getAllByRole('img')[0].className).toContain('object-contain');
    });

    it('draws a picture sent alone at its own size, not as a thumbnail', async () => {
        request.mockResolvedValue(PNG);
        draw([{path: '/a/gone.png', size: 181}]);
        const image = await screen.findByRole('img');
        expect(image.className).not.toContain('120px');
    });

    it('opens the viewer on the clicked picture, with its place in the session', async () => {
        request.mockResolvedValue(PNG);
        draw([{path: '/a/1.png', size: 5}, {path: '/a/2.png', size: 5}]);
        const images = await screen.findAllByRole('img');
        fireEvent.click(images[1]);
        expect(await screen.findByTestId('lightbox')).toHaveTextContent('1/2/e9/e9:0:f0,e9:0:f1');
    });

    it('falls back to a card when the backend has no picture to give', async () => {
        request.mockResolvedValue({kind: 'none'});
        draw([{path: '/a/big.png', size: 99999999}, {path: '/a/other.txt', size: 3}]);
        await waitFor(() => expect(screen.getByText('PNG')).toBeInTheDocument());
    });

    // A picture that was missing when the card first drew (gone, then written or restored) must not
    // stay a chip for good: the next draw asks again.
    it('asks again on the next draw after the file was missing', async () => {
        request.mockResolvedValueOnce({kind: 'none'});
        const first = draw([{path: '/a/gone.png', size: 181}]);
        await waitFor(() => expect(screen.getByText('PNG')).toBeInTheDocument());
        first.unmount();
        request.mockResolvedValue(PNG);
        draw([{path: '/a/gone.png', size: 181}]);
        expect(await screen.findByRole('img')).toBeInTheDocument();
    });

    it('plays video in a player, and a m4v as a card', async () => {
        // A video is read in pieces, the way the preview pane reads one (any size Claude Desktop plays).
        request.mockImplementation(async (_type: string, payload: {path: string}) =>
            payload.path.endsWith('.mp4')
                ? {ok: true, kind: 'video', mimeType: 'video/mp4', size: 3, offset: 0, base64: 'QUJD'}
                : {kind: 'none'});
        const {container} = draw([{path: '/a/c.mp4', size: 3}, {path: '/a/d.m4v', size: 3}]);
        await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
        expect(container.querySelector('video')).toHaveAttribute('src', 'blob:x');
        expect(screen.getByText('M4V')).toBeInTheDocument();
    });

    it('draws a video too big to play as a chip when it is sent alone, and as a card among others', async () => {
        request.mockResolvedValue({kind: 'none'});
        const alone = draw([{path: '/a/big40mb.mp4', size: 41322937}]);
        await waitFor(() => expect(screen.getByText('41.3MB')).toBeInTheDocument());
        expect(screen.getByText('big40mb.mp4').closest('button')?.className).not.toContain('h-full');
        alone.unmount();

        draw([{path: '/a/big40mb.mp4', size: 41322937}, {path: '/a/t.csv', size: 5}]);
        await waitFor(() => expect(screen.getByText('big40mb.mp4').closest('button')?.className).toContain('h-full'));
    });

    it('plays sound in a player with the file name above it', async () => {
        request.mockResolvedValue({kind: 'audio', mimeType: 'audio/mpeg', base64: 'QUJD'});
        const {container} = draw([{path: '/a/sample.mp3', size: 3}]);
        await waitFor(() => expect(container.querySelector('audio')).not.toBeNull());
        expect(screen.getByText('sample.mp3')).toBeInTheDocument();
        expect(container.querySelector('audio')).toHaveAttribute('src', 'blob:x');
    });

    it('asks for the sent-file limits when it asks for a picture', async () => {
        request.mockResolvedValue(PNG);
        draw([{path: '/a/1.png', size: 5}]);
        await screen.findByRole('img');
        expect(request).toHaveBeenCalledWith(expect.anything(), {path: '/a/1.png', sentFile: true});
    });

    it('shows the full path on hover of any item', () => {
        draw([{path: '/a/b/page.html', size: 1}, {path: '/a/b/t.csv', size: 1}]);
        expect(screen.getAllByTestId('tooltip-wrap').map((el) => el.getAttribute('data-path')).filter(Boolean)).toEqual(['/a/b/page.html', '/a/b/t.csv']);
    });
});

describe('the download button', () => {
    function clickDownload() {
        const anchors: HTMLAnchorElement[] = [];
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            anchors.push(this);
        };
        return {anchors, restore: () => { HTMLAnchorElement.prototype.click = click; }};
    }

    it('is there for every item, fades in on hover, and saves the file under its own name', async () => {
        request.mockResolvedValue({ok: true, size: 3, offset: 0, base64: 'QUJD'});
        const {anchors, restore} = clickDownload();
        draw([{path: '/a/page.html', size: 3}, {path: '/a/t.csv', size: 3}]);

        const buttons = screen.getAllByRole('button', {name: 'Download'});
        expect(buttons).toHaveLength(2);
        expect(buttons[0].className).toContain('opacity-0');
        expect(buttons[0].className).toContain('group-hover/sent:opacity-100');
        expect(buttons[0].className).toContain('transition-opacity');

        fireEvent.click(buttons[1]);
        await waitFor(() => expect(anchors).toHaveLength(1));
        expect(anchors[0].download).toBe('t.csv');
        expect(openChatFile).not.toHaveBeenCalled();
        restore();
    });

    it('reads a big file in pieces until it has all of it', async () => {
        request
            .mockResolvedValueOnce({ok: true, size: 6, offset: 0, base64: 'QUJD'})
            .mockResolvedValueOnce({ok: true, size: 6, offset: 3, base64: 'REVG'});
        const {anchors, restore} = clickDownload();
        draw([{path: '/a/x.zip', size: 6}]);
        fireEvent.click(screen.getByRole('button', {name: 'Download'}));
        await waitFor(() => expect(anchors).toHaveLength(1));
        expect(request).toHaveBeenNthCalledWith(2, expect.anything(), {path: '/a/x.zip', offset: 3});
        restore();
    });

    it('says so when the file cannot be read', async () => {
        request.mockResolvedValue({ok: false, reason: 'unreadable'});
        const {anchors, restore} = clickDownload();
        draw([{path: '/a/x.zip', size: 6}]);
        fireEvent.click(screen.getByRole('button', {name: 'Download'}));
        await waitFor(() => expect(toastError).toHaveBeenCalled());
        expect(anchors).toHaveLength(0);
        restore();
    });
});
