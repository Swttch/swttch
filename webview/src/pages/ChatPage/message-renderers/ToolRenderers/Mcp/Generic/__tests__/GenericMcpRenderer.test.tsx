import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';
import type {ReactElement} from 'react';
import {ToolStatusContext, type ToolStatus} from '../../../common';
import {GenericMcpRenderer} from '../index';

function makeToolUse(input: Record<string, unknown>, name: string): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name,
        input,
    });
}

function makeToolResult(content: unknown, isError = false): LoadedMessageDto {
    return {
        message: {
            content: [{type: ContentBlockType.ToolResult, content, ...(isError ? {is_error: true} : {})}],
        },
    } as unknown as LoadedMessageDto;
}

const TOOL = 'mcp__workspace-mcp__search_gmail_messages';

describe('GenericMcpRenderer', () => {
    const withStatus = (status: ToolStatus, node: ReactElement) => (
        <ToolStatusContext.Provider value={status}>{node}</ToolStatusContext.Provider>
    );

    it('writes the header as "server: tool" and says "used" once the call has a result', () => {
        render(withStatus('success', <GenericMcpRenderer toolUse={makeToolUse({}, TOOL)} />));
        expect(screen.getByText('workspace-mcp: search gmail messages')).toBeInTheDocument();
        expect(screen.getByText('Used')).toBeInTheDocument();
    });

    it('keeps the status words out of the bold, so the tool label stands apart from them', () => {
        render(withStatus('success', <GenericMcpRenderer toolUse={makeToolUse({}, TOOL)} />));
        expect(screen.getByText('Used')).toHaveClass('font-normal');
        expect(screen.getByText('workspace-mcp: search gmail messages')).not.toHaveClass('font-normal');
    });

    it('says "using" while the call has no result yet', () => {
        render(withStatus('progress', <GenericMcpRenderer toolUse={makeToolUse({}, TOOL)} />));
        expect(screen.getByText('workspace-mcp: search gmail messages')).toBeInTheDocument();
        expect(screen.getByText('Using')).toBeInTheDocument();
    });

    it('keeps a failed call on "using" and marks it failed', () => {
        render(withStatus('error', <GenericMcpRenderer toolUse={makeToolUse({}, TOOL)} />));
        expect(screen.getByText('Using')).toBeInTheDocument();
        expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('puts no wording on a declined call, which never ran', () => {
        render(withStatus('declined', <GenericMcpRenderer toolUse={makeToolUse({}, TOOL)} />));
        expect(screen.getByText('workspace-mcp: search gmail messages')).toBeInTheDocument();
        expect(screen.queryByText('Failed')).not.toBeInTheDocument();
        expect(screen.queryByText('Using')).not.toBeInTheDocument();
        expect(screen.queryByText('Used')).not.toBeInTheDocument();
    });

    it('renders the input preview from the first priority key', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({query: 'in:inbox newer_than:7d', page_size: 3}, TOOL)}
            />
        );
        // Once in the header preview and once in the input section's `Query` field.
        expect(screen.getByText('in:inbox newer_than:7d', {selector: '.truncate'})).toBeInTheDocument();
        expect(screen.getByText('in:inbox newer_than:7d', {selector: '.whitespace-pre-wrap'})).toBeInTheDocument();
    });

    it('renders the tool result in an output section (raw text)', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({query: 'x'}, TOOL)}
                toolResult={makeToolResult('Found 3 messages')}
            />
        );
        expect(screen.getByText("Output")).toBeInTheDocument();
        expect(screen.getByText(/Found 3 messages/)).toBeInTheDocument();
    });

    it('renders an error result in the same output section (no special styling)', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({query: 'x'}, TOOL)}
                toolResult={makeToolResult("Error calling tool 'search_gmail_messages': ACTION REQUIRED")}
            />
        );
        expect(screen.getByText("Output")).toBeInTheDocument();
        expect(screen.getByText(/ACTION REQUIRED/)).toBeInTheDocument();
    });

    it('renders every input key in an input section, including one the preview does not know (#596)', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({command: 'echo "hello 3"', cwd: '/work'}, 'mcp__shell-sandboxed__run_command')}
            />
        );
        expect(screen.getByText("Input")).toBeInTheDocument();
        expect(screen.getByText('Command')).toBeInTheDocument();
        expect(screen.getByText('echo "hello 3"', {selector: '.whitespace-pre-wrap'})).toBeInTheDocument();
        expect(screen.getByText('Cwd')).toBeInTheDocument();
        expect(screen.getByText('/work')).toBeInTheDocument();
    });

    it('opens a nested table under the caption of an object-valued input key', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({env: {LANG: 'C'}, timeout_ms: 30000}, 'mcp__shell-sandboxed__run_script')}
            />
        );
        expect(screen.getByText('Env')).toBeInTheDocument();
        expect(screen.getByText('LANG')).toBeInTheDocument();
        expect(screen.getByText('C')).toBeInTheDocument();
        expect(screen.getByText('Timeout ms')).toBeInTheDocument();
        expect(screen.getByText('30000')).toBeInTheDocument();
    });

    it('does not render an input section when the input is empty', () => {
        render(<GenericMcpRenderer toolUse={makeToolUse({}, TOOL)} />);
        expect(screen.queryByText("Input")).not.toBeInTheDocument();
    });

    it('keeps a JSON-object result as indented JSON', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({command: 'x'}, 'mcp__shell-sandboxed__run_command')}
                toolResult={makeToolResult('{"stdout":"hi\\n","exit_code":0}')}
            />
        );
        expect(screen.getByText(/"stdout": "hi\\n"/)).toBeInTheDocument();
        expect(screen.getByText(/"exit_code": 0/)).toBeInTheDocument();
    });

    it('shows a list of plain values as one comma-separated line', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({args: ['--fast', '--no-color']}, 'mcp__shell-sandboxed__run_script')}
            />
        );
        expect(screen.getByText('--fast, --no-color')).toBeInTheDocument();
    });

    it('puts a failed call\'s error text above the input, marks the header, and drops the output caption', () => {
        const {container} = render(withStatus('error',
            <GenericMcpRenderer
                toolUse={makeToolUse({command: 'cat /nope'}, 'mcp__shell-sandboxed__run_command')}
                toolResult={makeToolResult('{"stderr":"No such file","exit_code":1}', true)}
            />
        ));
        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.queryByText('Output')).not.toBeInTheDocument();
        const error = container.querySelector('.text-state-error-fg.font-mono');
        expect(error?.textContent).toContain('"exit_code": 1');
        const input = screen.getByText('Input');
        // The error text comes before the input caption in the document.
        expect(error!.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('does not mark a successful call as failed', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({query: 'x'}, TOOL)}
                toolResult={makeToolResult('ok')}
            />
        );
        expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    });

    it('shows no output caption when there is no input to tell it apart from', () => {
        render(
            <GenericMcpRenderer
                toolUse={makeToolUse({}, 'mcp__shell-sandboxed__status')}
                toolResult={makeToolResult('idle')}
            />
        );
        expect(screen.getByText('idle')).toBeInTheDocument();
        expect(screen.queryByText('Output')).not.toBeInTheDocument();
    });

    it('draws a picture the result carries, which used to be dropped', () => {
        const {container} = render(
            <GenericMcpRenderer
                toolUse={makeToolUse({region: 'full'}, 'mcp__shell-sandboxed__screenshot')}
                toolResult={makeToolResult([
                    {type: ContentBlockType.Image, source: {type: 'base64', media_type: 'image/png', data: 'AAAA'}},
                ])}
            />
        );
        expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    });

    it('hides the CLI\'s "[Image: source: ...]" note next to a picture it draws', () => {
        const {container} = render(
            <GenericMcpRenderer
                toolUse={makeToolUse({region: 'full'}, 'mcp__shell-sandboxed__screenshot')}
                toolResult={makeToolResult([
                    {type: ContentBlockType.Text, text: '[Image: source: /tmp/x/shot.png]'},
                    {type: ContentBlockType.Image, source: {type: 'base64', media_type: 'image/png', data: 'AAAA'}},
                ])}
            />
        );
        expect(container.querySelector('img')).not.toBeNull();
        expect(screen.queryByText(/Image: source/)).not.toBeInTheDocument();
        expect(screen.queryByText('Output')).not.toBeInTheDocument();
    });

    it('does not render an output section when there is no result', () => {
        render(<GenericMcpRenderer toolUse={makeToolUse({query: 'x'}, TOOL)} />);
        expect(screen.queryByText("Output")).not.toBeInTheDocument();
    });

    it('does not throw when input is missing entirely', () => {
        expect(() =>
            render(<GenericMcpRenderer toolUse={makeToolUse(undefined as never, TOOL)} />)
        ).not.toThrow();
    });
});
