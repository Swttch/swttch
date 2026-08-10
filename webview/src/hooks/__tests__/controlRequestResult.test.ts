import { describe, it, expect } from 'vitest';
import { parseControlRequestResult } from '../controlRequestResult';
import { CONTROL_REQUEST_COMMAND_PREFIX } from '../useControlRequestCommand';

const reloadId = `${CONTROL_REQUEST_COMMAND_PREFIX}reload_plugins-abc-123`;
const btwId = `${CONTROL_REQUEST_COMMAND_PREFIX}side_question-abc-123`;

function response(requestId: string, body: Record<string, unknown>) {
  return {
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response: body },
  };
}

describe('parseControlRequestResult', () => {
  // Shape taken from a real CLI reply to `control_request{subtype:"reload_plugins"}`.
  it('summarises a reload_plugins response', () => {
    const result = parseControlRequestResult(
      response(reloadId, {
        commands: [],
        agents: [],
        plugins: [
          { name: 'oh-my-claudecode', path: '/p/omc', source: 'user' },
          { name: 'skill-creator', path: '/p/sc', source: 'user' },
        ],
        mcpServers: [],
        error_count: 0,
      }),
    );
    expect(result?.subtype).toBe('reload_plugins');
    expect(result?.isError).toBe(false);
    expect(result?.text).toContain('oh-my-claudecode');
    expect(result?.text).toContain('skill-creator');
    expect(result?.text).toContain('2 plugins');
  });

  it('reports plugins that failed to load', () => {
    const result = parseControlRequestResult(
      response(reloadId, { plugins: [{ name: 'omc' }], error_count: 1 }),
    );
    expect(result?.text).toContain('1 plugin failed to load');
  });

  it('handles having no plugins enabled', () => {
    const result = parseControlRequestResult(response(reloadId, { plugins: [], error_count: 0 }));
    expect(result?.text).toContain('None are currently enabled');
  });

  // Shape taken from a real CLI reply to `control_request{subtype:"side_question"}`.
  it('returns the answer text for a side_question response', () => {
    const result = parseControlRequestResult(
      response(btwId, { response: '4', synthetic: false }),
    );
    expect(result?.subtype).toBe('side_question');
    expect(result?.text).toBe('4');
  });

  it('marks an error response', () => {
    const result = parseControlRequestResult({
      type: 'control_response',
      response: { subtype: 'error', request_id: reloadId, error: 'boom' },
    });
    expect(result?.isError).toBe(true);
    expect(result?.text).toContain('boom');
  });

  // The CLI's own control traffic (permission prompts and the like) shares this
  // event type; only the requests we minted an id for are ours to render.
  it('ignores control responses we did not send', () => {
    expect(
      parseControlRequestResult(response('can_use_tool_42', { behavior: 'allow' })),
    ).toBeNull();
  });

  it('ignores non-control_response events', () => {
    expect(parseControlRequestResult({ type: 'assistant' })).toBeNull();
    expect(parseControlRequestResult({})).toBeNull();
  });
});
