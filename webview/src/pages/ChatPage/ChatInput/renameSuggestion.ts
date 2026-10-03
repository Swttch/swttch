import { hangulToQwerty } from '@/commandPalette/hangulKeys';

/** What the box holds once `/rename` and the space after it are typed. */
const RENAME_COMMAND_PREFIX = '/rename ';

/**
 * The name to offer after `/rename `: the title the session has now.
 *
 * Offered only while nothing follows the space. The moment the user types a
 * letter they have chosen their own name, and a suggestion trailing it would be
 * noise at best and a wrong completion at worst.
 *
 * The command counts when it was typed with the Korean layout still on
 * (`/ㄱㄷㅜㅁㅡㄷ `), since the keys pressed were the right ones.
 *
 * @returns The title to show as a preview, or null when there is nothing to offer.
 */
export function renameSuggestion(value: string, sessionTitle: string | undefined): string | null {
  if (hangulToQwerty(value).toLowerCase() !== RENAME_COMMAND_PREFIX) return null;
  const title = sessionTitle?.trim();
  return title ? title : null;
}
