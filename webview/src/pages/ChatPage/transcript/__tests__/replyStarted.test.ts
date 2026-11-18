import { describe, it, expect } from 'vitest';
import { LoadedMessageType } from '@/dto';
import { replyStartedIn } from '../replyStarted';
import type { LoadedMessageDto } from '../../../../types';

const assistant = (content: unknown): LoadedMessageDto => ({ type: LoadedMessageType.Assistant, message: { content } }) as unknown as LoadedMessageDto;
const user = (content: unknown): LoadedMessageDto => ({ type: LoadedMessageType.User, message: { content } }) as unknown as LoadedMessageDto;

const REPLIED = 'The user answered: "Q?"="[User did not answer this question — they sent a message instead. Treat that message as their response; do not re-ask.]"';

// The working line carries the time as well as the tokens from the moment the model writes its answer, and, as the
// desktop app does, right after a question was answered by a message typed in the chat.
describe('replyStartedIn', () => {
  it('is false while the model has written nothing yet', () => {
    expect(replyStartedIn([])).toBe(false);
    expect(replyStartedIn([assistant([{ type: 'thinking', thinking: '...' }])])).toBe(false);
  });

  it('is true once the newest entry is the model\'s text', () => {
    expect(replyStartedIn([assistant([{ type: 'text', text: 'Hello' }])])).toBe(true);
    expect(replyStartedIn([assistant([{ type: 'text', text: '   ' }])])).toBe(false);
  });

  it('is true right after a question was answered by a message typed in the chat', () => {
    expect(replyStartedIn([user([{ type: 'tool_result', tool_use_id: 't1', content: REPLIED }])])).toBe(true);
    // The CLI may hand the text over as blocks.
    expect(replyStartedIn([user([{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: REPLIED }] }])])).toBe(true);
  });

  it('is false after a question answered in the card, or after any other tool result', () => {
    expect(replyStartedIn([user([{ type: 'tool_result', tool_use_id: 't1', content: 'User has answered your questions: "Q?"="Blue".' }])])).toBe(false);
    expect(replyStartedIn([user([{ type: 'tool_result', tool_use_id: 't2', content: 'file written' }])])).toBe(false);
  });

  it('is false for a message the person typed', () => {
    expect(replyStartedIn([user('hello')])).toBe(false);
  });

  // The message that replaced the question is put into the conversation right after the result of the question tool
  // (the CLI has just read it there), so the newest entry is that message, not the result.
  it('is true when only the message that replaced the question stands after the result of the question', () => {
    const result = user([{ type: 'tool_result', tool_use_id: 't1', content: REPLIED }]);
    expect(replyStartedIn([result, user('테스트 메시지')])).toBe(true);
    expect(replyStartedIn([result, user([{ type: 'text', text: '테스트 메시지' }])])).toBe(true);
  });

  // The line keeps the time for the rest of the turn the question was replied in: it must not lose it while the model
  // thinks (the newest entry is then a thinking block, with no text yet) and get it back when the text comes.
  it('stays true for the rest of the turn after the question was replied to, whatever the model writes next', () => {
    const result = user([{ type: 'tool_result', tool_use_id: 't1', content: REPLIED }]);
    expect(replyStartedIn([result, user('테스트 메시지'), assistant([{ type: 'thinking', thinking: '...' }])])).toBe(true);
    expect(replyStartedIn([result, user('테스트 메시지'), assistant([{ type: 'thinking', thinking: '...' }]), assistant([{ type: 'text', text: 'ok' }])])).toBe(true);
  });

  it('is false for a turn that began after the question was replied to, and for messages that follow no such result', () => {
    const result = user([{ type: 'tool_result', tool_use_id: 't1', content: REPLIED }]);
    // The person wrote again, and the model has not written anything to that yet.
    expect(replyStartedIn([result, user('테스트 메시지'), assistant([{ type: 'text', text: 'ok' }]), user('다음 질문'), assistant([{ type: 'thinking', thinking: '...' }])])).toBe(false);
    expect(replyStartedIn([user('hello'), user('another')])).toBe(false);
  });
});
