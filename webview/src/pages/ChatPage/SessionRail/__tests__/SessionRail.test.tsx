import {beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {SessionRail} from '../index';
import {TOGGLE_SESSION_RAIL_EVENT} from '../event';
import {currentBranchOf} from '../EnvironmentSection';
import type {LoadedMessageDto} from '@/types';

const {openUrl, openChatFile, send} = vi.hoisted(() => ({
    openUrl: vi.fn(() => Promise.resolve()),
    openChatFile: vi.fn(),
    send: vi.fn(),
}));
let messages: LoadedMessageDto[] = [];

vi.mock('@/adapters', () => ({getAdapter: () => ({openUrl})}));
vi.mock('@/utils/openChatFile', () => ({openChatFile}));
vi.mock('react-hot-toast', () => ({default: {error: vi.fn()}}));
vi.mock('@/contexts/ChatStreamContext', () => ({useChatStreamContext: () => ({messages, isStreaming: false})}));
const sessionCtx = vi.hoisted(() => ({
    sessions: [] as unknown[],
    switchSession: undefined as unknown as (sessionId: string) => void,
}));
vi.mock('@/contexts/SessionContext', () => ({
    useSessionContext: () => ({
        workingDirectory: '/Users/me/Projects/swttch',
        currentSessionId: 's1',
        sessions: sessionCtx.sessions,
        switchSession: sessionCtx.switchSession,
    }),
}));
// Whether the session-management MCP is installed: what decides if the rail draws the linked sessions.
let mcpInstalled: string | null = null;
vi.mock('@/hooks/queries/useSessionMcp', () => ({
    useSessionMcp: () => ({info: {packageName: '@swttch/session-manager-mcp', installed: mcpInstalled, latest: null, updatable: false, updating: false}}),
}));
// One object for every render: a fresh one would change the effect's dependencies each time and loop it.
const bridge = vi.hoisted(() => ({isConnected: true, send: undefined as unknown}));
vi.mock('@/contexts/BridgeContext', () => ({useBridgeContext: () => bridge}));
vi.mock('@/components/ImageLightbox', () => ({
    ImageLightbox: (p: {srcs: (string | null)[]; initialIndex: number}) => <div data-testid="lightbox">{p.initialIndex}/{p.srcs.length}</div>,
}));
let outputsIndex: unknown[] | undefined = [];
vi.mock('@/hooks/useSessionOutputs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/hooks/useSessionOutputs')>()),
    useSessionOutputs: () => outputsIndex,
    useSessionOutputImages: () => ({loaded: {}, ensure: vi.fn()}),
}));
vi.mock('@/hooks/queries/useSponsorStatus', () => ({useSponsorStatus: () => ({isSponsor: false})}));
let mockActivity: Record<string, string> = {};
vi.mock('@/hooks/useSessionActivity', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/hooks/useSessionActivity')>()),
    useSessionActivity: () => ({activity: mockActivity, open: new Set<string>(), markRead: vi.fn()}),
}));
vi.mock('@/hooks/useSessionPictures', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/useSessionPictures')>('@/hooks/useSessionPictures');
    const {isPictureOutput} = await vi.importActual<typeof import('@/hooks/useSessionOutputs')>('@/hooks/useSessionOutputs');
    return {
        useSessionPictures: () => (outputsIndex === undefined ? undefined : actual.mergePictures([], (outputsIndex as never[]).filter(isPictureOutput))),
        useSessionPictureLoader: () => ({loaded: {}, ensure: vi.fn()}),
    };
});
vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
    getBridge: () => ({request: vi.fn(() => Promise.resolve({kind: 'none'}))}),
}));
vi.mock('@/i18n', () => ({
    i18n: {language: 'en', t: (key: string) => key},
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    }),
}));

const REPORT = `## Context Usage

**Model:** claude-opus-4-8[1m]
**Tokens:** 358.7k / 1m (36%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| Messages | 243.1k | 24.3% |
| Memory files | 54.4k | 5.4% |
| Free space | 607.2k | 60.7% |
`;

