import { useEffect, useRef, useState, type ComponentType } from 'react';
import Tippy from '@tippyjs/react/headless';
import { ArrowTopRightOnSquareIcon, CheckIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
// The solid glyph, not the outline one: its three dots are filled and bigger, so they stay visible at this size.
import { EllipsisHorizontalIcon } from '@heroicons/react/24/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { PinIcon } from '@/components/FilePreviewPane/PaneIcons';
import { useRunViewPlacement } from '@/hooks/useRunViewPlacement';
import { CenterViewIcon, FullPageViewIcon, SideViewIcon } from './PlacementIcons';

/** How much of a run is shown. `simple` is the short one. */
export type RunVariant = 'simple' | 'full';

/** Where a run opens: beside the chat, over it, as the page, or in a tab of its own. */
export type RunPlacement = 'side' | 'center' | 'page' | 'tab';

/**
 * Where a run view is drawn, which decides how its title row looks: `modal` is the window over the chat, `panel` is
 * the Background tasks side panel, and `page` is a page of its own. One title row serves all three; this is how it
 * tells which one it is in.
 */
export type RunSurface = 'modal' | 'panel' | 'page';

/** How much of the title row's controls have gone into the "More" menu: 0 none, 1 the detailed-view switch, 2 the place menu too, 3 all. */
export type RunTitleLevel = 0 | 1 | 2 | 3;

export function runTitleLevelFor(width: number): RunTitleLevel {
  if (width >= 420) return 0;
  if (width >= 380) return 1;
  if (width >= 320) return 2;
  return 3;
}

/**
 * Whether the run is drawn in the panel's form (the panel's own row and tighter body, the controls in one "More"
 * menu). The side panel and a page are; only the window over the chat is not.
 */
export function isCompactSurface(surface: RunSurface): boolean {
  return surface !== 'modal';
}

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
 * The header row of the Background tasks panel, for its list and for a run shown in it: as high as the session's top
 * bar (its `py-1` around a 30px icon button) and with the same `px-2` at the sides, so the two bars read as one line
 * across the window.
 */
export const SIDE_PANEL_HEADER_CLASS = 'flex h-[2.39rem] shrink-0 items-center justify-between gap-1 px-2';

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

/** The button that takes this run to the other view it is offered, named and drawn as that view. */
function AlternativeViewButton(props: { label: string; Icon: ComponentType<{ className?: string }>; onClick: () => void }) {
  const { label, Icon, onClick } = props;
  return (
    <Tooltip content={label} placement="top">
      <button type="button" onClick={onClick} aria-label={label} className={ICON_BUTTON_CLASS}>
        <Icon className="w-5 h-5" />
      </button>
    </Tooltip>
  );
}

/**
 * Where the button beside the place menu takes a run: its alternative view, which depends on where the run is. From the
 * window and from the side panel it is a tab of its own; from a page (or a tab), back to the side panel.
 */
export function alternativeViewOf(placement: RunPlacement | undefined): 'tab' | 'side' {
  return placement === 'page' || placement === 'tab' ? 'side' : 'tab';
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
 * The button wears one glyph wherever the run is, so the title row looks the same in the window, the page and the
 * tab; the menu lists the four places and ticks the one in use. A menu opened by a click, so Tippy is told when it
 * is open rather than deciding for itself, and it goes into `<body>` so the
 * window it hangs from, which clips what spills past it, cannot cut it off.
 */
export function RunPlacementMenu(props: { placement: RunPlacement; onSelect?: (placement: RunPlacement) => void }) {
  const { placement, onSelect } = props;
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const label = t('backgroundTasks.viewOptions');

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
            <PlacementRow
              key={value}
              value={value}
              label={t(labelKey)}
              Icon={Icon}
              selected={value === placement}
              onSelect={() => {
                setOpen(false);
                onSelect?.(value);
              }}
            />
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
            <CenterViewIcon className="w-5 h-5" />
          </button>
        </Tooltip>
      </span>
    </Tippy>
  );
}

const RUN_SUBMENU_ATTRIBUTE = 'data-run-submenu';

const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-start text-sm text-text-primary hover:bg-surface-hover transition-colors cursor-pointer';

/**
 * One place a run can open in, in the view options menu: its icon and name, and at the end of the row the mark that
 * says what is true of it.
 *
 * - The tick marks the place this run is in now, and the solid pin the place pinned as the default for the project.
 *   Where a row is both, the tick shows.
 * - While the pointer is on the row the mark is the pin whatever else it was: outline when the place is not the
 *   default yet (it brightens under the pointer, with "Set as default" over it), solid when it is. Pressing the outline
 *   pin pins the place, for the project. It is a button of its own inside the row, so pressing it does not also pick
 *   the place.
 *
 * Without a place to keep the pin in (a view drawn on its own) the row has the tick alone.
 */
function PlacementRow(props: {
  value: RunPlacement;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  selected: boolean;
  onSelect: () => void;
}) {
  const { value, label, Icon, selected, onSelect } = props;
  const { t } = useTranslation('chat');
  const { pinned, pin, unpin } = useRunViewPlacement();
  const isPinned = pinned === value;
  // What pressing the pin does: pin the place when it is not the default, take the pin off when it is.
  const pinLabel = isPinned ? t('artifactMenu.unpin') : t('backgroundTasks.setAsDefault');

  return (
    // A row, not a button: the pin is a button, and a button inside a button is not allowed.
    <div
      role="menuitemradio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group ${MENU_ITEM_CLASS}`}
    >
      <Icon className="w-5 h-5 shrink-0 text-text-secondary" />
      <span className="flex-1">{label}</span>
      {pin ? (
        <>
          {/* At rest: the tick if it is the place in use, else the solid pin if it is the default, else nothing. */}
          {selected ? (
            <CheckIcon className="w-4 h-4 shrink-0 group-hover:hidden" />
          ) : isPinned ? (
            <PinIcon solid className="w-4 h-4 shrink-0 text-text-secondary group-hover:hidden" />
          ) : null}
          {/* Under the pointer: the pin, whatever it was at rest. */}
          <Tooltip content={pinLabel} placement="top">
            <button
              type="button"
              aria-label={pinLabel}
              aria-pressed={isPinned}
              data-testid={`pin-${value}`}
              onClick={(event) => {
                event.stopPropagation();
                if (isPinned) unpin?.();
                else pin(value);
              }}
              className="hidden shrink-0 group-hover:flex text-text-tertiary hover:text-text-primary transition-colors"
            >
              <PinIcon solid={isPinned} className="w-4 h-4" />
            </button>
          </Tooltip>
        </>
      ) : (
        selected && <CheckIcon className="w-4 h-4 shrink-0" />
      )}
    </div>
  );
}

/**
 * The "More" button and its dropdown: the same controls as {@link RunViewActions} lays out in a row (the short or
 * detailed view, and where the run opens), as rows of the menu under the button; where it opens is a second menu beside
 * its row. The tab of its own is one of those places, so it has no row of its own here. For the side panel, whose
 * title row is too narrow to lay the controls out.
 */
export function RunActionsMenu(props: {
  variant: RunVariant;
  onVariantChange?: (variant: RunVariant) => void;
  placement?: RunPlacement;
  onPlacementChange?: (placement: RunPlacement) => void;
}) {
  const { variant, onVariantChange, placement, onPlacementChange } = props;
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  // The second level follows the pointer: it opens when the pointer is on its row and closes when the pointer is on
  // neither the row nor the menu. The pause lets the pointer cross from one to the other without the menu going.
  const subCloseTimer = useRef<ReturnType<typeof setTimeout>>();
  const showSub = () => {
    clearTimeout(subCloseTimer.current);
    setSubOpen(true);
  };
  const hideSubSoon = () => {
    clearTimeout(subCloseTimer.current);
    subCloseTimer.current = setTimeout(() => setSubOpen(false), 120);
  };
  useEffect(() => () => clearTimeout(subCloseTimer.current), []);
  const label = t('sessionHeader.dock.overflowTitle');
  const close = () => {
    setOpen(false);
    setSubOpen(false);
  };

  return (
    <Tippy
      visible={open}
      // The second level is drawn into <body>, outside this menu, yet belongs to it: a click in it is not outside.
      onClickOutside={(_, event) => {
        if ((event.target as Element).closest?.(`[${RUN_SUBMENU_ATTRIBUTE}]`)) return;
        close();
      }}
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
          {onVariantChange && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onVariantChange(variant === 'simple' ? 'full' : 'simple');
              }}
              className={`${MENU_ITEM_CLASS} text-accent-claude`}
            >
              {t(variant === 'simple' ? 'backgroundTasks.viewFull' : 'backgroundTasks.viewSimple')}
            </button>
          )}
          {placement && (
            // The second level: "Change view options" is a row of this menu, and its four places open in a menu of
            // their own beside it. Opened by a click, like the first level.
            <Tippy
              visible={subOpen}
              interactive
              placement="left-start"
              // Left of the row when there is room, else right of it, and where neither fits it is pushed back inside the
              // window (over the first menu) rather than left hanging off the edge.
              popperOptions={{
                modifiers: [
                  { name: 'flip', options: { fallbackPlacements: ['right-start', 'left-end', 'right-end'], padding: 8 } },
                  { name: 'preventOverflow', options: { altAxis: true, padding: 8 } },
                ],
              }}
              // No gap to the first level, so the pointer never leaves both menus on its way across. The row sits
              // inside the first menu's border and padding, so the distance is that (a hair less, so they overlap
              // rather than part by a sub-pixel).
              offset={[0, 4]}
              appendTo={() => document.body}
              render={(subAttrs) => (
                <div
                  role="menu"
                  {...{ [RUN_SUBMENU_ATTRIBUTE]: '' }}
                  onMouseEnter={showSub}
                  onMouseLeave={hideSubSoon}
                  className="min-w-[11rem] p-1 bg-surface-raised border border-border-default rounded-lg shadow-xl z-50"
                  {...subAttrs}
                >
                  {PLACEMENTS.map(({ value, labelKey, Icon }) => (
                    <PlacementRow
                      key={value}
                      value={value}
                      label={t(labelKey)}
                      Icon={Icon}
                      selected={value === placement}
                      onSelect={() => {
                        close();
                        onPlacementChange?.(value);
                      }}
                    />
                  ))}
                </div>
              )}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={subOpen}
                onMouseEnter={showSub}
                onMouseLeave={hideSubSoon}
                // A touch has no hover, so a click opens it too.
                onClick={showSub}
                className={MENU_ITEM_CLASS}
              >
                <span className="flex-1">{t('backgroundTasks.viewOptions')}</span>
                <ChevronRightIcon className="w-4 h-4 shrink-0 text-text-secondary" />
              </button>
            </Tippy>
          )}
        </div>
      )}
    >
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
            <EllipsisHorizontalIcon className="w-5 h-5" />
          </button>
        </Tooltip>
      </span>
    </Tippy>
  );
}

