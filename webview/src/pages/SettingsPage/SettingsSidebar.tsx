import { useState } from 'react';
import { ROUTE_META, ICON_COMPONENTS, SETTINGS_SUB_ROUTES, Route } from '@/router/routes';
import { useRouter } from '@/router';
import { useUpdateAvailable } from '@/hooks/useUpdateAvailable';
import { isBrowser } from '@/config/environment';
import { Tooltip } from '@/components';
import { useTranslation } from '@/i18n';
import {
  SidebarMode,
  SIDEBAR_MAX_REM,
  FULL_COLUMN_STYLE,
  ICON_COLUMN_STYLE,
} from './useSidebarLayout';

interface SettingsSidebarProps {
  mode: SidebarMode;
  /** False when the navigation is put away, by the toggle or by the mode's default. */
  open: boolean;
  /** Called after a nav item is chosen, so a drawer can put itself away. */
  onNavigate?: () => void;
}

export function SettingsSidebar({ mode, open, onNavigate }: SettingsSidebarProps) {
  const { route, navigate } = useRouter();
  const { hasUpdate } = useUpdateAvailable();
  const browser = isBrowser();
  const { t } = useTranslation('settings');

  // Held here rather than lifted, because peeking is not a decision anyone else
  // on this screen has to know about: it changes what this column looks like and
  // nothing about what it means.
  const [peeking, setPeeking] = useState(false);
  const canPeek = open && mode === SidebarMode.ICONS;
  const folded = canPeek && !peeking;

  // What the column takes out of the row.
  //
  // A labelled column is sized by the browser from a share of the row, so that
  // it is the one that gives ground as the row narrows. The other shapes are
  // fixed: an icon column is as wide as an icon, and a drawer takes nothing at
  // all because it is drawn over the content rather than beside it.
  const trackStyle = !open
    ? { width: 0 }
    : mode === SidebarMode.DRAWER
      ? { width: 0 }
      : mode === SidebarMode.ICONS
        ? ICON_COLUMN_STYLE
        : FULL_COLUMN_STYLE;

  // What the column looks like, which is the same as what it takes except when
  // it is borrowing space it does not own: a drawer, or an icon column under
  // the pointer.
  const panelWidth = !open
    ? 0
    : mode === SidebarMode.DRAWER || (canPeek && peeking)
      ? `${SIDEBAR_MAX_REM}rem`
      : '100%';

  return (
    <nav
      // The column is never unmounted and its labels are never dropped from the
      // tree. Every state here is a width, and what is too wide to show is cut
      // off by `overflow-hidden` — which is what lets the widths be animated at
      // all, and what makes peeking a transition rather than a re-render.
      className="relative flex-initial flex-shrink-0 transition-[width] duration-200 ease-out"
      style={trackStyle}
      onPointerEnter={canPeek ? () => setPeeking(true) : undefined}
      onPointerLeave={canPeek ? () => setPeeking(false) : undefined}
    >
      {/* Set apart from the content by its own surface rather than by a rule
          down the edge. A line draws itself; a lifted panel lets the two areas
          read as two areas without adding anything to look at. It shares
          `raised` with the section cards, because they are the two things laid
          on the canvas and neither sits above the other. */}
      <div
        className={`absolute inset-y-0 start-0 overflow-hidden bg-surface-raised py-4 transition-[width] duration-200 ease-out ${
          // Over the content in the two states where the column shows more than
          // it took: peeked open, or a drawer.
          mode === SidebarMode.DRAWER || peeking ? 'z-20 shadow-lg' : ''
        }`}
        style={{ width: panelWidth }}
        aria-hidden={!open}
      >
        <ul className="space-y-1 px-2">
          {SETTINGS_SUB_ROUTES.map((subRoute) => {
            if (subRoute === Route.SETTINGS_BROWSER && !browser) {
              return null;
            }
            const meta = ROUTE_META[subRoute];
            const Icon = meta.icon ? ICON_COMPONENTS[meta.icon] : null;
            // Section labels live in ROUTE_META (also consumed outside React), so we
            // translate at the render site: the route key's last segment maps to a
            // `nav.*` key in the settings namespace (e.g. 'settings/general' → nav.general).
            const navLabel = t(`nav.${subRoute.replace('settings/', '')}`);
            const isActive = route === subRoute;
            const showBadge = subRoute === Route.SETTINGS_RELEASES && hasUpdate;

            return (
              <li key={subRoute}>
                {/* Named for the pointer only while the label is folded away.
                    Peeking already answers the question a tooltip would, so
                    offering both means the label arrives twice and from two
                    directions. */}
                <Tooltip content={folded ? navLabel : undefined} placement="right">
                  <button
                    onClick={() => { navigate(subRoute); onNavigate?.(); }}
                    // Three states on one ramp, in the order of how much they claim:
                    // an untouched item is the sidebar itself, hovering fills it at
                    // `hover`, and the item you are on takes `pressed`, the far end.
                    // It used to take `overlay`, which sits BELOW `hover` — the item
                    // you were on was quieter than the one the cursor happened to be
                    // over, and it was only a few steps off the sidebar besides.
                    className={`
                      relative w-full min-w-0 flex items-center px-3 py-2 rounded-lg text-sm transition-colors
                      ${isActive
                        ? 'bg-surface-pressed text-text-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}
                    `}
                  >
                    {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                    {/* The label folds rather than being clipped by the column.
                        Clipping leaves whatever fits — an icon column 56px wide
                        showed 18px of the first label, which reads as a word cut
                        in half rather than as an icon. The gap is the label's own
                        `ps-2` for the same reason: a `gap` on the button would
                        still be there once the label had folded to nothing. */}
                    <span
                      className={`overflow-hidden whitespace-nowrap text-ellipsis transition-[max-width,opacity,padding] duration-200 ease-out ${
                        folded ? 'max-w-0 opacity-0 ps-0' : 'max-w-full opacity-100 ps-2'
                      }`}
                    >
                      {navLabel}
                    </span>
                    {showBadge && (
                      <span
                        className={
                          folded
                            // Nothing in the row can be pushed to, so the dot
                            // goes on the corner of the icon instead.
                            ? 'absolute end-1.5 top-1.5 w-2 h-2 rounded-full bg-accent-primary'
                            : 'ms-auto flex-shrink-0 w-2 h-2 rounded-full bg-accent-primary'
                        }
                      />
                    )}
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
