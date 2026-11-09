import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { LoadedMessageDto } from '../../../types';
import { isContentBlockArray } from '../../../types';
import { ContentBlockType } from '../../../dto/message/ContentBlockDto';
import { useSettings } from '@/contexts/SettingsContext';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { getBridge } from '@/api/bridge/Bridge';
import { setPendingTranscriptView } from '@/utils/pendingTranscriptView';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { SettingKey, TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '@/types/settings';
import { useTranscriptViewMode } from '../message-renderers/transcriptViewMode';

/** What the cycle moves between: the three views, and the classic chat the app has always had. */
export type ViewChoice = TranscriptViewMode | 'classic';

const CYCLE: ViewChoice[] = [...TRANSCRIPT_VIEW_MODES, 'classic'];

const CHANGED_TOAST_ID = 'transcript-view-changed';

/** How long the cycling must stay still before the offer to keep the view as the default appears. */
export const OFFER_DELAY_MS = 2000;
/** How long the offer stays before it takes itself away. */
export const OFFER_VISIBLE_MS = 5000;

/** Whether Claude has produced thinking anywhere in the messages loaded for this session. */
export function sessionHasThinking(messages: LoadedMessageDto[]): boolean {
  return messages.some((message) => {
    const content = message.message?.content;
    return isContentBlockArray(content) && content.some((block) => block.type === ContentBlockType.Thinking);
  });
}

/**
 * The view after `current` when the shortcut is pressed: Normal, Thinking, Verbose, the classic chat, and round
 * to Normal again. The desktop app lists Thinking only once the session has thinking in it, so the cycle skips
 * it until then. The classic chat is in the cycle so that a press never leaves the user somewhere the keyboard
 * cannot get out of.
 */
export function nextTranscriptViewChoice(current: ViewChoice, hasThinking: boolean): ViewChoice {
  const from = CYCLE.indexOf(current);
  for (let step = 1; step <= CYCLE.length; step++) {
    const candidate = CYCLE[(from + step) % CYCLE.length];
    if (hasThinking || candidate !== 'thinking') return candidate;
  }
  return current;
}

export interface DefaultViewOffer {
  /** The view the shortcut stopped on, which the user can keep as the default for every session. */
  offer: ViewChoice | null;
  accept: () => void;
  dismiss: () => void;
}

/**
 * Ctrl+I cycles the view of the session on screen, from anywhere in the app: the classic chat, a text field
 * being typed in, the settings page. It acts through `window`, so no screen has to carry it.
 *
 * Control, not Command, on every platform, and the physical key (`code`) rather than the letter, because on a
 * Korean or other non-Latin layout the letter is not "i". The browser's own answer to the key (a Tab character
 * in a macOS text field) is stopped.
 *
 * The pick is the session's, kept by session id as the header menu keeps it (a chat not started yet holds it in the page). When the pressing has stopped for
 * two seconds on a view that is not yet the default, `offer` says so, and it goes away after five seconds
 * unless it is taken or dismissed.
 */
export function useCycleTranscriptViewMode(): DefaultViewOffer {
  const { settings, updateSetting } = useSettings();
  const sessionId = useSessionContextOrNull()?.currentSessionId ?? null;
  const current: ViewChoice = useTranscriptViewMode() ?? 'classic';
  const messages = useChatStreamContext().messages;
  const latest = useRef({ settings, updateSetting, sessionId, current, messages });
  latest.current = { settings, updateSetting, sessionId, current, messages };

  const [offer, setOffer] = useState<ViewChoice | null>(null);
  const waitTimer = useRef<ReturnType<typeof setTimeout>>();
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const { t } = useTranslation('chat');
  const tRef = useRef(t);
  tRef.current = t;

  const clearTimers = useCallback(() => {
    clearTimeout(waitTimer.current);
    clearTimeout(hideTimer.current);
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setOffer(null);
  }, [clearTimers]);

  const accept = useCallback(() => {
    const choice = offer;
    if (!choice) return;
    dismiss();
    void latest.current.updateSetting(SettingKey.TRANSCRIPT_VIEW_MODE, choice);
    const name = tRef.current(`sessionHeader.transcriptView.${choice}`);
    toast.success(tRef.current('sessionHeader.transcriptView.defaultOffer.saved', { mode: name }));
  }, [offer, dismiss]);

  useEffect(() => {
    /** Moves the chat on screen to the next view: its session's, or the waiting pick of a chat not started yet. */
    const cycle = (): boolean => {
      const { settings, updateSetting, sessionId, current, messages } = latest.current;
      const next = nextTranscriptViewChoice(current, sessionHasThinking(messages));
      // A press that follows before the setting has come back must continue from this one, not from the old view.
      latest.current.current = next;
      if (sessionId) {
        const bySession = settings[SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION] ?? {};
        void updateSetting(SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION, { ...bySession, [sessionId]: next });
      } else {
        // No session to keep it under yet: the pick waits in the page for the first message.
        setPendingTranscriptView(next);
      }
      // Says which view the press landed on. One fixed id, so a run of presses replaces the line instead of stacking.
      const label = tRef.current('sessionHeader.transcriptView.title');
      toast(`${label}: ${tRef.current(`sessionHeader.transcriptView.${next}`)}`, { id: CHANGED_TOAST_ID, duration: 1500 });

      // Every press starts the wait over, so the offer comes once the pressing has stopped, not once per press.
      clearTimeout(waitTimer.current);
      clearTimeout(hideTimer.current);
      setOffer(null);
      waitTimer.current = setTimeout(() => {
        const defaultChoice = latest.current.settings[SettingKey.TRANSCRIPT_VIEW_MODE] ?? 'normal';
        if (next === defaultChoice) return;
        setOffer(next);
        hideTimer.current = setTimeout(() => setOffer(null), OFFER_VISIBLE_MS);
      }, OFFER_DELAY_MS);
      return true;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.code !== 'KeyI') return;
      if (cycle()) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    // In the IDE the key never reaches the page: the IDE claims Ctrl+I and says so over the bridge.
    const unsubscribe = getBridge().subscribe(MessageType.CYCLE_TRANSCRIPT_VIEW, () => {
      cycle();
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unsubscribe();
      clearTimers();
    };
  }, [clearTimers]);

  return { offer, accept, dismiss };
}
