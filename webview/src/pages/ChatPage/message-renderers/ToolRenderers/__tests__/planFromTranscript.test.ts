import {describe, it, expect} from 'vitest';
import type {LoadedMessageDto} from '@/types';
import {findPlanFileContent} from '../planFromTranscript';

const PLAN_PATH = '/Users/me/.claude/plans/do-not-read-any-glistening-gadget.md';

function assistant(blocks: Array<Record<string, unknown>>): LoadedMessageDto {
    return {type: 'assistant', message: {role: 'assistant', content: blocks}} as unknown as LoadedMessageDto;
}

const write = (id: string, filePath: string, content: string) =>
    ({type: 'tool_use', id, name: 'Write', input: {file_path: filePath, content}});
const exitPlan = (id: string, input: Record<string, unknown> = {}) =>
    ({type: 'tool_use', id, name: 'ExitPlanMode', input});

describe('findPlanFileContent', () => {
    it('returns the plan file written in the same message as ExitPlanMode (parallel tool calls)', () => {
        const messages = [assistant([write('w1', PLAN_PATH, '# Plan\n\nbody'), exitPlan('e1')])];

        expect(findPlanFileContent(messages, 'e1')).toBe('# Plan\n\nbody');
    });

    it('returns the plan file written in an earlier message', () => {
        const messages = [
            assistant([write('w1', PLAN_PATH, '# Earlier')]),
            assistant([exitPlan('e1')]),
        ];

        expect(findPlanFileContent(messages, 'e1')).toBe('# Earlier');
    });

    it('takes the latest plan file write before the ExitPlanMode, not a later one', () => {
        const messages = [
            assistant([write('w1', PLAN_PATH, '# First')]),
            assistant([write('w2', PLAN_PATH, '# Second'), exitPlan('e1')]),
            assistant([write('w3', PLAN_PATH, '# After')]),
        ];

        expect(findPlanFileContent(messages, 'e1')).toBe('# Second');
    });

    it('ignores writes to files that are not in a plans directory', () => {
        const messages = [assistant([write('w1', '/Users/me/project/README.md', '# Readme'), exitPlan('e1')])];

        expect(findPlanFileContent(messages, 'e1')).toBeUndefined();
    });

    it('returns undefined when the ExitPlanMode is not in the messages', () => {
        const messages = [assistant([write('w1', PLAN_PATH, '# Plan')])];

        expect(findPlanFileContent(messages, 'missing')).toBeUndefined();
    });

    it('accepts a Windows plan path', () => {
        const messages = [assistant([write('w1', 'C:\\Users\\me\\.claude\\plans\\x.md', '# Win'), exitPlan('e1')])];

        expect(findPlanFileContent(messages, 'e1')).toBe('# Win');
    });
});
