import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { LoadedMessageDto } from '../../../../types';
import { buildSegments, isPeerMessage, type ToolCall } from '../buildSegments';
import { parseCrossSessionMessage, parseCrossSessionPreview } from '../../message-renderers/CrossSessionMessageRenderer';
import { groupLabel, rowLabel, toolKindOf } from '../toolSummary';
import { isStartSessionTool, sessionLinkIdOf, startedSessionOf, startedSessionsIn } from '../../message-renderers/utils/startedSessions';

/**
 * Acceptance for: "A session that starts, looks up or detaches sessions through the session-management MCP
 * reads the way the same work reads in the desktop app: a card for the session it started, a line for each
 * thing it did, and a way into the session."
 */

// A translator that shows what it was asked for: the key's last part.
const t = ((key: string) => key.split('.').pop()) as unknown as TFunction;

const SESSION = '4e4b99cb-7b8e-4ea2-a9f9-1b3073ccaf12';
const answerOf = (text: string, failed = false) =>
  ({ message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: text, ...(failed && { is_error: true }) }] } }) as unknown as LoadedMessageDto;

function call(name: string, input: Record<string, unknown> = {}, answer?: LoadedMessageDto, streaming = false): ToolCall {
  const message = { type: 'assistant', isStreaming: streaming } as unknown as LoadedMessageDto;
  return { toolUse: { id: name, name, input, tool_result: answer } as unknown as ToolCall['toolUse'], message };
}

describe('the session-management MCP\'s tools read like the desktop app\'s own', () => {
  it.each([
    ['mcp__swttch_session__start_session', 'sessionStart'],
    ['mcp__swttch_session_mgmt__list_sessions', 'sessionList'],
    ['mcp__swttch_session_mgmt__get_session', 'sessionLookup'],
    ['mcp__swttch_session_mgmt__send_message', 'sessionMessage'],
    ['mcp__swttch_session_mgmt__archive_session', 'sessionArchive'],
    ['mcp__swttch_session_mgmt__set_session_title', 'sessionRename'],
    ['mcp__swttch_session_mgmt__list_events', 'sessionRead'],
    ['mcp__swttch_session_mgmt__detach_session', 'sessionDetach'],
    ['mcp__ccd_session_mgmt__detach_session', 'sessionDetach'],
  ])('%s is %s', (name, kind) => {
    expect(toolKindOf(call(name, {}, answerOf('ok')))).toBe(kind);
  });

  it('a tool of another server that happens to be called the same is not one of them', () => {
    expect(toolKindOf(call('mcp__other__start_session', {}, answerOf('ok')))).toBe('other');
  });

  it('the line over a run names what was done instead of counting "other actions"', () => {
    const calls = [
      call('mcp__swttch_session_mgmt__get_session', { session_id: 'self' }, answerOf('{"title": "Caller"}')),
      call('mcp__swttch_session_mgmt__list_sessions', { linked: true }, answerOf('[]')),
    ];
    const label = groupLabel(calls, t);
    expect(label).toContain('sessionLookedUp');
    expect(label).toContain('listedSessions');
    expect(label).not.toContain('otherActions');
  });
});

describe('moving a session to the top level', () => {
  const moved = '{\n  "session_id": "' + SESSION + '",\n  "title": "2026.11.10 - v0.36.2",\n  "detached": true\n}';

  it('says the session was moved, and names it by its title', () => {
    const label = rowLabel(call('mcp__swttch_session_mgmt__detach_session', { session_id: SESSION }, answerOf(moved)), t);
    expect(label.before).toBe('sessionDetached');
    expect(label.meta).toBe('2026.11.10 - v0.36.2');
  });

  it('says it is being moved while the call runs', () => {
    const label = rowLabel(call('mcp__swttch_session_mgmt__detach_session', { session_id: SESSION }, undefined, true), t);
    expect(label.before).toBe('sessionDetaching');
  });

  it('does not report a move that was refused as done', () => {
    const label = rowLabel(call('mcp__swttch_session_mgmt__detach_session', { session_id: SESSION }, answerOf('unavailable: the sidebar has no nesting yet', true)), t);
    expect(label.before).toBe('sessionDetaching');
  });
});

