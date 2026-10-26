import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Tippy from '@tippyjs/react/headless';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { DesktopIcon, ShapeIcon, type DesktopIconName } from './DesktopIcon';

export type AnnotateTool = 'select' | 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'step' | 'text';
type DrawTool = Exclude<AnnotateTool, 'select'>;

const DRAW_TOOLS: DrawTool[] = ['pen', 'line', 'arrow', 'rect', 'ellipse', 'text', 'step'];
const SHAPE_TOOLS: DrawTool[] = ['line', 'arrow', 'rect', 'ellipse', 'step'];
const COLORS = ['#E03131', '#1971C2', '#2F9E44', '#1F1E1D', '#FFFFFF'] as const;
const COLOR_KEYS = ['red', 'blue', 'green', 'black', 'white'] as const;
const WIDTHS = [2, 4, 8, 12] as const;
const WIDTH_KEYS = ['thin', 'medium', 'thick', 'extraThick'] as const;

interface Stroke {
  tool: DrawTool;
  color: string;
  width: number;
  /** A pen's path; the two corners of a line, arrow, rectangle or ellipse; the place of a step or a text. */
  points: Array<{ x: number; y: number }>;
  text?: string;
  step?: number;
}

// Claude Desktop's annotation bar, measured on its own: a 30px dark bar with a 1px border, 24px square buttons,
// and three layouts by the width it has (all tools, the tools folded into one menu, and the minimum).
const BAR = '#1f1e1d';
const BORDER = '#363534';
const INK = '#efeeeb';
const DIM = '#8e8d8b';
const PRESSED_BG = '#142238';
const PRESSED_INK = '#7396d4';
const HOVER = 'rgba(255,255,255,0.08)';

/** A length in the page's pixels, whatever the app's zoom is. */
const z = (n: number): string => `calc(${n}px/var(--ui-zoom,1))`;

type Layout = 'full' | 'compact' | 'minimal';

interface MenuItemSpec {
  key: string;
  label: string;
  leading?: ReactNode;
  checked?: boolean;
  /** Said at the side of the item on hover, for items that show only a picture. */
  hint?: string;
  onSelect: () => void;
}

function Chip({ fill, square }: { fill: string; square?: boolean }) {
  const light = fill === '#FFFFFF' || fill === '#1F1E1D';
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        width: z(14),
        height: z(14),
        borderRadius: square ? z(3) : '9999px',
        background: fill,
        boxShadow: `0 0 0 ${z(1)} ${light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'}`,
      }}
    />
  );
}

function WidthChip({ width }: { width: number }) {
  return <span aria-hidden style={{ display: 'block', width: z(20), height: `calc(${width}px/var(--ui-zoom,1))`, borderRadius: '9999px', background: 'currentColor' }} />;
}

function Icon({ name, size = 16, style }: { name: DesktopIconName; size?: number; style?: CSSProperties }) {
  return <DesktopIcon name={name} style={{ width: z(size), height: z(size), flex: 'none', ...style }} />;
}

function ToolIcon({ tool }: { tool: AnnotateTool }) {
  switch (tool) {
    case 'select':
      return <Icon name="CursorFilled" />;
    case 'pen':
      return <Icon name="Edit" />;
    case 'line':
      return <Icon name="LineSegment" />;
    case 'arrow':
      return <Icon name="ArrowLine" />;
    case 'text':
      return <Icon name="TextT" />;
    case 'rect':
    case 'ellipse':
    case 'step':
      return <ShapeIcon name={tool} style={{ width: z(16), height: z(16), flex: 'none' }} />;
  }
}

const buttonBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: z(24),
  borderRadius: z(6),
  border: 0,
  background: 'transparent',
  color: INK,
  cursor: 'default',
  flex: 'none',
};

