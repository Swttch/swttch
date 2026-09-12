import { useCallback, useEffect, useState } from 'react';
import { MessageType } from '@/shared';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useWorkingDir } from '@/contexts/WorkingDirContext';
import type {
  PromptCategory,
  PromptCategoriesAck,
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
  /** Every category that exists, named once each. */
  categories: PromptCategory[];
  create: (
    scope: PromptScope,
    name: string,
    content: string,
    categoryIds?: string[],
  ) => Promise<void>;
  update: (
    scope: PromptScope,
    id: string,
    name: string,
    content: string,
    categoryIds?: string[],
  ) => Promise<void>;
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
  /** Add a category, which starts empty. Rejected when the name is taken. */
  createCategory: (name: string) => Promise<PromptCategoriesAck>;
  /** Rename one category. Every prompt follows, because they reference its id. */
  renameCategory: (id: string, name: string) => Promise<PromptCategoriesAck>;
  /** Remove a category. Its prompts stay and fall back to uncategorised. */
  deleteCategory: (id: string) => Promise<PromptCategoriesAck>;
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
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectAvailable = Boolean(workingDirectory);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);

    // Categories come back on the same round trip: the sidebar and the lists are
    // drawn together, so reading them apart would show one before the other.
    (bridge.send(MessageType.GET_PROMPT_CATEGORIES, {}) as Promise<PromptCategoriesAck>)
      .then((ack) => setCategories(ack?.categories ?? []))
      .catch(() => setCategories([]));

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
    async (scope: PromptScope, name: string, content: string, categoryIds?: string[]) => {
      await bridge.send(MessageType.CREATE_PROMPT, {
        ...scopePayload(scope),
        name,
        content,
        categories: categoryIds,
      });
      reload();
    },
    [bridge, scopePayload, reload],
  );

  const update = useCallback(
    async (scope: PromptScope, id: string, name: string, content: string, categoryIds?: string[]) => {
      await bridge.send(MessageType.UPDATE_PROMPT, {
        ...scopePayload(scope),
        id,
        name,
        content,
        categories: categoryIds,
      });
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

  /**
   * The three category writes.
   *
   * Each answers with the full list, which is set straight away rather than
   * waiting for the next reload: the sidebar is what the user just acted on, so
   * it is the thing that must not lag.
   */
  const applyCategoryAck = useCallback((ack: PromptCategoriesAck) => {
    if (ack?.status !== 'error' && ack?.categories) setCategories(ack.categories);
    return ack;
  }, []);

  const createCategory = useCallback(
    async (name: string) =>
      applyCategoryAck(
        (await bridge.send(MessageType.CREATE_PROMPT_CATEGORY, { name })) as PromptCategoriesAck,
      ),
    [bridge, applyCategoryAck],
  );

  const renameCategory = useCallback(
    async (id: string, name: string) =>
      applyCategoryAck(
        (await bridge.send(MessageType.RENAME_PROMPT_CATEGORY, { id, name })) as PromptCategoriesAck,
      ),
    [bridge, applyCategoryAck],
  );

  const deleteCategory = useCallback(
    async (id: string) =>
      applyCategoryAck(
        (await bridge.send(MessageType.DELETE_PROMPT_CATEGORY, { id })) as PromptCategoriesAck,
      ),
    [bridge, applyCategoryAck],
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
    categories,
    reload,
    create,
    update,
    remove,
    createCategory,
    renameCategory,
    deleteCategory,
    exportPrompts,
    previewImport,
    importPrompts,
  };
}
