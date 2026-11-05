import {describe, it, expect} from 'vitest';
import {
    isMcpToolName,
    mcpServerName,
    mcpToolName,
    mcpHeaderLabel,
    mcpInputPreview,
} from '../cursorMcp';

describe('isMcpToolName', () => {
    it('is true for an mcp__ prefixed name', () => {
        expect(isMcpToolName('mcp__workspace-mcp__search_gmail_messages')).toBe(true);
    });

    it('is false for a plain tool name', () => {
        expect(isMcpToolName('Bash')).toBe(false);
    });

    it('is false for an empty string', () => {
        expect(isMcpToolName('')).toBe(false);
    });
});

describe('mcpServerName / mcpToolName', () => {
    // Cursor parses the server as the FIRST segment after mcp__, and the tool as
    // everything after that (joined by __, so a __ inside the tool name is preserved).
    it('takes the server from the first segment', () => {
        expect(mcpServerName('mcp__workspace-mcp__search_gmail_messages')).toBe('workspace-mcp');
    });

    it('takes the tool from the remaining segments', () => {
        expect(mcpToolName('mcp__workspace-mcp__search_gmail_messages')).toBe('search_gmail_messages');
    });

    it('preserves __ inside the tool name (server = first segment only)', () => {
        expect(mcpServerName('mcp__server__foo__bar')).toBe('server');
        expect(mcpToolName('mcp__server__foo__bar')).toBe('foo__bar');
    });

    it('returns empty strings for a non-mcp name', () => {
        expect(mcpServerName('Bash')).toBe('');
        expect(mcpToolName('Bash')).toBe('');
    });
});

describe('mcpHeaderLabel', () => {
    it('formats as "server: tool" with the tool\'s underscores read as spaces', () => {
        expect(mcpHeaderLabel('mcp__shell-sandboxed__run_command')).toBe('shell-sandboxed: run command');
        expect(mcpHeaderLabel('mcp__shell-sandboxed__screenshot')).toBe('shell-sandboxed: screenshot');
    });

    it('keeps the server exactly as named', () => {
        expect(mcpHeaderLabel('mcp__claude_ai_Gmail__get_thread')).toBe('claude_ai_Gmail: get thread');
    });

    it('keeps a __ inside the tool name as a single space', () => {
        expect(mcpHeaderLabel('mcp__server__foo__bar')).toBe('server: foo bar');
    });

    it('falls back to the raw name when it is not a valid mcp name', () => {
        expect(mcpHeaderLabel('Bash')).toBe('Bash');
        expect(mcpHeaderLabel('mcp__only_one_segment')).toBe('mcp__only_one_segment');
    });
});

describe('mcpInputPreview keys the desktop app does not preview (#596)', () => {
    it('does not preview a `command`, which the card shows in its own code box', () => {
        expect(mcpInputPreview({command: 'echo "hello 3"'})).toBeNull();
    });

    it('does not preview a `text`', () => {
        expect(mcpInputPreview({text: 'plain'})).toBeNull();
    });

    it('still previews a `query` when a command comes with it', () => {
        expect(mcpInputPreview({command: 'x', query: 'how to rotate keys'})).toBe('how to rotate keys');
    });
});

describe('mcpInputPreview', () => {
    it('returns the first priority-key string value (query)', () => {
        expect(mcpInputPreview({query: 'in:inbox newer_than:7d'})).toBe('in:inbox newer_than:7d');
    });

    it('prefixes channel with #', () => {
        expect(mcpInputPreview({channel: 'general'})).toBe('#general');
    });

    it('reduces a url to its hostname', () => {
        expect(mcpInputPreview({url: 'https://example.com/some/path?x=1'})).toBe('example.com');
    });

    it('truncates a long value to 40 chars with an ellipsis', () => {
        const long = 'a'.repeat(60);
        expect(mcpInputPreview({query: long})).toBe('a'.repeat(40) + '…');
    });

    it('respects priority order (query before text)', () => {
        expect(mcpInputPreview({text: 'second', query: 'first'})).toBe('first');
    });

    it('returns null when no priority key holds a string', () => {
        expect(mcpInputPreview({foo: 'bar', page_size: 3})).toBeNull();
        expect(mcpInputPreview({})).toBeNull();
        expect(mcpInputPreview(undefined)).toBeNull();
    });
});