/** A square ghost button with an icon, as the bar's tools are; pressed means the tool is armed. */
function IconButton({ label, tip, pressed, disabled, onClick, children, width = 24 }: {
  label: string;
  tip?: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  width?: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Tooltip desktop content={tip ?? label} placement="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          ...buttonBase,
          width: z(width),
          background: pressed ? PRESSED_BG : hover && !disabled ? HOVER : 'transparent',
          color: pressed ? PRESSED_INK : INK,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function Separator() {
  return <span aria-hidden style={{ width: z(1), height: z(16), background: BORDER, flex: 'none' }} />;
}

/** Empty room between two parts of the bar, in the pixels Desktop's bar leaves (measured). */
function Sp({ w }: { w: number }) {
  return <span aria-hidden style={{ width: z(w), flex: 'none' }} />;
}

/** A menu that opens above the bar: the item list, with a check on the one chosen. */
function Menu({ label, trigger, items, open, onOpen, tip, disabled, pressed, align = 'top-start', groups }: {
  label: string;
  trigger: ReactNode;
  items?: MenuItemSpec[];
  open: boolean;
  onOpen: (next: boolean) => void;
  tip?: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  align?: 'top-start' | 'top';
  /** Several lists with a rule between them, and submenus. */
  groups?: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  // A click inside the page is in another document, so it never reaches the click-outside check below; the
  // window losing focus to that page is what tells the menu to close.
  useEffect(() => {
    if (!open) return;
    const close = () => onOpen(false);
    window.addEventListener('blur', close);
    return () => window.removeEventListener('blur', close);
  }, [open, onOpen]);
  return (
    <Tippy
      visible={open}
      interactive
      placement={align}
      offset={[0, 8]}
      appendTo={() => document.body}
      onClickOutside={(_, event) => {
        if (event.target instanceof Element && event.target.closest('[data-tippy-root]')) return;
        onOpen(false);
      }}
      render={(attrs) => (
        <div
          role="menu"
          aria-label={label}
          {...attrs}
          style={{
            zIndex: 60,
            background: BAR,
            border: `${z(1)} solid ${BORDER}`,
            borderRadius: z(10),
            padding: z(4),
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            color: INK,
            font: `${z(13)}/${z(18)} system-ui, sans-serif`,
            minWidth: z(items?.some((i) => i.leading && !i.label) ? 40 : 150),
          }}
        >
          {groups ?? items?.map((item) => <MenuItem key={item.key} item={item} />)}
        </div>
      )}
    >
      <span style={{ display: 'flex' }}>
        <Tooltip desktop content={tip ?? label} placement="top">
          <button
            type="button"
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => onOpen(!open)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              ...buttonBase,
              gap: z(4),
              paddingLeft: z(5),
              paddingRight: z(6),
              background: pressed ? PRESSED_BG : open || (hover && !disabled) ? HOVER : 'transparent',
              color: pressed ? PRESSED_INK : INK,
              opacity: disabled ? 0.45 : 1,
            }}
          >
            {trigger}
            <Icon name="CaretDown" size={12} style={{ color: DIM }} />
          </button>
        </Tooltip>
      </span>
    </Tippy>
  );
}

function MenuItem({ item }: { item: MenuItemSpec }) {
  const [hover, setHover] = useState(false);
  const row = (
    <button
      type="button"
      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={item.checked}
      aria-label={item.label || item.hint}
      onClick={item.onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: z(8),
        width: '100%',
        height: z(28),
        padding: `0 ${z(8)}`,
        border: 0,
        borderRadius: z(6),
        background: hover ? HOVER : 'transparent',
        color: INK,
        textAlign: 'start',
        cursor: 'default',
      }}
    >
      {item.leading}
      {item.label && <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>}
      {item.checked && <Icon name="Check" size={14} style={{ marginInlineStart: z(8) }} />}
    </button>
  );
  return item.hint ? (
    <Tooltip desktop content={item.hint} placement="right">
      {row}
    </Tooltip>
  ) : (
    row
  );
}

