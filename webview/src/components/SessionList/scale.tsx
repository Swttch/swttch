import { createContext, useContext, ReactNode } from 'react';

/**
 * 세션 리스트 스케일.
 *
 * 같은 SessionList/SessionItem/SearchInput을 두 곳에서 공유하되 폰트·여백만
 * 분기한다:
 * - Compact: 세션 드롭다운(상단바에서 떠오르는 작은 메뉴)
 * - Regular: 좌측 툴 윈도우(채팅영역과 동일한 일반 스케일, text-sm 기준)
 */
export enum SessionListScale {
  Compact = 'compact',
  Regular = 'regular',
}

interface ScaleTokens {
  listPad: string;
  groupHeader: string;
  itemPad: string;
  /**
   * The start padding of `itemPad`, in rem. The tree lines of a nested row are
   * placed from the row's edge, so they need the same number the class holds.
   */
  itemInsetRem: number;
  itemText: string;
  itemTime: string;
  searchPad: string;
  searchInput: string;
}

const SCALE_TOKENS: Record<SessionListScale, ScaleTokens> = {
  [SessionListScale.Compact]: {
    listPad: 'p-1.5 pt-0',
    groupHeader: 'px-2 py-1.5 text-[0.8461rem]',
    itemPad: 'px-2 py-1.5',
    itemInsetRem: 0.5,
    itemText: 'text-xs',
    itemTime: 'text-[0.8461rem]',
    searchPad: 'p-1.5',
    searchInput: 'text-xs px-2.5 py-1.5 pe-7',
  },
  [SessionListScale.Regular]: {
    listPad: 'p-2 pt-0',
    groupHeader: 'px-2.5 py-1.5 text-sm',
    itemPad: 'px-2.5 py-2',
    itemInsetRem: 0.625,
    itemText: 'text-sm',
    itemTime: 'text-xs',
    searchPad: 'p-2',
    searchInput: 'text-sm px-3 py-2 pe-9',
  },
};

const SessionListScaleContext = createContext<SessionListScale>(SessionListScale.Compact);

interface ProviderProps {
  scale: SessionListScale;
  children: ReactNode;
}

export function SessionListScaleProvider(props: ProviderProps) {
  const { scale, children } = props;

  return (
    <SessionListScaleContext.Provider value={scale}>
      {children}
    </SessionListScaleContext.Provider>
  );
}

/** 현재 스케일에 해당하는 Tailwind 클래스 토큰을 반환한다. */
export function useSessionListScale(): ScaleTokens {
  return SCALE_TOKENS[useContext(SessionListScaleContext)];
}
