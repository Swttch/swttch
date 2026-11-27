import type { ComposerContent, DraftAttachment } from '@/shared';
import { Attachment, FileAttachment, FolderAttachment, ImageAttachment, isFileAttachment, isFolderAttachment, isImageAttachment } from '@/types/attachment';
import type { PendingElement } from '@/utils/composerElements';
import type { PendingReply } from '@/utils/composerReplies';
import type { AgentRecipient } from '../hooks/useAgentMention';

/** What the composer holds, in the parts its components keep it in. */
export interface ComposerParts {
  text: string;
  recipient: AgentRecipient | null;
  pathTokens: string[];
  attachments: readonly Attachment[];
  replies: readonly PendingReply[];
  elements: readonly PendingElement[];
}

/** Keeps a picture's bytes, and hands them back. */
export interface PictureShelf {
  picture(id: string): string | undefined;
  keepPicture(id: string, data: string): void;
}

function attachmentOf(attachment: Attachment, pictures: PictureShelf): DraftAttachment[] {
  if (isImageAttachment(attachment)) {
    pictures.keepPicture(attachment.id, attachment.base64);
    return [{ id: attachment.id, type: 'image', name: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size }];
  }
  if (isFileAttachment(attachment)) {
    return [{ id: attachment.id, type: 'file', name: attachment.fileName, path: attachment.absolutePath, size: attachment.size }];
  }
  if (isFolderAttachment(attachment)) {
    return [{ id: attachment.id, type: 'folder', name: attachment.folderName, path: attachment.absolutePath }];
  }
  return [];
}

/** The composer's parts as one content, with the bytes of its pictures put on the shelf. */
export function contentOfComposer(parts: ComposerParts, pictures: PictureShelf): ComposerContent {
  return {
    text: parts.text,
    recipient: parts.recipient ? { ...parts.recipient } : null,
    pathTokens: [...parts.pathTokens],
    attachments: parts.attachments.flatMap((attachment) => attachmentOf(attachment, pictures)),
    replies: parts.replies.map(({ id, quote, comment }) => ({ id, quote, comment })),
    // An element's picture is an attachment of its own, so the element is kept without a second copy of it.
    elements: parts.elements.map(({ token, element, imageName }) => ({
      token,
      element: { ...element, screenshot: undefined },
      imageName,
    })),
  };
}

/** The attachments a content names. A picture whose bytes are not here is left out. */
export function attachmentsOf(content: ComposerContent, pictures: PictureShelf): Attachment[] {
  return content.attachments.flatMap((attachment): Attachment[] => {
    if (attachment.type === 'image') {
      const base64 = pictures.picture(attachment.id);
      if (base64 === undefined) return [];
      return [new ImageAttachment({ id: attachment.id, fileName: attachment.name, mimeType: attachment.mimeType ?? 'image/png', base64, size: attachment.size ?? 0 })];
    }
    if (attachment.type === 'folder') {
      return [new FolderAttachment({ id: attachment.id, folderName: attachment.name, absolutePath: attachment.path ?? '' })];
    }
    return [new FileAttachment({ id: attachment.id, fileName: attachment.name, absolutePath: attachment.path ?? '', size: attachment.size })];
  });
}

export const elementsOf = (content: ComposerContent): PendingElement[] =>
  content.elements.map(({ token, element, imageName }) => ({ token, element: element as unknown as PendingElement['element'], imageName }));
