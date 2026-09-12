import { useCallback, useEffect, useState } from 'react';
import { MessageType } from '@/shared';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import type {
  ConflictStrategy,
  ExportPromptsAck,
  GetPromptsAck,
  ImportPromptsAck,
  PreviewImportAck,
  PromptScope,
  SavedPrompt,
} from '@/types/prompt';

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
  /**
   * Write the given prompts to a file the user picks, answering with the path
   * written or null when they cancelled the save dialog.
   */
  exportPrompts: (scope: PromptScope, ids: string[]) => Promise<ExportPromptsAck>;
  /**
   * Read a prompt file the user picks and say what importing it would do.
   * Nothing is written until {@link PromptStore.importPrompts} is called.
   */
  previewImport: (scope: PromptScope) => Promise<PreviewImportAck>;
  /** Apply a previewed import with the chosen conflict strategy. */
  importPrompts: (
    scope: PromptScope,
    prompts: SavedPrompt[],
    strategy: ConflictStrategy,
  ) => Promise<ImportPromptsAck>;
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

  const exportPrompts = useCallback(
    async (scope: PromptScope, ids: string[]) =>
      (await bridge.send(MessageType.EXPORT_PROMPTS, {
        ...scopePayload(scope),
        ids,
      })) as ExportPromptsAck,
    [bridge, scopePayload],
  );

  const previewImport = useCallback(
    async (scope: PromptScope) =>
      (await bridge.send(MessageType.PREVIEW_PROMPT_IMPORT, scopePayload(scope))) as PreviewImportAck,
    [bridge, scopePayload],
  );

  const importPrompts = useCallback(
    async (scope: PromptScope, prompts: SavedPrompt[], strategy: ConflictStrategy) => {
      const ack = (await bridge.send(MessageType.IMPORT_PROMPTS, {
        ...scopePayload(scope),
        prompts,
        strategy,
      })) as ImportPromptsAck;
      reload();
      return ack;
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
    exportPrompts,
    previewImport,
    importPrompts,
  };
}