interface BarProps {
  picking: boolean;
  tool: AnnotateTool;
  onToolChange: (tool: AnnotateTool) => void;
  onTogglePick: () => void;
  color: string;
  onColorChange: (color: string) => void;
  width: number;
  onWidthChange: (width: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  hasStrokes: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onAddToChat: () => void;
  onClose: () => void;
}

/**
 * Claude Desktop's annotation bar, floating at the bottom of the page. It has the room it has: with enough, every
 * tool is a button; with less, the tools fold into one menu; with the least, the colour and the line width go into
 * that menu too and "Add to chat" is only a plus. The layout is decided by measuring the bar in the layouts and
 * the room, as Desktop does.
 */
function AnnotationBar(props: BarProps) {
  const { t } = useTranslation('chat');
  const { picking, tool, onToolChange, onTogglePick, color, onColorChange, width, onWidthChange } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>('full');
  const widths = useRef({ full: 0, compact: 0 });
  const [menu, setMenu] = useState<'tool' | 'shape' | 'color' | 'width' | null>(null);
  const [shape, setShape] = useState<DrawTool>('rect');
  const [nested, setNested] = useState<'color' | 'width' | null>(null);

  const hasMarks = props.hasStrokes || props.canUndo || props.canRedo;

  const decide = useCallback(() => {
    const el = inner.current;
    const room = wrap.current?.clientWidth;
    if (!el || !room) return;
    // The bar's own width, whatever room there is: its borders, and what is in it at its natural size.
    const natural = el.offsetWidth + 2;
    if (layout === 'full') widths.current.full = natural;
    else if (layout === 'compact') widths.current.compact = natural;
    const next: Layout = widths.current.full <= room ? 'full' : widths.current.compact <= room ? 'compact' : 'minimal';
    if (next !== layout) setLayout(next);
  }, [layout]);

  useLayoutEffect(decide);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(decide);
    observer.observe(el);
    return () => observer.disconnect();
  }, [decide]);
  // What is on the bar changes its widths, so what was measured is measured again.
  useEffect(() => {
    widths.current = { full: 0, compact: 0 };
    setLayout('full');
  }, [hasMarks]);

  const label = (tl: AnnotateTool) => t(`filePreview.tool.${tl}`);
  const pick = (tl: AnnotateTool) => {
    setMenu(null);
    setNested(null);
    // Choosing a tool ends picking an element: the two are one choice, as in the menu's check mark.
    if (picking) onTogglePick();
    onToolChange(tool === tl ? 'select' : tl);
  };
  const pickShape = (tl: DrawTool) => {
    setShape(tl);
    setMenu(null);
    if (picking) onTogglePick();
    onToolChange(tl);
  };

  const colorItems: MenuItemSpec[] = COLORS.map((c, i) => ({
    key: c,
    label: '',
    hint: t(`filePreview.color.${COLOR_KEYS[i]}`),
    leading: <Chip fill={c} />,
    checked: c === color,
    onSelect: () => {
      onColorChange(c);
      setMenu(null);
      setNested(null);
    },
  }));
  const widthItems: MenuItemSpec[] = WIDTHS.map((w, i) => ({
    key: String(w),
    label: '',
    hint: t(`filePreview.width.${WIDTH_KEYS[i]}`),
    leading: <WidthChip width={w} />,
    checked: w === width,
    onSelect: () => {
      onWidthChange(w);
      setMenu(null);
      setNested(null);
    },
  }));
  const colorName = t(`filePreview.color.${COLOR_KEYS[COLORS.indexOf(color as (typeof COLORS)[number])] ?? 'red'}`);
  const widthName = t(`filePreview.width.${WIDTH_KEYS[WIDTHS.indexOf(width as (typeof WIDTHS)[number])] ?? 'medium'}`);

  const leading = (
    <IconButton label={t('filePreview.selectElement')} pressed={picking} onClick={onTogglePick}>
      <Icon name="Cursor" />
    </IconButton>
  );

  const toolItems: MenuItemSpec[] = [
    { key: 'pick', label: t('filePreview.selectElement'), leading: <Icon name="Cursor" />, checked: picking, onSelect: () => { setMenu(null); onTogglePick(); } },
    ...DRAW_TOOLS.map((tl) => ({
      key: tl,
      label: label(tl),
      leading: <ToolIcon tool={tl} />,
      checked: tool === tl,
      onSelect: () => pick(tl),
    })),
  ];

  const colorTrigger = <Chip fill={color} />;
  const widthTrigger = <WidthChip width={width} />;

  const tools =
    layout === 'full' ? (
      <>
        {leading}
        <Sp w={6} />
        <IconButton label={label('pen')} pressed={tool === 'pen'} onClick={() => pick('pen')}>
          <ToolIcon tool="pen" />
        </IconButton>
        <Sp w={8.5} />
        <Menu
          label={t('filePreview.shapes')}
          tip={t('filePreview.shapes')}
          trigger={<ToolIcon tool={shape} />}
          pressed={SHAPE_TOOLS.includes(tool as DrawTool) && tool === shape}
         
          open={menu === 'shape'}
          onOpen={(o) => setMenu(o ? 'shape' : null)}
          items={SHAPE_TOOLS.map((tl) => ({ key: tl, label: label(tl), leading: <ToolIcon tool={tl} />, checked: tool === tl, onSelect: () => pickShape(tl) }))}
        />
        <Sp w={8.5} />
        <IconButton label={label('text')} pressed={tool === 'text'} onClick={() => pick('text')}>
          <ToolIcon tool="text" />
        </IconButton>
      </>
    ) : (
      <Menu
        label={t('filePreview.annotationTool')}
        tip={t('filePreview.annotationTool')}
        trigger={picking ? <Icon name="Cursor" /> : <ToolIcon tool={tool} />}
        pressed={false}
        open={menu === 'tool'}
        onOpen={(o) => { setMenu(o ? 'tool' : null); setNested(null); }}
        groups={
          <>
            {toolItems.map((item) => <MenuItem key={item.key} item={item} />)}
            {layout === 'minimal' && (
              <>
                <div style={{ height: z(1), background: BORDER, margin: `${z(4)} 0` }} />
                <NestedMenu label={t('filePreview.inkColor')} hint={colorName} leading={colorTrigger} open={nested === 'color'} onOpen={(o) => setNested(o ? 'color' : null)} items={colorItems} />
                <NestedMenu label={t('filePreview.lineWidth')} hint={widthName} leading={widthTrigger} open={nested === 'width'} onOpen={(o) => setNested(o ? 'width' : null)} items={widthItems} />
              </>
            )}
          </>
        }
      />
    );

  return (
    <div ref={wrap} style={{ position: 'absolute', left: z(10), right: z(10), bottom: z(10), display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 20 }}>
      <div
        ref={bar}
        role="toolbar"
        aria-label={t('filePreview.annotate')}
        data-layout={layout}
        style={{
          pointerEvents: 'auto',
          boxSizing: 'border-box',
          maxWidth: '100%',
          overflow: 'hidden',
          border: `${z(1)} solid ${BORDER}`,
          borderRadius: z(12),
          background: BAR,
          color: INK,
          boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
          font: `${z(13)}/${z(18)} system-ui, sans-serif`,
        }}
      >
        <div
          ref={inner}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: 'max-content',
            height: z(30),
            paddingLeft: z(layout === 'full' ? 6 : 9),
            paddingRight: z(5.5),
          }}
        >
        <div role="group" aria-label={t('filePreview.annotationTool')} style={{ display: 'flex', alignItems: 'center' }}>
          {tools}
        </div>
        {layout !== 'minimal' && (
          <>
            <Sp w={layout === 'full' ? 6 : 8} />
            <Separator />
            <Sp w={9} />
            <Menu
              label={t('filePreview.inkColor')}
              tip={colorName}
              trigger={colorTrigger}
             
              open={menu === 'color'}
              onOpen={(o) => setMenu(o ? 'color' : null)}
              items={colorItems}
            />
            <Sp w={11} />
            <Menu
              label={t('filePreview.lineWidth')}
              tip={widthName}
              trigger={widthTrigger}
             
              open={menu === 'width'}
              onOpen={(o) => setMenu(o ? 'width' : null)}
              items={widthItems}
            />
            <Sp w={8} />
            <Separator />
          </>
        )}
        {layout === 'minimal' && (
          <>
            <Sp w={8} />
            <Separator />
          </>
        )}
        <Sp w={7} />
        {hasMarks && (
          <>
            <IconButton label={t('filePreview.undo')} disabled={!props.canUndo} onClick={props.onUndo}>
              <Icon name="ArrowCounterClockwise" />
            </IconButton>
            <IconButton label={t('filePreview.redo')} disabled={!props.canRedo} onClick={props.onRedo}>
              <Icon name="ArrowClockwise" />
            </IconButton>
            <IconButton label={t('filePreview.clearAll')} disabled={!props.hasStrokes} onClick={props.onClear}>
              <Icon name="Trash" />
            </IconButton>
            <Sp w={4} />
          </>
        )}
        <Tooltip desktop content={props.hasStrokes ? t('filePreview.annotateAddToChat') : t('filePreview.selectElementDetail')} placement="top">
          <span style={{ display: 'flex' }}>
            <button
              type="button"
              aria-label={t('filePreview.annotateAddToChat')}
              disabled={!props.hasStrokes}
              onClick={props.onAddToChat}
              style={{
                ...buttonBase,
                height: z(23),
                marginTop: z(1),
                width: layout === 'minimal' ? z(23) : undefined,
                padding: layout === 'minimal' ? 0 : `0 ${z(7.5)}`,
                background: INK,
                color: BAR,
                whiteSpace: 'nowrap',
                opacity: props.hasStrokes ? 1 : 0.3,
              }}
            >
              {layout === 'minimal' ? <Icon name="Add" /> : t('filePreview.annotateAddToChat')}
            </button>
          </span>
        </Tooltip>
        <Sp w={layout === 'full' ? 6 : layout === 'compact' ? 5.25 : 6.5} />
        <IconButton label={t('filePreview.annotateExit')} onClick={props.onClose}>
          <Icon name="X" />
        </IconButton>
        </div>
      </div>
    </div>
  );
}

