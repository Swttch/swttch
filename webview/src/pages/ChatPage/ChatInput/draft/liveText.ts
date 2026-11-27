/**
 * The text on screen in the composer while it is ahead of the composer's value.
 *
 * A syllable an IME is still composing is in the box and not yet in the value, and the value must stay that way:
 * rendering the composer in the middle of a composition doubles the glyphs under JCEF. What has to answer at once, such
 * as the "Edited" mark of a recalled send (#735), reads the text here and renders by itself.
 */
export class LiveText {
  private text: string | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** The text typed last, or null once the value has caught up. */
  get = (): string | null => this.text;

  set = (text: string | null): void => {
    if (text === this.text) return;
    this.text = text;
    this.listeners.forEach((listener) => listener());
  };
}
