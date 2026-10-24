import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {ArtifactTag} from '../ArtifactTag';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

const openUrl = vi.fn(() => Promise.resolve());
let messages: LoadedMessageDto[] = [];

vi.mock('@/adapters', () => ({getAdapter: () => ({openUrl})}));
vi.mock('@/contexts/ChatStreamContext', () => ({useChatStreamContext: () => ({messages})}));
vi.mock('react-hot-toast', () => ({default: {error: vi.fn()}}));
vi.mock('@/i18n', () => ({
    i18n: {t: (key: string) => key},
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    }),
}));

const A = 'https://claude.ai/artifact/aaaaaaaaaaaaaaaaaaaaaa';
const B = 'https://claude.ai/artifact/bbbbbbbbbbbbbbbbbbbbbb';

function published(title: string, url: string): LoadedMessageDto {
    const block = Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: `tu-${url}`,
        name: 'Artifact',
        input: {title, file_path: '/tmp/page.html'},
        tool_result: {
            message: {content: [{type: ContentBlockType.ToolResult, content: `Published /tmp/page.html at ${url} (Version 1, version id 1)`}]},
        },
    });
    return {message: {content: [block]}} as unknown as LoadedMessageDto;
}

beforeEach(() => {
    openUrl.mockClear();
    messages = [];
});

describe('ArtifactTag', () => {
    it('renders nothing when the session published no Artifact', () => {
        const {container} = render(<ArtifactTag/>);
        expect(container).toBeEmptyDOMElement();
    });

    it('names the one page and opens it on click', () => {
        messages = [published('Q4 deck', A)];
        render(<ArtifactTag/>);
        fireEvent.click(screen.getByText('Q4 deck'));
        expect(openUrl).toHaveBeenCalledWith(A);
    });

    it('shows a count for several pages, lists them newest first, and opens the one picked', () => {
        messages = [published('First', A), published('Second', B)];
        render(<ArtifactTag/>);
        fireEvent.click(screen.getByText(/chatInput\.artifacts\.count/));
        expect(openUrl).not.toHaveBeenCalled();

        const items = screen.getAllByRole('menuitem');
        expect(items.map((item) => item.textContent)).toEqual(['Second', 'First']);

        fireEvent.click(items[1]);
        expect(openUrl).toHaveBeenCalledWith(A);
        expect(screen.queryByRole('menuitem')).toBeNull();
    });

    it('reopens the most recent page on Ctrl+]', () => {
        messages = [published('First', A), published('Second', B)];
        render(<ArtifactTag/>);
        fireEvent.keyDown(window, {key: ']', ctrlKey: true});
        expect(openUrl).toHaveBeenCalledWith(B);
    });

    it('reopens the most recent page on the physical bracket key when the layout prints another character', () => {
        messages = [published('First', A), published('Second', B)];
        render(<ArtifactTag/>);
        fireEvent.keyDown(window, {key: 'Dead', code: 'BracketRight', ctrlKey: true});
        expect(openUrl).toHaveBeenCalledWith(B);
    });

    it.each([
        {key: ']'},
        {key: ']', metaKey: true},
        {key: ']', ctrlKey: true, shiftKey: true},
        {key: '[', ctrlKey: true},
    ])('ignores %j', (init) => {
        messages = [published('First', A)];
        render(<ArtifactTag/>);
        fireEvent.keyDown(window, init);
        expect(openUrl).not.toHaveBeenCalled();
    });

    it('does not answer Ctrl+] when there is nothing to open', () => {
        render(<ArtifactTag/>);
        fireEvent.keyDown(window, {key: ']', ctrlKey: true});
        expect(openUrl).not.toHaveBeenCalled();
    });
});
