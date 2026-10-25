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
vi.mock('@/contexts/SessionContext', () => ({
    useSessionContext: () => ({workingDirectory: '/Users/me/Projects/swttch', currentSessionId: 's1'}),
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
    openUrl.mockClear();
    openChatFile.mockClear();
    bridge.send = send;
    send.mockReset();
    send.mockResolvedValue({status: 'ok', markdown: REPORT});
    messages = [];
    outputsIndex = [];
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
        expect(screen.getByTestId('lightbox')).toHaveTextContent('1/2');
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
