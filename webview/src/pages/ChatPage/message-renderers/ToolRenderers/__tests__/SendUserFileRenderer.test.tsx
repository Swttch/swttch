import {beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {subscribeComposerFiles} from '@/utils/composerElements';
import {SendUserFileRenderer} from '../SendUserFileRenderer';
import {_resetSentMediaCache, formatSentSize, sentFilesOf} from '../sendUserFile';
import {_resetSentFileProgress} from '../sentFileProgress';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

const {request, openChatFile, toastError, toastSuccess, revealFile, handlers, subscribe} = vi.hoisted(() => {
    // What the backend sends without being asked, by message type: the test calls these to play the backend.
    const handlers = new Map<string, (message: {payload: unknown}) => void>();
    return {
        request: vi.fn(), openChatFile: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(), revealFile: vi.fn(() => Promise.resolve()),
        handlers,
        subscribe: vi.fn((type: string, handler: (message: {payload: unknown}) => void) => {
            handlers.set(type, handler);
            return () => { handlers.delete(type); };
        }),
    };
});

vi.mock('@/adapters', () => ({getAdapter: () => ({revealFile})}));

vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
    getBridge: () => ({request, subscribe}),
}));
vi.mock('react-hot-toast', () => ({default: {error: toastError, success: toastSuccess}}));
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
    toastSuccess.mockReset();
    _resetSentMediaCache();
    _resetSentFileProgress();
    handlers.clear();
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

    /** A host that cannot show its save dialog (an older plugin that does not know the request): the file goes through the browser. */
    function hostCannotSave(bytes: (payload: {offset?: number}) => unknown) {
        request.mockImplementation((type: string, payload: {offset?: number}) =>
            type === 'SAVE_SENT_FILE' ? Promise.reject(new Error('unknown request')) : Promise.resolve(bytes(payload)));
    }

    it('is there for every item and fades in on hover', () => {
        draw([{path: '/a/page.html', size: 3}, {path: '/a/t.csv', size: 3}]);
        const buttons = screen.getAllByRole('button', {name: 'Download'});
        expect(buttons).toHaveLength(2);
        // The buttons fade in together, as one group, beside the other.
        const group = buttons[0].parentElement as HTMLElement;
        expect(group.className).toContain('opacity-0');
        expect(group.className).toContain('group-hover/sent:opacity-100');
        expect(group.className).toContain('transition-opacity');
        expect(screen.getAllByRole('button', {name: 'More options'})[0].parentElement).toBe(group);
    });

    it('asks the host where to save the file, saves it under its own name and says where it went', async () => {
        request.mockResolvedValue({path: '/Users/me/Documents/t.csv'});
        draw([{path: '/a/page.html', size: 3}, {path: '/a/t.csv', size: 3}]);
        fireEvent.click(screen.getAllByRole('button', {name: 'Download'})[1]);
        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Saved: /Users/me/Documents/t.csv'));
        expect(request).toHaveBeenCalledWith('SAVE_SENT_FILE', {path: '/a/t.csv', suggestedName: 't.csv'}, {timeout: null});
        expect(openChatFile).not.toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });

    it('says nothing when the save dialog is closed', async () => {
        request.mockResolvedValue({path: null});
        draw([{path: '/a/t.csv', size: 3}]);
        fireEvent.click(screen.getByRole('button', {name: 'Download'}));
        await waitFor(() => expect(request).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(toastSuccess).not.toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });

    it('says so when the host cannot read the file', async () => {
        request.mockResolvedValue({error: 'unreadable'});
        draw([{path: '/a/x.zip', size: 6}]);
        fireEvent.click(screen.getByRole('button', {name: 'Download'}));
        await waitFor(() => expect(toastError).toHaveBeenCalled());
        expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('hands the file to the browser when the host cannot ask, and says it was downloaded', async () => {
        hostCannotSave(() => ({ok: true, size: 3, offset: 0, base64: 'QUJD'}));
        const {anchors, restore} = clickDownload();
        draw([{path: '/a/page.html', size: 3}, {path: '/a/t.csv', size: 3}]);
        fireEvent.click(screen.getAllByRole('button', {name: 'Download'})[1]);
        await waitFor(() => expect(anchors).toHaveLength(1));
        expect(anchors[0].download).toBe('t.csv');
        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Downloaded t.csv'));
        restore();
    });

    it('reads a big file in pieces until it has all of it, when the browser does the saving', async () => {
        hostCannotSave(({offset}) => (offset ? {ok: true, size: 6, offset: 3, base64: 'REVG'} : {ok: true, size: 6, offset: 0, base64: 'QUJD'}));
        const {anchors, restore} = clickDownload();
        draw([{path: '/a/x.zip', size: 6}]);
        fireEvent.click(screen.getByRole('button', {name: 'Download'}));
        await waitFor(() => expect(anchors).toHaveLength(1));
        expect(request).toHaveBeenCalledWith(expect.anything(), {path: '/a/x.zip', offset: 3});
        restore();
    });

    it('says so when the browser path cannot read the file either', async () => {
        hostCannotSave(() => ({ok: false, reason: 'unreadable'}));
        const {anchors, restore} = clickDownload();
        draw([{path: '/a/x.zip', size: 6}]);
        fireEvent.click(screen.getByRole('button', {name: 'Download'}));
        await waitFor(() => expect(toastError).toHaveBeenCalled());
        expect(anchors).toHaveLength(0);
        restore();
    });
});

describe('the card while its file is being saved', () => {
    it('fills its background as far as the backend says the file is written, then lets go of it', async () => {
        let finishSave: (answer: unknown) => void = () => {};
        request.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
        draw([{path: '/a/t.csv', size: 10}, {path: '/a/other.csv', size: 10}]);
        expect(screen.queryByRole('progressbar')).toBeNull();

        fireEvent.click(screen.getAllByRole('button', {name: 'Download'})[0]);
        await waitFor(() => expect(handlers.has('SAVE_SENT_FILE_PROGRESS')).toBe(true));
        act(() => handlers.get('SAVE_SENT_FILE_PROGRESS')!({payload: {path: '/a/t.csv', loaded: 5, size: 10}}));
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

        // Another file's progress is not this card's.
        act(() => handlers.get('SAVE_SENT_FILE_PROGRESS')!({payload: {path: '/a/other.csv', loaded: 9, size: 10}}));
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

        await act(async () => finishSave({path: '/Users/me/t.csv'}));
        await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100'));
        await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull(), {timeout: 2000});
        expect(handlers.has('SAVE_SENT_FILE_PROGRESS')).toBe(false);
    });

    it('draws no bar when the save is closed before a byte is written', async () => {
        request.mockResolvedValue({path: null});
        draw([{path: '/a/t.csv', size: 10}]);
        fireEvent.click(screen.getByRole('button', {name: 'Download'}));
        await waitFor(() => expect(request).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByRole('progressbar')).toBeNull();
    });
});

