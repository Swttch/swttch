import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {ReportFindingsRenderer} from '../ReportFindingsRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

const openFile = vi.fn();

vi.mock('@/adapters', () => ({
    getAdapter: () => ({openFile: (...args: unknown[]) => openFile(...args)}),
}));

vi.mock('@/contexts/SessionContext', () => ({
    useSessionContext: () => ({workingDirectory: '/repo'}),
}));

function makeToolUse(input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name: 'ReportFindings',
        input,
    });
}

describe('ReportFindingsRenderer', () => {
    it('counts the findings', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [
                {file: 'src/a.ts', line: 12, summary: 'off-by-one'},
                {file: 'src/b.ts', summary: 'unused import'},
            ],
        })} />);

        expect(screen.getByText('2 findings')).toBeInTheDocument();
    });

    // An empty array is the tool's way of saying "nothing survived verification",
    // which is a result worth stating rather than a blank row.
    it('says so when a review found nothing', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({findings: []})} />);
        expect(screen.getByText(/no findings/i)).toBeInTheDocument();
    });

    it('shows a finding as file:line when it has a line', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/a.ts', line: 12, summary: 'off-by-one'}],
        })} />);

        expect(screen.getByText('src/a.ts:12')).toBeInTheDocument();
        expect(screen.getByText('off-by-one')).toBeInTheDocument();
    });

    it('shows a finding as the bare file when it has no line', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/b.ts', summary: 'unused import'}],
        })} />);

        expect(screen.getByText('src/b.ts')).toBeInTheDocument();
    });

    // `summary` is the full sentence and `short_summary` its compressed label for
    // a narrow UI. The chat column is wide, so the sentence wins.
    it('prefers the full summary over the compressed label', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{
                file: 'src/a.ts',
                summary: 'The loop reads one element past the end.',
                short_summary: 'off-by-one',
            }],
        })} />);

        expect(screen.getByText('The loop reads one element past the end.')).toBeInTheDocument();
        expect(screen.queryByText('off-by-one')).not.toBeInTheDocument();
    });

    it('falls back to the compressed label when there is no full summary', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/a.ts', short_summary: 'off-by-one'}],
        })} />);

        expect(screen.getByText('off-by-one')).toBeInTheDocument();
    });

    // The evidence for the finding. Without it the card states a verdict the
    // reader has no way to check, which sends them to the raw payload.
    it('shows the failure scenario', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{
                file: 'math.js',
                summary: 'add() does not guard non-numbers',
                failure_scenario: "add('1','2') returns '12' instead of 3",
            }],
        })} />);

        expect(screen.getByText(/add\('1','2'\) returns '12' instead of 3/)).toBeInTheDocument();
    });

    it('shows the category', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/a.ts', summary: 'off-by-one', category: 'correctness'}],
        })} />);

        expect(screen.getByText('correctness')).toBeInTheDocument();
    });

    it('shows the verdict and the applied outcome', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/a.ts', summary: 'off-by-one', verdict: 'CONFIRMED', outcome: 'fixed'}],
        })} />);

        expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
        expect(screen.getByText('fixed')).toBeInTheDocument();
    });

    // The outcome is written by the model, so a value outside the schema must not
    // put a raw translation key on screen.
    it('shows an unrecognized outcome verbatim rather than its translation key', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/a.ts', summary: 'off-by-one', outcome: 'deferred'}],
        })} />);

        expect(screen.getByText('deferred')).toBeInTheDocument();
        expect(screen.queryByText(/reportFindings\.outcome/)).not.toBeInTheDocument();
    });

    // `file` is repo-relative, and the IDE needs an absolute path plus the line.
    it('opens the finding at its line, resolved against the working directory', () => {
        openFile.mockClear();

        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/a.ts', line: 12, summary: 'off-by-one'}],
        })} />);

        fireEvent.click(screen.getByText('src/a.ts:12'));
        expect(openFile).toHaveBeenCalledWith('/repo/src/a.ts', 12);
    });

    // `verdict` is only set when a verify pass ran, so a list can mix findings
    // that have one with findings that do not. Each finding must still occupy the
    // same three grid cells, or the ones without a verdict slide left and the
    // column stops lining up.
    it('lays every finding out in the same three columns, verdict or not', () => {
        const {container} = render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [
                {file: 'a.ts', summary: 'no verdict on this one'},
                {file: 'b.ts', summary: 'this one was verified', verdict: 'CONFIRMED'},
            ],
        })} />);

        const grid = container.querySelector('.grid');
        expect(grid).not.toBeNull();
        expect(grid?.children).toHaveLength(2 * 3);
    });

    it('shows everything about a finding that has no verdict', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{
                file: 'math.js',
                line: 2,
                category: 'correctness',
                summary: 'add() does not guard non-numbers',
                failure_scenario: "add('1','2') returns '12'",
            }],
        })} />);

        expect(screen.getByText('add() does not guard non-numbers')).toBeInTheDocument();
        expect(screen.getByText('math.js:2')).toBeInTheDocument();
        expect(screen.getByText('correctness')).toBeInTheDocument();
        expect(screen.getByText(/add\('1','2'\) returns '12'/)).toBeInTheDocument();
    });

    it('renders without throwing when findings is missing', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({})} />);
        expect(screen.getByText('ReportFindings')).toBeInTheDocument();
    });
});
