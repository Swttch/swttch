import { useCallback, useEffect, useRef } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { basename } from './basename';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import { ImageAttachSource } from '@/types';

interface Props {
  addImageAttachment: (file: File, source: ImageAttachSource) => Promise<void>;
  addFileAttachment: (absolutePath: string, fileName: string, size?: number) => void;
  addFolderAttachment: (absolutePath: string, folderName: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AttachMenu(props: Props) {
  const {
    addImageAttachment,
    addFileAttachment,
    addFolderAttachment,
    isOpen,
    onClose,
  } = props;

  const { t } = useTranslation('chat');
  const bridge = useBridgeContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleAttachImage = useCallback(() => {
    onClose();
    fileInputRef.current?.click();
  }, [onClose]);

  const handleAttachFiles = useCallback(async () => {
    onClose();
    const response = await bridge.send(MessageType.PICK_FILES, { mode: 'files', multiple: true }) as { paths: string[] } | null;
    if (!response?.paths) return;
    for (const p of response.paths) {
      addFileAttachment(p, basename(p));
    }
  }, [bridge, addFileAttachment, onClose]);

  const handleAttachFolders = useCallback(async () => {
    onClose();
    const response = await bridge.send(MessageType.PICK_FILES, { mode: 'folders', multiple: true }) as { paths: string[] } | null;
    if (!response?.paths) return;
    for (const p of response.paths) {
      addFolderAttachment(p, basename(p));
    }
  }, [bridge, addFolderAttachment, onClose]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await addImageAttachment(file, ImageAttachSource.Button);
    }
    e.target.value = ''; // reset for re-selection
  }, [addImageAttachment]);

  return (
    <div ref={menuRef}>
      {isOpen && (
        <div className="absolute bottom-full end-0 mb-1 w-40 py-1 bg-surface-overlay border border-border-default rounded-md shadow-lg z-30">
          <button onClick={handleAttachImage} className="w-full px-3 py-1.5 text-start text-xs text-text-secondary hover:bg-surface-hover flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            {t('chatInput.attachMenu.image')}
          </button>
          <button onClick={handleAttachFiles} className="w-full px-3 py-1.5 text-start text-xs text-text-secondary hover:bg-surface-hover flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
            </svg>
            {t('chatInput.attachMenu.file')}
          </button>
          <button onClick={handleAttachFolders} className="w-full px-3 py-1.5 text-start text-xs text-text-secondary hover:bg-surface-hover flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            {t('chatInput.attachMenu.folder')}
          </button>
        </div>
      )}

      {/* Hidden file input - 항상 렌더링 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
