import { useCallback, useEffect, useState } from 'react';
import { MessageType } from '@/shared';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import type { GetPromptsAck, PromptScope, SavedPrompt } from '@/types/prompt';

/**
 * Both scopes of the prompt library, read together.
 *
 * The modal shows global and project prompts stacked on one screen rather than
 * behind a scope switch, so the store hands back both lists at once and every
 * mutation says which scope it applies to.
 */
export interface PromptStore {
  globalPrompts: SavedPrompt[];
  projectPrompts: SavedPrompt[];
  /** True while the two lists are being read. */
  loading: boolean;
  /** Set when a read failed; cleared by the next successful read. */
  error: string | null;
  /** False when no project is open, so the project section cannot be written. */
  projectAvailable: boolean;
  reload: () => void;
  create: (scope: PromptScope, name: string, content: string) => Promise<void>;
  update: (scope: PromptScope, id: string, name: string, content: string) => Promise<void>;
  remove: (scope: PromptScope, id: string) => Promise<void>;
}

export function usePromptStore(): PromptStore {
  const bridge = useBridgeContext();
  const { workingDirectory } = useWorkingDir();

  const [globalPrompts, setGlobalPrompts] = useState<SavedPrompt[]>([]);
  const [projectPrompts, setProjectPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectAvailable = Boolean(workingDirectory);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);

    const requests: Array<Promise<GetPromptsAck>> = [
      bridge.send(MessageType.GET_PROMPTS, { scope: 'global' }) as Promise<GetPromptsAck>,
    ];
    if (workingDirectory) {
      requests.push(
        bridge.send(MessageType.GET_PROMPTS, {
          scope: 'project',
          workingDir: workingDirectory,
        }) as Promise<GetPromptsAck>,
      );
    }

    Promise.all(requests)
      .then((acks) => {
        setGlobalPrompts(acks[0]?.prompts ?? []);
        setProjectPrompts(acks[1]?.prompts ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [bridge, workingDirectory]);

  useEffect(() => { reload(); }, [reload]);

  /** The payload every mutation needs: the scope, plus the project it applies to. */
  const scopePayload = useCallback(
    (scope: PromptScope) => ({
      scope,
      ...(scope === 'project' ? { workingDir: workingDirectory } : {}),
    }),
    [workingDirectory],
  );

  const create = useCallback(
    async (scope: PromptScope, name: string, content: string) => {
      await bridge.send(MessageType.CREATE_PROMPT, { ...scopePayload(scope), name, content });
      reload();
    },
    [bridge, scopePayload, reload],
  );

  const update = useCallback(
    async (scope: PromptScope, id: string, name: string, content: string) => {
      await bridge.send(MessageType.UPDATE_PROMPT, { ...scopePayload(scope), id, name, content });
      reload();
    },
    [bridge, scopePayload, reload],
  );

  const remove = useCallback(
    async (scope: PromptScope, id: string) => {
      await bridge.send(MessageType.DELETE_PROMPT, { ...scopePayload(scope), id });
      reload();
    },
    [bridge, scopePayload, reload],
  );

  return {
    globalPrompts,
    projectPrompts,
    loading,
    error,
    projectAvailable,
    reload,
    create,
    update,
    remove,
  };
}
