import {
  Cog6ToothIcon,
  SwatchIcon,
  ShieldCheckIcon,
  CommandLineIcon,
  AdjustmentsHorizontalIcon,
  InformationCircleIcon,
  ChartBarSquareIcon,
  ArrowLeftIcon,
  ArrowsRightLeftIcon,
  ArrowUpCircleIcon,
  ComputerDesktopIcon,
  BellIcon,
  LockClosedIcon,
  HeartIcon,
  CodeBracketSquareIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType, SVGProps } from 'react';

/**
 * 아이콘 이름 enum - 모든 아이콘 참조는 이 enum 사용
 * 인라인 문자열 사용 금지
 */
export enum IconName {
  COG = 'Cog6ToothIcon',
  SWATCH = 'SwatchIcon',
  SHIELD_CHECK = 'ShieldCheckIcon',
  COMMAND_LINE = 'CommandLineIcon',
  ADJUSTMENTS = 'AdjustmentsHorizontalIcon',
  CHART_BAR_SQUARE = 'ChartBarSquareIcon',
  INFORMATION_CIRCLE = 'InformationCircleIcon',
  ARROW_LEFT = 'ArrowLeftIcon',
  ARROWS_RIGHT_LEFT = 'ArrowsRightLeftIcon',
  ARROW_UP_CIRCLE = 'ArrowUpCircleIcon',
  COMPUTER_DESKTOP = 'ComputerDesktopIcon',
  BELL = 'BellIcon',
  LOCK_CLOSED = 'LockClosedIcon',
  HEART = 'HeartIcon',
  CODE_BRACKET_SQUARE = 'CodeBracketSquareIcon',
}

/**
 * 애플리케이션 라우트 enum
 * 인라인 문자열 사용 금지 - 모든 경로는 이 enum으로 참조
 */
export enum Route {
  PROJECT_SELECTOR = '',
  NEW_SESSION = 'sessions/new',
  SESSION = 'sessions/:current_session_id',
  // 좌측 세션 패널 전용 뷰. '/sessions/'와 분리된 prefix를 써야
  // parseSessionIdFromPath가 'panel'을 세션 ID로 오인하지 않는다.
  SESSION_PANEL = 'session-panel',
  SETTINGS = 'settings',
  SETTINGS_GENERAL = 'settings/general',
  SETTINGS_APPEARANCE = 'settings/appearance',
  SETTINGS_PERMISSIONS = 'settings/permissions',
  SETTINGS_CLI = 'settings/cli',
  SETTINGS_ADVANCED = 'settings/advanced',
  SETTINGS_TUNNEL = 'settings/tunnel',
  SETTINGS_USAGE = 'settings/usage',
  SETTINGS_RELEASES = 'settings/releases',
  SETTINGS_BROWSER = 'settings/browser',
  SETTINGS_IDE = 'settings/ide',
  SETTINGS_ACCOUNT = 'settings/account',
  SETTINGS_SPONSOR = 'settings/sponsor',
  SETTINGS_ABOUT = 'settings/about',
  SETTINGS_PRIVACY = 'settings/privacy',
  SWITCH_ACCOUNT = 'switch-account',
}

export interface RouteMeta {
  path: string;
  label: string;
  icon: IconName | null;
  description?: string;
  scopeSupport?: 'both' | 'none';
}

/**
 * 라우트별 통합 메타데이터
 */
