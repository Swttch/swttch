import { describe, it, expect } from 'vitest';
import { REPLIED_IN_CHAT_ANSWER, isRepliedInChat, repliedInChatAnswers } from '../repliedInChat';

// What the desktop app writes for a question that the person replied to in the chat instead of in the card.
const DESKTOP_RESULT =
  'The user answered: "좋아하는 색은 무엇입니까?"="[User did not answer this question — they sent a message instead. Treat that message as their response; do not re-ask.]". Read the answers carefully.';

describe('repliedInChat', () => {
  it('gives every question the answer the desktop app gives', () => {
    const answers = repliedInChatAnswers([{ question: 'A?' }, { question: 'B?' }]);
    expect(answers).toEqual({ 'A?': REPLIED_IN_CHAT_ANSWER, 'B?': REPLIED_IN_CHAT_ANSWER });
  });

  it('recognises the result the CLI gives back for such a question, and only that', () => {
    expect(isRepliedInChat(DESKTOP_RESULT)).toBe(true);
    expect(isRepliedInChat('User has answered your questions: "A?"="Blue".')).toBe(false);
    expect(isRepliedInChat('The user doesn\'t want to proceed with this tool use.')).toBe(false);
    expect(isRepliedInChat('')).toBe(false);
  });

  it('writes the answer so that the result of the CLI reads like the desktop app\'s', () => {
    // The CLI joins each question with its answer as `"Q"="A"`; the answer must not carry a quote that would end it early.
    expect(REPLIED_IN_CHAT_ANSWER.includes('"')).toBe(false);
  });
});
