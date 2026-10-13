import { useSideQuestions, SideQuestionWindowMode } from '@/contexts/SideQuestionContext';
import { SideQuestionWindow } from './SideQuestionWindow';

/**
 * The `/btw` ("by the way") window: side questions and their answers, floating
 * above the chat.
 *
 * Opened by `/btw`, by the dock, by the command palette, or by Mod+Shift+B. The
 * main conversation keeps running behind it untouched — a side question is never
 * part of that conversation, which is why its answer is not shown there.
 *
 * It stays mounted while parked as a button in the corner, so its size and position
 * survive a minimize and come back with it.
 *
 * Its composer only asks side questions: whatever is typed is sent as
 * `/btw <text>`, so a slash command typed here is a question about that
 * command, not the command itself.
 */
export function SideQuestionModal() {
  const { mode, hasUnseen, close, minimize, open, exchanges, clear } = useSideQuestions();
  if (mode === SideQuestionWindowMode.Closed) return null;
  return (
    <SideQuestionWindow
      exchanges={exchanges}
      isMinimized={mode === SideQuestionWindowMode.Minimized}
      hasUnseen={hasUnseen}
      onClose={close}
      onClear={clear}
      onMinimize={minimize}
      onRestore={open}
    />
  );
}
