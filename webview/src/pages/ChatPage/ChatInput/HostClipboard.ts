/** The shape the host answers GET_CLIPBOARD with. Every part may be missing or null. */
export type HostClipboardResponse = {
  text?: string | null;
  image?: { mimeType?: string | null; base64?: string | null } | null;
};

/**
 * What the IDE host read off the system clipboard when the composer's own paste
 * event came up empty (#278): text, an image, both, or neither.
 *
 * Built from the host's answer with [HostClipboard.from], which treats anything
 * missing or of the wrong shape as "not on the clipboard", so a host that answers
 * oddly costs the user one paste instead of raising a fault.
 */
export class HostClipboard {
  static readonly NONE = new HostClipboard(null, null, null);

  private constructor(
    readonly text: string | null,
    readonly imageMimeType: string | null,
    readonly imageBase64: string | null,
  ) {}

  /** Whether the host found an image, which the composer attaches like any pasted image. */
  get hasImage(): boolean {
    return this.imageMimeType !== null && this.imageBase64 !== null;
  }

  /** The image as a file, ready for the attachment path that pasted images already take. */
  toImageFile(): File | null {
    if (this.imageMimeType === null || this.imageBase64 === null) return null;
    const binary = atob(this.imageBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], 'image.png', { type: this.imageMimeType });
  }

  /** Read the host's answer to GET_CLIPBOARD. */
  static from(response: HostClipboardResponse | null | undefined): HostClipboard {
    if (!response) return HostClipboard.NONE;

    const text = typeof response.text === 'string' && response.text.length > 0 ? response.text : null;

    const mimeType =
      typeof response.image?.mimeType === 'string' && response.image.mimeType.length > 0
        ? response.image.mimeType
        : null;
    const base64 =
      typeof response.image?.base64 === 'string' && response.image.base64.length > 0
        ? response.image.base64
        : null;
    const hasImage = mimeType !== null && base64 !== null;
    if (text === null && !hasImage) return HostClipboard.NONE;

    return new HostClipboard(text, hasImage ? mimeType : null, hasImage ? base64 : null);
  }
}