export const ROUTE_META: Record<Route, RouteMeta> = {
  [Route.PROJECT_SELECTOR]: {
    path: '/',
    label: 'Select Project',
    icon: null,
  },
  [Route.NEW_SESSION]: {
    path: '/sessions/new',
    label: 'New Session',
    icon: null
  },
  [Route.SESSION]: {
    path: '/sessions/:current_session_id',
    label: 'Session',
    icon: null
  },
  [Route.SESSION_PANEL]: {
    path: '/session-panel',
    label: 'Sessions',
    icon: null
  },
  [Route.SWITCH_ACCOUNT]: {
    path: '/switch-account',
    label: 'Switch account',
    icon: IconName.ARROWS_RIGHT_LEFT,
    description: 'Choose authentication method',
  },
  [Route.SETTINGS]: {
    path: '/settings',
    label: 'Settings',
    icon: IconName.COG
  },
  [Route.SETTINGS_GENERAL]: {
    path: '/settings/general',
    label: 'General',
    icon: IconName.COG,
    description: 'General settings',
    scopeSupport: 'both',
  },
  [Route.SETTINGS_APPEARANCE]: {
    path: '/settings/appearance',
    label: 'Appearance',
    icon: IconName.SWATCH,
    description: 'Theme and display settings',
    scopeSupport: 'both',
  },
  [Route.SETTINGS_PERMISSIONS]: {
    path: '/settings/permissions',
    label: 'Permissions',
    icon: IconName.SHIELD_CHECK,
    description: 'Tool approval settings',
    scopeSupport: 'both',
  },
  [Route.SETTINGS_CLI]: {
    path: '/settings/cli',
    label: 'CLI',
    icon: IconName.COMMAND_LINE,
    description: 'Claude CLI configuration',
    scopeSupport: 'both',
  },
  [Route.SETTINGS_ADVANCED]: {
    path: '/settings/advanced',
    label: 'Advanced',
    icon: IconName.ADJUSTMENTS,
    description: 'Debug and advanced options',
    scopeSupport: 'both',
  },
  [Route.SETTINGS_TUNNEL]: {
    path: '/settings/tunnel',
    label: 'Tunnel',
    icon: IconName.COMPUTER_DESKTOP,
    description: 'Remote tunnel and sleep prevention',
    scopeSupport: 'none',
  },
  [Route.SETTINGS_USAGE]: {
    path: '/settings/usage',
    label: 'Usage',
    icon: IconName.CHART_BAR_SQUARE,
    description: 'Plan usage limits and quota',
    scopeSupport: 'none',
  },
  [Route.SETTINGS_RELEASES]: {
    path: '/settings/releases',
    label: 'Releases',
    icon: IconName.ARROW_UP_CIRCLE,
    description: 'Release notes and updates',
    scopeSupport: 'none',
  },
  [Route.SETTINGS_BROWSER]: {
    path: '/settings/browser',
    label: 'Browser',
    icon: IconName.BELL,
    description: 'Browser-only options',
    scopeSupport: 'none',
  },
  [Route.SETTINGS_IDE]: {
    path: '/settings/ide',
    label: 'IDE',
    icon: IconName.CODE_BRACKET_SQUARE,
    description: 'IDE integration options',
    scopeSupport: 'none',
  },
  [Route.SETTINGS_ACCOUNT]: {
    path: '/settings/account',
    label: 'Account',
    icon: IconName.SHIELD_CHECK,
    description: 'Profile and authentication',
    scopeSupport: 'none',
  },
  [Route.SETTINGS_SPONSOR]: {
    path: '/settings/sponsor',
    label: 'Sponsor',
    icon: IconName.HEART,
    description: 'Support the project',
    scopeSupport: 'none',
  },
  [Route.SETTINGS_ABOUT]: {
    path: '/settings/about',
    label: 'About',
    icon: IconName.INFORMATION_CIRCLE,
    description: 'Version and information',
    scopeSupport: 'none',
  },
  [Route.SETTINGS_PRIVACY]: {
    path: '/settings/privacy',
    label: 'Privacy',
    icon: IconName.LOCK_CLOSED,
    description: 'Telemetry and privacy settings',
    scopeSupport: 'none',
  },
};

/**
 * IconName enum에서 실제 Heroicon 컴포넌트로 매핑
 */
export const ICON_COMPONENTS: Record<IconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  [IconName.COG]: Cog6ToothIcon,
  [IconName.SWATCH]: SwatchIcon,
  [IconName.SHIELD_CHECK]: ShieldCheckIcon,
  [IconName.COMMAND_LINE]: CommandLineIcon,
  [IconName.ADJUSTMENTS]: AdjustmentsHorizontalIcon,
  [IconName.CHART_BAR_SQUARE]: ChartBarSquareIcon,
  [IconName.INFORMATION_CIRCLE]: InformationCircleIcon,
  [IconName.ARROW_LEFT]: ArrowLeftIcon,
  [IconName.ARROWS_RIGHT_LEFT]: ArrowsRightLeftIcon,
  [IconName.ARROW_UP_CIRCLE]: ArrowUpCircleIcon,
  [IconName.COMPUTER_DESKTOP]: ComputerDesktopIcon,
  [IconName.BELL]: BellIcon,
  [IconName.LOCK_CLOSED]: LockClosedIcon,
  [IconName.HEART]: HeartIcon,
  [IconName.CODE_BRACKET_SQUARE]: CodeBracketSquareIcon,
};

/**
 * pathname에서 Route enum 추출
 */
export function pathToRoute(pathname: string): Route {
  const path = pathname || '/sessions/new';

  // 동적 세션 라우트: /sessions/{id} (단, /sessions/new 제외)
  if (path.startsWith('/sessions/') && path !== '/sessions/new') {
    return Route.SESSION;
  }

  for (const [route, meta] of Object.entries(ROUTE_META)) {
    if (meta.path === path) {
      return route as Route;
    }
  }

  return Route.NEW_SESSION;
}