/**
 * The controls of a run window's title row, in their order: the short or detailed view, the alternative view (a tab of
 * its own, or the side panel; see {@link alternativeViewOf}), and where the run opens. A subagent and a workflow share them, so the two windows cannot drift apart. Each is drawn only when
 * its handler is given; nothing is drawn when none is.
 */
export function RunViewActions(props: {
  variant: RunVariant;
  onVariantChange?: (variant: RunVariant) => void;
  onOpenInNewTab?: () => void;
  placement?: RunPlacement;
  onPlacementChange?: (placement: RunPlacement) => void;
  /** How much of the row has gone into the "More" menu, from none ({@link RunTitleLevel} 0) to all of it (3). */
  level?: RunTitleLevel;
}) {
  const { variant, onVariantChange, onOpenInNewTab, placement, onPlacementChange, level = 0 } = props;
  const { t } = useTranslation('chat');
  if (!onVariantChange && !onOpenInNewTab && !placement) return null;
  // What stays on the row at each level: the switch leaves first, then the place menu, and the alternative view's button last.
  const showSwitch = level === 0;
  const showAlternative = level <= 2;
  const alternative = alternativeViewOf(placement);
  const showPlaceMenu = level <= 1;
  const more = level >= 1;
  return (
    <>
      {showSwitch && onVariantChange && <RunVariantToggle variant={variant} onChange={onVariantChange} />}
      {showAlternative && alternative === 'tab' && onOpenInNewTab && (
        <AlternativeViewButton label={t('backgroundTasks.openInNewTab')} Icon={ArrowTopRightOnSquareIcon} onClick={onOpenInNewTab} />
      )}
      {showAlternative && alternative === 'side' && onPlacementChange && (
        <AlternativeViewButton label={t('backgroundTasks.placementSide')} Icon={SideViewIcon} onClick={() => onPlacementChange('side')} />
      )}
      {showPlaceMenu && placement && <RunPlacementMenu placement={placement} onSelect={onPlacementChange} />}
      {more && (
        <RunActionsMenu
          variant={variant}
          onVariantChange={onVariantChange}
          placement={showPlaceMenu ? undefined : placement}
          onPlacementChange={onPlacementChange}
        />
      )}
    </>
  );
}
