import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType, type SessionOutput } from '@/shared';
import { loadSentMedia } from '@/pages/ChatPage/message-renderers/ToolRenderers/sendUserFile';
import { useSessionScope } from './useSessionAssets';

interface OutputsResponse {
  status?: string;
  outputs?: SessionOutput[];
}

interface OutputDataResponse {
  status?: string;
  source?: { type?: string; data?: string; media_type?: string };
}

/** Stable identity of one output, shared by every cache that holds its bytes. */
export function outputKey(output: SessionOutput): string {
  switch (output.kind) {
    case 'image':
      return `${output.entryUuid}:${output.blockIndex}:${output.partIndex}`;
    case 'file':
      return `${output.entryUuid}:${output.blockIndex}:f${output.attachmentIndex}`;
    case 'artifact':
      return `artifact:${output.url}`;
  }
}

/** Whether the output is a picture the viewer can step through: a returned picture or a sent png, jpg or gif. */
export function isPictureOutput(output: SessionOutput): boolean {
  return output.kind === 'image' || (output.kind === 'file' && output.isImage);
}

/**
 * The index of everything the current session made or was handed back (pictures
 * tools returned, files sent with `SendUserFile`, published Artifacts), oldest first.
 *
 * `version` is anything that changes when the session gains a message: the query
 * asks again then, so a panel left open follows a running turn.
 */
export function useSessionOutputs(enabled: boolean, version?: unknown): SessionOutput[] | undefined {
  const { send } = useBridgeContext();
  const { workingDir, sessionId } = useSessionScope();

  const { data } = useQuery({
    queryKey: ['session-outputs', workingDir, sessionId, version],
    enabled: enabled && Boolean(workingDir && sessionId),
    staleTime: 30_000,
    queryFn: async (): Promise<SessionOutput[]> => {
      const res = await send<OutputsResponse>(MessageType.GET_SESSION_OUTPUTS, { workingDir, sessionId });
      return res?.status === 'ok' && Array.isArray(res.outputs) ? res.outputs : [];
    },
  });

  return data;
}

/**
 * Fetches the pictures of outputs on demand and remembers them: a returned
 * picture by its coordinate in the session, a sent picture from its path. A
 * session of screenshots weighs tens of megabytes, so nothing is fetched until
 * a tile scrolls into view or the viewer steps onto it.
 */
export function useSessionOutputImages(): {
  loaded: Record<string, string>;
  ensure: (output: SessionOutput) => void;
} {
  const { send } = useBridgeContext();
  const { workingDir, sessionId } = useSessionScope();
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const inFlight = useRef<Set<string>>(new Set());

  const ensure = useCallback(
    (output: SessionOutput) => {
      if (!workingDir || !sessionId || !isPictureOutput(output)) return;
      const key = outputKey(output);
      if (loaded[key] || inFlight.current.has(key)) return;
      inFlight.current.add(key);
      const keep = (src: string | null) => {
        if (src) setLoaded((prev) => ({ ...prev, [key]: src }));
        else inFlight.current.delete(key);
      };

      if (output.kind === 'file') {
        void loadSentMedia(output.path).then(keep).catch(() => inFlight.current.delete(key));
        return;
      }
      if (output.kind !== 'image') return;

      void send<OutputDataResponse>(MessageType.GET_SESSION_OUTPUT_DATA, {
        workingDir,
        sessionId,
        entryUuid: output.entryUuid,
        blockIndex: output.blockIndex,
        partIndex: output.partIndex,
      })
        .then((res) => {
          // `gone` means the entry was rewound away: the caller keeps its placeholder.
          keep(res?.status === 'ok' && res.source?.data ? `data:${res.source.media_type ?? output.mediaType};base64,${res.source.data}` : null);
        })
        .catch(() => inFlight.current.delete(key));
    },
    [send, workingDir, sessionId, loaded],
  );

  return { loaded, ensure };
}
