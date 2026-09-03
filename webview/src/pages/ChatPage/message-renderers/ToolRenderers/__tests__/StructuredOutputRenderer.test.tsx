import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {StructuredOutputRenderer} from '../StructuredOutputRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

function makeToolUse(input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name: 'StructuredOutput',
        input,
    });
}

describe('StructuredOutputRenderer', () => {
    it('renders a `report` field as markdown, not raw JSON', () => {
        render(
            <StructuredOutputRenderer
                toolUse={makeToolUse({
                    file: '/private/tmp/ccg-demo/src/cart.js',
                    purpose: 'Summarize the pricing module',
                    report: '# cart.js summary\n\nHandles pricing.',
                })}
            />,
        );

        expect(screen.getByRole('heading', {name: 'cart.js summary'})).toBeInTheDocument();
        expect(screen.getByText('Summarize the pricing module')).toBeInTheDocument();
        expect(screen.getByText('/private/tmp/ccg-demo/src/cart.js')).toBeInTheDocument();
        // The raw JSON envelope must not also be dumped verbatim.
        expect(screen.queryByText(/"report":/)).not.toBeInTheDocument();
    });

    it('falls back to pretty-printed JSON when there is no `report` field (a different workflow schema)', () => {
        render(
            <StructuredOutputRenderer
                toolUse={makeToolUse({
                    verdict: 'pass',
                    findings: ['no issues found'],
                })}
            />,
        );

        expect(screen.getByText(/"verdict": "pass"/)).toBeInTheDocument();
        expect(screen.getByText(/"no issues found"/)).toBeInTheDocument();
    });
});
