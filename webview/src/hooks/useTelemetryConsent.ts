import { useCallback, useEffect, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/**
 * 텔레메트리 동의 상태. 백엔드 `profile.ts`의 ConsentStatus와 값이 일치해야 한다
 * (settings.ts ↔ Kotlin SettingKey 동기화와 같은 원칙).
 */
export enum ConsentStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DENIED = 'denied',
}

/** 동의를 결정한 경로(이벤트 분석용). */
export enum ConsentSource {
  BANNER = 'banner',
  SETTINGS = 'settings',
}

/**
 * 동의 인풋배너에서 일어난 일. accept/deny와 같은 `action` 자리를 쓰므로,
 * 하나의 `telemetry_consent` 이벤트가 show → dismiss/deny/accept 퍼널 전체를 담는다.
 */
export enum ConsentBannerAction {
  /** 배너가 사용자에게 표시됐다. */
  SHOW = 'show',
  /** 답하지 않은 채 X로 닫았다 — 상태는 PENDING으로 남는다(거절과 다른 점). */
  DISMISS = 'dismiss',
}

interface ConsentResponse {
  consentStatus: ConsentStatus;
  decidedAt: string | null;
}

/**
 * profile.json의 텔레메트리 동의 상태를 읽고, 수락(accept)/거부(deny)를 영속화하는 훅.
 * 이벤트 전송은 전부 백엔드 핸들러가 처리한다 — deny와 배너 노출/닫기는 동의 게이팅을
 * 우회해 보내야 동의율의 분모가 생기기 때문이다(각 핸들러 주석 참조).
 */
export function useTelemetryConsent() {
  const { send } = useBridgeContext();
  const [status, setStatus] = useState<ConsentStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = (await send(MessageType.GET_TELEMETRY_CONSENT, {})) as ConsentResponse | null;
      setStatus(res?.consentStatus ?? null);
    } catch {
      setStatus(null);
    }
  }, [send]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(
    async (source: ConsentSource) => {
      const res = (await send(MessageType.SET_TELEMETRY_CONSENT, { accepted: true, source })) as ConsentResponse | null;
      setStatus(res?.consentStatus ?? ConsentStatus.ACCEPTED);
    },
    [send],
  );

  const deny = useCallback(
    async (source: ConsentSource) => {
      const res = (await send(MessageType.SET_TELEMETRY_CONSENT, { accepted: false, source })) as ConsentResponse | null;
      setStatus(res?.consentStatus ?? ConsentStatus.DENIED);
    },
    [send],
  );

  /**
   * 배너 노출/닫기를 백엔드에 보고한다. 동의 상태를 바꾸지 않으므로 응답을 기다리지 않는다.
   * 노출은 세션을 바꿀 때마다 배너가 다시 떠 여러 번 불릴 수 있고, 그 중복은 백엔드가
   * 프로세스 단위로 억제한다 — 호출자가 발동 조건을 따로 관리하지 않게 하기 위해서다.
   */
  const trackBanner = useCallback(
    (action: ConsentBannerAction) => {
      void send(MessageType.TRACK_TELEMETRY_CONSENT_BANNER, { action });
    },
    [send],
  );

  return { status, accept, deny, refresh, trackBanner };
}