const fileRow = (name: string, isImage = false, entryUuid = 'u1', attachmentIndex = 0) => ({
    kind: 'file', entryUuid, blockIndex: 0, attachmentIndex, path: `/a/${name}`, name, size: 1, isImage, timestamp: '2026-10-26T01:02:03.000Z',
});

function openRail() {
    act(() => {
        window.dispatchEvent(new Event(TOGGLE_SESSION_RAIL_EVENT));
    });
}

beforeEach(() => {
    mockActivity = {};
    openUrl.mockClear();
    openChatFile.mockClear();
    bridge.send = send;
    send.mockReset();
    send.mockResolvedValue({status: 'ok', markdown: REPORT});
    messages = [];
    outputsIndex = [];
    mcpInstalled = null;
    sessionCtx.sessions = [];
    sessionCtx.switchSession = vi.fn();
});

describe('SessionRail', () => {
    it('draws nothing until the toggle event, then opens with Environment and Outputs and closes again', () => {
        const {container} = render(<SessionRail/>);
        expect(container).toBeEmptyDOMElement();
        openRail();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('swttch')).toBeInTheDocument();
        openRail();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes on Escape and on a click outside', () => {
        render(<SessionRail/>);
        openRail();
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(screen.queryByRole('dialog')).toBeNull();
        openRail();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('names the branch the CLI last recorded', () => {
        expect(currentBranchOf([{gitBranch: 'old'}, {}, {gitBranch: 'feat/593'}, {gitBranch: 'HEAD'}])).toBe('feat/593');
        messages = [{type: 'user', gitBranch: 'feat/593'} as unknown as LoadedMessageDto];
        render(<SessionRail/>);
        openRail();
        expect(screen.getByText('feat/593')).toBeInTheDocument();
    });

    it('keeps Context closed and asks /context only when it is opened', async () => {
        render(<SessionRail/>);
        openRail();
        expect(send).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', {name: 'sessionRail.context'}));
        expect(await screen.findByText(/sessionRail\.contextUsed/)).toHaveTextContent('"percent":36');
        expect(screen.getByText('Messages')).toBeInTheDocument();
        expect(screen.getByText('Free space')).toBeInTheDocument();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('lists outputs newest first, opens a file where the transcript does, and shows more after five', () => {
        outputsIndex = Array.from({length: 7}, (_, i) => fileRow(`f${i}.txt`, false, 'u1', i));
        render(<SessionRail/>);
        openRail();
        expect(screen.getByText('f6.txt')).toBeInTheDocument();
        expect(screen.queryByText('f0.txt')).toBeNull();
        fireEvent.click(screen.getByText('f6.txt'));
        expect(openChatFile).toHaveBeenCalledWith('/a/f6.txt');
        fireEvent.click(screen.getByText('sessionRail.showMore'));
        expect(screen.getByText('f0.txt')).toBeInTheDocument();
    });

    it('opens a sent picture in the viewer, a returned picture by its tool, and a published page in the browser', () => {
        outputsIndex = [
            fileRow('photo.jpg', true),
            {kind: 'image', entryUuid: 'u2', blockIndex: 0, partIndex: 0, mediaType: 'image/png', byteSize: 3, timestamp: null, tool: 'mcp__Claude_Browser__computer'},
            {kind: 'artifact', entryUuid: 'u3', blockIndex: 0, url: 'https://claude.ai/artifact/abc123', title: 'Deck', timestamp: null},
        ];
        render(<SessionRail/>);
        openRail();
        expect(screen.getByText(/sessionRail\.toolImage.*Claude Browser/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('photo.jpg'));
        // Not a sponsor: the viewer stays inside the entry that was clicked.
        expect(screen.getByTestId('lightbox')).toHaveTextContent('0/1');
        fireEvent.click(screen.getByText('Deck'));
        expect(openUrl).toHaveBeenCalledWith('https://claude.ai/artifact/abc123');
    });

    it('says so while the session index is still being read', () => {
        outputsIndex = undefined as unknown as unknown[];
        render(<SessionRail/>);
        openRail();
        expect(screen.getAllByText('sessionRail.contextLoading').length).toBeGreaterThan(0);
    });
});

function linked(id: string, title: string, startedBy: string | null, startedAt = 0, desktopStarter?: string) {
    return {
        id,
        title,
        createdAt: new Date(startedAt || 0),
        updatedAt: new Date(startedAt || 0),
        sessionMark: {id, parentSessionUid: startedBy, startedAt, ...(desktopStarter ? {desktopParentSessionId: desktopStarter} : {})},
    };
}

describe('SessionRail - linked sessions', () => {
    it('is left out while the session-management MCP is not installed', () => {
        mcpInstalled = null;
        sessionCtx.sessions = [linked('s1', 'This one', null)];
        render(<SessionRail/>);
        openRail();
        expect(screen.queryByText('sessionRail.linked.title')).toBeNull();
    });

    it('says none for a session no other session started and that started none', () => {
        mcpInstalled = '0.2.0';
        sessionCtx.sessions = [linked('s1', 'This one', null)];
        render(<SessionRail/>);
        openRail();
        expect(screen.getByText('sessionRail.linked.parent')).toBeInTheDocument();
        expect(screen.getByText('sessionRail.linked.children')).toBeInTheDocument();
        expect(screen.getAllByText('sessionRail.linked.none')).toHaveLength(2);
    });

    it('names the parent and lists the children in the order they were started, and opens one on a click', () => {
        mcpInstalled = '0.2.0';
        sessionCtx.sessions = [
            linked('s1', 'This one', 'p1'),
            linked('p1', 'The manager', null),
            linked('c2', 'Second child', 's1', 20),
            linked('c1', 'First child', 's1', 10),
            linked('x', 'Somebody else child', 'p1', 5),
        ];
        render(<SessionRail/>);
        openRail();
        expect(screen.getByRole("button", {name: "The manager"})).toBeInTheDocument();
        const rows = screen.getAllByRole('button', {name: /^(First|Second) child$/}).map((b) => b.textContent);
        expect(rows).toEqual(['First child', 'Second child']);
        expect(screen.queryByRole("button", {name: "Somebody else child"})).toBeNull();
        fireEvent.click(screen.getByRole("button", {name: "The manager"}));
        expect(sessionCtx.switchSession).toHaveBeenCalledWith('p1');
        fireEvent.click(screen.getByRole("button", {name: "Second child"}));
        expect(sessionCtx.switchSession).toHaveBeenCalledWith('c2');
    });

    it('marks a child that is running, as the Claude desktop app does, and leaves the idle ones bare', () => {
        mcpInstalled = '0.2.0';
        mockActivity = {c1: 'running'};
        sessionCtx.sessions = [
            linked('s1', 'This one', null),
            linked('c1', 'First child', 's1', 10),
            linked('c2', 'Second child', 's1', 20),
        ];
        render(<SessionRail/>);
        openRail();
        const first = screen.getByRole('button', {name: 'First child'});
        const second = screen.getByRole('button', {name: 'Second child'});
        expect(first.querySelector('[data-testid="session-activity"][data-activity="running"]')).not.toBeNull();
        expect(second.querySelector('[data-testid="session-activity"]')).toBeNull();
    });

    it('says the parent is not in the list when it runs in a folder the list does not cover', () => {
        mcpInstalled = '0.2.0';
        sessionCtx.sessions = [linked('s1', 'This one', 'a-session-in-another-folder')];
        render(<SessionRail/>);
        openRail();
        expect(screen.getByText('sessionRail.linked.notInList')).toBeInTheDocument();
    });
});

describe('SessionRail - archived sessions', () => {
    beforeEach(() => {
        mcpInstalled = '0.4.0';
    });

    it('leads the title of an archived session with a pill, and leaves a live one bare', () => {
        sessionCtx.sessions = [
            linked('s1', 'This one', 'p1'),
            {...linked('p1', 'The manager', null), sessionMark: {id: 'p1', parentSessionUid: null, archivedAt: 1794301002844}},
            linked('c1', 'A live child', 's1', 10),
        ];
        render(<SessionRail/>);
        openRail();
        const pills = screen.getAllByTestId('archived-pill');
        expect(pills).toHaveLength(1);
        expect(pills[0]).toHaveTextContent('sessionRail.linked.archived');
        expect(pills[0].nextElementSibling).toHaveTextContent('The manager');
    });
});

describe('SessionRail - the links the Claude desktop app records', () => {
    beforeEach(() => {
        mcpInstalled = '0.4.0';
        send.mockResolvedValue({status: 'ok'});
    });

    const resetButton = () => screen.getByRole('button', {name: 'sessionRail.linked.resetToDesktop'});

    it('shows the parent the desktop app records where the package chose nothing', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null, 0, 'p1'), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        expect(screen.getByRole('button', {name: 'The manager'})).toBeInTheDocument();
    });

    it('does not bring the desktop parent back under a session that was taken to the top level on purpose', () => {
        sessionCtx.sessions = [linked('s1', 'This one', '', 0, 'p1'), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        expect(screen.queryByRole('button', {name: 'The manager'})).toBeNull();
    });

    it('has nothing to reset while every link is the one the desktop app records', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null, 0, 'p1'), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        expect(resetButton()).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(resetButton());
        expect(send).not.toHaveBeenCalled();
    });

    it('forgets what was chosen by hand for this session and for the sessions the desktop app says it started', async () => {
        sessionCtx.sessions = [
            linked('s1', 'This one', '', 0, 'p1'),
            linked('p1', 'The manager', null),
            linked('c1', 'A child', 'other', 10, 's1'),
            linked('c2', 'Started only through the package', 's1', 20),
        ];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(resetButton());
        // The links are reset one after another.
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
        expect(send).toHaveBeenCalledWith('SET_SESSION_PARENT', {sessionId: 's1', parentSessionId: null, inherit: true});
        expect(send).toHaveBeenCalledWith('SET_SESSION_PARENT', {sessionId: 'c1', parentSessionId: null, inherit: true});
        expect(send).not.toHaveBeenCalledWith('SET_SESSION_PARENT', expect.objectContaining({sessionId: 'c2'}));
    });
});

describe('SessionRail - changing the links by hand', () => {
    beforeEach(() => {
        mcpInstalled = '0.3.0';
        send.mockResolvedValue({status: 'ok'});
    });

    /** The button after the title of the parent relation (Change) or of the children relation (Add). */
    const addButton = (which: 'parent' | 'children') =>
        screen.getByRole('button', {name: which === 'parent' ? 'sessionRail.linked.change' : 'sessionRail.linked.addChild'});
    const optionTitles = () => screen.getAllByRole('option').map((o) => o.querySelector('span.truncate')?.textContent);

    it('puts the session under the session picked from the search list', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        fireEvent.click(screen.getByRole('option', {name: /The manager/}));
        expect(send).toHaveBeenCalledWith('SET_SESSION_PARENT', {sessionId: 's1', parentSessionId: 'p1'});
    });

    it('keeps a click inside the search list from closing the rail', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        fireEvent.mouseDown(screen.getByRole('option', {name: /The manager/}));
        expect(screen.getByRole('dialog', {name: 'sessionRail.title'})).toBeInTheDocument();
    });

    it('filters the list by what is typed', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null), linked('p1', 'The manager', null), linked('o1', 'Unrelated', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        fireEvent.change(screen.getByPlaceholderText('sessionRail.linked.searchPlaceholder'), {target: {value: 'unrel'}});
        expect(optionTitles()).toEqual(['Unrelated']);
        fireEvent.change(screen.getByPlaceholderText('sessionRail.linked.searchPlaceholder'), {target: {value: 'zzz'}});
        expect(screen.getByText('sessionRail.linked.noMatch')).toBeInTheDocument();
    });

    it('unlinks the parent, which makes the session top-level', () => {
        sessionCtx.sessions = [linked('s1', 'This one', 'p1'), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(screen.getByRole('button', {name: 'sessionRail.linked.removeParent'}));
        expect(send).toHaveBeenCalledWith('SET_SESSION_PARENT', {sessionId: 's1', parentSessionId: null});
    });

    it('unlinks a parent that is not in the list, whose transcript may be gone', () => {
        sessionCtx.sessions = [linked('s1', 'This one', 'a-session-that-is-gone')];
        render(<SessionRail/>);
        openRail();
        expect(screen.getByText('sessionRail.linked.notInList')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'sessionRail.linked.removeParent'}));
        expect(send).toHaveBeenCalledWith('SET_SESSION_PARENT', {sessionId: 's1', parentSessionId: null});
    });

    it('offers no session below this one as a parent, nor the parent it already has', () => {
        sessionCtx.sessions = [
            linked('s1', 'This one', 'p1'),
            linked('p1', 'The manager', null),
            linked('c1', 'A child', 's1', 10),
            linked('g1', 'A grandchild', 'c1', 20),
            linked('o1', 'Unrelated', null),
        ];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        expect(optionTitles()).toEqual(['Unrelated']);
    });

    it('adds a session below this one, offering neither this one, its parent, nor a child it already has', () => {
        sessionCtx.sessions = [
            linked('s1', 'This one', 'p1'),
            linked('p1', 'The manager', null),
            linked('c1', 'A child', 's1', 10),
            linked('o1', 'Unrelated', null),
        ];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('children'));
        expect(optionTitles()).toEqual(['Unrelated']);
        fireEvent.click(screen.getByRole('option', {name: /Unrelated/}));
        expect(send).toHaveBeenCalledWith('SET_SESSION_PARENT', {sessionId: 'o1', parentSessionId: 's1'});
    });

    it('takes a child out of the group, without deleting it', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null), linked('c1', 'A child', 's1', 10)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(screen.getByRole('button', {name: 'sessionRail.linked.removeChild'}));
        expect(send).toHaveBeenCalledWith('SET_SESSION_PARENT', {sessionId: 'c1', parentSessionId: null});
    });

    it('closes the search list on a press outside it, the rail staying open, and on the next one the rail closes', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(screen.getByRole('dialog', {name: 'sessionRail.title'})).toBeInTheDocument();
        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes the search list on a press on the field itself, blank space beside its title included', () => {
        sessionCtx.sessions = [linked('s1', 'This one', 'p1'), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        fireEvent.mouseDown(screen.getByRole('heading', {name: 'sessionRail.linked.parent'}));
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('closes the search list when the button that opened it is pressed again', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        fireEvent.mouseDown(addButton('parent'));
        fireEvent.click(addButton('parent'));
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('closes only the search list on Escape, and the rail on the next one', () => {
        sessionCtx.sessions = [linked('s1', 'This one', null), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(screen.getByRole('dialog', {name: 'sessionRail.title'})).toBeInTheDocument();
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows the refusal of the package instead of failing silently', async () => {
        const toast = (await import('react-hot-toast')).default;
        send.mockResolvedValue({status: 'error', error: 'A session cannot be its own parent.'});
        sessionCtx.sessions = [linked('s1', 'This one', null), linked('p1', 'The manager', null)];
        render(<SessionRail/>);
        openRail();
        fireEvent.click(addButton('parent'));
        fireEvent.click(screen.getByRole('option', {name: /The manager/}));
        await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('A session cannot be its own parent.'));
    });
});
