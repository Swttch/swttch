/**
 * What the viewer's bottom panel can do with the image on screen.
 *
 * Every source the viewer receives is a `data:` URL — attachments live inline in
 * the transcript, and session images arrive as base64 over the socket. So these
 * go through `fetch`, which decodes a data URL without a network round trip and
 * hands back a Blob the platform APIs accept.
 */

/** Decode the viewer's `data:` URL into bytes the clipboard and downloads take. */
async function toBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** `image/png` → `png`, falling back to png for anything unrecognizable. */
function extensionOf(mimeType: string): string {
  const subtype = mimeType.split('/')[1] ?? 'png';
  return subtype.split('+')[0] || 'png';
}

/**
 * Put the image on the clipboard.
 *
 * Rejects rather than reporting success on a platform that refuses: the
 * clipboard image API is unevenly supported (and a JCEF build may not have it at
 * all), and silently doing nothing while saying "copied" is worse than saying it
 * failed.
 */
export async function copyImage(dataUrl: string): Promise<void> {
  const blob = await toBlob(dataUrl);
  const write = navigator.clipboard?.write;
  if (typeof write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new Error('clipboard images unsupported');
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

/**
 * Save the image to disk.
 *
 * Downloads a blob URL rather than the `data:` URL itself: browsers cap how long
 * a downloadable `data:` href may be, and a screenshot is easily past it — the
 * download then fails silently, which is the worst way for a save button to
 * behave.
 *
 * The transcript never records the name the file was attached under, so one is
 * built from the position instead. A stable, obvious name beats an invented one
 * that looks like the original but is not.
 */
export async function downloadImage(dataUrl: string, index: number): Promise<void> {
  const blob = await toBlob(dataUrl);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `image-${index + 1}.${extensionOf(blob.type || 'image/png')}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Released on a timer: revoking while the browser is still reading the blob
  // cancels the save.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Open the image in a new browser tab.
 *
 * Goes through a blob URL because browsers block top-level navigation to a
 * `data:` URL — handing `window.open` the source directly opens a blank tab.
 * The object URL is released on a timer rather than immediately, since revoking
 * it before the new tab has loaded leaves that tab empty.
 */
export async function openImageInNewTab(dataUrl: string): Promise<void> {
  const blob = await toBlob(dataUrl);
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
