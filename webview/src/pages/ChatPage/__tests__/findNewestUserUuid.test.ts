import { describe, it, expect } from 'vitest';
import { findNewestUserUuid } from '../paging';
import { LoadedMessageType } from '../../../dto/common';
import type { LoadedMessageDto } from '../../../types';

function msg(type: LoadedMessageType, uuid?: string): LoadedMessageDto {
  return { type, uuid } as LoadedMessageDto;
}

/** A message the human actually typed: content is a plain string. */
function typed(uuid: string, content = 'hello'): LoadedMessageDto {
  return {
    type: LoadedMessageType.User,
    uuid,
    message: { role: 'user', content },
  } as unknown as LoadedMessageDto;
}

/** A message the human typed as content blocks (text, optionally with images). */
function typedBlocks(uuid: string, blockTypes: string[] = ['text']): LoadedMessageDto {
  return {
    type: LoadedMessageType.User,
    uuid,
    message: {
      role: 'user',
      content: blockTypes.map(type => (type === 'text' ? { type, text: 'hi' } : { type })),
    },
  } as unknown as LoadedMessageDto;
}

/**
 * A tool result. The CLI writes these as `type: "user"` JSONL entries too, so
 * they are indistinguishable from a real send by `type` alone — they carry a
 * `tool_result` content block and a `toolUseResult` field instead.
 */
function toolResult(uuid: string): LoadedMessageDto {
  return {
    type: LoadedMessageType.User,
    uuid,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: `t-${uuid}`, content: 'ok' }],
    },
    toolUseResult: { stdout: 'ok' },
  } as unknown as LoadedMessageDto;
}

describe('findNewestUserUuid', () => {
  it('returns null when there is no user message', () => {
    const messages = [msg(LoadedMessageType.Assistant, 'a-1'), msg(LoadedMessageType.System, 's-1')];
    expect(findNewestUserUuid(messages)).toBeNull();
  });

  it('returns the newest (last) user uuid when multiple user messages exist', () => {
    const messages = [
      typed('u-1'),
      msg(LoadedMessageType.Assistant, 'a-1'),
      typed('u-2'),
      msg(LoadedMessageType.Assistant, 'a-2'),
    ];
    expect(findNewestUserUuid(messages)).toBe('u-2');
  });

  it('returns the preceding user uuid even when the last message is an assistant placeholder', () => {
    // addUserMessage appends both a user message and an assistant placeholder for
    // non-streaming sends, so the newest array element is not the user message.
    const messages = [
      typed('u-1'),
      typed('u-2'),
      msg(LoadedMessageType.Assistant, 'a-placeholder'),
    ];
    expect(findNewestUserUuid(messages)).toBe('u-2');
  });

  it('is unaffected by an older-page prepend of a past user message', () => {
    const before = [
      typed('u-1'),
      msg(LoadedMessageType.Assistant, 'a-1'),
    ];
    expect(findNewestUserUuid(before)).toBe('u-1');

    // Simulate prepending an older page in front of the existing messages.
    const afterPrepend = [
      typed('u-older'),
      msg(LoadedMessageType.Assistant, 'a-older'),
      ...before,
    ];
    expect(findNewestUserUuid(afterPrepend)).toBe('u-1');
  });

  it('returns null for an empty array', () => {
    expect(findNewestUserUuid([])).toBeNull();
  });

  // Issue #206. The caller re-arms auto-follow whenever this uuid changes, so
  // anything that is not a deliberate send must not move it — otherwise every
  // tool call yanks the viewport back to the bottom while the user is reading
  // further up. Tool results are `type: "user"` entries in the CLI's JSONL, and
  // in real sessions they outnumber genuine sends by roughly 10 to 1.
  describe('ignores entries the user did not send (issue #206)', () => {
    it('skips a tool result and returns the preceding typed message', () => {
      const messages = [
        typed('u-1'),
        msg(LoadedMessageType.Assistant, 'a-1'),
        toolResult('tr-1'),
      ];
      expect(findNewestUserUuid(messages)).toBe('u-1');
    });

    it('stays put across a burst of tool results', () => {
      const base = [typed('u-1'), msg(LoadedMessageType.Assistant, 'a-1')];
      const withTools = [...base, toolResult('tr-1'), toolResult('tr-2'), toolResult('tr-3')];

      // The uuid must be identical before and after the tools ran; the caller
      // treats any change as "the user sent something new".
      expect(findNewestUserUuid(base)).toBe('u-1');
      expect(findNewestUserUuid(withTools)).toBe('u-1');
    });

    it('returns null when tool results are the only user-typed entries', () => {
      const messages = [msg(LoadedMessageType.Assistant, 'a-1'), toolResult('tr-1')];
      expect(findNewestUserUuid(messages)).toBeNull();
    });

    it('skips a transcript-only entry', () => {
      const hidden = {
        ...typed('hidden-1'),
        isVisibleInTranscriptOnly: true,
      } as unknown as LoadedMessageDto;
      expect(findNewestUserUuid([typed('u-1'), hidden])).toBe('u-1');
    });

    it('skips a synthetic entry', () => {
      const synthetic = {
        ...typed('synthetic-1'),
        isSynthetic: true,
      } as unknown as LoadedMessageDto;
      expect(findNewestUserUuid([typed('u-1'), synthetic])).toBe('u-1');
    });

    it('skips the carried-over compact summary', () => {
      // A compact boundary emits the summary as an ordinary `user` entry, so it
      // would otherwise read as a send and yank the viewport down mid-turn.
      const summary = {
        ...typed('compact-1'),
        isCompactSummary: true,
      } as unknown as LoadedMessageDto;
      expect(findNewestUserUuid([typed('u-1'), summary])).toBe('u-1');
    });
  });

  describe('still detects genuine sends', () => {
    it('detects a send whose content is a plain string', () => {
      expect(findNewestUserUuid([typed('u-1')])).toBe('u-1');
    });

    it('detects a send authored as text blocks', () => {
      expect(findNewestUserUuid([typedBlocks('u-1')])).toBe('u-1');
    });

    it('detects a send that carries pasted images alongside text', () => {
      expect(findNewestUserUuid([typedBlocks('u-1', ['image', 'text'])])).toBe('u-1');
    });

    it('detects a new send that arrives after tool results', () => {
      const messages = [typed('u-1'), toolResult('tr-1'), typed('u-2')];
      expect(findNewestUserUuid(messages)).toBe('u-2');
    });
  });
});
