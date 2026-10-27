import {beforeEach, describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {ArtifactRenderer, artifactCallSubject, artifactUrlFrom} from '../ArtifactRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

const {loadFileContent, openChatFile} = vi.hoisted(() => ({loadFileContent: vi.fn(), openChatFile: vi.fn()}));
vi.mock('@/components/FilePreviewPane/loadFileContent', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/components/FilePreviewPane/loadFileContent')>()),
    loadFileContent: (...args: unknown[]) => loadFileContent(...args),
}));
vi.mock('@/utils/filePreviewPaneStore', () => ({filePreviewPaneStore: {open: (p: string, u?: string) => openChatFile(p, u)}}));

beforeEach(() => {
    loadFileContent.mockReset();
    openChatFile.mockReset();
    loadFileContent.mockResolvedValue({ok: false, reason: 'unreadable'});
});

function makeToolUse(input: Record<string, unknown>, name = 'Artifact'): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name,
        input,
    });
}

function makeToolResult(text: string): LoadedMessageDto {
    return {
        message: {content: [{type: ContentBlockType.ToolResult, content: text}]},
    } as unknown as LoadedMessageDto;
}

const PAGE = 'https://claude.ai/artifact/4Shmp5a4q7j2hL7hgQ3S5x';

describe('artifactUrlFrom', () => {
    it('finds the page address in a create result', () => {
        expect(artifactUrlFrom(`Created a new Artifact at ${PAGE} (version 1792737630-e07d) from the type`)).toBe(PAGE);
    });

    it('finds the page address in an update result', () => {
        expect(artifactUrlFrom(`Updated the Artifact at ${PAGE} (Version 2, version id x)`)).toBe(PAGE);
    });

    it('finds a Claude Code artifact address', () => {
        const url = 'https://claude.ai/code/artifact/0b7e8c1c-aaaa-bbbb-cccc-123456789abc';
        expect(artifactUrlFrom(`Read ${url}`)).toBe(url);
    });

    it('returns nothing when the result names no page', () => {
        expect(artifactUrlFrom('Quickstart for a slide deck.')).toBeUndefined();
        expect(artifactUrlFrom('')).toBeUndefined();
    });

    // A lookalike host must not become a clickable page link.
    it('ignores an address on another host', () => {
        expect(artifactUrlFrom('see https://evil.example/claude.ai/artifact/abc')).toBeUndefined();
    });
});

describe('artifactCallSubject', () => {
    it('names the intent of a quickstart', () => {
        expect(artifactCallSubject({action: 'quickstart', intent: 'slides'})).toBe('slides');
    });

    it('names the title of a create', () => {
        expect(artifactCallSubject({type_url: 'https://claude.ai/artifact/t', title: 'Swttch slides test'})).toBe('Swttch slides test');
    });

    it('names the page address of an update', () => {
        expect(artifactCallSubject({url: PAGE})).toBe(PAGE);
    });

    it('names the collection and document of a data call', () => {
        expect(artifactCallSubject({collection: 'votes', doc_id: 'u1'})).toBe('votes/u1');
        expect(artifactCallSubject({collection: 'votes'})).toBe('votes');
    });

    it('is empty when the call carries nothing to name', () => {
        expect(artifactCallSubject({})).toBe('');
        expect(artifactCallSubject(undefined)).toBe('');
    });
});

describe('ArtifactRenderer', () => {
    it('shows the tool name it was called under', () => {
        render(<ArtifactRenderer toolUse={makeToolUse({action: 'list'}, 'ArtifactData')} />);
        expect(screen.getByText('ArtifactData')).toBeInTheDocument();
    });

    it('shows the action and the subject', () => {
        render(<ArtifactRenderer toolUse={makeToolUse({action: 'quickstart', intent: 'slides'})} />);
        expect(screen.getByText('quickstart')).toBeInTheDocument();
        expect(screen.getByText('slides')).toBeInTheDocument();
    });

    // The reason the card exists: the reader needs a way to open what was published.
    it('draws a published page as a card with its name that opens the page', () => {
        render(
            <ArtifactRenderer
                toolUse={makeToolUse({type_url: 'https://claude.ai/artifact/t', title: 'Deck'})}
                toolResult={makeToolResult(`Created a new Artifact at ${PAGE} (version v1)`)}
            />,
        );

        const card = screen.getByRole('link', {name: 'Deck'});
        expect(card).toHaveAttribute('href', PAGE);
        expect(card).toHaveAttribute('target', '_blank');
        expect(card).toHaveAttribute('rel', 'noopener noreferrer');
        // The CLI's answering sentence is left out: the card says what it says.
        expect(screen.queryByText(/Created a new Artifact/)).not.toBeInTheDocument();
    });

    it('names the card after the file published when the call gave no title and the page names itself nothing', () => {
        render(
            <ArtifactRenderer
                toolUse={makeToolUse({file_path: '/a/b/page.html'})}
                toolResult={makeToolResult(`Published /a/b/page.html at ${PAGE} (Version 1, version id x)`)}
            />,
        );
        expect(screen.getByRole('button', {name: 'page'})).toBeInTheDocument();
    });

    // Desktop names the card by the page's own <title>, and opens the page beside the chat.
    it('names the card by the page title and opens the page in the pane on click', async () => {
        const html = '<!doctype html><title>Demo Page</title><body>hi</body>';
        loadFileContent.mockResolvedValue({ok: true, kind: 'html', mimeType: 'text/html', blob: new Blob([html]), pieces: [new TextEncoder().encode(html)]});
        render(
            <ArtifactRenderer
                toolUse={makeToolUse({file_path: '/a/b/page.html'})}
                toolResult={makeToolResult(`Published /a/b/page.html at ${PAGE} (Version 1, version id x)`)}
            />,
        );
        const card = await screen.findByRole('button', {name: 'Demo Page'});
        fireEvent.click(card);
        expect(openChatFile).toHaveBeenCalledWith('/a/b/page.html', PAGE);
    });

    it('makes the card of the page an update names before any result arrives', () => {
        render(<ArtifactRenderer toolUse={makeToolUse({url: PAGE, files: {}})} />);
        expect(screen.getByRole('link')).toHaveAttribute('href', PAGE);
    });

    it('keeps the result of a call that publishes nothing', () => {
        render(
            <ArtifactRenderer
                toolUse={makeToolUse({action: 'list'})}
                toolResult={makeToolResult(`Showing 1 of 1: ${PAGE}`)}
            />,
        );
        expect(screen.getByText(/Showing 1 of 1/)).toBeInTheDocument();
    });

    it('shows the result text', () => {
        render(
            <ArtifactRenderer
                toolUse={makeToolUse({action: 'quickstart', intent: 'slides'})}
                toolResult={makeToolResult('Quickstart for a slide deck.')}
            />,
        );
        expect(screen.getByText(/Quickstart for a slide deck/)).toBeInTheDocument();
    });

    it('shows no link when there is no page to open', () => {
        render(
            <ArtifactRenderer
                toolUse={makeToolUse({action: 'quickstart', intent: 'slides'})}
                toolResult={makeToolResult('Quickstart for a slide deck.')}
            />,
        );
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
});
