import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSettings } from '@/contexts/SettingsContext';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { getBridge } from '@/api/bridge/Bridge';
import { isJetBrains } from '@/config/environment';
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

/**
 * The view after `current` when the shortcut is pressed: Normal, Thinking, Verbose, the classic chat, and round
 * to Normal again. Every view is in the cycle whether or not the session has thinking in it yet: a view the
 * press never lands on cannot be chosen, and the user who wants Thinking for the next answer has to be able to
 * pick it before that answer exists. The classic chat is in the cycle so that a press never leaves the user
 * somewhere the keyboard cannot get out of.
 */
export function nextTranscriptViewChoice(current: ViewChoice): ViewChoice {
  return CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
}

/**
 * Whether a key press is the cycle shortcut: Control and Alt together with the physical I key, and nothing else
 * held. Ctrl+I alone is not it (Chrome keeps that key), and neither is Command or Shift with them.
 */
export function isCycleShortcut(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>): boolean {
  return event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey && event.code === 'KeyI';
}

export interface DefaultViewOffer {
  /** The view the shortcut stopped on, which the user can keep as the default for every session. */
  offer: ViewChoice | null;
  accept: () => void;
  dismiss: () => void;
}

/**
 * Ctrl+Alt+I (Ctrl+Option+I on a Mac) cycles the view of the session on screen, from anywhere in the app: the
 * classic chat, a text field being typed in, the settings page. It acts through `window`, so no screen has to
 * carry it.
 *
 * Control and Alt together, not Command, on every platform, and the physical key (`code`) rather than the letter,
 * because on a Korean or other non-Latin layout the letter is not "i", and with Option held a Mac types a
 * different character. Ctrl+I alone is not used: Chrome takes it before the page sees it and moves to another
 * tab, and a page cannot stop a key the browser keeps for itself.
 *
 * The pick is the session's, kept by session id as the header menu keeps it (a chat not started yet holds it in the page). When the pressing has stopped for
 * two seconds on a view that is not yet the default, `offer` says so, and it goes away after five seconds
 * unless it is taken or dismissed.
 */
export function useCycleTranscriptViewMode(): DefaultViewOffer {
  const { settings, updateSetting } = useSettings();
  const sessionId = useSessionContextOrNull()?.currentSessionId ?? null;
  const current: ViewChoice = useTranscriptViewMode() ?? 'classic';
  const latest = useRef({ settings, updateSetting, sessionId, current });
  latest.current = { settings, updateSetting, sessionId, current };

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
      const { settings, updateSetting, sessionId, current } = latest.current;
      const next = nextTranscriptViewChoice(current);
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
    // The view moves when the I key comes up, once per hold. Moving on the press made a held key repeat many
    // times a second and spin the view through every choice. The press only marks the hold (and stops the
    // browser's own answer to the key, which on a Mac is a typed character); modifiers are often let go before
    // the I key, so the release is recognised by the physical key alone.
    let held = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCycleShortcut(event)) return;
      held = true;
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'KeyI' || !held) return;
      held = false;
      cycle();
    };
    const onBlur = () => {
      held = false;
    };
    // In the IDE the keystroke has one road, the bridge: the IDE claims Ctrl+Alt+I and says so. The page can see
    // the same key press as well, and listening to both cycled the view twice for one press (measured: a save
    // of the setting 15 to 20 ms before every bridge message). A browser has no bridge message, so the page
    // listens there.
    if (!isJetBrains()) {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
    }
    const unsubscribe = getBridge().subscribe(MessageType.CYCLE_TRANSCRIPT_VIEW, () => {
      cycle();
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      unsubscribe();
      clearTimers();
    };
  }, [clearTimers]);

  return { offer, accept, dismiss };
}
