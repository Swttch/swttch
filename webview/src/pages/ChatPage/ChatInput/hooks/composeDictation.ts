/**
 * Splicing dictated text into whatever the user has already typed.
 *
 * Dictation does not own the input box. The user may have typed a sentence,
 * put the caret in the middle of it, and only then started speaking — so each
 * transcript has to be woven into the existing text at the caret rather than
 * appended or, worse, replacing it.
 *
 * Interim text arrives repeatedly and grows: "안녕", "안녕 하", "안녕 하이".
 * Each one replaces the previous rather than stacking, which is why the anchor
 * (the text either side of the caret) is captured once when recording starts
 * and reused for every update.
 */

/** The text either side of the caret when recording began. */
export interface DictationAnchor {
  /** Everything before the caret. */
  prefix: string;
  /** Everything after the caret. */
  suffix: string;
  /**
   * The full value we last wrote. If the box no longer holds this, the user
   * edited it while speaking and we must not overwrite their edit.
   */
  lastSetValue: string;
}

export interface ComposedDictation {
  /** The value to put in the box. */
  value: string;
  /** Where the caret goes: at the end of the dictated run. */
  caret: number;
  /**
   * The dictated run's bounds within `value`, for rendering it as unsettled.
   * Null once the text is final — settled text is styled like anything else
   * the user typed.
   */
  interim: { start: number; end: number } | null;
}

/** Recording started with the caret somewhere in `value`. */
export function anchorAt(value: string, caret: number): DictationAnchor {
  const at = Math.max(0, Math.min(caret, value.length));
  return { prefix: value.slice(0, at), suffix: value.slice(at), lastSetValue: value };
}

/**
 * Weave `text` into the anchor.
 *
 * Spaces are inserted only where they are missing: dictating after "hello"
 * gives "hello world", but after "hello " it does not give "hello  world".
 * The same applies on the suffix side.
 *
 * @param isFinal Settled text renders as normal text; interim renders unsettled.
 * @returns The new value, or null if `text` is empty.
 */
export function composeDictation(
  anchor: DictationAnchor,
  text: string,
  isFinal: boolean,
): ComposedDictation | null {
  const spoken = text.trim();
  if (!spoken) return null;

  const { prefix, suffix } = anchor;
  const needsLeadingSpace = prefix.length > 0 && !/\s$/.test(prefix);
  const needsTrailingSpace = suffix.length > 0 && !/^\s/.test(suffix);

  const lead = needsLeadingSpace ? ' ' : '';
  const trail = needsTrailingSpace ? ' ' : '';

  const value = prefix + lead + spoken + trail + suffix;
  const start = prefix.length + lead.length;
  const caret = start + spoken.length;

  return { value, caret, interim: isFinal ? null : { start, end: caret } };
}

/**
 * Did the user edit the box themselves while we were writing into it?
 *
 * If so, dictation has to stop rather than fight them for the caret — our next
 * write would clobber whatever they just typed.
 */
export function wasEditedExternally(anchor: DictationAnchor, currentValue: string): boolean {
  return currentValue !== anchor.lastSetValue;
}
