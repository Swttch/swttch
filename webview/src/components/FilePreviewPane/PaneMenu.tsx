import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowDownTrayIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, ChevronDownIcon, CodeBracketIcon,
  ComputerDesktopIcon, DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { getAdapter } from '@/adapters';
import { i18n, useTranslation } from '@/i18n';
import { downloadSentFile } from '@/pages/ChatPage/message-renderers/ToolRenderers/sendUserFile';

interface PaneMenuProps {
  /** What the pane calls the file: the page's own title, else the file name. */
  heading: string;
  path: string;
  name: string;
  /** The text of the page when the file is one, which can then be copied. */
  source?: string;
  /** The address the page was published at, when it was published. */
  publishedUrl?: string;
  onReload: () => void;
}

type Icon = ComponentType<{ className?: string }>;

function Item({ icon: Icon, onSelect, children }: { icon: Icon; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-[0.8461rem] text-text-primary transition-colors hover:bg-surface-hover"
    >
      <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

/**
 * The menu under the pane's title, as Claude Desktop's artifact pane has one:
 * the things to do with the file shown, gathered behind the name so the header
 * itself stays light. What needs an account on claude.ai there (rename, share,
 * pin, delete) is not offered, since it cannot be done to a file on this machine.
 */
export function PaneMenu({ heading, path, name, source, publishedUrl, onReload }: PaneMenuProps) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape folds the menu first; the pane closes only on an Escape pressed with no menu open.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const run = (action: () => unknown) => () => {
    setOpen(false);
    const failed = (err: unknown) => {
      console.error('[FilePreviewPane] Menu action failed:', err);
      toast.error(i18n.t('chat:fileOpenFailed', { path }));
    };
    try {
      void Promise.resolve(action()).catch(failed);
    } catch (err) {
      failed(err);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-[0.9231rem] font-medium text-text-primary transition-colors hover:bg-surface-hover"
      >
        <span dir="ltr" className="truncate">{heading}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute start-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border-default bg-surface-overlay p-1.5 shadow-lg"
        >
          <div className="px-2.5 pb-1.5 pt-1">
            <div dir="ltr" className="truncate text-[0.8461rem] text-text-primary">{name}</div>
            <div dir="ltr" className="truncate text-[0.7692rem] text-text-tertiary">{path}</div>
          </div>
          <div className="my-1 border-t border-border-subtle" />
          <Item icon={ArrowDownTrayIcon} onSelect={run(async () => {
            if (!(await downloadSentFile(path, name))) toast.error(i18n.t('chat:sentFiles.downloadFailed'));
          })}>{t('filePreview.download')}</Item>
          {source !== undefined && (
            <Item icon={DocumentDuplicateIcon} onSelect={run(async () => {
              await navigator.clipboard.writeText(source);
              toast.success(i18n.t('chat:filePreview.copied'));
            })}>{t('filePreview.copySource')}</Item>
          )}
          <Item icon={ArrowPathIcon} onSelect={run(onReload)}>{t('filePreview.reload')}</Item>
          <div className="my-1 border-t border-border-subtle" />
          {publishedUrl && (
            <Item icon={ArrowTopRightOnSquareIcon} onSelect={run(() => getAdapter().openUrl(publishedUrl))}>{t('filePreview.openPublished')}</Item>
          )}
          <Item icon={CodeBracketIcon} onSelect={run(() => getAdapter().openFile(path))}>{t('filePreview.openInEditor')}</Item>
          <Item icon={ComputerDesktopIcon} onSelect={run(() => getAdapter().openFileWithSystemApp(path))}>{t('filePreview.openWithSystemApp')}</Item>
        </div>
      )}
    </div>
  );
}
