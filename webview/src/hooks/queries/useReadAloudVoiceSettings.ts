import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { MessageType } from '@/shared';

/** What the Claude account has chosen for reading aloud; null for what is not set or not known. */
export interface ReadAloudVoiceSettings {
  voice: string | null;
  speed: number | null;
  language: string | null;
}

interface RawResult {
  voice?: string | null;
  speed?: number | null;
  language?: string | null;
}

/**
 * The voice, speed and language the reading will use when the settings do not say otherwise, so the settings screen
 * can show them as what they are. Asked of the backend, which asks the kit that holds the login; unknown (all null)
 * when the kit is missing, too old or could not be run.
 */
export function useReadAloudVoiceSettings(): ReadAloudVoiceSettings {
  const { send, isConnected } = useBridgeContext();
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? undefined;
  const query = useQuery<ReadAloudVoiceSettings>({
    queryKey: [MessageType.GET_READ_ALOUD_VOICE_SETTINGS, workingDirectory ?? null],
    queryFn: async () => {
      const r = (await send(MessageType.GET_READ_ALOUD_VOICE_SETTINGS, { workingDir: workingDirectory })) as RawResult;
      return { voice: r.voice ?? null, speed: r.speed ?? null, language: r.language ?? null };
    },
    enabled: isConnected,
    staleTime: 5 * 60 * 1000,
  });
  return query.data ?? { voice: null, speed: null, language: null };
}
