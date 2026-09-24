import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useOnboardingChecklist,
  type ChecklistStep,
} from '@/pages/ChatPage/Onboarding';
import { useChatStreamContext } from './ChatStreamContext';

interface OnboardingContextType {
  steps: ChecklistStep[];
  /** The card is on screen, so the message box is off. */
  visible: boolean;
  /** Every step is done, so the card's "Get started" button is available. */
  allDone: boolean;
  /** Record that the card was closed. What both of its buttons call. */
  dismiss: () => void;
}

const OnboardingContext = createContext<OnboardingContextType>({
  steps: [],
  visible: false,
  allDone: false,
  dismiss: () => {},
});

/**
 * One answer to "is the onboarding card up", for everything that has to agree
 * about it.
 *
 * Read separately, the card and the message box would drift — the card could be
 * closed and the box stay dimmed, which is the app telling the user two
 * different things about the same fact.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { steps, dismissedAt, allDone, dismiss } = useOnboardingChecklist();
  const { messages } = useChatStreamContext();

  /**
   * The card is up. Everything that turns off while it is up reads THIS, so
   * "card up" and "message box off" cannot come apart.
   *
   * Two things have to be true, and the second one is here because of where the
   * card is drawn. It stands in the empty state, which exists only while the
   * conversation has nothing in it, so on a screen with history the card has
   * nowhere to appear. Left out, this value would still say "up" there and the
   * box would go dead with nothing on screen to say why or to close — which is
   * exactly #482.
   *
   * `=== null` rather than a falsy check: until the record has been read the
   * value is `undefined`, and treating that as "never closed" would flash the
   * card at every install that closed it long ago, once per launch.
   */
  const visible = dismissedAt === null && messages.length === 0;

  const value = useMemo(
    () => ({ steps, visible, allDone, dismiss }),
    [steps, visible, allDone, dismiss],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextType {
  return useContext(OnboardingContext);
}
