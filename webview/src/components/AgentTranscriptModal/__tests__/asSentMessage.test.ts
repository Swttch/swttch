import { describe, it, expect } from 'vitest';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto, getTextContent } from '@/types';
import { isUserSend } from '@/pages/ChatPage/paging';
import { asSentMessage } from '../AgentTranscriptView';

const framed = 'The coordinator sent a message while you were working:\nㅎㅇ\n\nAddress this before completing your current task.';

const meta = (content: unknown, isMeta = true) =>
  toInstance(LoadedMessageDto, { type: 'user', uuid: 'u', isMeta, message: { role: 'user', content } });

describe('asSentMessage', () => {
  it('draws a message sent to the agent while it worked as that message, without the CLI frame', () => {
    const shown = asSentMessage(meta(framed));
    expect(getTextContent(shown)).toBe('ㅎㅇ');
    // It is something the person sent, so it counts as a send (it opens a section with its own bubble).
    expect(isUserSend(shown)).toBe(true);
  });

  it('keeps several lines of the message as they were written', () => {
    const shown = asSentMessage(meta('The coordinator sent a message while you were working:\nfirst\nsecond\n\nAddress this before completing your current task.'));
    expect(getTextContent(shown)).toBe('first\nsecond');
  });

  it('leaves every other message alone, and does not change the one it was given', () => {
    const plain = meta('hello', false);
    expect(asSentMessage(plain)).toBe(plain);
    const otherNote = meta('Your previous response had no visible output.');
    expect(asSentMessage(otherNote)).toBe(otherNote);
    const original = meta(framed);
    asSentMessage(original);
    expect(original.isMeta).toBe(true);
    expect(getTextContent(original)).toBe(framed);
  });
});
