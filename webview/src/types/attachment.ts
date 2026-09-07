export enum AttachmentType {
  Image = 'image',
  File = 'file',
  Folder = 'folder',
}

/**
 * Which of the three entry points the user attached an image through.
 *
 * Reported with {@link MessageType.IMAGE_ATTACHED} so telemetry can tell the
 * paths apart. All three converge on `addImageAttachment`, so without this the
 * backend would only ever learn that *an* image was attached.
 */
export enum ImageAttachSource {
  /** The paperclip menu's "Image" item, via a hidden file input. */
  Button = 'button',
  /** Cmd/Ctrl+V with an image on the clipboard. */
  Paste = 'paste',
  /** An image file dropped onto the chat input. */
  Drop = 'drop',
}

export abstract class Attachment {
  readonly id: string;
  abstract readonly type: AttachmentType;

  constructor() {
    this.id = crypto.randomUUID();
  }

  abstract get displayLabel(): string;
  abstract get isPreviewable(): boolean;
  abstract toPayload(): AttachmentPayload;
}

export class ImageAttachment extends Attachment {
  readonly type = AttachmentType.Image;
  readonly fileName: string;
  readonly mimeType: string;
  readonly base64: string;
  readonly size: number;

  constructor(params: { fileName: string; mimeType: string; base64: string; size: number }) {
    super();
    this.fileName = params.fileName;
    this.mimeType = params.mimeType;
    this.base64 = params.base64;
    this.size = params.size;
  }

  get displayLabel(): string {
    return this.fileName;
  }

  get isPreviewable(): boolean {
    return true;
  }

  get dataUrl(): string {
    return `data:${this.mimeType};base64,${this.base64}`;
  }

  toPayload(): ImageAttachmentPayload {
    return new ImageAttachmentPayload({
      fileName: this.fileName,
      mimeType: this.mimeType,
      base64: this.base64,
    });
  }
}

export class FileAttachment extends Attachment {
  readonly type = AttachmentType.File;
  readonly fileName: string;
  readonly absolutePath: string;
  readonly size?: number;

  constructor(params: { fileName: string; absolutePath: string; size?: number }) {
    super();
    this.fileName = params.fileName;
    this.absolutePath = params.absolutePath;
    this.size = params.size;
  }

  get displayLabel(): string {
    return this.fileName;
  }

  get isPreviewable(): boolean {
    return false;
  }

  toPayload(): FileAttachmentPayload {
    return new FileAttachmentPayload({
      fileName: this.fileName,
      absolutePath: this.absolutePath,
    });
  }
}

export class FolderAttachment extends Attachment {
  readonly type = AttachmentType.Folder;
  readonly folderName: string;
  readonly absolutePath: string;

  constructor(params: { folderName: string; absolutePath: string }) {
    super();
    this.folderName = params.folderName;
    this.absolutePath = FolderAttachment.normalizeTrailingSeparator(params.absolutePath);
  }

  /**
   * Ensures the path ends with exactly one separator, matching the separator
   * already used in the path so that mixed separators (e.g. "C:\a\b/") are
   * never produced.
   *
   * Rules:
   *  - Already ends with `/` or `\` → return as-is.
   *  - Contains `\` (Windows path) → append `\`.
   *  - Otherwise (POSIX or forward-slash path) → append `/`.
   */
  static normalizeTrailingSeparator(path: string): string {
    if (/[/\\]$/.test(path)) {
      return path;
    }
    return path.includes('\\') ? path + '\\' : path + '/';
  }

  get displayLabel(): string {
    return this.folderName + '/';
  }

  get isPreviewable(): boolean {
    return false;
  }

  toPayload(): FolderAttachmentPayload {
    return new FolderAttachmentPayload({
      folderName: this.folderName,
      absolutePath: this.absolutePath,
    });
  }
}

export abstract class AttachmentPayload {
  abstract readonly type: AttachmentType;
}

export class ImageAttachmentPayload extends AttachmentPayload {
  readonly type = AttachmentType.Image;
  readonly fileName: string;
  readonly mimeType: string;
  readonly base64: string;

  constructor(params: { fileName: string; mimeType: string; base64: string }) {
    super();
    this.fileName = params.fileName;
    this.mimeType = params.mimeType;
    this.base64 = params.base64;
  }
}

export class FileAttachmentPayload extends AttachmentPayload {
  readonly type = AttachmentType.File;
  readonly fileName: string;
  readonly absolutePath: string;

  constructor(params: { fileName: string; absolutePath: string }) {
    super();
    this.fileName = params.fileName;
    this.absolutePath = params.absolutePath;
  }
}

export class FolderAttachmentPayload extends AttachmentPayload {
  readonly type = AttachmentType.Folder;
  readonly folderName: string;
  readonly absolutePath: string;

  constructor(params: { folderName: string; absolutePath: string }) {
    super();
    this.folderName = params.folderName;
    this.absolutePath = params.absolutePath;
  }
}

export const ATTACHMENT_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  ALLOWED_IMAGE_MIME_TYPES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const,
} as const;

export function isImageAttachment(att: Attachment): att is ImageAttachment {
  return att.type === AttachmentType.Image;
}

export function isFileAttachment(att: Attachment): att is FileAttachment {
  return att.type === AttachmentType.File;
}

export function isFolderAttachment(att: Attachment): att is FolderAttachment {
  return att.type === AttachmentType.Folder;
}