function NestedMenu({ label, hint, leading, open, onOpen, items }: {
  label: string;
  hint: string;
  leading: ReactNode;
  open: boolean;
  onOpen: (open: boolean) => void;
  items: MenuItemSpec[];
}) {
  const [hover, setHover] = useState(false);
  return (
    <Tippy
      visible={open}
      interactive
      placement="right-start"
      offset={[0, 6]}
      appendTo={() => document.body}
      render={(attrs) => (
        <div role="menu" aria-label={label} {...attrs} style={{ zIndex: 61, background: BAR, border: `${z(1)} solid ${BORDER}`, borderRadius: z(10), padding: z(4), minWidth: z(40), color: INK, boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
          {items.map((item) => <MenuItem key={item.key} item={item} />)}
        </div>
      )}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
        onMouseEnter={() => { setHover(true); onOpen(true); }}
        onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', alignItems: 'center', gap: z(8), width: '100%', height: z(28), padding: `0 ${z(8)}`, border: 0, borderRadius: z(6), background: hover || open ? HOVER : 'transparent', color: INK, textAlign: 'start', cursor: 'default' }}
      >
        {leading}
        <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ color: DIM, whiteSpace: 'nowrap' }}>{hint}</span>
        <Icon name="CaretDown" size={12} style={{ color: DIM, transform: 'rotate(-90deg)' }} />
      </button>
    </Tippy>
  );
}

