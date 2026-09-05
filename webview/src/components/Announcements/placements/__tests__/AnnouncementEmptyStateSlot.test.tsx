import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnouncementEmptyStateSlot } from '../AnnouncementEmptyStateSlot';
import { AnnouncementFrequency, AnnouncementPlacement, type Announcement } from '@/shared';

const mockDismiss = vi.fn();
const mockUseAnnouncements = vi.fn();
vi.mock('@/hooks/useAnnouncements', () => ({
  useAnnouncements: (placement: AnnouncementPlacement) => mockUseAnnouncements(placement),
}));

// 슬롯이 호출하는 useAnnouncementActionDispatch가 useRouter/useNavigate를
// 호출하는데, 이 슬롯 테스트에는 <Router> 컨텍스트가 없어 액션 디스패치 자체를
// 목킹한다.
vi.mock('@/components/Announcements/useAnnouncementActionDispatch', () => ({
  useAnnouncementActionDispatch: () => vi.fn(),
}));

// 인라인 공지는 앱에 내장된 것이라 계정 조회 같은 실제 데이터를 읽는다. 이 파일이
// 검증하는 것은 "서버 공지를 어떻게 다루는가"이므로, 인라인 쪽은 목록만 갈아끼워
// 서버 공지와의 우선순위만 확인한다.
const mockUseInlineAnnouncements = vi.fn();
vi.mock('../../inline/useInlineAnnouncements', () => ({
  useInlineAnnouncements: (placement: AnnouncementPlacement) => mockUseInlineAnnouncements(placement),
}));

function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 'a1',
    placements: [AnnouncementPlacement.EMPTY_STATE],
    priority: 0,
    icon: 'BellIcon',
    title: 'Empty state title',
    body: 'Empty state body',
    dismissible: true,
    actions: [],
    target: { frequency: AnnouncementFrequency.UNTIL_DISMISSED },
    ...overrides,
  };
}

describe('AnnouncementEmptyStateSlot', () => {
  beforeEach(() => {
    mockDismiss.mockClear();
    mockUseAnnouncements.mockReset();
    mockUseInlineAnnouncements.mockReset();
    mockUseInlineAnnouncements.mockReturnValue([]);
  });

  // 서버 공지를 먼저 두고 인라인을 뒤에 잇는 배치라, 알릴 일이 있어 발행한 공지가
  // 항상 자리를 가져가고 없을 때만 내장 안내가 그 자리를 채운다.
  describe('내장 인라인 공지와의 자리 배분', () => {
    const inlineCard = {
      id: 'built-in',
      placement: AnnouncementPlacement.EMPTY_STATE,
      useIsRelevant: () => true,
      render: () => <p>built-in card</p>,
    };

    it('서버 공지가 없으면 인라인 공지가 그 자리를 채운다', () => {
      mockUseAnnouncements.mockReturnValue({ announcements: [], dismiss: mockDismiss });
      mockUseInlineAnnouncements.mockReturnValue([inlineCard]);

      render(<AnnouncementEmptyStateSlot />);

      expect(screen.getByText('built-in card')).toBeInTheDocument();
    });

    it('서버 공지가 있으면 인라인 공지는 자리를 양보한다', () => {
      mockUseAnnouncements.mockReturnValue({ announcements: [makeAnnouncement()], dismiss: mockDismiss });
      mockUseInlineAnnouncements.mockReturnValue([inlineCard]);

      render(<AnnouncementEmptyStateSlot />);

      expect(screen.getByText('Empty state title')).toBeInTheDocument();
      expect(screen.queryByText('built-in card')).not.toBeInTheDocument();
    });

    it('둘 다 없으면 아무것도 렌더하지 않는다', () => {
      mockUseAnnouncements.mockReturnValue({ announcements: [], dismiss: mockDismiss });

      const { container } = render(<AnnouncementEmptyStateSlot />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  it('공지가 있으면 카드를 표시하고 올바른 placement로 조회한다', () => {
    mockUseAnnouncements.mockReturnValue({ announcements: [makeAnnouncement()], dismiss: mockDismiss });
    render(<AnnouncementEmptyStateSlot />);
    expect(screen.getByText('Empty state title')).toBeInTheDocument();
    expect(mockUseAnnouncements).toHaveBeenCalledWith(AnnouncementPlacement.EMPTY_STATE);
  });

  it('공지가 없으면 아무것도 렌더하지 않는다', () => {
    mockUseAnnouncements.mockReturnValue({ announcements: [], dismiss: mockDismiss });
    const { container } = render(<AnnouncementEmptyStateSlot />);
    expect(container).toBeEmptyDOMElement();
  });

  it('닫기(X) 클릭 시 dismiss(announcement)가 호출된다', () => {
    const announcement = makeAnnouncement({ id: 'close-me' });
    mockUseAnnouncements.mockReturnValue({ announcements: [announcement], dismiss: mockDismiss });
    render(<AnnouncementEmptyStateSlot />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockDismiss).toHaveBeenCalledWith(announcement);
  });

  it('frequency가 ALWAYS여도 dismissible이면 닫기(X)가 존재한다', () => {
    const announcement = makeAnnouncement({ id: 'always-1', target: { frequency: AnnouncementFrequency.ALWAYS } });
    mockUseAnnouncements.mockReturnValue({ announcements: [announcement], dismiss: mockDismiss });
    render(<AnnouncementEmptyStateSlot />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockDismiss).toHaveBeenCalledWith(announcement);
  });

  it('dismiss 후 목록이 비면(useAnnouncements 재조회 반영) 카드가 사라진다', () => {
    mockUseAnnouncements.mockReturnValue({ announcements: [makeAnnouncement({ id: 'close-me' })], dismiss: mockDismiss });
    const { rerender, container } = render(<AnnouncementEmptyStateSlot />);
    expect(screen.getByText('Empty state title')).toBeInTheDocument();

    mockUseAnnouncements.mockReturnValue({ announcements: [], dismiss: mockDismiss });
    rerender(<AnnouncementEmptyStateSlot />);
    expect(container).toBeEmptyDOMElement();
  });
});
