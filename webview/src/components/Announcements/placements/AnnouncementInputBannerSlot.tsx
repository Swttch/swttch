import { useAnnouncements } from '@/hooks/useAnnouncements';
import { AnnouncementPlacement } from '@/shared';
import { AnnouncementView } from '@/vendor/announcement-ui';
import { useAnnouncementActionDispatch } from '../useAnnouncementActionDispatch';

/**
 * INPUT_BANNER 플레이스먼트 공지 슬롯.
 *
 * 채팅 인풋 바로 위, `TelemetryConsentBanner`/`InputBanner`
 * (자동모드 강등 안내) 등 기존 인풋배너 계열과 같은 자리에 형제로 마운트한다.
 * 이 자리의 배너들은 좌-우-X 한 줄 가로 레이아웃이므로 공지도 www admin과 공유하는
 * vendored `AnnouncementView variant="banner"`(아이콘·제목·본문 좌측, 액션·X 우측)로
 * 렌더하고, 형제 배너들과 동일한 하단 여백(mb-2)만 래퍼에서 맞춘다.
 *
 * 렌더는 `AnnouncementView`에 위임하고 슬롯은 동작(액션 디스패치·dismiss)만 콜백으로
 * 주입한다. `announcement-scope`는 `--ann-*` CSS 변수를 플러그인 테마에 매핑한다.
 */
export function AnnouncementInputBannerSlot() {
  const { announcements, dismiss } = useAnnouncements(AnnouncementPlacement.INPUT_BANNER);
  const dispatch = useAnnouncementActionDispatch();
  const announcement = announcements[0];
  if (!announcement) return null;

  return (
    <div className="announcement-scope mb-2">
      <AnnouncementView
        announcement={announcement}
        variant="banner"
        onAction={(action) => dispatch(announcement, action, dismiss)}
        onDismiss={() => dismiss(announcement)}
      />
    </div>
  );
}
