import React, { useState, useCallback, useMemo } from 'react';
import { Attachment, ImageAttachment, FileAttachment, FolderAttachment, ATTACHMENT_LIMITS, ImageAttachSource } from '../../../../types';
import { useTranslation } from '@/i18n';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';
import { isJetBrains } from '@/config/environment';
import { basename } from '../basename';
import { collectFolderFiles, readDroppedEntries, uploadFile, uploadFolder, type DroppedEntry } from './droppedFiles';

function isInlineImageType(mimeType: string): boolean {
  return ATTACHMENT_LIMITS.ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ATTACHMENT_LIMITS.ALLOWED_IMAGE_MIME_TYPES)[number]);
}

/**
 * Tell the backend an image was attached, purely so telemetry can see it.
 *
 * The three attach paths all live in the webview, so before this the backend
 * never learned that attaching happened at all and the feature was invisible in
 * usage data. Fire-and-forget over `sendRaw` like PANEL_FOCUSED: nothing ACKs
 * it, and losing one ping matters far less than delaying the attachment.
 *
 * Sends the mime type and byte size but NEVER the file name, which routinely
 * carries personal information (paths, project names, screenshot titles).
 */
function reportImageAttached(source: ImageAttachSource, file: File): void {
  try {
    getBridge().sendRaw({
      type: MessageType.IMAGE_ATTACHED,
      payload: { source, mimeType: file.type, size: file.size },
      timestamp: Date.now(),
    });
  } catch {
    // Socket not open yet. The attachment itself already succeeded, so a lost
    // telemetry ping must never surface to the user.
  }
}

export interface UseAttachmentsReturn {
  attachments: Attachment[];
  addImageAttachment: (file: File, source: ImageAttachSource) => Promise<void>;
  addFileAttachment: (absolutePath: string, fileName: string, size?: number) => void;
  addFolderAttachment: (absolutePath: string, folderName: string) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  error: string | null;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLElement>) => void;
  handleDrop: (e: React.DragEvent) => void;
}

export function useAttachments(): UseAttachmentsReturn {
  const { t } = useTranslation('chat');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const addImageAttachment = useCallback(async (file: File, source: ImageAttachSource) => {
    // Clear previous error
    setError(null);

    // Validate MIME type
    if (!ATTACHMENT_LIMITS.ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ATTACHMENT_LIMITS.ALLOWED_IMAGE_MIME_TYPES)[number])) {
      setError(t('chatInput.attachments.errors.unsupportedType', { type: file.type || 'unknown' }));
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Validate file size
    if (file.size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const maxMB = ATTACHMENT_LIMITS.MAX_FILE_SIZE / (1024 * 1024);
      setError(t('chatInput.attachments.errors.tooLarge', { size: sizeMB, max: maxMB }));
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Read file as base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Strip "data:image/png;base64," prefix
        const base64Data = dataUrl.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const attachment = new ImageAttachment({
      fileName: file.name || 'image.png',
      mimeType: file.type,
      base64,
      size: file.size,
    });

    setAttachments((prev) => [...prev, attachment]);

    // Only after the attachment actually lands: a rejected type or an oversize
    // file returned above, so those never count as an attach.
    reportImageAttached(source, file);
  }, []);

  const addFileAttachment = useCallback((absolutePath: string, fileName: string, size?: number) => {
    const attachment = new FileAttachment({ fileName, absolutePath, size });
    setAttachments((prev) => {
      if (prev.some((att) => att instanceof FileAttachment && att.absolutePath === attachment.absolutePath)) {
        return prev;
      }
      return [...prev, attachment];
    });
  }, []);

  const addFolderAttachment = useCallback((absolutePath: string, folderName: string) => {
    const attachment = new FolderAttachment({ folderName, absolutePath });
    setAttachments((prev) => {
      if (prev.some((att) => att instanceof FolderAttachment && att.absolutePath === attachment.absolutePath)) {
        return prev;
      }
      return [...prev, attachment];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setError(null);
  }, []);

  /**
   * Turn what a drop or a paste carried into attachments.
   *
   * Pictures the model can read inline stay inline, in every environment.
   * Everything else becomes a path chip, whatever its type. In the IDE the path
   * comes from the NATIVE_DROP_FLUSH RPC (Kotlin CefDragHandler → backend stash
   * → IPC), which gives canonical OS paths. Reading them off `dataTransfer`
   * there would duplicate: IDE project-tree drops put the user-project path in
   * text/plain *and* deliver a sandbox-mirror path via CefDragHandler — two
   * different strings for the same file, so the dedup guard can't collapse them.
   */
  const attachEntries = useCallback(async (entries: DroppedEntry[], source: ImageAttachSource) => {
    for (const { file, isDirectory, directory } of entries) {
      if (!isDirectory && isInlineImageType(file.type)) {
        await addImageAttachment(file, source);
        continue;
      }
      if (isJetBrains()) continue;

      // A browser never reveals a file's path, so the file is uploaded and the
      // chip points at the saved copy.
      const request = (type: string, payload: Record<string, unknown>) => getBridge().request(type, payload);
      try {
        if (directory) {
          const savedPath = await uploadFolder(await collectFolderFiles(directory), request);
          addFolderAttachment(savedPath, directory.name);
        } else {
          const savedPath = await uploadFile(file, request);
          addFileAttachment(savedPath, file.name || basename(savedPath), file.size);
        }
      } catch (err) {
        console.error('[useAttachments] File upload failed:', err);
        setError(t('chatInput.attachments.errors.uploadFailed', { name: file.name }));
        setTimeout(() => setError(null), 3000);
      }
    }
  }, [addImageAttachment, addFileAttachment, addFolderAttachment, t]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLElement>) => {
    if (!e.clipboardData) return;

    // Read before the first await: the browser empties the clipboard data once
    // this handler yields.
    const entries = readDroppedEntries(e.clipboardData);

    // Plain text carries no file at all and keeps the browser's own paste. A file
    // the IDE would not attach inline is also left alone there, since the IDE gets
    // its path some other way.
    const attachable = entries.some(({ file, isDirectory }) =>
      (!isDirectory && isInlineImageType(file.type)) || !isJetBrains());
    if (!attachable) return;

    e.preventDefault();
    await attachEntries(entries, ImageAttachSource.Paste);
  }, [attachEntries]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    // Read before the first await: the browser empties the DataTransfer once
    // this handler yields.
    await attachEntries(readDroppedEntries(e.dataTransfer), ImageAttachSource.Drop);
  }, [attachEntries, setIsDragOver]);

  return useMemo(() => ({
    attachments,
    addImageAttachment,
    addFileAttachment,
    addFolderAttachment,
    removeAttachment,
    clearAttachments,
    error,
    isDragOver,
    setIsDragOver,
    handlePaste,
    handleDrop,
  }), [attachments, addImageAttachment, addFileAttachment, addFolderAttachment, removeAttachment, clearAttachments, error, isDragOver, setIsDragOver, handlePaste, handleDrop]);
}