describe('picking several files', () => {
    const three = [{path: '/a/one.csv', size: 1}, {path: '/a/two.csv', size: 2}, {path: '/a/three.csv', size: 3}];
    const picked = (container: HTMLElement) => [...container.querySelectorAll('[data-sent-file][data-picked]')].map((el) => el.querySelector('button')?.textContent ?? '');
    const names = ['one.csv', 'two.csv', 'three.csv'];
    const card = (name: string) => screen.getByText(name).closest('button') as HTMLElement;

    it('picks the run from the last file picked to the one clicked with Shift, without opening anything', () => {
        const {container} = draw(three);
        fireEvent.click(card('one.csv'), {shiftKey: true});
        expect(picked(container)).toHaveLength(1);
        fireEvent.click(card('three.csv'), {shiftKey: true});
        expect(picked(container)).toHaveLength(3);
        expect(openChatFile).not.toHaveBeenCalled();
        // A shorter run replaces the pick, from the same first file.
        fireEvent.click(card('two.csv'), {shiftKey: true});
        expect(picked(container)).toHaveLength(2);
        expect(names).toHaveLength(3);
    });

    it('adds a file to the pick and takes it out with Shift+Cmd', () => {
        const {container} = draw(three);
        fireEvent.click(card('one.csv'), {shiftKey: true, metaKey: true});
        fireEvent.click(card('three.csv'), {shiftKey: true, metaKey: true});
        expect(picked(container)).toHaveLength(2);
        expect(card('two.csv').closest('[data-sent-file]')).not.toHaveAttribute('data-picked');
        fireEvent.click(card('one.csv'), {shiftKey: true, metaKey: true});
        expect(picked(container)).toHaveLength(1);
        expect(openChatFile).not.toHaveBeenCalled();
    });

    it('lets go of the pick on a plain click, which still opens the file, and on Escape', () => {
        const {container} = draw(three);
        fireEvent.click(card('one.csv'), {shiftKey: true});
        fireEvent.click(card('three.csv'), {shiftKey: true});
        fireEvent.click(card('two.csv'));
        expect(openChatFile).toHaveBeenCalledWith('/a/two.csv');
        expect(picked(container)).toHaveLength(0);

        fireEvent.click(card('one.csv'), {shiftKey: true});
        expect(picked(container)).toHaveLength(1);
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(picked(container)).toHaveLength(0);
    });

    it('opens one menu for the whole pick, with the number in what it says', async () => {
        const {container} = draw(three);
        fireEvent.click(card('one.csv'), {shiftKey: true});
        fireEvent.click(card('three.csv'), {shiftKey: true});
        fireEvent.contextMenu(card('two.csv'), {clientX: 5, clientY: 5});
        const menu = await screen.findByRole('menu');
        expect(within(menu).getByText('3 files')).toBeInTheDocument();
        expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
            'Download 3 files', 'Attach 3 files', 'Copy 3 file names', 'Copy 3 paths',
        ]);
        expect(picked(container)).toHaveLength(3);
    });

    it('opens the menu of one file alone when that file is not in the pick', async () => {
        const {container} = draw(three);
        fireEvent.click(card('one.csv'), {shiftKey: true});
        fireEvent.click(card('two.csv'), {shiftKey: true});
        fireEvent.contextMenu(card('three.csv'), {clientX: 5, clientY: 5});
        const menu = await screen.findByRole('menu');
        expect(within(menu).getAllByRole('menuitem')[0].textContent).toBe('Download');
        expect(within(menu).queryByText(/files$/)).toBeNull();
        expect(picked(container)).toHaveLength(0);
    });

    it('attaches every picked file and copies their paths, one on each line', async () => {
        const attached: unknown[][] = [];
        const unsubscribe = subscribeComposerFiles((...args) => attached.push(args));
        const writeText = vi.fn(() => Promise.resolve());
        Object.assign(navigator, {clipboard: {writeText}});
        draw(three);
        fireEvent.click(card('one.csv'), {shiftKey: true});
        fireEvent.click(card('three.csv'), {shiftKey: true});
        fireEvent.contextMenu(card('two.csv'), {clientX: 5, clientY: 5});
        fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', {name: 'Attach 3 files'}));
        expect(attached).toEqual([['/a/one.csv', 'one.csv', 1], ['/a/two.csv', 'two.csv', 2], ['/a/three.csv', 'three.csv', 3]]);

        fireEvent.contextMenu(card('two.csv'), {clientX: 5, clientY: 5});
        fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', {name: 'Copy 3 paths'}));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('/a/one.csv\n/a/two.csv\n/a/three.csv'));
        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('3 paths copied'));
        unsubscribe();
    });

    it('saves every picked file into the one folder chosen, and says how many and where', async () => {
        request.mockImplementation((type: string) =>
            Promise.resolve(type === 'PICK_FILES'
                ? {paths: ['/dest']}
                : {saved: [{path: '/a/one.csv'}, {path: '/a/two.csv'}, {path: '/a/three.csv'}], failed: []}));
        draw(three);
        fireEvent.click(card('one.csv'), {shiftKey: true});
        fireEvent.click(card('three.csv'), {shiftKey: true});
        fireEvent.contextMenu(card('two.csv'), {clientX: 5, clientY: 5});
        fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', {name: 'Download 3 files'}));
        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Saved 3 files in /dest'));
        expect(request).toHaveBeenCalledWith('PICK_FILES', {mode: 'folders', multiple: false}, {timeout: null});
        expect(request).toHaveBeenCalledWith('SAVE_SENT_FILES', {
            files: [{path: '/a/one.csv', name: 'one.csv'}, {path: '/a/two.csv', name: 'two.csv'}, {path: '/a/three.csv', name: 'three.csv'}],
            folder: '/dest',
        }, {timeout: null});
    });

    it('saves nothing and says nothing when the folder dialog is closed', async () => {
        request.mockResolvedValue({paths: []});
        draw(three);
        fireEvent.click(card('one.csv'), {shiftKey: true});
        fireEvent.click(card('two.csv'), {shiftKey: true});
        fireEvent.contextMenu(card('one.csv'), {clientX: 5, clientY: 5});
        fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', {name: 'Download 2 files'}));
        await waitFor(() => expect(request).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(request).toHaveBeenCalledTimes(1);
        expect(toastSuccess).not.toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });
});

