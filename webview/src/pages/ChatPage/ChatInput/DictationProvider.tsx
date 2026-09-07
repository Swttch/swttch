import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { useDictation, type Dictation } from './hooks/useDictation';
import { useGlobalShortcut } from './hooks/useGlobalShortcut';
import { useInstallCcb } from '@/hooks/queries/useInstallCcb';
import { useDictationAvailability } from '@/hooks/queries/useDictationAvailability';
import { useVoicePrompt } from '@/hooks/useVoicePrompt';
import { useConfirmDialog, ConfirmResult } from '@/components/ConfirmDialog/useConfirmDialog';
import { useChatInputFocus } from '@/contexts/ChatInputFocusContext';
import { useChatInputState } from '@/contexts/ChatInputStateContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey, VOICE_SHORTCUT_DEFAULT, type VoiceSettings } from '@/types/settings';
import { getCaretOffset, setCaretOffset } from '@/utils/domSelection';
import {
  decideVoiceGate,
  VoiceGateAction,
  effectOfVoiceAnswer,
  VoiceAnswerEffect,
  voiceSettingsAfterDecline,
  isAnswer,
} from './firstUseVoiceGate';

interface DictationContextType {
  dictation: Dictation;
  /** The one way in. See the note on the provider. */
  startDictation: () => void;
  /** Voice input is switched on for this machine. */
  voiceEnabled: boolean;
  /** The rebindable keystroke, in stored form (e.g. 'Alt+D'). */
  voiceShortcut: string;
  /** Dictation cannot run here as this machine is set up, so far as we know. */
  unavailable: boolean;
  /** Install the kit dictation needs, for the banner that offers to. */
  installKit: () => void;
  installingKit: boolean;
}

const DictationContext = createContext<DictationContextType | null>(null);

export function useDictationContext(): DictationContextType {
  const value = useContext(DictationContext);
  if (!value) throw new Error('useDictationContext must be used within a DictationProvider');
  return value;
}

/**
 * Owns the dictation session for the whole chat screen.
 *
 * It sits here rather than inside the composer because a recording has to
 * outlive it. The composer is not always on screen: an approval prompt (a
 * permission request, a plan, a question) takes its place at the bottom of the
 * chat, which unmounts it. While the session lived inside, that unmount ran the
 * cleanup that releases the microphone, so a prompt appearing mid-sentence
 * stopped the recording and the user had to notice, restart, and say it all
 * again (issue #409).
 *
 * Nothing is lost while the composer is away: the text it dictates into already
 * lives further out, in ChatInputStateContext, and the caret it anchors on falls
 * back to the end of that text when no composer is mounted to report one. So the
 * words keep landing in the draft, and the composer finds them there when it
 * comes back.
 *
 * The chat screen is the right boundary, not the whole app. Dictation writes
 * into the composer's draft, so starting one from a screen that has no composer
 * would pile up text where nobody can see it.
 */
