import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Attachment, ImageAttachment, FileAttachment, FolderAttachment, PendingUpload, ATTACHMENT_LIMITS, ImageAttachSource } from '../../../../types';
import { useTranslation } from '@/i18n';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';
import { isJetBrains } from '@/config/environment';
import { basename } from '../basename';
import {
  collectFolderFiles,
  readDroppedEntries,
  totalBytesOf,
  uploadFile,
  uploadFolder,
  UploadCancelledError,
  type DroppedEntry,
} from './droppedFiles';

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

/**
 * The attachments in the order `ids` names them.
 *
 * An id the list no longer holds is ignored, and an attachment `ids` does not name
 * (one that landed while a chip was being dragged) keeps its place after the named
 * ones, so a reorder can never lose an attachment.
 */
export function orderAttachmentsBy(attachments: Attachment[], ids: string[]): Attachment[] {
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const named = ids.flatMap((id) => {
    const attachment = byId.get(id);
    byId.delete(id);
    return attachment ? [attachment] : [];
  });
  return [...named, ...byId.values()];
}

export interface UseAttachmentsReturn {
  attachments: Attachment[];
  /** Files and folders still travelling to the backend; each becomes an attachment when it lands. */
  uploads: PendingUpload[];
  addImageAttachment: (file: File, source: ImageAttachSource) => Promise<void>;
  addFileAttachment: (absolutePath: string, fileName: string, size?: number) => void;
  addFolderAttachment: (absolutePath: string, folderName: string) => void;
  removeAttachment: (id: string) => void;
  /** Put the attachments in the order of `ids`, the way a drag of a chip decided it. */
  reorderAttachments: (ids: string[]) => void;
  /** Stop an upload in flight and drop its chip. */
  cancelUpload: (id: string) => void;
  clearAttachments: () => void;
  error: string | null;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLElement>) => Promise<void>;
  handleDrop: (e: React.DragEvent) => Promise<void>;
}

export function useAttachments(): UseAttachmentsReturn {
  const { t } = useTranslation('chat');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const cancelledUploads = useRef(new Set<string>());
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

  const reorderAttachments = useCallback((ids: string[]) => {
    setAttachments((prev) => orderAttachmentsBy(prev, ids));
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
    const isInline = ({ file, isDirectory }: DroppedEntry) => !isDirectory && isInlineImageType(file.type);

    // Every chip that will need an upload appears at once, so the person sees the
    // whole drop and not only the file being sent at the moment.
    const pending = new Map<DroppedEntry, PendingUpload>();
    if (!isJetBrains()) {
      for (const entry of entries.filter((e) => !isInline(e))) {
        pending.set(entry, new PendingUpload({
          label: entry.directory?.name ?? entry.file.name,
          isFolder: entry.directory !== null,
          totalBytes: entry.directory ? 0 : entry.file.size,
        }));
      }
      if (pending.size > 0) setUploads((prev) => [...prev, ...pending.values()]);
    }

    const request = (type: string, payload: Record<string, unknown>) => getBridge().request(type, payload);

    for (const entry of entries) {
      if (isInline(entry)) {
        await addImageAttachment(entry.file, source);
        continue;
      }
      const upload = pending.get(entry);
      if (!upload) continue; // the IDE supplies the path itself

      const control = {
        onProgress: (sentBytes: number, totalBytes: number) =>
          setUploads((prev) => prev.map((u) => (u.id === upload.id ? u.withProgress(sentBytes, totalBytes) : u))),
        isCancelled: () => cancelledUploads.current.has(upload.id),
      };

      // A browser never reveals a file's path, so the file is uploaded and the
      // chip points at the saved copy.
      try {
        if (control.isCancelled()) throw new UploadCancelledError();
        if (entry.directory) {
          const files = await collectFolderFiles(entry.directory);
          control.onProgress(0, totalBytesOf(files));
          const savedPath = await uploadFolder(files, request, control);
          addFolderAttachment(savedPath, entry.directory.name);
        } else {
          const savedPath = await uploadFile(entry.file, request, control);
          addFileAttachment(savedPath, entry.file.name || basename(savedPath), entry.file.size);
        }
      } catch (err) {
        // Removing the chip is the person's own choice, not a failure to report.
        if (!(err instanceof UploadCancelledError)) {
          console.error('[useAttachments] File upload failed:', err);
          setError(t('chatInput.attachments.errors.uploadFailed', { name: upload.label }));
          setTimeout(() => setError(null), 3000);
        }
      } finally {
        cancelledUploads.current.delete(upload.id);
        setUploads((prev) => prev.filter((u) => u.id !== upload.id));
      }
    }
  }, [addImageAttachment, addFileAttachment, addFolderAttachment, t]);

  const cancelUpload = useCallback((id: string) => {
    cancelledUploads.current.add(id);
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

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
    uploads,
    addImageAttachment,
    addFileAttachment,
    addFolderAttachment,
    removeAttachment,
    reorderAttachments,
    cancelUpload,
    clearAttachments,
    error,
    isDragOver,
    setIsDragOver,
    handlePaste,
    handleDrop,
  }), [attachments, uploads, addImageAttachment, addFileAttachment, addFolderAttachment, removeAttachment, reorderAttachments, cancelUpload, clearAttachments, error, isDragOver, setIsDragOver, handlePaste, handleDrop]);
}
