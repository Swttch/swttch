import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  XMarkIcon,
  TrashIcon,
  MinusIcon,
  ChatBubbleLeftEllipsisIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import { Tooltip } from '@/components/Tooltip';
import { SideQuestionStatus, type SideQuestionExchange } from '@/contexts/SideQuestionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatFooterHeight } from '@/pages/ChatPage/chatFooter';
import { Exchange } from './Exchange';
import { SideQuestionComposer } from './SideQuestionComposer';
import {
  ResizeEdge,
  MAXIMIZED_MARGIN_PX,
  MINIMIZED_SIZE_PX,
  defaultRect,
  maximizedRect,
  minimizedRect,
  moveRect,
  resizeRect,
  clampRect,
  type Rect,
  type Size,
} from './windowGeometry';

/** How long a size change glides. Off while the pointer holds the window. */
const GLIDE_MS = 200;
/** Gap between the parked button and the top of the chat input. */
const MINIMIZED_BOTTOM_GAP_PX = 8;
/** Width of the invisible probe that measures the interface zoom. */
const PROBE_SIZE_PX = 100;

type Drag = 'move' | ResizeEdge;

const HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: ResizeEdge.North, className: '-top-1 left-3 right-3 h-2 cursor-ns-resize' },
  { edge: ResizeEdge.South, className: '-bottom-1 left-3 right-3 h-2 cursor-ns-resize' },
  { edge: ResizeEdge.East, className: '-right-1 top-3 bottom-3 w-2 cursor-ew-resize' },
  { edge: ResizeEdge.West, className: '-left-1 top-3 bottom-3 w-2 cursor-ew-resize' },
  { edge: ResizeEdge.NorthEast, className: '-top-1 -right-1 w-4 h-4 cursor-nesw-resize' },
  { edge: ResizeEdge.NorthWest, className: '-top-1 -left-1 w-4 h-4 cursor-nwse-resize' },
  { edge: ResizeEdge.SouthEast, className: '-bottom-1 -right-1 w-4 h-4 cursor-nwse-resize' },
  { edge: ResizeEdge.SouthWest, className: '-bottom-1 -left-1 w-4 h-4 cursor-nesw-resize' },
];

const CURSOR_BY_DRAG: Record<Drag, string> = {
  move: 'move',
  [ResizeEdge.North]: 'ns-resize',
  [ResizeEdge.South]: 'ns-resize',
  [ResizeEdge.East]: 'ew-resize',
  [ResizeEdge.West]: 'ew-resize',
  [ResizeEdge.NorthEast]: 'nesw-resize',
  [ResizeEdge.SouthWest]: 'nesw-resize',
  [ResizeEdge.NorthWest]: 'nwse-resize',
  [ResizeEdge.SouthEast]: 'nwse-resize',
};

interface Environment {
  /** Device pixels per layout pixel: the interface zoom. */
  scale: number;
  /** What 1rem measures, in layout pixels. */
  rem: number;
  /** The window's size in layout pixels, which is what the frame is positioned in. */
  viewport: Size;
}

/**
 * The interface zoom is applied as a CSS `zoom` on the root, so a pixel of
 * layout is `scale` pixels of pointer coordinates. Reading it off a 100px probe
 * works whichever way the browser resolves `zoom`, where reading
 * `style.zoom` would only work for the way it is set.
 */
function measureEnvironment(probe: HTMLElement | null): Environment {
  const probeWidth = probe?.getBoundingClientRect().width ?? 0;
  const scale = probeWidth > 0 ? probeWidth / PROBE_SIZE_PX : 1;
  const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return {
    scale,
    rem: Number.isFinite(rootFont) && rootFont > 0 ? rootFont : MAXIMIZED_MARGIN_PX,
    viewport: { width: window.innerWidth / scale, height: window.innerHeight / scale },
  };
}

interface Props {
  /** Exchanges of the session on screen, oldest first. */
  exchanges: SideQuestionExchange[];
  /** Parked as a floating button in the corner instead of shown in full. */
  isMinimized: boolean;
  /** An answer settled while the window was parked. */
  hasUnseen: boolean;
  onClose: () => void;
  onClear: () => void;
  onMinimize: () => void;
  onRestore: () => void;
}

/**
 * The side-question window: a floating window over the chat, not a modal. The
 * person keeps working in the chat behind it, so there is no scrim to click
 * through and Escape only counts while the window has focus.
 *
 * It can be dragged by its title bar, resized from any edge or corner,
 * maximized (1rem from every side of the window), and parked as a button above the
 * chat input. Maximize and minimize are the same frame moving to a different
 * rect, which is what lets a CSS transition animate them.
 */
