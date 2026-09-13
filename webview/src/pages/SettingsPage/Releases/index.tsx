import { useState, useMemo } from 'react';
import { ArrowPathIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { usePluginUpdates } from '@/hooks/usePluginUpdates';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';
import {
  sanitizeReleaseHtml,
  formatReleaseDate,
  extractTitle,
  stripTitle,
} from '@/utils/releaseNotesHtml';

function ReleasesSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-raised rounded-lg border border-border-default p-4">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 bg-surface-overlay rounded animate-pulse" />
            <div className="h-5 w-16 bg-surface-overlay rounded animate-pulse" />
            <div className="h-4 w-48 bg-surface-overlay rounded animate-pulse" />
            <div className="h-4 w-32 bg-surface-overlay rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ReleaseAccordionProps {
  update: { id: number; version: string; notes: string; cdate: string | number };
  isCurrent: boolean;
  defaultOpen: boolean;
}

function ReleaseAccordion(props: ReleaseAccordionProps) {
  const { update, isCurrent, defaultOpen } = props;
  const { t } = useTranslation('settings');
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const title = extractTitle(update.notes);
  const rawBody = stripTitle(update.notes);
  const body = useMemo(() => rawBody ? sanitizeReleaseHtml(rawBody) : '', [rawBody]);

  return (
    <div className="bg-surface-raised rounded-lg border border-border-default">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex flex-col gap-1 px-4 py-3 text-start hover:bg-surface-hover transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 w-full">
          <ChevronRightIcon
            // Collapsed: points toward reading-forward direction (right in LTR, left in
            // RTL via rtl:-scale-x-100). Expanded: always points down. Tailwind composes
            // transforms as rotate() then scaleX(), so under RTL the mirrored coordinate
            // frame needs the rotation sign flipped too (rtl:-rotate-90) to still land on
            // "down" instead of "up" once combined with the mirror.
            className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform rtl:-scale-x-100 ${isOpen ? 'rotate-90 rtl:-rotate-90' : ''}`}
          />
          <span className="text-sm font-semibold text-text-primary shrink-0">
            v{update.version}
          </span>
          <span className="text-xs text-text-tertiary shrink-0 ms-auto">
            {formatReleaseDate(update.cdate, t('releases.unknownDate'))}
          </span>
          {isCurrent && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-surface-tooltip text-text-secondary shrink-0">
              {t('releases.current')}
            </span>
          )}
        </div>
        {title && (
          <span className="text-sm text-text-secondary ps-6">{title}</span>
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 ps-10">
          {body ? (
            <div
              // No @tailwindcss/typography plugin is installed, so `prose` would be
              // a dead class — every block element's spacing/markers are set
              // explicitly here instead (Tailwind preflight resets h*/ul/ol/p).
              className="text-sm text-text-secondary max-w-none
                [&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-text-primary
                [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-text-primary
                [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary
                [&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0
                [&_p]:my-2
                [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5
                [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5
                [&_li]:my-1
                [&_a]:text-text-link [&_a:hover]:underline
                [&_strong]:font-semibold [&_strong]:text-text-primary
                [&_code]:text-xs [&_code]:bg-surface-overlay [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
              dangerouslySetInnerHTML={{ __html: body }}
            />
          ) : (
            <p className="text-sm text-text-disabled italic">{t('releases.noNotes')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ReleasesSettings() {
  const { t } = useTranslation('settings');
  const { updates, isLoading, error, refresh } = usePluginUpdates();
  const { pluginVersion, requiresRestart } = useVersionInfo();
  const { send } = useBridgeContext();

  const latestUpdate = updates[0];
  const hasNewVersion =
    latestUpdate != null && latestUpdate.version !== pluginVersion;

  const handleUpdate = () => {
    send(MessageType.UPDATE_PLUGIN, {});
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-text-primary">{t('releases.title')}</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">v{pluginVersion}</span>
          {hasNewVersion && (
            <div className="flex flex-col items-end gap-1">
              {requiresRestart && <span className="text-xs text-text-secondary">{t('releases.restartRequired')}</span>}
              <button
                onClick={handleUpdate}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-accent-primary-hover hover:bg-accent-primary text-text-primary transition-colors"
              >
                {t('releases.updateButton', { version: latestUpdate.version })}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-state-error-bg border border-state-error-border rounded-lg text-sm text-state-error-fg">
          {error}
        </div>
      )}

      {isLoading && updates.length === 0 ? (
        <ReleasesSkeleton />
      ) : updates.length > 0 ? (
        <div className="space-y-2">
          {updates.map((update, index) => (
            <ReleaseAccordion
              key={update.id}
              update={update}
              isCurrent={update.version === pluginVersion}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      ) : !isLoading ? (
        <p className="text-sm text-text-tertiary">{t('releases.empty')}</p>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-text-tertiary mt-4">
        <button
          onClick={refresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-surface-hover transition-colors disabled:opacity-50"
          title={t('releases.refresh')}
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
