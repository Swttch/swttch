/**
 * What every paste that consults the IDE host shares, whether it goes into the
 * composer or into a plain text field.
 */

/**
 * How long a paste waits for the host to read the clipboard. A read is instant when
 * it works, so this only ends the wait for a host that never answers, which would
 * otherwise leave the user's paste doing nothing for the bridge's thirty seconds.
 */
export const HOST_CLIPBOARD_TIMEOUT_MS = 5_000;

/**
 * How long a paste the browser has already performed waits for the host's word on it.
 * The text is on screen by then, so a slow host only means the correction comes late
 * (or not at all), never that the paste is lost.
 */
export const HOST_PASTE_CHECK_TIMEOUT_MS = 1_500;

/** The two clipboards' readers may end lines differently; the words are what is compared. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Wait until the browser has finished the paste it was in the middle of when the event fired. */
export function afterNativePaste(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
