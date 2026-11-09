import { useCallback, useEffect, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { MessageType, DictationErrorKind } from '@/shared';
import { useTranslation } from '@/i18n';
import { PcmStreamPlayer } from '@/utils/readAloud/pcmStreamPlayer';
import { speechLanguageOf } from '@/utils/readAloud/speechLanguage';
import { useSettingsOrNull } from '@/contexts/SettingsContext';
import { useReadAloudVoiceSettings } from '@/hooks/queries/useReadAloudVoiceSettings';
import { SettingKey, type VoiceSettings } from '@/types/settings';

export type ReadAloudStatus = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * One reply is read at a time, so what is being read lives in one place for the whole page: starting a second
 * reply ends the first, and every reply's button reads its own status off this.
 */
interface Active {
  key: string;
  status: Exclude<ReadAloudStatus, 'idle'>;
}
let active: Active | null = null;
let player: PcmStreamPlayer | null = null;
const listeners = new Set<() => void>();

function setActive(next: Active | null): void {
  active = next;
  listeners.forEach((listener) => listener());
}
const subscribeActive = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function endPlayer(): void {
  player?.stop();
  player = null;
}

/**
 * The "Read aloud" button's state and action for one reply.
 *
 * The text is sent to the backend, which has `swttch-ext tts` read it (that is what carries the account's login,
 * which the plugin may not touch) and sends the voice back as PCM; this plays it as it arrives. A press while it
 * loads or plays pauses or resumes it; a press on another reply moves the reading there.
 */
export function useReadAloud(key: string): {
  status: ReadAloudStatus;
  /** Start reading `text`, or pause or resume this reply's reading. */
  toggle: (text: string) => void;
  /** Stop this reply's reading, if it is the one being read. */
  stop: () => void;
} {
  const { send, subscribe } = useBridgeContext();
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? undefined;
  const { t } = useTranslation('chat');
  const voiceSettings = (useSettingsOrNull()?.settings[SettingKey.VOICE] as VoiceSettings | undefined) ?? {};
  const account = useReadAloudVoiceSettings();
  const current = useSyncExternalStore(subscribeActive, () => active, () => null);
  const mine = current?.key === key;

  // What the backend sends is for whichever reply is being read; only that reply's button listens.
  useEffect(() => {
    if (!mine) return;
    const offAudio = subscribe(MessageType.READ_ALOUD_AUDIO, (envelope) => {
      const { audio } = (envelope.payload ?? {}) as { audio?: string };
      if (!audio || !player) return;
      const bytes = Uint8Array.from(atob(audio), (character) => character.charCodeAt(0));
      player.push(bytes);
    });
    const offDone = subscribe(MessageType.READ_ALOUD_DONE, () => {
      player?.finishInput();
    });
    const offError = subscribe(MessageType.READ_ALOUD_ERROR, (envelope) => {
      const { message } = (envelope.payload ?? {}) as { message?: string };
      endPlayer();
      setActive(null);
      toast.error(message ? `${t('readAloud.failed')} ${message}` : t('readAloud.failed'));
    });
    return () => {
      offAudio();
      offDone();
      offError();
    };
  }, [mine, subscribe, t]);

  // Leaving the page ends the reading: nobody should hear a reply they can no longer see.
  useEffect(() => {
    return () => {
      if (active?.key === key) {
        void send(MessageType.STOP_READ_ALOUD, {});
        endPlayer();
        setActive(null);
      }
    };
  }, [key, send]);

  const stop = useCallback(() => {
    if (active?.key !== key) return;
    void send(MessageType.STOP_READ_ALOUD, {});
    endPlayer();
    setActive(null);
  }, [key, send]);

  const toggle = useCallback(
    (text: string) => {
      if (active?.key === key && player) {
        if (active.status === 'playing') {
          player.pause();
          setActive({ key, status: 'paused' });
        } else if (active.status === 'paused') {
          player.resume();
          setActive({ key, status: 'playing' });
        } else {
          // Still loading: another press means "never mind".
          stop();
        }
        return;
      }

      // Another reply is being read: it ends first.
      if (active) void send(MessageType.STOP_READ_ALOUD, {});
      endPlayer();

      // Made here, inside the press, because a browser only lets a page that was asked to play make sound.
      const next = new PcmStreamPlayer();
      if (!next.supported) {
        toast.error(t('readAloud.unsupported'));
        return;
      }
      player = next;
      next.onStarted = () => {
        if (player === next && active?.key === key && active.status === 'loading') setActive({ key, status: 'playing' });
      };
      next.onEnded(() => {
        if (player === next) {
          player = null;
          setActive(null);
        }
      });
      setActive({ key, status: 'loading' });

      void send(MessageType.START_READ_ALOUD, {
        text,
        // The language in use is the one chosen here, else the account's; only when neither says, the reply's own text does.
        language: voiceSettings.readAloudLanguage || account.language || speechLanguageOf(text),
        voice: voiceSettings.readAloudVoice || undefined,
        speed: voiceSettings.readAloudSpeed ?? undefined,
        workingDir: workingDirectory,
      }).then((ack) => {
        const answer = ack as { status?: string; errorKind?: DictationErrorKind; error?: string } | undefined;
        if (answer?.status === 'ok' || player !== next) return;
        endPlayer();
        setActive(null);
        toast.error(readAloudFailureText(t, answer?.errorKind, answer?.error));
      });
    },
    [key, send, stop, t, workingDirectory, voiceSettings.readAloudLanguage, voiceSettings.readAloudVoice, voiceSettings.readAloudSpeed, account.language],
  );

  return { status: mine ? current.status : 'idle', toggle, stop };
}

/** What to tell the reader when a reading could not even start. The codes are the ones dictation uses for the same causes. */
function readAloudFailureText(t: (key: string) => string, kind: DictationErrorKind | undefined, message: string | undefined): string {
  switch (kind) {
    case DictationErrorKind.KIT_MISSING:
      return t('readAloud.kitMissing');
    case DictationErrorKind.KIT_TOO_OLD:
      return t('readAloud.kitTooOld');
    case DictationErrorKind.NOT_LOGGED_IN:
      return t('readAloud.notLoggedIn');
    default:
      return message ? `${t('readAloud.failed')} ${message}` : t('readAloud.failed');
  }
}