interface Props {
  /** The reader is pointing at an element on the page; drawing waits. */
  picking: boolean;
  onTogglePick: () => void;
  /** Sends the page with the marks over it to the chat; given the canvas the marks are drawn on. */
  onAddToChat: (marks: HTMLCanvasElement) => void;
  onClose: () => void;
}

/**
 * Claude Desktop's annotation tools over a page: the bar, and a layer to draw on. The marks are strokes kept in a
 * list, so undo, redo and clear are what they say; they are drawn over the page and are not part of it.
 */
export function AnnotateLayer({ picking, onTogglePick, onAddToChat, onClose }: Props) {
  const { t } = useTranslation('chat');
  const [tool, setTool] = useState<AnnotateTool>('select');
  const [color, setColor] = useState<string>(COLORS[0]);
  const [width, setWidth] = useState<number>(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undone, setUndone] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Stroke | null>(null);
  const [typing, setTyping] = useState<{ x: number; y: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // The canvas has the layer's own size, in the pixels the reader sees.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const rect = el.parentElement?.getBoundingClientRect();
      if (rect && (el.width !== Math.round(rect.width) || el.height !== Math.round(rect.height))) {
        el.width = Math.round(rect.width);
        el.height = Math.round(rect.height);
        redraw();
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redraw = useCallback(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    for (const stroke of live ? [...strokes, live] : strokes) drawStroke(ctx, stroke);
  }, [strokes, live]);
  useEffect(redraw, [redraw]);

  const drawing = !picking && tool !== 'select';
  const point = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.current!.width, y: ((e.clientY - rect.top) / rect.height) * canvas.current!.height };
  };
  const commit = (stroke: Stroke) => {
    setStrokes((list) => [...list, stroke]);
    setUndone([]);
  };
  const nextStep = () => strokes.filter((s) => s.tool === 'step').length + 1;

  return (
    <>
      {drawing && (
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
              if (tool === 'step') {
                commit({ tool, color, width, points: [p], step: nextStep() });
                return;
              }
              setLive({ tool: tool as DrawTool, color, width, points: [p] });
            }}
            onPointerMove={(e) => {
              if (!live || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const p = point(e);
              setLive((s) => (s ? { ...s, points: s.tool === 'pen' ? [...s.points, p] : [s.points[0], p] } : s));
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              if (live && live.points.length > 1) commit(live);
              setLive(null);
            }}
          />
          {typing && (
            <input
              autoFocus
              aria-label={t('filePreview.tool.text')}
              className="absolute min-w-[6rem] rounded border bg-white/90 px-1 text-[0.9231rem] outline-none"
              style={{ color, borderColor: color, left: `${(typing.x / (canvas.current?.width ?? 1)) * 100}%`, top: `${(typing.y / (canvas.current?.height ?? 1)) * 100}%` }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value !== '') {
                  commit({ tool: 'text', color, width, points: [typing], text: e.currentTarget.value });
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
      {/* The marks stay drawn while another tool is picked, so the canvas is kept even when nothing is being drawn. */}
      {!drawing && <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 z-10 h-full w-full" />}
      <AnnotationBar
        picking={picking}
        tool={tool}
        onToolChange={setTool}
        onTogglePick={onTogglePick}
        color={color}
        onColorChange={setColor}
        width={width}
        onWidthChange={setWidth}
        canUndo={strokes.length > 0}
        canRedo={undone.length > 0}
        hasStrokes={strokes.length > 0}
        onUndo={() => {
          const last = strokes[strokes.length - 1];
          if (!last) return;
          setStrokes(strokes.slice(0, -1));
          setUndone((list) => [...list, last]);
        }}
        onRedo={() => {
          const last = undone[undone.length - 1];
          if (!last) return;
          setUndone(undone.slice(0, -1));
          setStrokes((list) => [...list, last]);
        }}
        onClear={() => {
          setStrokes([]);
          setUndone([]);
        }}
        onAddToChat={() => canvas.current && onAddToChat(canvas.current)}
        onClose={onClose}
      />
    </>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke): void {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const [a, b] = [s.points[0], s.points[s.points.length - 1]];
  ctx.beginPath();
  switch (s.tool) {
    case 'pen':
      ctx.moveTo(a.x, a.y);
      for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
      break;
    case 'line':
    case 'arrow': {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (s.tool === 'arrow') {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const head = 10 + s.width * 1.5;
        for (const turn of [-Math.PI / 7, Math.PI / 7]) {
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - head * Math.cos(angle + turn), b.y - head * Math.sin(angle + turn));
        }
      }
      break;
    }
    case 'rect':
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      break;
    case 'ellipse':
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      break;
    case 'step': {
      ctx.arc(a.x, a.y, 12 + s.width, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.color === '#FFFFFF' ? '#1F1E1D' : '#FFFFFF';
      ctx.font = `600 ${12 + s.width}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(s.step ?? 1), a.x, a.y + 1);
      ctx.restore();
      return;
    }
    case 'text':
      ctx.font = `${14 + s.width * 2}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(s.text ?? '', a.x, a.y);
      ctx.restore();
      return;
  }
  ctx.stroke();
  ctx.restore();
}
