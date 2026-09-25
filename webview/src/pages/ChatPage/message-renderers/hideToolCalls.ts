import { useSettingsOrNull } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';

/**
 * Tools that stay on screen with `hideToolCalls` on.
 *
 * The line is between a tool that CHANGES something or ASKS something and a
 * tool that only looks or runs. The first kind is what the turn produced, so
 * hiding it would hide the point of the turn; the second is how it got there.
 *
 * `SendUserMessage` is there for its own reason: in the CLI's brief mode the
 * assistant's plain text never reaches the user and that tool call IS the
 * reply, so hiding it would leave a blank turn. `Brief` is its legacy name,
 * paired the same way as in `ToolRendererMap`.
 */
const ALWAYS_VISIBLE_TOOLS = new Set([
  'Edit',
  'Write',
  'NotebookEdit',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'SendUserMessage',
  'Brief',
]);

export function isAlwaysVisibleTool(name: string): boolean {
  return ALWAYS_VISIBLE_TOOLS.has(name);
}

/**
 * Whether the chat is hiding tool calls.
 *
 * Reads through [useSettingsOrNull] so a renderer mounted without a provider
 * (every unit test that renders one directly) shows its tool card as before.
 */
export function useHideToolCalls(): boolean {
  const context = useSettingsOrNull();
  return context?.settings[SettingKey.HIDE_TOOL_CALLS] ?? false;
}
