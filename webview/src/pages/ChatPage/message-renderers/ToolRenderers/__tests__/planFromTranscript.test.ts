import {describe, it, expect} from 'vitest';
import type {LoadedMessageDto} from '@/types';
import {findPlanFileContent} from '../planFromTranscript';

const PLAN_PATH = '/Users/me/.claude/plans/do-not-read-any-glistening-gadget.md';

/** One transcript entry. Entries of the same API response share `messageId`. */
function assistant(blocks: Array<Record<string, unknown>>, messageId?: string): LoadedMessageDto {
    return {
        type: 'assistant',
        message_id: messageId,
        message: {role: 'assistant', content: blocks},
    } as unknown as LoadedMessageDto;
}

const write = (id: string, filePath: string, content: string) =>
    ({type: 'tool_use', id, name: 'Write', input: {file_path: filePath, content}});
const edit = (id: string, filePath: string, oldString: string, newString: string, replaceAll = false) =>
    ({type: 'tool_use', id, name: 'Edit', input: {file_path: filePath, old_string: oldString, new_string: newString, replace_all: replaceAll}});
const exitPlan = (id: string, input: Record<string, unknown> = {}) =>
    ({type: 'tool_use', id, name: 'ExitPlanMode', input});

describe('findPlanFileContent', () => {
    it('returns the plan file written in the same message as ExitPlanMode (parallel tool calls)', () => {
        const messages = [assistant([write('w1', PLAN_PATH, '# Plan\n\nbody'), exitPlan('e1')])];

        expect(findPlanFileContent(messages, 'e1')).toBe('# Plan\n\nbody');
    });

    it('returns the plan file written in an earlier message', () => {
        const messages = [
            assistant([write('w1', PLAN_PATH, '# Earlier')], 'm1'),
            assistant([exitPlan('e1')], 'm2'),
        ];

        expect(findPlanFileContent(messages, 'e1')).toBe('# Earlier');
    });

    it('takes the latest plan file write before the ExitPlanMode, not a later one', () => {
        const messages = [
            assistant([write('w1', PLAN_PATH, '# First')], 'm1'),
            assistant([write('w2', PLAN_PATH, '# Second'), exitPlan('e1')], 'm2'),
            assistant([write('w3', PLAN_PATH, '# After')], 'm3'),
        ];

        expect(findPlanFileContent(messages, 'e1')).toBe('# Second');
    });

    it('returns undefined when the ExitPlanMode is not in the messages', () => {
        const messages = [assistant([write('w1', PLAN_PATH, '# Plan')])];

        expect(findPlanFileContent(messages, 'missing')).toBeUndefined();
    });

    it('accepts a Windows plan path', () => {
        const messages = [assistant([write('w1', 'C:\\Users\\me\\.claude\\plans\\x.md', '# Win'), exitPlan('e1')])];

        expect(findPlanFileContent(messages, 'e1')).toBe('# Win');
    });

    describe('which Write counts as the plan file', () => {
        it('ignores a project document written in an earlier response, even under a plans folder', () => {
            const messages = [
                assistant([write('w1', '/Users/me/project/docs/plans/feature.md', '# Feature doc')], 'm1'),
                assistant([exitPlan('e1')], 'm2'),
            ];

            expect(findPlanFileContent(messages, 'e1')).toBeUndefined();
        });

        it('trusts a Write sent in the same response as ExitPlanMode, whatever its folder (plansDirectory setting)', () => {
            const messages = [
                assistant([write('w1', '/Users/me/project/docs/plans/feature.md', '# Custom folder plan')], 'm1'),
                assistant([exitPlan('e1')], 'm1'),
            ];

            expect(findPlanFileContent(messages, 'e1')).toBe('# Custom folder plan');
        });

        it('tells responses apart by the id a loaded entry keeps on message.id', () => {
            const loaded = (id: string, blocks: Array<Record<string, unknown>>) =>
                ({type: 'assistant', message: {id, role: 'assistant', content: blocks}}) as unknown as LoadedMessageDto;
            const messages = [
                loaded('msg_1', [write('w1', '/Users/me/project/docs/plans/feature.md', '# Custom folder plan')]),
                loaded('msg_1', [exitPlan('e1')]),
            ];
            const apart = [
                loaded('msg_1', [write('w1', '/Users/me/project/docs/plans/feature.md', '# Doc')]),
                loaded('msg_2', [exitPlan('e1')]),
            ];

            expect(findPlanFileContent(messages, 'e1')).toBe('# Custom folder plan');
            expect(findPlanFileContent(apart, 'e1')).toBeUndefined();
        });

        it('does not trust a same-response Write that is not a markdown file', () => {
            const messages = [assistant([write('w1', '/Users/me/project/src/index.ts', 'code'), exitPlan('e1')], 'm1')];

            expect(findPlanFileContent(messages, 'e1')).toBeUndefined();
        });
    });

    describe('edits to the plan file after it was written', () => {
        it('applies an Edit so the card shows what the user is about to approve', () => {
            const messages = [
                assistant([write('w1', PLAN_PATH, '# Plan\n\nuse option A')], 'm1'),
                assistant([edit('ed1', PLAN_PATH, 'option A', 'option B')], 'm2'),
                assistant([exitPlan('e1')], 'm3'),
            ];

            expect(findPlanFileContent(messages, 'e1')).toBe('# Plan\n\nuse option B');
        });

        it('applies edits in order and honours replace_all', () => {
            const messages = [
                assistant([write('w1', PLAN_PATH, 'a a a')], 'm1'),
                assistant([edit('ed1', PLAN_PATH, 'a', 'b', true)], 'm2'),
                assistant([edit('ed2', PLAN_PATH, 'b b', 'c')], 'm3'),
                assistant([exitPlan('e1')], 'm4'),
            ];

            expect(findPlanFileContent(messages, 'e1')).toBe('c b');
        });

        it('ignores an Edit of another file', () => {
            const messages = [
                assistant([write('w1', PLAN_PATH, '# Plan')], 'm1'),
                assistant([edit('ed1', '/Users/me/project/README.md', 'x', 'y')], 'm2'),
                assistant([exitPlan('e1')], 'm3'),
            ];

            expect(findPlanFileContent(messages, 'e1')).toBe('# Plan');
        });

        it('gives up rather than show a stale plan when an Edit cannot be applied', () => {
            const messages = [
                assistant([write('w1', PLAN_PATH, '# Plan')], 'm1'),
                assistant([edit('ed1', PLAN_PATH, 'text that is not there', 'y')], 'm2'),
                assistant([exitPlan('e1')], 'm3'),
            ];

            expect(findPlanFileContent(messages, 'e1')).toBeUndefined();
        });

        it('recovers when the plan file is written again after a failed Edit', () => {
            const messages = [
                assistant([write('w1', PLAN_PATH, '# Plan')], 'm1'),
                assistant([edit('ed1', PLAN_PATH, 'missing', 'y')], 'm2'),
                assistant([write('w2', PLAN_PATH, '# Rewritten')], 'm3'),
                assistant([exitPlan('e1')], 'm4'),
            ];

            expect(findPlanFileContent(messages, 'e1')).toBe('# Rewritten');
        });
    });
});
