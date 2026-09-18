import { ROUTE_META, ICON_COMPONENTS, SETTINGS_SUB_ROUTES, Route } from '@/router/routes';
import { useRouter } from '@/router';
import { useUpdateAvailable } from '@/hooks/useUpdateAvailable';
import { isBrowser } from '@/config/environment';
import { useTranslation } from '@/i18n';

interface SettingsSidebarProps {
  /** On mobile the sidebar renders as a slide-in drawer instead of an inline column. */
  isDrawer?: boolean;
  /** Drawer open state (only meaningful when isDrawer). */
  open?: boolean;
  /** Called after a nav item is chosen, so the drawer can close itself on mobile. */
  onNavigate?: () => void;
}

export function SettingsSidebar({ isDrawer = false, open = false, onNavigate }: SettingsSidebarProps) {
  const { route, navigate } = useRouter();
  const { hasUpdate } = useUpdateAvailable();
  const browser = isBrowser();
  const { t } = useTranslation('settings');

  return (
    <nav
      // Set apart by its own surface rather than by a rule down the edge. A line
      // draws itself; a lifted panel lets the two areas read as two areas
      // without adding anything to look at.
      //
      // The same surface the section cards use, deliberately. This screen has two
      // levels, not three: one canvas, and everything that sits on it. A sidebar
      // pitched between the canvas and the cards would be a third level carrying
      // no meaning, and the eye reads an unexplained step as an accident.
      className={`w-48 flex-shrink-0 py-4 bg-surface-raised ${
        isDrawer
          ? `absolute start-0 top-0 bottom-0 z-20 transition-transform duration-200 ${
              open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
            }`
          : ''
      }`}
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
              <button
                onClick={() => { navigate(subRoute); onNavigate?.(); }}
                // Three states on one ramp, in the order of how much they claim:
                // an untouched item is the sidebar itself, hovering fills it at
                // `hover`, and the item you are on takes `pressed`, the far end.
                // It used to take `overlay`, which sits BELOW `hover` — the item
                // you were on was quieter than the one the cursor happened to be
                // over, and it was only a few steps off the sidebar besides.
                className={`
                  w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                  ${isActive
                    ? 'bg-surface-pressed text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}
                `}
              >
                {Icon && <Icon className="w-4 h-4" />}
                <span>{navLabel}</span>
                {showBadge && (
                  <span className="ms-auto w-2 h-2 rounded-full bg-accent-primary" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
