import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { MessageType, DictationErrorKind } from '@/shared';

export interface DictationAvailability {
  /** This machine can dictate right now. */
  available: boolean;
  /** Why not, when it cannot. Null while it can. */
  reason: DictationErrorKind | null;
  /**
   * What the failed attempt said, for the reason that has words of its own
   * (DictationErrorKind.KIT_UNUSABLE). Null for every other answer.
   */
  detail: string | null;
}

interface RawResult {
  status?: string;
  available?: boolean;
  reason?: DictationErrorKind | null;
  detail?: string | null;
}

/**
 * Whether dictation can run on this machine, and why not when it cannot.
 *
 * The kit being installed is only half of "can I dictate": the stream is opened
 * with the OAuth token a Claude account login leaves behind, so a machine
 * authenticated by API key alone has a perfectly installed kit and still cannot
 * record a word (#355). See {@link DictationErrorKind.NOT_LOGGED_IN} for why we
 * do not send an API key instead. The voice settings claim to describe the state
 * of the feature, so they have to say this too rather than leaving it to be
 * discovered by pressing the microphone.
 *
 * Answered by reading the local credential store, which is cheap but not free,
 * and the answer only changes when the user signs in or out. So it is cached
 * like the kit lookup beside it rather than asked again on every render.
 */
export function useDictationAvailability(options?: { enabled?: boolean }) {
  const { send, isConnected } = useBridgeContext();
  // The project decides which login answers this: a project can point Claude Code at its own
  // data directory, and the backend has no way to guess which project a request came from.
  // `OrNull` because the voice settings render outside the chat's provider.
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? undefined;

  const query = useQuery<DictationAvailability>({
    // The project is part of the key: the answer for one project does not describe another,
    // and a cached "not signed in" would follow the user into a project that is signed in.
    queryKey: [MessageType.GET_DICTATION_AVAILABILITY, workingDirectory ?? null],
    queryFn: async () => {
      const r = (await send(MessageType.GET_DICTATION_AVAILABILITY, {
        workingDir: workingDirectory,
      })) as RawResult;
      return { available: r.available ?? false, reason: r.reason ?? null, detail: r.detail ?? null };
    },
    enabled: isConnected && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });

  return { availability: query.data, loading: query.isLoading };
}
