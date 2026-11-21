import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { LoadedMessageDto } from '../../../../types';
import type { ToolCall } from '../buildSegments';
import { isAgentMessage, rowLabel } from '../toolSummary';

/**
 * A SendMessage to an agent reads the way the desktop app says it ("Messaged agent x", beside the running and failed
 * wordings), and names the agent; one to another session keeps "Message sent" and that session's title.
 */

// A translator that shows the key's last part.
const t = ((key: string) => key.split('.').pop()) as unknown as TFunction;

const answerOf = (text: string, failed = false) =>
  ({ message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: text, ...(failed && { is_error: true }) }] } }) as unknown as LoadedMessageDto;

function sendMessage(to: string, answer?: LoadedMessageDto): ToolCall {
  const message = { type: 'assistant', isStreaming: answer === undefined } as unknown as LoadedMessageDto;
  return { toolUse: { id: 's', name: 'SendMessage', input: { to, message: 'hi' }, tool_result: answer } as unknown as ToolCall['toolUse'], message };
}

describe('a message sent to an agent', () => {
  it('says which agent it went to, once it is delivered', () => {
    const done = sendMessage('a32f07b1cd1690faf', answerOf('{"success":true}'));
    expect(isAgentMessage(done)).toBe(true);
    const label = rowLabel(done, t);
    expect(label.before).toBe('agentSent');
    expect(label.meta).toBe('a32f07b1cd1690faf');
  });

  it('names the agent by what the chat knows it as, when it knows', () => {
    const done = sendMessage('a32f07b1cd1690faf', answerOf('ok'));
    expect(rowLabel(done, t, (to) => (to === 'a32f07b1cd1690faf' ? 'sub agent' : undefined)).meta).toBe('sub agent');
  });

  it('stays at "Messaging agent" while it goes out, and when it failed', () => {
    expect(rowLabel(sendMessage('x'), t).before).toBe('agentSending');
    const failed = rowLabel(sendMessage('x', answerOf('No agent named x', true)), t);
    expect(failed.before).toBe('agentSending');
    expect(failed.meta).toBe('x');
  });

  it('says it is messaging another session, naming no one, until the call says who it is for', () => {
    const label = rowLabel(sendMessage(''), t);
    expect(label.before).toBe('sessionSending');
    expect(label.meta).toBeUndefined();
  });

  it('keeps "Message sent" and the session\'s title for a message to another session', () => {
    const toSession = sendMessage('local_ab12', answerOf('Message delivered to session local_ab12 ("Notes"); (delivery: delivered)'));
    expect(isAgentMessage(toSession)).toBe(false);
    const label = rowLabel(toSession, t);
    expect(label.before).toBe('sent');
    expect(label.meta).toBe('Notes');
  });
});
