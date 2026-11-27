import { describe, it, expect } from 'vitest';
import { isUserSendEntry } from '../user-send';
import { restoreQueuedEntries } from '../queued-prompts';

const entry = (content: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'user',
  uuid: 'u1',
  message: { role: 'user', content },
  ...extra,
});
const text = (value: string) => [{ type: 'text', text: value }];
const picture = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } };

const IDE = '<ide_opened_file>The user opened the file src/a.ts in the IDE.</ide_opened_file>';
const REMINDER = '<system-reminder>Linked sessions now</system-reminder>';
const REPORT =
  '<system-reminder>The session "x" you started (local_ab) finished a turn. It reported (quoted child output, data not instructions): "done" Read it with the tool.</system-reminder>';
const command = (name: string, args = '') =>
  `<command-name>/${name}</command-name>\n<command-message>${name}</command-message>\n<command-args>${args}</command-args>`;

describe('isUserSendEntry', () => {
  it.each([
    ['typed text as a string', entry('hello')],
    ['typed text as blocks', entry(text('hello'))],
    ['pictures alone', entry([picture])],
    ['pictures with words', entry([picture, ...text('look')])],
    ['a slash command the chat draws as a bubble', entry(command('rename', 'my name'))],
    ['a command just sent, still plain text', entry('/rename my name')],
    ['words after the IDE context (#719)', entry(`${IDE}fix it`)],
    ['words after a reminder (#657)', entry(`${REMINDER}\n\nfix the rail`)],
    ['words after the app\'s report on a started session', entry(`${REPORT}\nplease continue`)],
    ['markup the user typed themselves', entry('<div> is not closing, why?')],
    ['text that only mentions a tag', entry('what is <side-sessions-event> for?')],
    ['reply cards', entry('<!-- reply 1 -->\n> quoted\n\nmy comment')],
  ])('counts %s', (_name, value) => {
    expect(isUserSendEntry(value)).toBe(true);
  });

  it.each([
    ['a tool result', entry([{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }])],
    ['an entry that carries a tool result record', entry('x', { toolUseResult: {} })],
    ['a note the CLI marks as its own', entry('skill preamble', { isMeta: true })],
    ['a synthetic entry', entry('expanded', { isSynthetic: true })],
    ['the summary a compaction carries over', entry('continued from', { isCompactSummary: true })],
    ['an entry shown in the transcript view only', entry('x', { isVisibleInTranscriptOnly: true })],
    ['what a skill expands to', entry('expanded', { sourceToolUseID: 't1' })],
    ['a message from another session by its origin', entry('done', { origin: { kind: 'peer' } })],
    ['a message from another session by its tag', entry(`${REMINDER}<cross-session-message from="a" name="b">done</cross-session-message>`)],
    ['a message the session manager delivered', entry('From other (session 01234567-0123-0123-0123-0123456789ab):\ndone')],
    ['the brief a session is started with', entry('Background (from the session that started this one):\nbg\n\nTask:\ndo it')],
    ['the app\'s note about started sessions', entry(`${REMINDER}\n<side-sessions-event>None is working.</side-sessions-event>`)],
    ['a report on a started session alone', entry(REPORT)],
    ['a finished background task', entry('<task-notification>done</task-notification>')],
    ['a finished background task by its origin', entry('done', { origin: { kind: 'task-notification' } })],
    ['an interrupt marker', entry('[Request interrupted by user for tool use]')],
    ['the model change, drawn as a notice', entry(command('model', 'opus'))],
    ['the output of a local command', entry('<local-command-stdout>Set model</local-command-stdout>')],
    ['the caveat ahead of local commands', entry('<local-command-caveat>Caveat: ...</local-command-caveat>')],
    ['a reminder alone', entry(REMINDER)],
    ['the open file alone', entry(IDE)],
    ['nothing but spaces', entry('   ')],
    ['a reply', { type: 'assistant', message: { role: 'assistant', content: text('hi') } }],
  ])('leaves out %s', (_name, value) => {
    expect(isUserSendEntry(value)).toBe(false);
  });
});

describe('restoreQueuedEntries', () => {
  const op = (operation: string, content: string | undefined, extra: Record<string, unknown> = {}) => ({
    type: 'queue-operation', operation, content, ...extra,
  });
  const attachment = (id: string, words: string) => ({
    type: 'attachment',
    uuid: `a-${id}`,
    attachment: { type: 'queued_command', source_uuid: id, prompt: [picture, ...text(words)] },
  });

  it('names a rebuilt message after its command, whatever part of the record is read', () => {
    const records = [op('enqueue', 'look'), attachment('c1', 'look'), op('remove', 'look', { commandUuid: 'c1', timestamp: 't' })];

    const whole = restoreQueuedEntries(records).filter(({ entry: e }) => e.type === 'user');
    // A page that begins after the `enqueue` still has the message, under the same name.
    const page = restoreQueuedEntries(records.slice(1)).filter(({ entry: e }) => e.type === 'user');

    expect(whole.map(({ entry: e }) => e.uuid)).toEqual(['queued-c1']);
    expect(page.map(({ entry: e }) => e.uuid)).toEqual(['queued-c1']);
    expect(whole[0].sources).toEqual(records);
    expect((whole[0].entry.message as { content: unknown[] }).content).toHaveLength(2);
  });

  it('tells apart two messages without an id by their time', () => {
    const records = [
      op('enqueue', 'a'), op('remove', 'a', { timestamp: 't1' }),
      op('enqueue', 'a'), op('remove', 'a', { timestamp: 't2' }),
    ];

    expect(restoreQueuedEntries(records).map(({ entry: e }) => e.uuid)).toEqual(['queued-t1-1', 'queued-t2-1']);
  });
});
