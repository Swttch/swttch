import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {CronCreateRenderer} from '../CronCreateRenderer';
import {CronDeleteRenderer} from '../CronDeleteRenderer';
import {CronListRenderer} from '../CronListRenderer';
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

describe('CronCreateRenderer', () => {
    it('shows the cron expression and the prompt', () => {
        render(<CronCreateRenderer toolUse={makeToolUse('CronCreate', {
            cron: '7 * * * *',
            prompt: 'check the deploy',
        })} />);

        expect(screen.getByText('7 * * * *')).toBeInTheDocument();
        expect(screen.getByText('check the deploy')).toBeInTheDocument();
    });

    // Both flags default to a value the caller never wrote down: recurring
    // defaults to true, durable to false. The row states the effective value.
    it('reports the defaults when the flags are omitted', () => {
        render(<CronCreateRenderer toolUse={makeToolUse('CronCreate', {cron: '7 * * * *'})} />);

        expect(screen.getByText(/recurring/i)).toBeInTheDocument();
        expect(screen.getByText(/session-only/i)).toBeInTheDocument();
    });

    it('reports a one-shot durable job when the flags say so', () => {
        render(<CronCreateRenderer toolUse={makeToolUse('CronCreate', {
            cron: '30 14 28 2 *',
            recurring: false,
            durable: true,
        })} />);

        expect(screen.getByText(/one-shot/i)).toBeInTheDocument();
        expect(screen.getByText(/durable/i)).toBeInTheDocument();
    });

    it('shows the job id the tool returned', () => {
        render(
            <CronCreateRenderer
                toolUse={makeToolUse('CronCreate', {cron: '7 * * * *'})}
                toolResult={makeToolResult('Created job cron_abc123')}
            />,
        );

        expect(screen.getByText(/cron_abc123/)).toBeInTheDocument();
    });
});

describe('CronDeleteRenderer', () => {
    it('names the job it cancelled', () => {
        render(<CronDeleteRenderer toolUse={makeToolUse('CronDelete', {id: 'cron_abc123'})} />);
        expect(screen.getByText(/cron_abc123/)).toBeInTheDocument();
    });
});

describe('CronListRenderer', () => {
    // CronList takes no arguments, so the result is the whole row.
    it('shows the listed jobs', () => {
        render(
            <CronListRenderer
                toolUse={makeToolUse('CronList', {})}
                toolResult={makeToolResult('cron_abc123  7 * * * *  check the deploy')}
            />,
        );

        expect(screen.getByText(/cron_abc123/)).toBeInTheDocument();
    });

    it('renders the header while the call is still running', () => {
        render(<CronListRenderer toolUse={makeToolUse('CronList', {})} />);
        expect(screen.getByText('CronList')).toBeInTheDocument();
    });
});
