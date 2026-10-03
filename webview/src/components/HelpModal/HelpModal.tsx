import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import { DEFAULT_HELP_TAB, HELP_TABS, type HelpTab } from './helpTabs';
import type { ShortcutContext } from './shortcutCatalog';

interface HelpModalProps {
  context: ShortcutContext;
  onClose: () => void;
}

/**
 * The help modal: a header, a tab bar, and the panel of the selected tab.
 *
 * The header and the tab bar stay put while the panel scrolls, so a long list
 * never pushes the close button out of reach.
 */
export function HelpModal(props: HelpModalProps) {
  const { context, onClose } = props;
  const { t } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<HelpTab>(DEFAULT_HELP_TAB);
  const dialogRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const tabId = (tab: HelpTab) => `${baseId}-tab-${tab}`;
  const panelId = (tab: HelpTab) => `${baseId}-panel-${tab}`;

  // Take focus into the dialog and give it back on close. The dialog itself is
  // focused rather than a field, so opening it types nothing into the composer
  // and a stray keystroke has nowhere to land. The chat input underneath
  // re-focuses itself on its own schedule, so focus is pulled back whenever it
  // wanders out while the dialog is open.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleFocusIn = (e: FocusEvent) => {
      const dialog = dialogRef.current;
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) {
        dialog.focus();
      }
    };
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Escape is taken in the capture phase so it closes this rather than reaching
  // the composer, which binds Escape for its own purposes.
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const index = HELP_TABS.findIndex((tab) => tab.id === activeTab);
    const next = HELP_TABS[(index + step + HELP_TABS.length) % HELP_TABS.length];
    setActiveTab(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  const active = HELP_TABS.find((tab) => tab.id === activeTab) ?? HELP_TABS[0];

  return (
    <Portal>
      <div
        data-testid="help-modal-scrim"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden outline-none"
        >
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4">
            <h2 id={titleId} className="text-md font-semibold text-text-primary">
              {t('helpModal.title')}
            </h2>
            <button
              type="button"
              aria-label={t('confirmDialog.close')}
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Tab bar */}
          <div
            role="tablist"
            aria-label={t('helpModal.tabsLabel')}
            className="flex-shrink-0 mx-4 mt-3 pb-1.5 flex items-center border-b-2 border-border-default"
          >
            {HELP_TABS.map((tab) => (
              <button
                key={tab.id}
                id={tabId(tab.id)}
                type="button"
                role="tab"
                aria-selected={tab.id === activeTab}
                aria-controls={panelId(tab.id)}
                tabIndex={tab.id === activeTab ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={handleTabKeyDown}
                className={`px-3 py-1.5 text-[0.8461rem] rounded-md font-medium transition-colors ${
                  tab.id === activeTab
                    ? 'text-text-primary bg-surface-tooltip/50'
                    : 'text-text-disabled hover:text-text-secondary'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div
            id={panelId(active.id)}
            role="tabpanel"
            aria-labelledby={tabId(active.id)}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-4"
          >
            <active.Panel context={context} />
          </div>
        </div>
      </div>
    </Portal>
  );
}
