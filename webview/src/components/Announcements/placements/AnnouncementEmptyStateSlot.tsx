import { useAnnouncements } from '@/hooks/useAnnouncements';
import { AnnouncementPlacement } from '@/shared';
import { AnnouncementView } from '@/vendor/announcement-ui';
import { useAnnouncementActionDispatch } from '../useAnnouncementActionDispatch';
import { useInlineAnnouncements } from '../inline/useInlineAnnouncements';

/**
 * EMPTY_STATE 플레이스먼트 공지 슬롯.
 *
 * 초기화된 세션(아직 첫 메시지를 시작하지 않은 상태)의 중앙 빈 화면에, 우선순위가
 * 가장 높은 공지 1건만 카드(`AnnouncementView variant="card"`)로 표시한다. 공지가
 * 없거나(로딩 중 포함) 목록이 비어 있으면 `null`을 렌더해 기존 EmptyState
 * 레이아웃에 전혀 영향을 주지 않는다.
 *
 * 렌더는 www admin과 공유하는 vendored `AnnouncementView`에 위임하고, 이 슬롯은
 * 동작(액션 디스패치·dismiss)만 콜백으로 주입한다. `announcement-scope`는
 * `AnnouncementView`가 참조하는 `--ann-*` CSS 변수를 플러그인 테마에 매핑한다.
 */
export function AnnouncementEmptyStateSlot() {
  const { announcements, dismiss } = useAnnouncements(AnnouncementPlacement.EMPTY_STATE);
  const inline = useInlineAnnouncements(AnnouncementPlacement.EMPTY_STATE);
  const dispatch = useAnnouncementActionDispatch();
  const announcement = announcements[0];

  // 서버 공지를 먼저 두고 앱에 내장된 인라인 공지를 뒤에 잇는다. 그래서 알릴 일이
  // 있어 발행한 공지가 항상 이 자리를 가져가고, 그런 공지가 없을 때만 내장 안내가
  // 그 자리를 채운다. 자리를 두고 다투지 않으므로 어느 쪽도 상대를 알 필요가 없다.
  if (!announcement) {
    const builtIn = inline[0];
    if (!builtIn) return null;
    return <div className="w-full max-w-[22rem]">{builtIn.render()}</div>;
  }

  return (
    <div className="announcement-scope w-full max-w-[22rem]">
      <AnnouncementView
        announcement={announcement}
        variant="card"
        onAction={(action) => dispatch(announcement, action, dismiss)}
        onDismiss={() => dismiss(announcement)}
      />
    </div>
  );
}
