import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelSection, PanelItem } from '@/types/commandPalette';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { APP_NAME } from '@/config/app';
import { PanelSectionComponent } from './PanelSectionComponent';

interface CommandPalettePanelProps {
  sections: PanelSection[];
  selectedSectionIndex: number;
  selectedItemIndex: number;
  /** Current slash-command filter text, forwarded so items can highlight matches. */
  filterQuery?: string;
  onItemClick: (sectionIndex: number, itemIndex: number) => void;
  onItemExecute: (item: PanelItem) => void;
  onClose: () => void;
}

export const CommandPalettePanel: React.FC<CommandPalettePanelProps> = ({
  sections,
  selectedSectionIndex,
  selectedItemIndex,
  filterQuery,
  onItemClick,
  onItemExecute,
  onClose,
}) => {
  const { t } = useTranslation('commandPalette');
  const panelRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const { pluginVersion, cliVersion, refresh: refreshVersion, isLoading: versionRefreshing } = useVersionInfo();

  // Clicking the version text re-queries the CLI version — same action as the
  // Settings › About refresh button (both hit the shared [GET_VERSION] query).
  const handleVersionRefresh = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (versionRefreshing) return;
    await refreshVersion();
  };

  // Auto-scroll selected item into view
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [selectedSectionIndex, selectedItemIndex]);

  // Click outside to close.
  //
  // The listener is attached a tick late on purpose. A mousedown elsewhere can
  // be what opens this panel in the first place: picking a file from the mention
  // dropdown settles the mention, which hands the shared slot back to the
  // command panel (issue #236) and mounts this component while that very
  // mousedown is still propagating. Attaching synchronously would let the panel
  // catch the click that created it, see a target outside itself, and close
  // immediately, so `/command @file ` lost its panel on a mouse pick while a
  // keyboard pick kept it (issue #373). Deferring puts the listener in place
  // only after the current event has finished dispatching.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className="slash-command-panel"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '0',
        marginBottom: '12px',
        width: 'calc(100%)',
        maxHeight: '320px',
        backgroundColor: 'var(--panel-bg, #252526)',
        borderRadius: 'var(--panel-radius, 6px)',
        boxShadow: 'var(--panel-shadow, 0 4px 12px rgba(0,0,0,0.3))',
        overflowY: 'auto',
        zIndex: 100,
        border: '1px solid var(--divider-color, #3c3c3c)',
      }}
    >
      {sections.map((section, sectionIndex) => (
        <PanelSectionComponent
          key={section.id}
          section={section}
          sectionIndex={sectionIndex}
          selectedSectionIndex={selectedSectionIndex}
          selectedItemIndex={selectedItemIndex}
          selectedItemRef={selectedItemRef}
          query={filterQuery}
          onItemClick={onItemClick}
          onItemExecute={onItemExecute}
        />
      ))}

      <div>
        {/* Mobile */}
        <div className="text-sm block xs:hidden px-3 pt-2 pb-3 -mt-2.5">
          <div className="flex items-center justify-between py-2">
            <button
                type="button"
                onClick={handleVersionRefresh}
                disabled={versionRefreshing}
                title={t('panel.refreshVersion')}
                className="text-text-secondary/80 hover:text-text-secondary hover:underline disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {`${APP_NAME} v${cliVersion}`}
            </button>

            <a className="text-text-tertiary underline hover:text-text-secondary" href="https://github.com/anthropics/claude-code/issues" target="_blank">
              {t('panel.reportProblem')}
            </a>
          </div>

          <div className="flex items-center justify-between py-2">
            <span className="text-text-secondary/80 leading-none">CCG v{pluginVersion}</span>
          </div>
        </div>

        {/* PC */}
        <div className=" text-[0.7rem] hidden xs:flex items-center justify-between px-3 pt-2 pb-3 -mt-2.5">
          <div className="flex items-center gap-3">
            <a className="text-text-tertiary underline hover:text-text-secondary" href="https://github.com/anthropics/claude-code/issues" target="_blank">
              {t('panel.reportProblem')}
            </a>
          </div>
          <div className="text-text-secondary/80">
            {cliVersion ? (
                <>
                  <span>{`v${pluginVersion} · `}</span>
                  {/* "Claude Code <version>" is the clickable unit — the plugin version
                  (left) doesn't change at runtime, so refetching it makes no sense. */}
                  <button
                      type="button"
                      onClick={handleVersionRefresh}
                      disabled={versionRefreshing}
                      title={t('panel.refreshVersion')}
                      className="hover:text-text-secondary hover:underline disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {`${APP_NAME} v${cliVersion}`}
                  </button>
                </>
            ) : (
                <span>{`v${pluginVersion}`}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
