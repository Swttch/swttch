import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { setTelemetryConsent, readProfile } from '../features/profile';
import { trackEvent } from '../features/telemetry';
import { getPluginVersion } from './getVersion';
import { MessageType } from '../../shared';

/**
 * 텔레메트리 수락(accept)/거부(deny)를 profile.json에 기록하고, 'telemetry_consent'
 * 이벤트를 전송한다(전송은 fire-and-forget — await/then 없음).
 *
 * - accept: 저장(ACCEPTED) 후 전송 → 동의 게이팅 통과.
 * - deny: 최초 거부든 철회든 항상 전송한다(게이팅 우회).
 *
 * 거부를 게이팅 밖에서 보내는 이유는 동의율 때문이다. 수락한 설치만 보고되면 분자만 쌓이고
 * 분모가 없어 "몇 명이 물음을 받고 몇 명이 수락했는지"를 영영 알 수 없다. 이 이벤트가 싣는
 * 정보는 수락한 설치가 이미 보내는 것과 동일하며, 공지(announcements) fetch가 미동의
 * 상태에서 나가는 것과 같은 선이다.
 */
export async function setTelemetryConsentHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const accepted = message.payload?.accepted === true;
  const source = typeof message.payload?.source === 'string' ? message.payload.source : 'unknown';
  const pluginVersion = getPluginVersion();

  if (accepted) {
    await setTelemetryConsent(true);
    trackEvent('telemetry_consent', { action: 'accept', source, pluginVersion });
  } else {
    await setTelemetryConsent(false);
    // 저장 후에는 상태가 DENIED라 동의 게이팅에 걸린다. 최초 거부와 철회를 모두 남기려면
    // 게이팅을 우회해야 한다.
    trackEvent(
      'telemetry_consent',
      { action: 'deny', source, pluginVersion },
      { requireConsent: false },
    );
  }

  const profile = await readProfile();
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    consentStatus: profile.telemetryConsent.status,
    decidedAt: profile.telemetryConsent.decidedAt,
  });
}
