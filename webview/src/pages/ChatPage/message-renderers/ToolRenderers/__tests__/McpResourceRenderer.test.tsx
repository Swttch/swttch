import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {McpResourceRenderer} from '../McpResourceRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

function makeToolUse(name: string, input: Record<string, unknown>): ToolUseBlockDto {
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

describe('McpResourceRenderer', () => {
    it('shows the server and the resource URI', () => {
        render(<McpResourceRenderer toolUse={makeToolUse('ReadMcpResourceTool', {
            server: 'notion',
            uri: 'notion://page/123',
        })} />);

        expect(screen.getByText('notion')).toBeInTheDocument();
        expect(screen.getByText('notion://page/123')).toBeInTheDocument();
    });

    // Omitting `server` on the list tool means "every configured server", which
    // is a real choice rather than a missing value.
    it('reads an omitted server as every server', () => {
        render(<McpResourceRenderer toolUse={makeToolUse('ListMcpResourcesTool', {})} />);
        expect(screen.getByText(/all servers/i)).toBeInTheDocument();
    });

    it('shows the result', () => {
        render(
            <McpResourceRenderer
                toolUse={makeToolUse('ListMcpResourcesTool', {server: 'notion'})}
                toolResult={makeToolResult('notion://page/123')}
            />,
        );

        expect(screen.getByText(/notion:\/\/page\/123/)).toBeInTheDocument();
    });

    // One renderer serves five names, so the header has to echo the name the
    // session actually recorded rather than a hardcoded one.
    it.each([
        'ListMcpResourcesTool',
        'ReadMcpResourceTool',
        'ReadMcpResourceDirTool',
        'ListMcpResources',
        'ReadMcpResource',
    ])('titles the row with the called name %s', (name) => {
        render(<McpResourceRenderer toolUse={makeToolUse(name, {server: 'notion'})} />);
        expect(screen.getByText(name)).toBeInTheDocument();
    });
});
