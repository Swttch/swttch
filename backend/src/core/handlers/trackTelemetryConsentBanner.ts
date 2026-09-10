import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { trackEvent } from '../features/telemetry';
import { getPluginVersion } from './getVersion';
import { MessageType } from '../../shared';

/**
 * What the consent input banner can report. These share the `action` property
 * with the accept/deny events, so one `telemetry_consent` event name carries the
 * whole funnel: show → dismiss / deny / accept.
 */
const BANNER_ACTIONS = new Set(['show', 'dismiss']);

/** This handler only ever serves the input banner, so the source is fixed. */
const BANNER_SOURCE = 'banner';

/**
 * Actions already reported by this backend process.
 *
 * The banner comes back on every session switch (ChatInput clears its dismissed
 * flag), so forwarding every impression would fill the denominator with repeats
 * from one install, and a user who closes it five times would produce more
 * dismissals than impressions — a funnel that reads backwards. Each action is
 * worth one report per install; once per process approximates that without
 * storing anything on disk.
 */
const reportedActions = new Set<string>();

/** Lets a test start from a clean process-level suppression set. */
export function resetTelemetryConsentBannerTracking(): void {
  reportedActions.clear();
}

/**
 * Reports that the consent banner was shown, or that the user closed it without
 * answering.
 *
 * Sent with `requireConsent: false` deliberately. An accept rate cannot be
 * computed from the installs that accepted, and this event carries nothing
 * beyond what an accepted install already sends — the same footing on which the
 * announcements fetch already runs without consent.
 *
 * The stored consent decision is left alone: closing the banner keeps the status
 * PENDING, and that is exactly what separates a dismissal from a denial.
 */
export function trackTelemetryConsentBannerHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): void {
  const action = typeof message.payload?.action === 'string' ? message.payload.action : '';

  if (BANNER_ACTIONS.has(action) && !reportedActions.has(action)) {
    reportedActions.add(action);
    trackEvent(
      'telemetry_consent',
      { action, source: BANNER_SOURCE, pluginVersion: getPluginVersion() },
      { requireConsent: false },
    );
  }

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
  });
}
