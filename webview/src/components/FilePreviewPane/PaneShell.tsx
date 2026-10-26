import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { Tooltip } from '@/components/Tooltip';
import { isMac } from '@/config/environment';
import { ExpandIcon, FoldIcon } from './PaneIcons';
import { MIN_PANE_WIDTH, maxPaneWidth, useIsWide, usePaneWidth } from './usePaneColumn';

/** The keys that close the pane, as the close button's tooltip writes them. */
const CLOSE_SHORTCUT_LABEL = (): string => (isMac() ? '⌘\\' : 'Ctrl+\\');

/** A square icon button of the pane's header and toolbar. */
export const paneIconButton =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] hover:opacity-100';

interface PaneShellProps {
  /** What the pane is called to a screen reader. */
  label: string;
  /** The card's own colour, when the page inside paints one (so no other colour shows at its rounded edge). */
  cardStyle?: CSSProperties;
  /** The left of the top row; the expand and close buttons are drawn after it. */
  header: ReactNode;
  /** A row under the top row, when the pane has one (a browser's address bar). */
  toolbar?: ReactNode;
  /** What fills the card. */
  children: ReactNode;
  /** Things that belong to the pane but are not in the card (a dialog). */
  outside?: ReactNode;
}

/**
 * What the Artifact pane and the Browser pane have in common, as Claude Desktop draws both: a rounded
 * card set in from the window's edge, beside the chat (or over it in a narrow window, or over all of it
 * when expanded), a top row with expand and close, the handle that sets its width, and Escape and ⌘\ to
 * close. What goes in the top row, whether there is a row under it, and what fills the card are the
 * panes' own (they are separate panes with their own specs).
 */
export function PaneShell({ label, cardStyle, header, toolbar, children, outside }: PaneShellProps) {
  const { t } = useTranslation('chat');
  const expanded = useSyncExternalStore(filePreviewPaneStore.subscribe, filePreviewPaneStore.isExpanded);
  const wide = useIsWide();
  const paneWidth = usePaneWidth(wide);
  const asideRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startWidth: number; scale: number } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') filePreviewPaneStore.close();
      // ⌘\ (Ctrl+\ elsewhere), the shortcut Claude Desktop's pane names on its close button.
      if (e.key === '\\' && (isMac() ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        filePreviewPaneStore.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <aside
        ref={asideRef}
        role="complementary"
        aria-label={label}
        // A rounded card set in from the window's edge, as Claude Desktop's is, rather than a slab against it.
        className="fixed bottom-2 end-2 top-2 z-40 flex flex-col overflow-hidden rounded-[calc(12px/var(--ui-zoom,1))] border border-border-default bg-surface-raised text-text-primary shadow-lg"
        // Beside the chat it takes its own column; in a window too narrow for two columns it floats over the chat, and expanded it covers it.
        style={{ width: expanded ? 'calc(100% - 1rem)' : paneWidth, ...cardStyle }}
      >
        {/* As thick as Claude Desktop's header (33px) and as close to the card's edges (3px), whatever the UI zoom: screen pixels, divided by it to land on the page's own. */}
        <header className="flex h-[calc(33px/var(--ui-zoom,1))] shrink-0 items-center gap-0.5 bg-surface-raised px-[calc(3px/var(--ui-zoom,1))] text-text-primary">
          <div className="min-w-0 flex-1">{header}</div>
          <Tooltip desktop content={expanded ? t('filePreview.collapse') : t('filePreview.expand')} placement="bottom">
            <button type="button" aria-label={expanded ? t('filePreview.collapse') : t('filePreview.expand')} className={paneIconButton}
              onClick={() => filePreviewPaneStore.toggleExpanded()}>
              {expanded ? <FoldIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
            </button>
          </Tooltip>
          <Tooltip desktop content={t('filePreview.close')} shortcut={CLOSE_SHORTCUT_LABEL()} placement="bottom">
            <button type="button" aria-label={t('filePreview.close')} className={paneIconButton}
              onClick={() => filePreviewPaneStore.close()}>
              <XMarkIcon className="h-4 w-4" />
            </button>
          </Tooltip>
        </header>

        {toolbar}

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto">{children}</div>
      </aside>
      {!expanded && (
        // Claude Desktop's handle: no line along the card, only a short pill in the gutter beside it, drawn while the pointer is on the
        // grip or dragging. It sits outside the card (which clips what is inside it), so it is a sibling placed from the card's own width.
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('filePreview.resize')}
          className="group/resize fixed bottom-2 top-2 z-40 w-[calc(20px/var(--ui-zoom,1))] cursor-col-resize touch-none"
          style={{ right: `calc(0.5rem + ${paneWidth} - 4px / var(--ui-zoom, 1))` }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            // Measured from where the drag began, in screen pixels: the pointer reports them, and the
            // stored width is kept in them too, so it does not change with the UI zoom.
            const aside = asideRef.current;
            const startWidth = aside?.offsetWidth ?? 0;
            const scale = aside && startWidth > 0 ? aside.getBoundingClientRect().width / startWidth : 1;
            drag.current = { startX: e.clientX, startWidth, scale: scale > 0 ? scale : 1 };
          }}
          onPointerMove={(e) => {
            const start = drag.current;
            if (!start || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const next = start.startWidth * start.scale + (start.startX - e.clientX);
            const max = maxPaneWidth(window.innerWidth, wide);
            filePreviewPaneStore.setWidth(Math.round(Math.min(max, Math.max(MIN_PANE_WIDTH, next))));
          }}
          onPointerUp={(e) => {
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onDoubleClick={() => filePreviewPaneStore.setWidth(null)}
        >
          <div className="absolute start-1/2 top-1/2 h-[calc(42px/var(--ui-zoom,1))] w-[calc(3px/var(--ui-zoom,1))] -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition-colors group-hover/resize:bg-text-primary/35 group-active/resize:bg-text-primary/50" />
        </div>
      )}
      {outside}
    </>
  );
}
