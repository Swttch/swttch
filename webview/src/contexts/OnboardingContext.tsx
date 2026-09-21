import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useOnboardingChecklist,
  type ChecklistStep,
} from '@/pages/ChatPage/Onboarding';

interface OnboardingContextType {
  steps: ChecklistStep[];
  /** The card is on screen, so the chat is not ready to be typed into yet. */
  visible: boolean;
  dismiss: () => void;
}

const OnboardingContext = createContext<OnboardingContextType>({
  steps: [],
  visible: false,
  dismiss: () => {},
});

/**
 * One answer to "is setup still being asked for", for everything that has to
 * agree about it.
 *
 * Two places act on it and they are on different branches of the tree: the
 * empty state, which the card stands in, and the composer, which is turned off
 * while it stands there. Read separately they would drift — the card could be
 * closed and the composer stay dimmed, which is the app telling the user two
 * different things about the same fact.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { steps, dismissed, blocking, dismiss } = useOnboardingChecklist();

  const value = useMemo(
    () => ({ steps, visible: !dismissed && blocking, dismiss }),
    [steps, dismissed, blocking, dismiss],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextType {
  return useContext(OnboardingContext);
}
