import { describe, it, expect } from 'vitest';
import { agentDisplayName, agentDisplayStatus } from '../workflowFormat';

// These two helpers exist because the backend stopped deciding for us: it now
// forwards the CLI's `workflow_progress[]` entry untouched, so turning `state`
// into a dot colour and picking a name to show are display decisions and live
// on this side (see the original-data rule in CLAUDE.md).
describe('agentDisplayStatus', () => {
    it('treats the CLI\'s finished states as done', () => {
        for (const state of ['done', 'completed', 'success']) {
            expect(agentDisplayStatus(state, 'running')).toBe('done');
            expect(agentDisplayStatus(state, 'stopped')).toBe('done');
        }
    });

    it('shows an agent as running while the workflow is still running', () => {
        expect(agentDisplayStatus('start', 'running')).toBe('running');
        expect(agentDisplayStatus('progress', 'running')).toBe('running');
        // No state reported yet is still "not finished", not "finished".
        expect(agentDisplayStatus(undefined, 'running')).toBe('running');
    });

    // This is what the backend used to bake in before broadcasting. A finished
    // card must not keep pulsing blue dots, and an agent that never reported
    // finishing must not be painted green just because the workflow ended.
    it('settles unfinished agents against the workflow\'s terminal status', () => {
        expect(agentDisplayStatus('progress', 'completed')).toBe('done');
        expect(agentDisplayStatus('progress', 'stopped')).toBe('stopped');
        expect(agentDisplayStatus('progress', 'failed')).toBe('stopped');
        expect(agentDisplayStatus(undefined, 'stopped')).toBe('stopped');
    });

    // `error` is a real CLI state and is not in its finished set, so an errored
    // agent settles with the workflow rather than counting as a success.
    it('does not count an errored agent as done', () => {
        expect(agentDisplayStatus('error', 'running')).toBe('running');
        expect(agentDisplayStatus('error', 'stopped')).toBe('stopped');
    });
});

describe('agentDisplayName', () => {
    it('uses the label the workflow script gave the agent', () => {
        expect(agentDisplayName({ label: 'classify:allay', agentId: 'a157cfae20b96c33d' })).toBe('classify:allay');
    });

    // A reloaded agent has no label, because the CLI persists it nowhere. The
    // journal does keep the agent's result, so a workflow that returns a topic
    // has effectively named its own agent.
    it('falls back to the result topic when there is no label', () => {
        expect(agentDisplayName({ agentId: 'a157cfae20b96c33d', result: { topic: 'океан' } })).toBe('океан');
    });

    // Scripts conventionally prefix a label with its phase. Under a header that
    // already names the phase, the prefix is noise costing width the agent's own
    // name needs — but only an exact `<phase>:` opening is the prefix.
    it('drops the phase prefix the label repeats', () => {
        expect(agentDisplayName({ label: 'probe:survivor-0' }, 'Probe')).toBe('survivor-0');
        // Scripts lowercase the prefix, so the match ignores case.
        expect(agentDisplayName({ label: 'PROBE:survivor-0' }, 'Probe')).toBe('survivor-0');
    });

    it('keeps everything past the phase, colons included', () => {
        expect(agentDisplayName({ label: 'verify:phantom:0' }, 'Verify')).toBe('phantom:0');
    });

    it('leaves a label alone when it does not open with this phase', () => {
        expect(agentDisplayName({ label: 'classify:allay' }, 'Verify')).toBe('classify:allay');
        expect(agentDisplayName({ label: 'probing:x' }, 'Probe')).toBe('probing:x');
        expect(agentDisplayName({ label: 'probe:survivor-0' })).toBe('probe:survivor-0');
    });

    // A chip has to say something, so a label that is nothing but its phase
    // keeps the prefix rather than rendering blank.
    it('does not strip a label down to nothing', () => {
        expect(agentDisplayName({ label: 'probe:' }, 'Probe')).toBe('probe:');
    });

    it('falls back to a slice of the agent id when there is nothing else', () => {
        expect(agentDisplayName({ agentId: 'a157cfae20b96c33d' })).toBe('a157cfae');
        expect(agentDisplayName({ agentId: 'a157cfae20b96c33d', result: '0' })).toBe('a157cfae');
        expect(agentDisplayName({ agentId: 'a157cfae20b96c33d', result: { fact: 'no topic here' } })).toBe('a157cfae');
    });

    // The fallbacks are for display only. Nothing may write them back onto
    // `label`, or a guess becomes indistinguishable from what the CLI reported.
    it('leaves the agent object alone', () => {
        const agent = { agentId: 'a157cfae20b96c33d', result: { topic: 'океан' } };
        agentDisplayName(agent);
        expect(agent).toEqual({ agentId: 'a157cfae20b96c33d', result: { topic: 'океан' } });
    });
});
