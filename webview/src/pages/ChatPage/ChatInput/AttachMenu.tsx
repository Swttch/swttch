import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Tippy from '@tippyjs/react/headless';
import type { Instance } from 'tippy.js';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { basename } from './basename';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

interface Props {
  addFileAttachment: (absolutePath: string, fileName: string, size?: number) => void;
  addFolderAttachment: (absolutePath: string, folderName: string) => void;
  onSlashCommand: () => void;
}

const ICON_PROPS = {
  className: 'w-[15px] h-[15px] shrink-0',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function PlusIcon() {
  return (
    <svg {...ICON_PROPS} className="w-[15px] h-[15px]" strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function SlashSquareIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M15 8 9 16" />
    </svg>
  );
}

interface ItemProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function MenuItem({ icon, label, onClick }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-start text-sm font-normal text-text-primary hover:bg-surface-pressed whitespace-nowrap"
    >
      <span className="text-text-secondary flex">{icon}</span>
      {label}
    </button>
  );
}

/**
 * The composer's "+" button. Hovering (or focusing, or tapping) it unfolds the
 * add menu above it: files or photos, a folder, and the slash command panel.
 * Modelled on Claude Desktop's composer menu.
 *
 * Files and photos share one native picker. A picked photo is attached by path
 * like any other file; the CLI reads it from there. Photos that arrive by paste
 * or drop still become inline image attachments.
 */
export function AttachMenu(props: Props) {
  const { addFileAttachment, addFolderAttachment, onSlashCommand } = props;

  const { t } = useTranslation('chat');
  const bridge = useBridgeContext();
  const tippyRef = useRef<Instance | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const hide = useCallback(() => tippyRef.current?.hide(), []);

  const pickFiles = useCallback(async () => {
    const response = await bridge.send(MessageType.PICK_FILES, { mode: 'files', multiple: true }) as { paths: string[] } | null;
    if (!response?.paths) return;
    for (const p of response.paths) {
      addFileAttachment(p, basename(p));
    }
  }, [bridge, addFileAttachment]);

  const pickFolders = useCallback(async () => {
    const response = await bridge.send(MessageType.PICK_FILES, { mode: 'folders', multiple: true }) as { paths: string[] } | null;
    if (!response?.paths) return;
    for (const p of response.paths) {
      addFolderAttachment(p, basename(p));
    }
  }, [bridge, addFolderAttachment]);

  // The command palette's "Attach file..." item opens the file picker directly, without the menu.
  useEffect(() => {
    const handleAttachFromPalette = () => { void pickFiles(); };
    window.addEventListener('command-palette:attach-files', handleAttachFromPalette);
    return () => window.removeEventListener('command-palette:attach-files', handleAttachFromPalette);
  }, [pickFiles]);

  return (
    <Tippy
      placement="top-start"
      interactive
      trigger="mouseenter focus click"
      delay={[80, 120]}
      offset={[0, 6]}
      appendTo={() => document.body}
      onCreate={(instance) => { tippyRef.current = instance; }}
      onShow={() => setIsOpen(true)}
      onHide={() => setIsOpen(false)}
      render={(attrs) => (
        <div
          className="z-50 min-w-[190px] p-1 bg-surface-overlay border border-border-default rounded-xl shadow-lg"
          role="menu"
          {...attrs}
        >
          <MenuItem
            icon={<PaperclipIcon />}
            label={t('chatInput.attachMenu.filesOrPhotos')}
            onClick={() => { hide(); void pickFiles(); }}
          />
          <MenuItem
            icon={<FolderIcon />}
            label={t('chatInput.attachMenu.folder')}
            onClick={() => { hide(); void pickFolders(); }}
          />
          <MenuItem
            icon={<SlashSquareIcon />}
            label={t('chatInput.attachMenu.slashCommands')}
            onClick={() => { hide(); onSlashCommand(); }}
          />
        </div>
      )}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`flex items-center justify-center w-6 h-6 shrink-0 rounded-md text-text-secondary hover:bg-surface-hover ${isOpen ? 'bg-surface-hover' : ''}`}
      >
        <PlusIcon />
      </button>
    </Tippy>
  );
}
