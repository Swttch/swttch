import { PanelSection, PanelSectionId } from '@/types/commandPalette';

/** The id of the Context section's "Archive conversation" row. */
export const ARCHIVE_CONVERSATION_ITEM_ID = 'archive-conversation';

/**
 * Take the "Archive conversation" row out of the Context section where archiving would do nothing: the
 * session-management MCP is not installed, the open session is not saved yet, or it is archived already.
 * Pure function: returns a new section (never mutates the input), so it is safe to call from a `useMemo`.
 */
export function applyArchiveItemVisibility(section: PanelSection, visible: boolean): PanelSection {
  if (visible || section.id !== PanelSectionId.Context) return section;
  return { ...section, items: section.items.filter((it) => it.id !== ARCHIVE_CONVERSATION_ITEM_ID) };
}