describe('a session started through the session-management MCP', () => {
  const started = '{\n  "session_id": "' + SESSION + '",\n  "name": "manager",\n  "cwd": "/work/project",\n  "wake_when_done": false\n}';

  it('is known by the CLI session and the folder the answer names', () => {
    expect(startedSessionOf(started, { title: 'Next manager' })).toEqual({ sessionId: SESSION, cwd: '/work/project', title: 'Next manager' });
  });

  it('falls back to the folder the call asked for when the answer is from before the server reported it', () => {
    const older = '{"session_id": "' + SESSION + '", "name": "manager"}';
    expect(startedSessionOf(older, { cwd: '/asked/for' })?.cwd).toBe('/asked/for');
    expect(startedSessionOf(older, {})?.cwd).toBeUndefined();
  });

  it('is not read out of the desktop app\'s answer, a refusal, or a call still running', () => {
    expect(startedSessionOf('Started. session_id: local_abc123', {})).toBeUndefined();
    expect(startedSessionOf('unavailable: presets are not supported', {})).toBeUndefined();
    expect(startedSessionOf('{"session_id": "not-an-id"}', {})).toBeUndefined();
    expect(startedSessionOf('', {})).toBeUndefined();
  });

  it('stands on its own in the conversation, as a card, like a start made by the desktop app\'s tool', () => {
    expect(isStartSessionTool('mcp__swttch_session__start_session')).toBe(true);
    expect(isStartSessionTool('mcp__ccd_session__start_session')).toBe(true);
    expect(isStartSessionTool('mcp__swttch_session_mgmt__list_sessions')).toBe(false);
    const entry = (blocks: unknown[]) => ({ type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: blocks } }) as unknown as LoadedMessageDto;
    const segments = buildSegments([entry([
      { type: 'tool_use', id: 't1', name: 'mcp__swttch_session_mgmt__list_sessions', input: {}, tool_result: answerOf('[]') },
      { type: 'tool_use', id: 't2', name: 'mcp__swttch_session__start_session', input: { title: 'Next manager' }, tool_result: answerOf(started) },
      { type: 'tool_use', id: 't3', name: 'mcp__swttch_session_mgmt__detach_session', input: { session_id: SESSION }, tool_result: answerOf('{"title": "Next manager", "detached": true}') },
    ])]);
    const tools = segments.filter((s) => s.kind === 'tools') as Array<{ calls: ToolCall[] }>;
    expect(tools.map((s) => s.calls.map((c) => c.toolUse.id))).toEqual([['t1'], ['t2'], ['t3']]);
  });

  it('can be found again from anywhere in the conversation that started it', () => {
    const messages = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'mcp__swttch_session__start_session', input: { title: 'Next manager' }, tool_result: answerOf(started) }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't9', name: 'mcp__swttch_session__start_session', input: { title: 'Refused' }, tool_result: answerOf('unavailable: no', true) }] } },
    ] as unknown as LoadedMessageDto[];
    const sessions = startedSessionsIn(messages);
    expect([...sessions.keys()]).toEqual([SESSION]);
    expect(sessions.get(SESSION)?.title).toBe('Next manager');
    expect(startedSessionsIn(undefined).size).toBe(0);
  });

  it('is found in the conversation as the CLI records it, where the answer is a later entry naming the call', () => {
    const messages = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'mcp__swttch_session__start_session', input: { title: 'Next manager' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: started }] }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't3', name: 'Bash', input: {} }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't3', content: started }] } },
    ] as unknown as LoadedMessageDto[];
    const sessions = startedSessionsIn(messages);
    expect([...sessions.keys()]).toEqual([SESSION]);
    expect(sessions.get(SESSION)).toEqual({ sessionId: SESSION, cwd: '/work/project', title: 'Next manager' });
  });
});

describe('a message the session-management MCP delivered from another session', () => {
  const text = `From Add up the numbers (session ${SESSION}):\nThis session, which you started, has ended its turn. Its last reply:\n90`;

  it('is read as a message from that session: its title, its id, and what it said', () => {
    expect(parseCrossSessionMessage(text)).toEqual({
      from: SESSION,
      name: 'Add up the numbers',
      body: 'This session, which you started, has ended its turn. Its last reply:\n90',
    });
    expect(parseCrossSessionPreview(text)?.name).toBe('Add up the numbers');
  });

  it('is drawn in the run it arrives in, as the desktop app draws a message from another session', () => {
    const entry = { type: 'user', uuid: 'u9', message: { role: 'user', content: text } } as unknown as LoadedMessageDto;
    expect(isPeerMessage(entry)).toBe(true);
  });

  it('is not read out of something a person typed that only looks alike', () => {
    for (const typed of ['From the docs: use npm', 'From Alice (session 12): hi', `He said: From X (session ${SESSION}):\nhi`, `From X (session ${SESSION}): same line`]) {
      expect(parseCrossSessionMessage(typed)).toBeUndefined();
    }
  });

  it('still reads the CLI\'s own tag', () => {
    expect(parseCrossSessionMessage('<cross-session-message from="local_a" name="Peer">hello</cross-session-message>')).toEqual({ from: 'local_a', name: 'Peer', body: 'hello' });
  });
});

describe('a link to a session in the reply', () => {
  it('is the form the session-management MCP asks for, with or without the leading #', () => {
    expect(sessionLinkIdOf('#session_' + SESSION)).toBe(SESSION);
    expect(sessionLinkIdOf('session_' + SESSION)).toBe(SESSION);
  });

  it('is nothing else: a file, a web address, the desktop app\'s own link, a bare id', () => {
    for (const href of ['./src/a.ts', 'https://example.com/#session_' + SESSION, '#local_abc', '#' + SESSION, '#session_nope', undefined]) {
      expect(sessionLinkIdOf(href)).toBeUndefined();
    }
  });
});