export function DictationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('chat');
  const { textareaRef } = useChatInputFocus();
  const { input, setInput } = useChatInputState();
  const {
    settings: claudeSettings,
    updateSettingWithScope: updateClaudeSettingWithScope,
  } = useClaudeSettings();
  const { settings: appSettings } = useSettings();

  // Read the current text without making dictation depend on it — the callback
  // would otherwise be rebuilt on every keystroke, and re-subscribe the stream.
  const valueRef = useRef(input);
  valueRef.current = input;

  const dictation = useDictation(
    useCallback(
      () => ({
        value: valueRef.current,
        // Dictate at the caret, so speaking mid-sentence inserts there rather
        // than appending to the end of what was already typed.
        //
        // With no composer mounted there is no caret to read, and the end of the
        // draft is the only answer that cannot lose text: it appends. That is
        // the case that runs while an approval prompt holds the composer's slot.
        caret: textareaRef.current
          ? getCaretOffset(textareaRef.current)
          : valueRef.current.length,
        // Move the caret to the end of what was just written, the way paste
        // does. The editable layer resets the caret to the start whenever its
        // content is replaced wholesale, so without this every recording ended
        // with the caret back at 0 — and the next one dictated in front of the
        // last, running consecutive phrases backwards.
        setValue: (next: string, caret?: number) => {
          setInput(next);
          if (caret === undefined) return;
          requestAnimationFrame(() => {
            const target = textareaRef.current;
            if (target) setCaretOffset(target, caret);
          });
        },
      }),
      [setInput, textareaRef],
    ),
  );

  // Installing the kit for dictation is the same `npm i -g @swttch/extend-kit`
  // the usage panel already runs, so it reuses that mutation rather than adding
  // a second path that installs the same package.
  const { install: installKitMutation, installing: installingKit } = useInstallCcb();
  const { shouldAsk: shouldAskVoice, markAsked, decide } = useVoicePrompt();
  const { confirmDialog, ask } = useConfirmDialog();

  // The user can rebind this; the default lives with the other voice defaults.
  const voiceShortcut =
    (appSettings[SettingKey.VOICE] as VoiceSettings | undefined)?.shortcut ?? VOICE_SHORTCUT_DEFAULT;

  // `/voice off` in the CLI writes voice.enabled=false, and that decision
  // should hold here too — one machine, one answer.
  //
  // Only an explicit false hides it. Claude Code treats a missing key as off
  // because its dictation has to be switched on with /voice, but we have no
  // such command: the microphone button is visible, so there is nothing to
  // discover and nothing to turn on first. Inheriting "absent means off" would
  // hide the feature from everyone who never opened a terminal.
  const voiceEnabled =
    (claudeSettings.voice as { enabled?: boolean } | undefined)?.enabled !== false;

  // Asked before anything is pressed, so the microphone can say "not now" at a
  // glance instead of looking ready and refusing on the first press.
  //
  // Only dims the button. Whether a start is actually allowed stays the
  // backend's call in START_DICTATION, so there is one decider and this cannot
  // drift from it: both read the same probe. Asked only while voice input is on,
  // since a hidden microphone has nothing to dim.
  const { availability } = useDictationAvailability({ enabled: voiceEnabled });
  const unavailable = availability?.available === false;

  // Reachable even with the first-use question answered: someone who accepted
  // and later removed the kit (in a terminal, or from Settings) is not asked
  // again, so dictation fails here instead. Without this the banner would name
  // the problem and offer no way out of it.
  const installKit = useCallback(() => {
    void (async () => {
      try {
        await installKitMutation();
        // The backend caches where it found (or failed to find) the kit; clear
        // the error so the next press retries instead of showing a stale
        // failure.
        dictation.dismissError();
      } catch {
        // The mutation surfaces its own failure through the same banner.
      }
    })();
  }, [installKitMutation, dictation]);

  // The one-time question, asked on the first attempt to dictate rather than on
  // arrival: at that moment the user has just reached for the feature, so the
  // question is about something they want, and the answer means something.
  //
  // Every way of starting dictation goes through here, so the button and the
  // shortcut cannot answer it differently — or skip it.
  const startDictationAsync = useCallback(async () => {
    if (decideVoiceGate(shouldAskVoice) === VoiceGateAction.Record) {
      void dictation.start();
      return;
    }

    // Written before the dialog is awaited: closing the app on an unanswered
    // question must leave "we asked" behind, not look like we never did.
    void markAsked();

    // ask(), not confirm(): closing this is not the same as saying no. "No"
    // turns voice input off for good, so Escape, the backdrop and the close
    // button leave the question unanswered — it comes back on the next press.
    const answer = await ask({
      title: t('chatInput.dictation.firstUse.title'),
      message: t('chatInput.dictation.firstUse.message'),
      confirmLabel: t('chatInput.dictation.firstUse.accept'),
      cancelLabel: t('chatInput.dictation.firstUse.decline'),
    });
    if (!isAnswer(answer)) return;

    const accepted = answer === ConfirmResult.Confirmed;
    await decide(accepted);

    if (effectOfVoiceAnswer(accepted) === VoiceAnswerEffect.DisableVoice) {
      // The same write the settings screen's own toggle makes, so there is one
      // way to turn voice input off and one place it is stored. Global scope:
      // this is a decision about the machine, not about the open project.
      await updateClaudeSettingWithScope(
        'voice',
        voiceSettingsAfterDecline(claudeSettings.voice as Record<string, unknown> | undefined),
        'global',
      );
      return;
    }

    try {
      await installKitMutation();
      toast.success(t('chatInput.dictation.firstUse.installed'));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('chatInput.dictation.firstUse.installFailed'),
      );
    }
    // Recording deliberately does not start here. The install was a detour the
    // user did not ask for; dropping them straight into a live microphone they
    // did not expect is worse than letting them press again when ready.
  }, [
    shouldAskVoice,
    dictation,
    markAsked,
    ask,
    decide,
    claudeSettings.voice,
    updateClaudeSettingWithScope,
    installKitMutation,
    t,
  ]);

  const startDictation = useCallback(() => void startDictationAsync(), [startDictationAsync]);

  // Bound globally rather than on the composer: the point of the shortcut is to
  // start talking without reaching for the mouse, which is exactly the moment
  // the composer does not have focus — including the moment an approval prompt
  // has taken the composer's place entirely.
  useGlobalShortcut(voiceEnabled ? voiceShortcut : null, {
    isRecording: () => dictation.isRecording,
    onStart: startDictation,
    onStop: () => void dictation.stop(),
  });

  const value = useMemo(
    () => ({
      dictation,
      startDictation,
      voiceEnabled,
      voiceShortcut,
      unavailable,
      installKit,
      installingKit,
    }),
    [
      dictation,
      startDictation,
      voiceEnabled,
      voiceShortcut,
      unavailable,
      installKit,
      installingKit,
    ],
  );

  return (
    <DictationContext.Provider value={value}>
      {children}
      {/* Rendered by the provider rather than the composer: the first-use
          question can now be raised while the composer is unmounted. */}
      {confirmDialog}
    </DictationContext.Provider>
  );
}
