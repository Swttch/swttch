import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {TaskStopRenderer} from '../TaskStopRenderer';
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

const STOPPED = JSON.stringify({
    message: 'Successfully stopped task: b5a3bdzoi (sleep 30 && echo done)',
    task_id: 'b5a3bdzoi',
    task_type: 'local_bash',
    command: 'sleep 30 && echo done',
});

// The result is a JSON object. Printed raw it was a wall of braces in the result
// row; parsed, it reads like TaskOutput's meta line.
describe('TaskStopRenderer', () => {
    it('shows the message rather than the raw JSON', () => {
        render(
            <TaskStopRenderer
                toolUse={makeToolUse('TaskStop', {task_id: 'b5a3bdzoi'})}
                toolResult={makeToolResult(STOPPED)}
            />,
        );

        expect(screen.getByText(/Successfully stopped task: b5a3bdzoi/)).toBeInTheDocument();
        expect(screen.queryByText(/"task_type":/)).not.toBeInTheDocument();
    });

    it('breaks out the task type and the command', () => {
        render(
            <TaskStopRenderer
                toolUse={makeToolUse('TaskStop', {task_id: 'b5a3bdzoi'})}
                toolResult={makeToolResult(STOPPED)}
            />,
        );

        expect(screen.getByText('local_bash')).toBeInTheDocument();
        expect(screen.getByText('sleep 30 && echo done')).toBeInTheDocument();
    });

    // A command is code: it keeps its own order under `<html dir="rtl">`.
    it('keeps the command LTR', () => {
        render(
            <TaskStopRenderer
                toolUse={makeToolUse('TaskStop', {task_id: 'b5a3bdzoi'})}
                toolResult={makeToolResult(STOPPED)}
            />,
        );

        expect(screen.getByText('sleep 30 && echo done').closest('[dir]')?.getAttribute('dir')).toBe('ltr');
    });

    // Anything that is not that object still has to reach the reader.
    it('falls back to the raw text when the result is not the expected object', () => {
        render(
            <TaskStopRenderer
                toolUse={makeToolUse('TaskStop', {task_id: 'nope'})}
                toolResult={makeToolResult('No such task: nope')}
            />,
        );

        expect(screen.getByText(/No such task: nope/)).toBeInTheDocument();
    });

    it('falls back when the result is malformed JSON', () => {
        render(
            <TaskStopRenderer
                toolUse={makeToolUse('TaskStop', {task_id: 'x'})}
                toolResult={makeToolResult('{"message": truncated…')}
            />,
        );

        expect(screen.getByText(/truncated/)).toBeInTheDocument();
    });

    it('reads the id from the legacy shell_id field', () => {
        render(<TaskStopRenderer toolUse={makeToolUse('KillShell', {shell_id: 'b5a3bdzoi'})} />);
        expect(screen.getByText(/b5a3bdzoi/)).toBeInTheDocument();
    });

    // A call that named no id at all still identifies what it stopped. Matched on
    // the header form, since the message repeats the id further down.
    it('falls back to the id the result reports', () => {
        render(
            <TaskStopRenderer toolUse={makeToolUse('TaskStop', {})} toolResult={makeToolResult(STOPPED)} />,
        );

        expect(screen.getByText(/task: "b5a3bdzoi"/)).toBeInTheDocument();
    });
});
