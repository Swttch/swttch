import { useState, type ComponentType } from 'react';
import Tippy from '@tippyjs/react/headless';
import { ArrowTopRightOnSquareIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { CenterViewIcon, FullPageViewIcon, SideViewIcon } from './PlacementIcons';

/** How much of a run is shown. `simple` is the short one. */
export type RunVariant = 'simple' | 'full';

/** Where a run opens: beside the chat, over it, as the page, or in a tab of its own. */
export type RunPlacement = 'side' | 'center' | 'page' | 'tab';

/**
 * The icon button the title row's controls and its close button share. The
 * same padding, colour and hover as the icons of the dock in the session
 * header (`p-1` around a `w-5 h-5` glyph), so a run window's icons are the size
 * of the ones the dock already has. Used with a `w-5 h-5` icon inside.
 */
export const TITLE_ICON_BUTTON_CLASS =
  'p-1 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0';
const ICON_BUTTON_CLASS = TITLE_ICON_BUTTON_CLASS;

/**
 * The word button that flips between the short and the detailed view.
 *
 * Worded as the view it goes TO, not the one it is in: the label of "Pin to
 * dock" is the pin it would do, and this reads the same way.
 */
export function RunVariantToggle(props: { variant: RunVariant; onChange: (variant: RunVariant) => void }) {
  const { variant, onChange } = props;
  const { t } = useTranslation('chat');
  const isSimple = variant === 'simple';

  return (
    <button
      type="button"
      onClick={() => onChange(isSimple ? 'full' : 'simple')}
      className="px-1.5 text-xs font-medium text-accent-claude transition-opacity hover:opacity-80 shrink-0"
    >
      {t(isSimple ? 'backgroundTasks.viewFull' : 'backgroundTasks.viewSimple')}
    </button>
  );
}

/** Opens this run in a browser tab of its own. */
export function OpenInNewTabButton(props: { onClick: () => void }) {
  const { t } = useTranslation('chat');
  const label = t('backgroundTasks.openInNewTab');

  return (
    <Tooltip content={label} placement="top">
      <button type="button" onClick={props.onClick} aria-label={label} className={ICON_BUTTON_CLASS}>
        <ArrowTopRightOnSquareIcon className="w-5 h-5" />
      </button>
    </Tooltip>
  );
}

const PLACEMENTS: { value: RunPlacement; labelKey: string; Icon: ComponentType<{ className?: string }> }[] = [
  { value: 'side', labelKey: 'backgroundTasks.placementSide', Icon: SideViewIcon },
  { value: 'center', labelKey: 'backgroundTasks.placementCenter', Icon: CenterViewIcon },
  { value: 'page', labelKey: 'backgroundTasks.placementPage', Icon: FullPageViewIcon },
  // The glyph of the title row's open-in-new-tab button, so the same act reads
  // the same in both places.
  { value: 'tab', labelKey: 'backgroundTasks.placementTab', Icon: ArrowTopRightOnSquareIcon },
];

/**
 * The button that picks where this run opens, and the menu under it.
 *
 * The button wears the glyph of the placement it is in now; the menu lists the
 * four and ticks that one. A menu opened by a click, so Tippy is told when it
 * is open rather than deciding for itself, and it goes into `<body>` so the
 * window it hangs from, which clips what spills past it, cannot cut it off.
 */
export function RunPlacementMenu(props: { placement: RunPlacement; onSelect?: (placement: RunPlacement) => void }) {
  const { placement, onSelect } = props;
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const label = t('backgroundTasks.viewOptions');
  const Current = PLACEMENTS.find((p) => p.value === placement)?.Icon ?? CenterViewIcon;

  return (
    <Tippy
      visible={open}
      onClickOutside={() => setOpen(false)}
      interactive
      placement="bottom-end"
      offset={[0, 4]}
      appendTo={() => document.body}
      render={(attrs) => (
        <div
          role="menu"
          className="min-w-[11rem] p-1 bg-surface-raised border border-border-default rounded-lg shadow-xl z-50"
          {...attrs}
        >
          {PLACEMENTS.map(({ value, labelKey, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === placement}
              onClick={() => {
                setOpen(false);
                onSelect?.(value);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-start text-sm text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <Icon className="w-5 h-5 shrink-0 text-text-secondary" />
              <span className="flex-1">{t(labelKey)}</span>
              {value === placement && <CheckIcon className="w-4 h-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    >
      {/* `Tooltip` rather than a `title` attribute: native tooltips do not
          render in the JCEF WebView, so a `title` would label the button in the
          browser and nowhere in the IDE. */}
      <span className="flex shrink-0">
        <Tooltip content={label} placement="top">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={label}
            className={ICON_BUTTON_CLASS}
          >
            <Current className="w-5 h-5" />
          </button>
        </Tooltip>
      </span>
    </Tippy>
  );
}

/**
 * The controls of a run window's title row, in their order: the short or detailed view, a tab of its own, and where
 * the run opens. A subagent and a workflow share them, so the two windows cannot drift apart. Each is drawn only when
 * its handler is given; nothing is drawn when none is.
 */
export function RunViewActions(props: {
  variant: RunVariant;
  onVariantChange?: (variant: RunVariant) => void;
  onOpenInNewTab?: () => void;
  placement?: RunPlacement;
  onPlacementChange?: (placement: RunPlacement) => void;
}) {
  const { variant, onVariantChange, onOpenInNewTab, placement, onPlacementChange } = props;
  if (!onVariantChange && !onOpenInNewTab && !placement) return null;
  return (
    <>
      {onVariantChange && <RunVariantToggle variant={variant} onChange={onVariantChange} />}
      {onOpenInNewTab && <OpenInNewTabButton onClick={onOpenInNewTab} />}
      {placement && <RunPlacementMenu placement={placement} onSelect={onPlacementChange} />}
    </>
  );
}
