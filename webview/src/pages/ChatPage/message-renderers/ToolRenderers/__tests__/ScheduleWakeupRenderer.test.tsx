import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ScheduleWakeupRenderer, formatWakeupDelay} from '../ScheduleWakeupRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

function makeToolUse(input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name: 'ScheduleWakeup',
        input,
    });
}

describe('formatWakeupDelay', () => {
    it('renders seconds under a minute as seconds', () => {
        expect(formatWakeupDelay(45)).toBe('45s');
    });

    it('splits a delay into minutes and seconds', () => {
        expect(formatWakeupDelay(90)).toBe('1m 30s');
    });

    it('drops the seconds when the delay lands on a whole minute', () => {
        expect(formatWakeupDelay(1200)).toBe('20m');
    });

    it('spells out hours for the longest delays the runtime allows', () => {
        expect(formatWakeupDelay(3600)).toBe('1h');
        expect(formatWakeupDelay(3660)).toBe('1h 1m');
    });

    it('renders a zero delay rather than an empty string', () => {
        expect(formatWakeupDelay(0)).toBe('0s');
    });
});

describe('ScheduleWakeupRenderer', () => {
    it('shows the delay and the reason', () => {
        render(<ScheduleWakeupRenderer toolUse={makeToolUse({
            delaySeconds: 90,
            reason: 'watching the CI run',
            prompt: 'check the deploy',
        })} />);

        expect(screen.getByText(/1m 30s/)).toBeInTheDocument();
        expect(screen.getByText('watching the CI run')).toBeInTheDocument();
    });

    it('shows the prompt that will fire on the next wake-up', () => {
        render(<ScheduleWakeupRenderer toolUse={makeToolUse({
            delaySeconds: 60,
            prompt: 'check the deploy',
        })} />);

        expect(screen.getByText('check the deploy')).toBeInTheDocument();
    });

    // `stop: true` ends the loop and the runtime ignores every other field, so a
    // delay next to it would read as "waking again in 90 seconds".
    it('reports a stop without a delay, even when other fields are present', () => {
        render(<ScheduleWakeupRenderer toolUse={makeToolUse({
            stop: true,
            delaySeconds: 90,
            prompt: 'check the deploy',
        })} />);

        expect(screen.getByText(/loop stopped/i)).toBeInTheDocument();
        expect(screen.queryByText(/1m 30s/)).not.toBeInTheDocument();
        expect(screen.queryByText('check the deploy')).not.toBeInTheDocument();
    });

    it('marks a quiet tick so a run of them is readable', () => {
        render(<ScheduleWakeupRenderer toolUse={makeToolUse({delaySeconds: 60, noop: true})} />);
        expect(screen.getByText(/no change/i)).toBeInTheDocument();
    });

    it('does not mark a tick that changed something', () => {
        render(<ScheduleWakeupRenderer toolUse={makeToolUse({delaySeconds: 60, noop: false})} />);
        expect(screen.queryByText(/no change/i)).not.toBeInTheDocument();
    });
});