export function SideQuestionWindow(props: Props) {
  const { exchanges, isMinimized, hasUnseen, onClose, onClear, onMinimize, onRestore } = props;
  const { t } = useTranslation('chat');
  const { runControlRequestCommand } = useChatStreamContext();
  const { inputMode } = useSessionContext();
  const footerHeight = useChatFooterHeight();

  const frameRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [env, setEnv] = useState<Environment>(() => measureEnvironment(null));
  const [rect, setRect] = useState<Rect>(() => defaultRect(env.viewport, env.rem));
  const [isMaximized, setIsMaximized] = useState(false);
  const [dragging, setDragging] = useState<Drag | null>(null);
  const dragRef = useRef<{ kind: Drag; startX: number; startY: number; startRect: Rect; scale: number } | null>(null);

  // Measure the zoom before the first paint, so the window never flashes at the
  // wrong size, and again whenever the window itself is resized.
  useLayoutEffect(() => {
    const next = measureEnvironment(probeRef.current);
    setEnv(next);
    setRect(defaultRect(next.viewport, next.rem));
  }, []);
  useEffect(() => {
    const onResize = () => {
      const next = measureEnvironment(probeRef.current);
      setEnv(next);
      setRect((r) => clampRect(r, next.viewport));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The editor gets focus on open so a shortcut press can go straight into
  // typing, and again when the window comes back from the corner. Focus goes
  // back to where it was when the window closes.
  useEffect(() => {
    if (isMinimized) return;
    (editorRef.current ?? frameRef.current)?.focus();
  }, [isMinimized]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  // Follow the newest exchange, but to its TOP: an answer arrives whole, and
  // scrolling to the bottom of a long one would leave its first lines above the
  // fold with nothing to say there is more above.
  const lastKey = exchanges.length
    ? `${exchanges[exchanges.length - 1].requestId}:${exchanges[exchanges.length - 1].status}`
    : '';
  useEffect(() => {
    const list = scrollRef.current;
    const newest = list?.lastElementChild as HTMLElement | null;
    if (!list || !newest) return;
    const padding = parseFloat(getComputedStyle(list).paddingTop) || 0;
    list.scrollTop = Math.max(0, newest.offsetTop - padding);
  }, [lastKey]);

  // A drag is always computed from where it started plus how far the pointer has
  // travelled in total, so the window sits under the pointer however fast it moves.
  const begin = useCallback(
    (e: ReactPointerEvent<HTMLElement>, kind: Drag) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const fresh = measureEnvironment(probeRef.current);
      setEnv(fresh);
      if (typeof e.pointerId === 'number') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is a nicety: the window listeners below still see every move.
        }
      }
      dragRef.current = { kind, startX: e.clientX, startY: e.clientY, startRect: rect, scale: fresh.scale };
      setDragging(kind);
    },
    [rect],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / drag.scale;
      const dy = (e.clientY - drag.startY) / drag.scale;
      const viewport = { width: window.innerWidth / drag.scale, height: window.innerHeight / drag.scale };
      setRect(
        drag.kind === 'move'
          ? moveRect(drag.startRect, dx, dy, viewport)
          : resizeRect(drag.startRect, drag.kind, dx, dy, viewport),
      );
    };
    const onEnd = () => {
      dragRef.current = null;
      setDragging(null);
    };

    // The pointer strays off a thin handle constantly; without this it selects
    // the text it passes over and shows the cursor of whatever is underneath.
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = CURSOR_BY_DRAG[dragging];

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('blur', onEnd);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('blur', onEnd);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragging]);

  const send = (question: string) => runControlRequestCommand(`/btw ${question}`, inputMode);

  const bottomLine = env.viewport.height - footerHeight / env.scale - MINIMIZED_BOTTOM_GAP_PX;
  const target = isMinimized
    ? minimizedRect(env.viewport, bottomLine, env.rem)
    : isMaximized
      ? maximizedRect(env.viewport, env.rem)
      : rect;

  const canMoveAndResize = !isMinimized && !isMaximized;
  const isWaiting = exchanges.some((e) => e.status === SideQuestionStatus.Pending);

  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (canMoveAndResize) begin(e, 'move');
  };
  const onHeaderDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsMaximized((v) => !v);
  };

  const iconButton = 'w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:bg-gray-500/50 transition-colors';

  return (
    <Portal>
      <div
        ref={probeRef}
        aria-hidden="true"
        style={{ position: 'fixed', left: 0, top: 0, width: PROBE_SIZE_PX, height: 0, visibility: 'hidden', pointerEvents: 'none' }}
      />
      <div
        ref={frameRef}
        role="dialog"
        aria-modal="false"
        aria-label={t('sideQuestion.title')}
        tabIndex={-1}
        className="fixed z-50 focus:outline-none"
        style={{
          left: target.left,
          top: target.top,
          width: target.width,
          height: target.height,
          transition: dragging
            ? 'none'
            : ['left', 'top', 'width', 'height'].map((p) => `${p} ${GLIDE_MS}ms ease`).join(', '),
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isMinimized) {
            // The chat uses Escape too (to stop the agent); inside this window it belongs to the window.
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div
          data-window-panel
          aria-hidden={isMinimized}
          className="h-full bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col"
          // Fades out as the frame shrinks to the button, and is hidden for good
          // once that glide is over, so the parked editor cannot take focus or typing.
          style={{
            opacity: isMinimized ? 0 : 1,
            visibility: isMinimized ? 'hidden' : 'visible',
            transition: `opacity ${GLIDE_MS}ms ease, visibility 0s linear ${isMinimized ? GLIDE_MS : 0}ms`,
          }}
        >
          <div
            data-window-header
            onPointerDown={onHeaderPointerDown}
            onDoubleClick={onHeaderDoubleClick}
            className={`flex items-start justify-between gap-2 px-4 pt-4 pb-3 flex-shrink-0 border-b border-border-subtle select-none touch-none ${
              canMoveAndResize ? 'cursor-move' : ''
            }`}
          >
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-text-primary truncate">{t('sideQuestion.title')}</h2>
              <div className="text-[0.8461rem] text-text-tertiary">{t('sideQuestion.subtitle')}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {exchanges.length > 0 && (
                <Tooltip content={t('sideQuestion.clear')}>
                  <button onClick={onClear} aria-label={t('sideQuestion.clear')} className={iconButton}>
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </Tooltip>
              )}
              <Tooltip content={t('sideQuestion.minimize')}>
                <button onClick={onMinimize} aria-label={t('sideQuestion.minimize')} className={iconButton}>
                  <MinusIcon className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip content={isMaximized ? t('sideQuestion.restoreSize') : t('sideQuestion.maximize')}>
                <button
                  onClick={() => setIsMaximized((v) => !v)}
                  aria-label={isMaximized ? t('sideQuestion.restoreSize') : t('sideQuestion.maximize')}
                  className={iconButton}
                >
                  {isMaximized ? <ArrowsPointingInIcon className="w-4 h-4" /> : <ArrowsPointingOutIcon className="w-4 h-4" />}
                </button>
              </Tooltip>
              <Tooltip content={t('sideQuestion.close')}>
                <button onClick={onClose} aria-label={t('sideQuestion.close')} className={iconButton}>
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div data-window-body className="flex-1 min-h-0 flex flex-col">
            {/* `relative` makes this the offset parent, so each exchange's offsetTop is measured inside the list. */}
            <div ref={scrollRef} className="relative flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
              {exchanges.length === 0 ? (
                <div className="text-text-primary/50 text-[0.9230rem] text-center mt-8">{t('sideQuestion.empty')}</div>
              ) : (
                exchanges.map((exchange) => <Exchange key={exchange.requestId} exchange={exchange} />)
              )}
            </div>

            <div className="shrink-0 px-3 pb-3 pt-1">
              <SideQuestionComposer inputMode={inputMode} onSend={send} editorRef={editorRef} />
              {isWaiting && <span className="sr-only">{t('sideQuestion.thinking')}</span>}
            </div>
          </div>
        </div>

        {/* Parked: just the speech bubble. Clicking it opens the window; hovering
            names it and shows a small X that closes it for good. */}
        {isMinimized && (
          <div className="group absolute right-0 bottom-0" style={{ width: MINIMIZED_SIZE_PX, height: MINIMIZED_SIZE_PX }}>
            <Tooltip content={t('sideQuestion.title')}>
              <button
                onClick={onRestore}
                aria-label={t('sideQuestion.open')}
                className="w-full h-full rounded-full bg-surface-raised border border-border-default shadow-2xl flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <ChatBubbleLeftEllipsisIcon className="w-5 h-5" />
              </button>
            </Tooltip>
            {/* The status dot and the X share one corner: the dot gives way to the X on hover. */}
            {hasUnseen ? (
              <span
                aria-label={t('sideQuestion.newAnswer')}
                className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-accent-primary pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0"
              />
            ) : (
              isWaiting && (
                <span
                  aria-label={t('sideQuestion.thinking')}
                  className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-text-tertiary animate-pulse pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0"
                />
              )
            )}
            <button
              onClick={onClose}
              aria-label={t('sideQuestion.close')}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-raised border border-border-default shadow flex items-center justify-center text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          </div>
        )}

        {canMoveAndResize &&
          HANDLES.map(({ edge, className }) => (
            <div
              key={edge}
              data-resize-edge={edge}
              onPointerDown={(e) => begin(e, edge)}
              className={`absolute z-10 touch-none ${className}`}
            />
          ))}
      </div>
    </Portal>
  );
}
