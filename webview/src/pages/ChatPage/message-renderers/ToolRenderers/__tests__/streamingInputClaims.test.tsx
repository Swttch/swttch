import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ReportFindingsRenderer} from '../ReportFindingsRenderer';
import {McpResourceRenderer} from '../McpResourceRenderer';
import {EnterWorktreeRenderer} from '../EnterWorktreeRenderer';
import {CronCreateRenderer} from '../CronCreateRenderer';
import {NotebookEditRenderer} from '../NotebookEditRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

/**
 * While a message streams, `input` is rebuilt from partial JSON, so a field
 * that has not arrived yet is indistinguishable from one the caller omitted.
 *
 * Renderers that read meaning into an absent field state that meaning as fact.
 * Caught in review of #401: ReportFindings showed "No findings" for a call that
 * was reporting two, for as long as the arguments were still streaming.
 */

function makeToolUse(name: string, input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name,
        input,
    });
}

/** The parent assistant message, still streaming its tool arguments. */
const STREAMING = {isStreaming: true} as unknown as LoadedMessageDto;

/** The same message once it has finished. */
const SETTLED = {isStreaming: false} as unknown as LoadedMessageDto;

describe('renderers do not read meaning into a field that has not streamed in yet', () => {
    it('ReportFindings does not claim "No findings" mid-stream', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse('ReportFindings', {})} message={STREAMING} />);
        expect(screen.queryByText(/no findings/i)).not.toBeInTheDocument();
    });

    it('ReportFindings does claim "No findings" once the call is settled', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse('ReportFindings', {findings: []})} message={SETTLED} />);
        expect(screen.getByText(/no findings/i)).toBeInTheDocument();
    });

    it('McpResource does not claim "all servers" mid-stream', () => {
        render(<McpResourceRenderer toolUse={makeToolUse('ListMcpResourcesTool', {})} message={STREAMING} />);
        expect(screen.queryByText(/all servers/i)).not.toBeInTheDocument();
    });

    it('McpResource does claim "all servers" once the call is settled', () => {
        render(<McpResourceRenderer toolUse={makeToolUse('ListMcpResourcesTool', {})} message={SETTLED} />);
        expect(screen.getByText(/all servers/i)).toBeInTheDocument();
    });

    it('EnterWorktree does not claim an auto-generated name mid-stream', () => {
        render(<EnterWorktreeRenderer toolUse={makeToolUse('EnterWorktree', {})} message={STREAMING} />);
        expect(screen.queryByText(/auto-named/i)).not.toBeInTheDocument();
    });

    it('EnterWorktree does claim an auto-generated name once the call is settled', () => {
        render(<EnterWorktreeRenderer toolUse={makeToolUse('EnterWorktree', {})} message={SETTLED} />);
        expect(screen.getByText(/auto-named/i)).toBeInTheDocument();
    });

    it('CronCreate does not report default flags mid-stream', () => {
        render(<CronCreateRenderer toolUse={makeToolUse('CronCreate', {cron: '7 * * * *'})} message={STREAMING} />);
        expect(screen.queryByText(/recurring/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/session-only/i)).not.toBeInTheDocument();
    });

    it('CronCreate does report default flags once the call is settled', () => {
        render(<CronCreateRenderer toolUse={makeToolUse('CronCreate', {cron: '7 * * * *'})} message={SETTLED} />);
        expect(screen.getByText(/recurring/i)).toBeInTheDocument();
        expect(screen.getByText(/session-only/i)).toBeInTheDocument();
    });

    // Found by sweeping the pre-existing renderers for the same pattern.
    it('NotebookEdit does not call a cell empty while its source streams in', () => {
        render(
            <NotebookEditRenderer
                toolUse={makeToolUse('NotebookEdit', {notebook_path: '/repo/nb.ipynb'})}
                message={STREAMING}
            />,
        );

        expect(screen.queryByText(/no content/i)).not.toBeInTheDocument();
    });

    it('NotebookEdit does call a cell empty once the call is settled', () => {
        render(
            <NotebookEditRenderer
                toolUse={makeToolUse('NotebookEdit', {notebook_path: '/repo/nb.ipynb', new_source: ''})}
                message={SETTLED}
            />,
        );

        expect(screen.getByText(/no content/i)).toBeInTheDocument();
    });

    // A result settles the input even on a message still flagged as streaming:
    // the arguments cannot change after the tool has already run on them.
    it('treats an arrived result as settling the input', () => {
        const toolResult = {
            message: {content: [{type: ContentBlockType.ToolResult, content: 'ok'}]},
        } as unknown as LoadedMessageDto;

        render(
            <ReportFindingsRenderer
                toolUse={makeToolUse('ReportFindings', {findings: []})}
                toolResult={toolResult}
                message={STREAMING}
            />,
        );

        expect(screen.getByText(/no findings/i)).toBeInTheDocument();
    });
});
