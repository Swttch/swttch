import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {ReportFindingsRenderer} from '../ReportFindingsRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

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
                {file: 'src/a.ts', line: 12, short_summary: 'off-by-one'},
                {file: 'src/b.ts', short_summary: 'unused import'},
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
            findings: [{file: 'src/a.ts', line: 12, short_summary: 'off-by-one'}],
        })} />);

        expect(screen.getByText('src/a.ts:12')).toBeInTheDocument();
        expect(screen.getByText('off-by-one')).toBeInTheDocument();
    });

    it('shows a finding as the bare file when it has no line', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/b.ts', short_summary: 'unused import'}],
        })} />);

        expect(screen.getByText('src/b.ts')).toBeInTheDocument();
    });

    it('falls back to the full summary when there is no short summary', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/a.ts', summary: 'The loop reads one element past the end.'}],
        })} />);

        expect(screen.getByText('The loop reads one element past the end.')).toBeInTheDocument();
    });

    it('shows the verdict and the applied outcome', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({
            findings: [{file: 'src/a.ts', short_summary: 'off-by-one', verdict: 'CONFIRMED', outcome: 'fixed'}],
        })} />);

        expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
        expect(screen.getByText('fixed')).toBeInTheDocument();
    });

    it('renders without throwing when findings is missing', () => {
        render(<ReportFindingsRenderer toolUse={makeToolUse({})} />);
        expect(screen.getByText('ReportFindings')).toBeInTheDocument();
    });
});
