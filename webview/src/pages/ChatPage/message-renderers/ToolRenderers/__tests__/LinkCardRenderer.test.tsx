import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {LinkCardRenderer, _resetLinkCards, browserUrlOf} from '../LinkCardRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

const {request, openUrl, openMenu} = vi.hoisted(() => ({request: vi.fn(), openUrl: vi.fn(() => Promise.resolve()), openMenu: vi.fn()}));

vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
    getBridge: () => ({request}),
}));
vi.mock('@/adapters', () => ({getAdapter: () => ({openUrl})}));
vi.mock('react-hot-toast', () => ({default: {error: vi.fn()}}));
vi.mock('@/utils/linkMenuStore', () => ({linkMenuStore: {open: openMenu}}));

const URL_593 = 'https://github.com/Swttch/swttch/issues/593';
const tool = Object.assign(new ToolUseBlockDto(), {type: ContentBlockType.ToolUse, id: 't1', name: 'mcp__Claude_Browser__preview_start', input: {url: URL_593}});

beforeEach(() => {
    request.mockReset();
    openUrl.mockClear();
    openMenu.mockClear();
    _resetLinkCards();
});

describe('browserUrlOf', () => {
    it('takes the address of a browser tool that opens a page, and nothing else', () => {
        expect(browserUrlOf('mcp__Claude_Browser__preview_start', {url: URL_593})).toBe(URL_593);
        expect(browserUrlOf('mcp__other_server__preview_start', {url: 'http://localhost:3000'})).toBe('http://localhost:3000');
        expect(browserUrlOf('mcp__Claude_Browser__preview_start', {name: 'dev'})).toBeUndefined();
        expect(browserUrlOf('mcp__Claude_Browser__preview_start', {url: 'file:///etc/passwd'})).toBeUndefined();
        expect(browserUrlOf('mcp__Claude_Browser__navigate', {url: URL_593})).toBeUndefined();
        expect(browserUrlOf('WebFetch', {url: URL_593})).toBeUndefined();
    });
});

describe('LinkCardRenderer', () => {
    it('draws the page picture, its title, its site and where it was opened', async () => {
        request.mockResolvedValue({url: URL_593, host: 'github.com', title: 'Show Artifacts and rich content', image: 'data:image/png;base64,QUJD'});
        render(<LinkCardRenderer toolUse={tool} url={URL_593}/>);

        expect(await screen.findByText('Show Artifacts and rich content')).toBeInTheDocument();
        expect(screen.getByText(/github\.com/)).toHaveTextContent('github.com · Opened in browser');
        expect(document.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,QUJD');
        expect(request).toHaveBeenCalledWith(expect.anything(), {url: URL_593});
    });

    // The picture's place is kept while the page is read, so the card does not jump when it arrives.
    it('keeps the picture band with a spinner in it while the page is read, and drops it for a page with no picture', async () => {
        let answer!: (value: unknown) => void;
        request.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        render(<LinkCardRenderer toolUse={tool} url={URL_593}/>);
        expect(screen.getByRole('status').className).toContain('aspect-[8/3]');

        answer({url: URL_593, host: 'github.com'});
        await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    });

    it('shows the address when the page told nothing, and no picture', async () => {
        request.mockResolvedValue({url: URL_593, host: 'github.com'});
        render(<LinkCardRenderer toolUse={tool} url={URL_593}/>);
        await waitFor(() => expect(screen.getByText(/github\.com/)).toBeInTheDocument());
        expect(screen.getByText(URL_593)).toBeInTheDocument();
        expect(document.querySelector('img')).toBeNull();
    });

    it('still draws the card when the page cannot be asked about', async () => {
        request.mockRejectedValue(new Error('offline'));
        render(<LinkCardRenderer toolUse={tool} url={URL_593}/>);
        await waitFor(() => expect(screen.getByText(/github\.com/)).toBeInTheDocument());
    });

    it('opens the page in the browser from the picture too', async () => {
        request.mockResolvedValue({url: URL_593, host: 'github.com', title: 'T', image: 'data:image/png;base64,QUJD'});
        render(<LinkCardRenderer toolUse={tool} url={URL_593}/>);
        await screen.findByText('T');
        fireEvent.click(document.querySelector('img')!);
        expect(openUrl).toHaveBeenCalledWith(URL_593);
    });

    it('opens the page in the browser from the button, and offers the link menu from the dots', async () => {
        request.mockResolvedValue({url: URL_593, host: 'github.com'});
        render(<LinkCardRenderer toolUse={tool} url={URL_593}/>);
        await screen.findByText(/github\.com/);

        fireEvent.click(screen.getByRole('button', {name: 'Open'}));
        expect(openUrl).toHaveBeenCalledWith(URL_593);

        fireEvent.click(screen.getByRole('button', {name: 'More options'}));
        expect(openMenu).toHaveBeenCalledWith(expect.objectContaining({target: {kind: 'external', url: URL_593}}));
    });
});
