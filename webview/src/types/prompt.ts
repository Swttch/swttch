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
