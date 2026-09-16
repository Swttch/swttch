import { getPluginVersion } from '../handlers/getVersion';
import { getWhatsNewSeenVersion, setWhatsNewSeenVersion } from './profile';

/**
 * "What's new" 팝업을 이번 실행에서 띄울지를 백엔드가 시작하는 순간에 정한다.
 *
 * 판정이 웹뷰가 아니라 여기 있는 이유가 둘이다.
 *
 * 첫째, 비교 대상인 "마지막으로 띄운 버전"이 `~/.claude-code-gui/profile.json`에 있다.
 * 웹뷰의 localStorage에 두면 IDE를 재시작할 때마다 사라진다. JetBrains 모드의 웹뷰 주소가
 * `http://localhost:<매번 새로 할당되는 포트>`라서 origin이 매번 바뀌기 때문이다(#453).
 *
 * 둘째, "막 설치된 버전"은 번들이 알고 있다. `getPluginVersion()`이 돌려주는 값은 esbuild가
 * 번들을 만들 때 박아 넣은 문자열이라, 지금 돌고 있는 이 백엔드가 어느 배포본에서 나왔는지를
 * 그대로 말해준다.
 *
 * 백엔드가 한 번 뜨는 동안 웹뷰 탭은 여럿 열릴 수 있으므로, 판정 결과를 메모리에 들고 있다가
 * 한 번 띄운 뒤에는 내린다. 그래서 같은 실행 안에서 탭을 새로 열어도 다시 뜨지 않는다.
 */

/**
 * 이번 실행에서 띄워야 할 버전. 띄울 것이 없으면 null.
 *
 * `resolveWhatsNewOnStartup()`이 채우고, `markWhatsNewSeen()`이 비운다.
 */
let pendingVersion: string | null = null;

/**
 * 백엔드 시작 시 1회 호출한다. 번들에 박힌 설치 버전과 마지막으로 띄운 버전을 비교해,
 * 둘이 다르면 이번 실행에서 팝업을 띄우기로 정한다.
 *
 * 신규 설치는 기록이 없어 null과 비교되므로 역시 "다르다"에 걸려 한 번 뜬다. 업데이트 설치와
 * 신규 설치를 가르지 않는 것은 의도된 것으로, 사용자가 방금 받은 배포본에 무엇이 들어있는지
 * 알려주는 것이 이 팝업의 목적이기 때문이다.
 *
 * 프로필을 읽지 못해도 시작을 막지 않는다. 그 경우 이번 실행에서는 띄우지 않는다.
 */
export async function resolveWhatsNewOnStartup(): Promise<string | null> {
  try {
    const installedVersion = getPluginVersion();
    const seenVersion = await getWhatsNewSeenVersion();
    pendingVersion = installedVersion !== seenVersion ? installedVersion : null;
  } catch {
    pendingVersion = null;
  }
  return pendingVersion;
}

/** 이번 실행에서 아직 띄우지 않은 버전. 띄울 것이 없으면 null. */
export function getPendingWhatsNewVersion(): string | null {
  return pendingVersion;
}

/**
 * 팝업을 띄운 사실을 기록하고, 이번 실행에서 다시 띄우지 않도록 내린다.
 *
 * 기록에 실패해도 메모리 플래그는 내린다. 파일에 쓰지 못한 것은 다음 실행에서 한 번 더 뜨는
 * 것으로 끝나지만, 플래그를 남겨두면 지금 열려 있는 다른 탭에서 곧바로 또 뜨기 때문이다.
 */
export async function markWhatsNewSeen(version: string): Promise<void> {
  pendingVersion = null;
  try {
    await setWhatsNewSeenVersion(version);
  } catch {
    // 다음 실행에서 한 번 더 뜬다. 띄우지 못하는 것보다 낫다.
  }
}
