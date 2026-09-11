import { describe, it, expect } from 'vitest';
import { hasWorkflowNotification, parseWorkflowNotification } from '../parseWorkflowNotification';

const SAMPLE = [
  '<task-notification>',
  '<task-id>wzzuuhjwu</task-id>',
  '<tool-use-id>toolu_011Fk6wuDvjsEDFe7whGqGrc</tool-use-id>',
  '<output-file>/private/tmp/x/tasks/wzzuuhjwu.output</output-file>',
  '<status>completed</status>',
  '<summary>Dynamic workflow "Analyze 68 batches" completed</summary>',
  '<result>{"completed":68,"total":68}</result>',
  '<usage><agent_count>68</agent_count><subagent_tokens>4569489</subagent_tokens><tool_uses>801</tool_uses><duration_ms>1598048</duration_ms></usage>',
  '</task-notification>',
].join('\n');

describe('parseWorkflowNotification', () => {
  it('detects the notification envelope', () => {
    expect(hasWorkflowNotification(SAMPLE)).toBe(true);
    expect(hasWorkflowNotification('no envelope here')).toBe(false);
  });

  it('returns null for non-notification text', () => {
    expect(parseWorkflowNotification('just some text')).toBeNull();
  });

  it('parses every field including the usage sub-block', () => {
    const n = parseWorkflowNotification(SAMPLE)!;
    expect(n.taskId).toBe('wzzuuhjwu');
    expect(n.toolUseId).toBe('toolu_011Fk6wuDvjsEDFe7whGqGrc');
    expect(n.outputFile).toBe('/private/tmp/x/tasks/wzzuuhjwu.output');
    expect(n.status).toBe('completed');
    expect(n.summary).toContain('completed');
    expect(n.result).toBe('{"completed":68,"total":68}');
    expect(n.usage).toEqual({
      // The envelope's own tag names — the parser must not rename them.
      agent_count: 68,
      subagent_tokens: 4569489,
      tool_uses: 801,
      duration_ms: 1598048,
    });
  });

  // A fixed list of tags drops anything the CLI adds later where nobody can
  // see it. `<note>` is the one already being dropped: it is the CLI saying a
  // finished agent can be resumed and will then notify again under the same
  // task-id, which is why one agent could show up as two rows.
  it('keeps a tag it has no named field for, and reports none when there is none', () => {
    const note = 'A task-notification fires each time this agent stops.';
    const withNote = SAMPLE.replace('<usage>', `<note>${note}</note>\n<usage>`);

    expect(parseWorkflowNotification(withNote)!.notification).toEqual({ note });
    // The envelope's own tag is not one of its contents.
    expect(parseWorkflowNotification(SAMPLE)!.notification).toBeUndefined();
  });
});
