/**
 * A message typed in the chat while a question card waits is the answer to the question (the desktop app's way).
 *
 * The CLI is told what the desktop app tells it: for each question, that the person did not answer it in the card but
 * sent a message instead, which is to be taken as the response. The text is the desktop app's own, read from the
 * session record it wrote (`The user answered: "Q"="[User did not answer this question — …]"`).
 */
export const REPLIED_IN_CHAT_ANSWER =
  '[User did not answer this question — they sent a message instead. Treat that message as their response; do not re-ask.]';

/** Whether the answer the CLI gave back for a question is the one for a question replied to in the chat. */
export function isRepliedInChat(output: string): boolean {
  return output.includes('they sent a message instead');
}

/** The `answers` of a question tool's input when the person replied in the chat: every question gets the same answer. */
export function repliedInChatAnswers(questions: ReadonlyArray<{ question: string }>): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of questions) answers[q.question] = REPLIED_IN_CHAT_ANSWER;
  return answers;
}
