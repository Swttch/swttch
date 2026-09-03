/**
 * The initials and colour of a project's badge.
 *
 * The badge is what lets the eye pick one row out of a long list before reading
 * any text, which is the whole reason the list needs it: a profile can hold
 * three projects named `proj2` and two named `t-ruby`, and the name alone tells
 * them apart in neither case.
 */

/**
 * Word-ish pieces of [name], splitting on whitespace and the common
 * folder-name separators (`-`, `_`, `.`).
 *
 * Anything else is kept as word content — including non-Latin scripts. This
 * function used to split on "everything that is not ASCII alphanumeric",
 * which treated Korean, Japanese, Arabic, or accented Latin text as pure
 * delimiter material: an alias like "테스트 프로젝트" (a project's display name
 * is user-editable free text, see ProjectMetaDialog) produced zero words and
 * fell through to the '?' placeholder below, even though the name plainly has
 * two.
 */
function words(name: string): string[] {
  return name.split(/[\s\-_.]+/).filter(Boolean);
}

/**
 * Up to two letters standing in for [name]: the first word's initial, plus the
 * last word's initial when there is more than one word.
 *
 * First-and-last rather than first-two, because the tail is what distinguishes
 * names in practice — `claude-code-gui-jetbrains` and
 * `claude-code-gui-jetbrains-worktrees` share every leading word and differ
 * only at the end.
 */
export function projectInitials(name: string): string {
  const parts = words(name);
  if (parts.length === 0) return '?';

  const first = parts[0][0];
  if (parts.length === 1) return first.toUpperCase();

  return (first + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A stable hue for [key], in degrees.
 *
 * Keyed on the full path rather than the name so two projects with the same
 * name still get different badges. The hash is the classic 31-multiplier over
 * char codes, kept unsigned so the result does not flip negative partway
 * through a long path.
 */
export function projectBadgeHue(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

/**
 * Inline colours for the badge of the project at [key].
 *
 * Generated rather than pulled from the design tokens because the tokens carry
 * no categorical palette, and a badge needs one hue per project rather than one
 * accent for the app. Saturation and lightness are fixed so every badge reads
 * the same weight against either theme, with white text on a mid-lightness
 * fill.
 */
export function projectBadgeStyle(key: string): { backgroundColor: string; color: string } {
  const hue = projectBadgeHue(key);
  return {
    backgroundColor: `hsl(${hue} 55% 45%)`,
    color: 'hsl(0 0% 100%)',
  };
}
