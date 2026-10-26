import { useRef, useState, type ReactNode } from 'react';
import Tippy from '@tippyjs/react/headless';
import type { Instance } from 'tippy.js';
import toast from 'react-hot-toast';
import { CheckIcon, ChevronRightIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { getAdapter } from '@/adapters';
import { getBridge } from '@/api/bridge/Bridge';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import { MessageType } from '@/shared';
import { paneIconButton } from './PaneShell';
import { useDefaultBrowser } from './useDefaultBrowser';

/** The sizes the page can be shown at, as the browser pane's "Viewport" offers: the pane's own width, or a device's. */
export const VIEWPORTS = [
  { id: 'responsive' },
  { id: 'mobile', width: 390, height: 844 },
  { id: 'tablet', width: 820, height: 1180 },
  { id: 'laptop', width: 1280, height: 800 },
  { id: 'desktop', width: 1440, height: 900 },
] as const;
export type ViewportId = (typeof VIEWPORTS)[number]['id'];

const ROW = 'flex w-full items-center gap-2 rounded-lg px-[calc(10px/var(--ui-zoom,1))] py-[calc(3px/var(--ui-zoom,1))] text-start text-[0.8461rem] leading-[calc(18px/var(--ui-zoom,1))]';
const RULE = <div className="my-[calc(4px/var(--ui-zoom,1))] border-t-[calc(1px/var(--ui-zoom,1))] border-border-default" />;

function Row({ children, trailing, checked, off, hint, danger, onSelect }: {
  children: ReactNode; trailing?: ReactNode; checked?: boolean;
  /** What the row does, said on hover. */
  hint?: string;
  /** Why the row cannot be used here; the row is dimmed and says it on hover. */
  off?: string;
  danger?: boolean; onSelect?: () => void;
}) {
  const role = checked === undefined ? 'menuitem' : 'menuitemcheckbox';
  const row = (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      aria-disabled={off !== undefined}
      onClick={off !== undefined ? undefined : onSelect}
      className={`${ROW} ${danger ? 'text-red-400' : 'text-text-primary'} ${off !== undefined ? 'cursor-not-allowed opacity-40' : 'hover:bg-[var(--surface-selected)]'}`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
      {checked && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
  const content = off !== undefined ? <span className="block max-w-[260px] whitespace-normal">{hint ? `${hint} ` : ''}{off}</span> : hint;
  return content ? <Tooltip desktop content={content} placement="left">{row}</Tooltip> : row;
}

interface Props {
  path: string;
  /** The address as the bar shows it. */
  address: string;
  viewport: ViewportId;
  onViewport: (next: ViewportId) => void;
  autoCheck: boolean;
  onAutoCheck: (next: boolean) => void;
  /** The annotation tools: shown, and the way to show or hide them. */
  annotating: boolean;
  onToggleAnnotate: () => void;
  annotateDisabled: boolean;
  /** Saves the page as shown as a picture. */
  onSaveScreenshot: () => Promise<void>;
  /** Open a file the reader picked, in a tab. */
  onOpenFile: (path: string) => void;
}

/**
 * The "⋮" menu of Claude Desktop's Browser pane, in its order: open in the browser, copy the address, save a
 * screenshot, open an HTML file; the viewport; the settings of the pane; cookies and browsing data. What
 * needs the browser engine Desktop draws this pane with (a screenshot, cookies, the sites Claude may act on)
 * is on the menu and dimmed, with the reason on hover, as the Artifact menu does for what it cannot do.
 */
export function BrowserMenu({ path, address, viewport, onViewport, autoCheck, onAutoCheck, onSaveScreenshot, annotating, onToggleAnnotate, annotateDisabled, onOpenFile }: Props) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const list = useRef<Instance | null>(null);
  const close = () => setOpen(false);
  const unavailable = t('filePreview.menu.unavailable');
  const browser = useDefaultBrowser();
  const hint = (key: string) => t(`filePreview.menu.hint.${key}`);

  const run = (action: () => unknown) => () => {
    close();
    try {
      void Promise.resolve(action()).catch(() => toast.error(t('filePreview.menu.failed')));
    } catch {
      toast.error(t('filePreview.menu.failed'));
    }
  };

  const shown = VIEWPORTS.find((v) => v.id === viewport) ?? VIEWPORTS[0];

  return (
    <Tippy
      // Controlled: opened by a click, closed by a press elsewhere; into <body>, so the pane's rounded card never clips it.
      visible={open}
      onClickOutside={(_, event) => {
        if (event.target instanceof Element && event.target.closest('[data-tippy-root]')) return;
        close();
      }}
      onHide={() => list.current?.hide()}
      interactive
      placement="bottom-end"
      offset={[0, 6]}
      appendTo={() => document.body}
      render={(attrs) => (
        <div role="menu" className="z-50 w-[calc(243px/var(--ui-zoom,1))] rounded-xl border border-border-default bg-surface-overlay px-1 py-[calc(4px/var(--ui-zoom,1))] text-text-primary shadow-lg" {...attrs}>
          <Row hint={hint('openInBrowser')} onSelect={run(() => getAdapter().openFileWithSystemApp(path))}>{browser ? t('filePreview.menu.openInBrowser', { browser }) : t('filePreview.menu.openInBrowserUnknown')}</Row>
          <Row hint={hint('copyUrl')} onSelect={run(async () => {
            await navigator.clipboard.writeText(address);
            toast.success(t('filePreview.menu.copied'));
          })}>{t('filePreview.menu.copyUrl')}</Row>
          <Row hint={hint('saveScreenshot')} onSelect={run(onSaveScreenshot)}>{t('filePreview.menu.saveScreenshot')}</Row>
          <Row hint={hint('annotate')} off={annotateDisabled ? unavailable : undefined} onSelect={run(onToggleAnnotate)}>{annotating ? t('filePreview.menu.hideAnnotate') : t('filePreview.menu.showAnnotate')}</Row>
          <Row hint={hint('openHtmlFile')} onSelect={run(async () => {
            const answer = (await getBridge().request(MessageType.PICK_FILES, { mode: 'files', multiple: false }, { timeout: null })) as { paths?: string[]; error?: string } | null;
            if (answer?.error) toast.error(answer.error);
            else if (answer?.paths?.[0]) onOpenFile(answer.paths[0]);
          })}>{t('filePreview.menu.openHtmlFile')}</Row>
          {RULE}
          <Tippy
            trigger="mouseenter focus click"
            interactive
            interactiveBorder={12}
            delay={[60, 160]}
            placement="left-start"
            offset={[-6, 4]}
            appendTo={() => document.body}
            onCreate={(instance) => { list.current = instance; }}
            render={(sub) => (
              <div role="menu" className="z-50 w-[calc(200px/var(--ui-zoom,1))] rounded-xl border border-border-default bg-surface-overlay px-1 py-[calc(4px/var(--ui-zoom,1))] text-text-primary shadow-lg" {...sub}>
                {VIEWPORTS.map((v) => (
                  <Row
                    key={v.id}
                    checked={viewport === v.id}
                    trailing={'width' in v ? <span className="text-text-tertiary">{v.width}×{v.height}</span> : undefined}
                    onSelect={run(() => onViewport(v.id))}
                  >
                    {t(`filePreview.viewport.${v.id}`)}
                  </Row>
                ))}
              </div>
            )}
          >
            <div>
              <Row hint={hint('viewport')} trailing={<span className="flex items-center gap-1 text-text-tertiary"><span>{t(`filePreview.viewport.${shown.id}`)}</span><ChevronRightIcon className="h-3.5 w-3.5" /></span>}>
                {t('filePreview.menu.viewport')}
              </Row>
            </div>
          </Tippy>
          {RULE}
          <Row checked hint={hint('openLinksBuiltIn')} off={unavailable}>{t('filePreview.menu.openLinksBuiltIn')}</Row>
          <Row checked hint={hint('autoOpenFiles')} off={unavailable}>{t('filePreview.menu.autoOpenFiles')}</Row>
          <Row checked={autoCheck} hint={hint('autoCheck')} onSelect={() => onAutoCheck(!autoCheck)}>{t('filePreview.menu.autoCheck')}</Row>
          <Row hint={hint('allowedSites')} off={unavailable}>{t('filePreview.menu.allowedSites')}</Row>
          {RULE}
          <div className="px-[calc(10px/var(--ui-zoom,1))] py-[calc(3px/var(--ui-zoom,1))] text-[0.7692rem] text-text-tertiary">{t('filePreview.menu.cookies')}</div>
          <Row hint={hint('importCookies')} off={unavailable}>{t('filePreview.menu.importCookies')}</Row>
          <Row hint={hint('keepCookies')} off={unavailable} trailing={<span className="flex items-center gap-1 text-text-tertiary"><span>{t('filePreview.menu.shared')}</span><ChevronRightIcon className="h-3.5 w-3.5" /></span>}>
            {t('filePreview.menu.keepCookies')}
          </Row>
          <Row danger hint={hint('clearData')} off={unavailable}>{t('filePreview.menu.clearData')}</Row>
        </div>
      )}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('filePreview.more')}
        onClick={() => setOpen((value) => !value)}
        className={`${paneIconButton} ${open ? '!opacity-100 bg-[color-mix(in_srgb,currentColor_12%,transparent)]' : ''}`}
      >
        <EllipsisVerticalIcon className="h-4 w-4" />
      </button>
    </Tippy>
  );
}
