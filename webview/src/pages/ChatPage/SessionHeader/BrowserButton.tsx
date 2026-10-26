import { useSyncExternalStore } from 'react';
import { useTranslation } from '@/i18n';
import { DesktopIcon } from '@/components/FilePreviewPane/DesktopIcon';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';

/** The globe Claude Desktop's Browser pane carries on its tabs, as the dock's browser icon. */
export function BrowserIcon({ className }: { className?: string }) {
  return <DesktopIcon name="Globe" className={className} />;
}

/**
 * Opens the Browser pane, on a new tab, or closes it when it is open. The ⋮ menu row does the same through
 * {@link filePreviewPaneStore.toggleBrowser}, so wherever it is clicked it behaves the same.
 */
export function BrowserButton() {
  const { t } = useTranslation('chat');
  const open = useSyncExternalStore(filePreviewPaneStore.subscribe, () => filePreviewPaneStore.get() !== null);

  return (
    <button
      onClick={() => filePreviewPaneStore.toggleBrowser()}
      aria-pressed={open}
      className="p-1 rounded transition-colors hover:bg-surface-hover"
      title={t('sessionHeader.browser.title')}
    >
      <BrowserIcon className={`w-5 h-5 ${open ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`} />
    </button>
  );
}