/**
 * pathname에서 세션 ID 추출 (동적 라우트 전용)
 * /sessions/new → null, /sessions/{id} → id
 */
export function parseSessionIdFromPath(pathname: string): string | null {
  if (pathname.startsWith('/sessions/') && pathname !== '/sessions/new') {
    return pathname.slice('/sessions/'.length) || null;
  }
  return null;
}

/**
 * 세션 ID로 path 생성
 */
export function sessionToPath(sessionId: string): string {
  return `/sessions/${sessionId}`;
}

/**
 * Route enum에서 path 생성 (정적 라우트 전용)
 * SESSION 라우트에는 sessionToPath()를 사용할 것
 */
export function routeToPath(route: Route): string {
  return ROUTE_META[route].path;
}

/**
 * 현재 URL의 workingDir 쿼리 파라미터를 보존하여 경로 생성
 * 루트 경로(/)는 프로젝트 선택 페이지이므로 workingDir를 포함하지 않음
 */
export function withWorkingDir(path: string, workingDir?: string | null): string {
  if (path === '/') return path;

  const dir = workingDir ?? new URLSearchParams(window.location.search).get('workingDir');
  if (!dir) return path;

  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}workingDir=${encodeURIComponent(dir)}`;
}

/**
 * Append `?rootDir=` when the anchor differs from the session's own directory.
 *
 * Omitted when they match, which keeps every existing URL byte-identical: an
 * absent parameter already means "the two coincide". Only opening a session
 * that lives below the directory being browsed writes it out.
 */
export function withRootDir(path: string, rootDir: string | null, workingDir: string | null): string {
  if (!rootDir || rootDir === workingDir) return path;

  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}rootDir=${encodeURIComponent(rootDir)}`;
}

/** Query param carrying where to return after a login completes. */
export const FALLBACK_PARAM = 'fallback';

/**
 * Build the login (switch-account) path, remembering `currentPathAndSearch` as a
 * `fallback` query param so a completed login — or a back action — can return the
 * user exactly where they were. Callers navigate to this with a PUSH so the back
 * stack stays intact (#178).
 *
 * Never stacks login-on-login: if the user is already on the switch-account page,
 * the base path is returned unchanged (the existing fallback already points home).
 */
export function loginPathWithFallback(currentPathAndSearch: string): string {
  const base = withWorkingDir(routeToPath(Route.SWITCH_ACCOUNT));
  if (currentPathAndSearch.startsWith(routeToPath(Route.SWITCH_ACCOUNT))) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${FALLBACK_PARAM}=${encodeURIComponent(currentPathAndSearch)}`;
}

/**
 * Read the return destination from a login page's `?fallback=` query. Returns null
 * when absent, or when it would loop back to the login page itself (so callers fall
 * back to a safe default like a new session).
 */
export function fallbackFromSearch(search: string): string | null {
  const fb = new URLSearchParams(search).get(FALLBACK_PARAM);
  if (!fb) return null;
  if (fb.startsWith(routeToPath(Route.SWITCH_ACCOUNT))) return null;
  return fb;
}

/**
 * 설정 관련 라우트인지 확인
 */
export function isSettingsRoute(route: Route): boolean {
  return route.startsWith('settings');
}

/**
 * Switch account 라우트인지 확인
 */
export function isSwitchAccountRoute(route: Route): boolean {
  return route === Route.SWITCH_ACCOUNT;
}

/**
 * 설정 서브메뉴 라우트 목록
 */
export const SETTINGS_SUB_ROUTES: Route[] = [
  Route.SETTINGS_GENERAL,
  Route.SETTINGS_APPEARANCE,
  Route.SETTINGS_PERMISSIONS,
  Route.SETTINGS_PRIVACY,
  Route.SETTINGS_CLI,
  // Route.SETTINGS_ADVANCED,  // TODO: not yet implemented
  Route.SETTINGS_BROWSER,
  Route.SETTINGS_IDE,
  Route.SETTINGS_ACCOUNT,
  Route.SETTINGS_USAGE,
  Route.SETTINGS_TUNNEL,
  Route.SETTINGS_RELEASES,
  Route.SETTINGS_ABOUT,
  // Sponsor sits last — it's a support/marketing entry, not a settings group.
  Route.SETTINGS_SPONSOR,
];

/**
 * UI 라벨 enum - 모든 UI 텍스트 라벨 참조는 이 enum 사용
 * 인라인 문자열 사용 금지
 */
export enum Label {
  SETTINGS = 'Settings',
  BACK = 'Back',
  CLOSE = 'Close',
  NEW_TAB = 'Open New Tab',
}
