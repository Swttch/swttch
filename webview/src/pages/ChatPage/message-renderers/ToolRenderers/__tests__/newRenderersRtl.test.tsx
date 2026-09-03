import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ScheduleWakeupRenderer} from '../ScheduleWakeupRenderer';
import {ReportFindingsRenderer} from '../ReportFindingsRenderer';
import {CronCreateRenderer} from '../CronCreateRenderer';
import {CronDeleteRenderer} from '../CronDeleteRenderer';
import {RemoteTriggerRenderer} from '../RemoteTriggerRenderer';
import {EnterWorktreeRenderer} from '../EnterWorktreeRenderer';
import {McpResourceRenderer} from '../McpResourceRenderer';
import {SendUserMessageRenderer} from '../SendUserMessageRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

/**
 * RTL exception: cron expressions, resource URIs, `file:line` locations,
 * worktree paths, trigger ids and attachment paths are code, not prose. They
 * must keep their own order under `<html dir="rtl">` UI mirroring, the way
 * GlobRenderer's pattern and file list already do.
 */

function makeToolUse(name: string, input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name,
        input,
    });
}

/** The nearest ancestor carrying an explicit `dir`, as the DOM would resolve it. */
function dirOf(text: string | RegExp): string | null | undefined {
    return screen.getByText(text).closest('[dir]')?.getAttribute('dir');
}

describe('code values in the new tool cards stay LTR', () => {
    it('keeps a cron expression LTR', () => {
        render(<CronCreateRenderer toolUse={makeToolUse('CronCreate', {cron: '7 * * * *'})} />);
        expect(dirOf('7 * * * *')).toBe('ltr');
    });

    it('keeps a cron job id LTR', () => {
        render(<CronDeleteRenderer toolUse={makeToolUse('CronDelete', {id: 'cron_abc123'})} />);
        expect(dirOf(/cron_abc123/)).toBe('ltr');
    });

    it('keeps an MCP resource URI LTR', () => {
        render(<McpResourceRenderer toolUse={makeToolUse('ReadMcpResourceTool', {
            server: 'notion',
            uri: 'notion://page/123',
        })} />);
        expect(dirOf('notion://page/123')).toBe('ltr');
    });

    it('keeps a finding location LTR', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse('ReportFindings', {
            findings: [{file: 'src/a.ts', line: 12, short_summary: 'off-by-one'}],
        })} />);
        expect(dirOf('src/a.ts:12')).toBe('ltr');
    });

    it('keeps a worktree path LTR', () => {
        render(<EnterWorktreeRenderer toolUse={makeToolUse('EnterWorktree', {
            path: '/repo/.claude/worktrees/wt',
        })} />);
        expect(dirOf(/\/repo\/\.claude\/worktrees\/wt/)).toBe('ltr');
    });

    it('keeps a trigger id LTR', () => {
        render(<RemoteTriggerRenderer toolUse={makeToolUse('RemoteTrigger', {
            action: 'run',
            trigger_id: 'trg_123',
        })} />);
        expect(dirOf('trg_123')).toBe('ltr');
    });

    it('keeps an attachment path LTR', () => {
        render(<SendUserMessageRenderer toolUse={makeToolUse('SendUserMessage', {
            message: 'Here it is.',
            attachments: ['/tmp/chart.png'],
        })} />);
        expect(dirOf('/tmp/chart.png')).toBe('ltr');
    });

    it('keeps a scheduled prompt LTR', () => {
        render(<ScheduleWakeupRenderer toolUse={makeToolUse('ScheduleWakeup', {
            delaySeconds: 60,
            prompt: 'check the deploy',
        })} />);
        expect(dirOf('check the deploy')).toBe('ltr');
    });

    // The reason is a sentence the model wrote, so it follows the UI direction
    // rather than being pinned — the opposite call from the values above.
    it('does not pin the human-written reason to LTR', () => {
        render(<ScheduleWakeupRenderer toolUse={makeToolUse('ScheduleWakeup', {
            delaySeconds: 60,
            reason: 'watching the CI run',
        })} />);
        expect(dirOf('watching the CI run')).not.toBe('ltr');
    });
});