describe('a right click on a card', () => {
    it('opens the same menu as the more button, for that card', async () => {
        draw([{path: '/a/page.html', size: 3}, {path: '/a/t.csv', size: 3}]);
        fireEvent.contextMenu(screen.getByText('t.csv'), {clientX: 40, clientY: 50});
        const menu = await screen.findByRole('menu');
        expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
            'Download', 'Show in file manager', 'Attach to chat input', 'Copy file name', 'Copy path',
        ]);
        const writeText = vi.fn(() => Promise.resolve());
        Object.assign(navigator, {clipboard: {writeText}});
        fireEvent.click(within(menu).getByRole('menuitem', {name: 'Copy path'}));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('/a/t.csv'));
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it('closes on Escape without doing anything', async () => {
        draw([{path: '/a/t.csv', size: 3}]);
        fireEvent.contextMenu(screen.getByText('t.csv'), {clientX: 10, clientY: 10});
        await screen.findByRole('menu');
        fireEvent.keyDown(document, {key: 'Escape'});
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
        expect(openChatFile).not.toHaveBeenCalled();
    });
});

describe('the more button', () => {
    const open = async (index = 0) => {
        fireEvent.click(screen.getAllByRole('button', {name: 'More options'})[index]);
        return screen.findByRole('menu');
    };

    it('opens a menu of what can be done with that file', async () => {
        draw([{path: '/a/page.html', size: 3}, {path: '/a/t.csv', size: 3}]);
        const menu = await open(1);
        expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
            'Download', 'Show in file manager', 'Attach to chat input', 'Copy file name', 'Copy path',
        ]);
        expect(openChatFile).not.toHaveBeenCalled();
    });

    it('attaches the file to the message box by its path', async () => {
        const attached: unknown[][] = [];
        const unsubscribe = subscribeComposerFiles((...args) => attached.push(args));
        draw([{path: '/a/b/t.csv', size: 3}]);
        fireEvent.click(within(await open()).getByRole('menuitem', {name: 'Attach to chat input'}));
        expect(attached).toEqual([['/a/b/t.csv', 't.csv', 3]]);
        unsubscribe();
    });

    it('copies the path and says so', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.assign(navigator, {clipboard: {writeText}});
        draw([{path: '/a/t.csv', size: 3}]);
        fireEvent.click(within(await open()).getByRole('menuitem', {name: 'Copy path'}));
        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Path copied'));
        expect(writeText).toHaveBeenCalledWith('/a/t.csv');
    });

    it('copies just the file name', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.assign(navigator, {clipboard: {writeText}});
        draw([{path: '/a/b/t.csv', size: 3}]);
        fireEvent.click(within(await open()).getByRole('menuitem', {name: 'Copy file name'}));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('t.csv'));
    });

    it('shows the file in the file manager', async () => {
        draw([{path: '/a/t.csv', size: 3}]);
        fireEvent.click(within(await open()).getByRole('menuitem', {name: 'Show in file manager'}));
        await waitFor(() => expect(revealFile).toHaveBeenCalledWith('/a/t.csv'));
    });

    it('saves the file from the menu the way the download button does', async () => {
        request.mockResolvedValue({path: '/Users/me/t.csv'});
        draw([{path: '/a/t.csv', size: 3}]);
        fireEvent.click(within(await open()).getByRole('menuitem', {name: 'Download'}));
        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Saved: /Users/me/t.csv'));
    });
});
