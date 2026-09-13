/**
 * Prompt library types. These mirror the backend store (features/prompts.ts)
 * field for field, so a prompt read from disk reaches the UI unedited.
 */

/** Where one prompt is stored. */
export type PromptScope = 'global' | 'project';

/** One saved prompt, exactly as the backend sent it. */
export interface SavedPrompt {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  /**
   * The ids of the categories this prompt is filed under, absent when it is
   * filed under none.
   *
   * Ids, not names: the name lives in one {@link PromptCategory} record, so
   * renaming a category is one write and every prompt follows.
   */
  categories?: string[];
}

/** One category, named once and referenced by id. */
export interface PromptCategory {
  id: string;
  name: string;
  createdAt: number;
}

/** The reply to the four category messages: always the full list. */
export interface PromptCategoriesAck {
  status?: 'ok' | 'error';
  error?: string;
  categories?: PromptCategory[];
}

/** A saved prompt together with the scope it was read from. */
export interface ScopedPrompt extends SavedPrompt {
  scope: PromptScope;
}

/** The reply to GET_PROMPTS. */
export interface GetPromptsAck {
  scope: PromptScope;
  prompts: SavedPrompt[];
}

/** The reply to CREATE_PROMPT and UPDATE_PROMPT. */
export interface PromptMutationAck {
  scope: PromptScope;
  prompt: SavedPrompt;
}

/** What to do with an incoming prompt whose id is already stored. */
export type ConflictStrategy = 'skip' | 'overwrite' | 'duplicate';

/** What one incoming prompt would do to the library it lands in. */
export type ImportItemStatus = 'new' | 'update';

export interface ImportItem {
  prompt: SavedPrompt;
  status: ImportItemStatus;
}

/** The reply to EXPORT_PROMPTS. `path` is null when the save dialog was cancelled. */
export interface ExportPromptsAck {
  status?: 'ok' | 'error';
  error?: string;
  path: string | null;
  count: number;
}

/**
 * The reply to PREVIEW_PROMPT_IMPORT.
 *
 * `cancelled` is set when the user closed the file picker, which is neither a
 * preview nor an error.
 */
export interface PreviewImportAck {
  status?: 'ok' | 'error';
  error?: string;
  cancelled?: boolean;
  scope?: PromptScope;
  items?: ImportItem[];
  newCount?: number;
  updateCount?: number;
}

/** The reply to IMPORT_PROMPTS. */
export interface ImportPromptsAck {
  status?: 'ok' | 'error';
  error?: string;
  imported?: number;
  updated?: number;
  skipped?: number;
}
