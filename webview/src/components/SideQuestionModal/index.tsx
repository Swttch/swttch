import { useSideQuestions } from '@/contexts/SideQuestionContext';
import { SideQuestionWindow } from './SideQuestionWindow';

/**
 * The `/btw` window: side questions and their answers, above the chat.
 *
 * Opened by `/btw`, by the command palette, or by Mod+Shift+B. The main
 * conversation keeps running behind it untouched — a side question is never
 * part of that conversation, which is why its answer is not shown there.
 *
 * Its composer only asks side questions: whatever is typed is sent as
 * `/btw <text>`, so a slash command typed here is a question about that
 * command, not the command itself.
 */
export function SideQuestionModal() {
  const { isOpen, close, exchanges, clear } = useSideQuestions();
  if (!isOpen) return null;
  return <SideQuestionWindow exchanges={exchanges} onClose={close} onClear={clear} />;
}
