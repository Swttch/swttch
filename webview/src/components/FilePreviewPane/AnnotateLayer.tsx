import { useEffect, useRef, useState } from 'react';
import { DesktopIcon } from './DesktopIcon';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { paneIconButton } from './PaneShell';

export type AnnotateTool = 'select' | 'pen' | 'shape' | 'text';
export type Shape = 'rectangle' | 'ellipse' | 'arrow';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffffff'];
const WIDTHS = [2, 3, 5, 8];

interface Props {
  /** The page's own clicks are used to pick an element, while the select tool is on. */
  onToolChange: (tool: AnnotateTool) => void;
  /** Sends the page with the marks over it to the chat; given the canvas the marks are drawn on. */
  onAddToChat: (marks: HTMLCanvasElement) => void;
  onExit: () => void;
}

/**
 * Claude Desktop's "Annotate": a bar floating at the bottom of the page (select, pen, shape, text, and
 * exit) and a layer over the page to draw on, "to show Claude what you mean". The marks are drawn over
 * the page and are not part of it. Desktop sends the drawing with a screenshot of the page; this panel
 * cannot capture the page it draws in a frame, so the marks stay here until the bar is closed.
 */
export function AnnotateLayer({ onToolChange, onAddToChat, onExit }: Props) {
  const { t } = useTranslation('chat');
  const [tool, setTool] = useState<AnnotateTool>('pen');
  const [shape, setShape] = useState<Shape>('rectangle');
  const [shapeMenu, setShapeMenu] = useState(false);
  const [ink, setInk] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [styleMenu, setStyleMenu] = useState<'color' | 'width' | null>(null);
  const [typing, setTyping] = useState<{ x: number; y: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ x: number; y: number; snapshot?: ImageData } | null>(null);

  useEffect(() => onToolChange(tool), [tool, onToolChange]);

  // The canvas has the layer's own size, in the pixels the reader sees.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const rect = el.parentElement?.getBoundingClientRect();
      if (rect && (el.width !== Math.round(rect.width) || el.height !== Math.round(rect.height))) {
        el.width = Math.round(rect.width);
        el.height = Math.round(rect.height);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, []);

  const point = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.current!.width, y: ((e.clientY - rect.top) / rect.height) * canvas.current!.height };
  };
  const context = () => {
    const ctx = canvas.current!.getContext('2d')!;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    return ctx;
  };

  const drawShape = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = context();
    ctx.beginPath();
    if (shape === 'rectangle') ctx.rect(from.x, from.y, to.x - from.x, to.y - from.y);
    else if (shape === 'ellipse') ctx.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);
    else {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - 14 * Math.cos(angle - Math.PI / 7), to.y - 14 * Math.sin(angle - Math.PI / 7));
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - 14 * Math.cos(angle + Math.PI / 7), to.y - 14 * Math.sin(angle + Math.PI / 7));
    }
    ctx.stroke();
  };

  const tools: Array<{ id: AnnotateTool; label: string; icon: React.ReactNode }> = [
    { id: 'select', label: t('filePreview.selectElement'), icon: <DesktopIcon name="Cursor" className="h-5 w-5" /> },
    { id: 'pen', label: t('filePreview.annotatePen'), icon: <DesktopIcon name="Edit" className="h-5 w-5" /> },
    { id: 'shape', label: t('filePreview.annotateShape'), icon: <DesktopIcon name="Shapes" className="h-5 w-5" /> },
    { id: 'text', label: t('filePreview.annotateText'), icon: <DesktopIcon name="TextT" className="h-5 w-5" /> },
  ];

  return (
    <>
      {tool !== 'select' && (
        <div className="absolute inset-0 z-10">
          <canvas
            ref={canvas}
            data-testid="annotate-canvas"
            className="h-full w-full touch-none cursor-crosshair"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = point(e);
              if (tool === 'text') {
                setTyping(p);
                return;
              }
              const ctx = context();
              drawing.current = { ...p, snapshot: tool === 'shape' ? ctx.getImageData(0, 0, canvas.current!.width, canvas.current!.height) : undefined };
              if (tool === 'pen') {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
              }
            }}
            onPointerMove={(e) => {
              const start = drawing.current;
              if (!start || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const p = point(e);
              if (tool === 'pen') {
                const ctx = context();
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
              } else if (tool === 'shape' && start.snapshot) {
                canvas.current!.getContext('2d')!.putImageData(start.snapshot, 0, 0);
                drawShape(start, p);
              }
            }}
            onPointerUp={(e) => {
              drawing.current = null;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
          />
          {typing && (
            <input
              autoFocus
              aria-label={t('filePreview.annotateText')}
              className="absolute min-w-[6rem] rounded border bg-white/90 px-1 text-[0.9231rem] outline-none"
              style={{ color: ink, borderColor: ink, left: `${(typing.x / (canvas.current?.width ?? 1)) * 100}%`, top: `${(typing.y / (canvas.current?.height ?? 1)) * 100}%` }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const ctx = context();
                  ctx.font = '16px sans-serif';
                  ctx.fillText(e.currentTarget.value, typing.x, typing.y + 14);
                  setTyping(null);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setTyping(null);
                }
              }}
              onBlur={() => setTyping(null)}
            />
          )}
        </div>
      )}
      <div
        role="toolbar"
        aria-label={t('filePreview.annotate')}
        className="absolute bottom-[calc(14px/var(--ui-zoom,1))] left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-border-default bg-[#1f1f1f] p-[calc(4px/var(--ui-zoom,1))] text-white shadow-lg"
      >
        {tools.map(({ id, label, icon }) => (
          <div key={id} className="relative flex items-center">
            <Tooltip desktop content={label} placement="top">
              <button
                type="button"
                aria-label={label}
                aria-pressed={tool === id}
                className={`${paneIconButton} ${tool === id ? '!opacity-100 bg-white/20' : ''}`}
                onClick={() => {
                  setTool(id);
                  setShapeMenu(false);
                }}
              >
                {icon}
              </button>
            </Tooltip>
            {id === 'shape' && (
              <>
                <button
                  type="button"
                  aria-label={t('filePreview.annotateShapes')}
                  aria-expanded={shapeMenu}
                  className="-ms-1 flex h-7 w-4 items-center justify-center opacity-70 hover:opacity-100"
                  onClick={() => setShapeMenu((value) => !value)}
                >
                  <DesktopIcon name="CaretDown" className="h-3 w-3" />
                </button>
                {shapeMenu && (
                  <div role="menu" className="absolute bottom-full start-0 mb-2 w-36 rounded-xl border border-border-default bg-[#1f1f1f] p-1 text-[0.8461rem] shadow-lg">
                    {(['rectangle', 'ellipse', 'arrow'] as const).map((id2) => (
                      <button
                        key={id2}
                        type="button"
                        role="menuitemradio"
                        aria-checked={shape === id2}
                        className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-start hover:bg-white/15"
                        onClick={() => {
                          setShape(id2);
                          setTool('shape');
                          setShapeMenu(false);
                        }}
                      >
                        {t(`filePreview.shape.${id2}`)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-white/25" />
        <div className="relative flex items-center">
          <button
            type="button"
            aria-label={t('filePreview.annotateColor')}
            aria-expanded={styleMenu === 'color'}
            className="flex h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/15"
            onClick={() => setStyleMenu((v) => (v === 'color' ? null : 'color'))}
          >
            <span className="h-4 w-4 rounded-full border border-white/40" style={{ background: ink }} />
            <DesktopIcon name="CaretDown" className="h-3 w-3 opacity-70" />
          </button>
          {styleMenu === 'color' && (
            <div role="menu" className="absolute bottom-full start-0 mb-2 flex gap-1.5 rounded-xl border border-border-default bg-[#1f1f1f] p-2 shadow-lg">
              {COLORS.map((c) => (
                <button key={c} type="button" role="menuitemradio" aria-checked={ink === c} aria-label={c} className="h-5 w-5 rounded-full border border-white/40" style={{ background: c, outline: ink === c ? '2px solid white' : undefined, outlineOffset: 1 }} onClick={() => { setInk(c); setStyleMenu(null); }} />
              ))}
            </div>
          )}
        </div>
        <div className="relative flex items-center">
          <button
            type="button"
            aria-label={t('filePreview.annotateWidth')}
            aria-expanded={styleMenu === 'width'}
            className="flex h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/15"
            onClick={() => setStyleMenu((v) => (v === 'width' ? null : 'width'))}
          >
            <span className="w-4 rounded-full bg-white" style={{ height: lineWidth }} />
            <DesktopIcon name="CaretDown" className="h-3 w-3 opacity-70" />
          </button>
          {styleMenu === 'width' && (
            <div role="menu" className="absolute bottom-full start-0 mb-2 flex w-16 flex-col gap-2 rounded-xl border border-border-default bg-[#1f1f1f] p-2.5 shadow-lg">
              {WIDTHS.map((w) => (
                <button key={w} type="button" role="menuitemradio" aria-checked={lineWidth === w} aria-label={`${w}px`} className="flex h-3 items-center rounded hover:bg-white/15" onClick={() => { setLineWidth(w); setStyleMenu(null); }}>
                  <span className="w-full rounded-full bg-white" style={{ height: w }} />
                </button>
              ))}
            </div>
          )}
        </div>
        <span aria-hidden className="mx-1 h-4 w-px bg-white/25" />
        <button
          type="button"
          className="h-7 rounded-lg bg-white px-3 text-[0.8461rem] font-medium text-black hover:bg-white/85"
          onClick={() => canvas.current && onAddToChat(canvas.current)}
        >
          {t('filePreview.annotateAddToChat')}
        </button>
        <Tooltip desktop content={t('filePreview.annotateExit')} placement="top">
          <button type="button" aria-label={t('filePreview.annotateExit')} className={paneIconButton} onClick={onExit}>
            <DesktopIcon name="X" className="h-5 w-5" />
          </button>
        </Tooltip>
      </div>
    </>
  );
}
