import { useState, useEffect, useCallback } from 'react';
import { useBridge } from './useBridge';
import type { TunnelErrorCode } from './tunnelError';
import { buildRemotePairUrl } from './buildRemotePairUrl';
import { MessageType } from '@/shared';

export type SleepExternalChange = 'none' | 'setting' | 'scheme';

function asExternalChange(value: unknown): SleepExternalChange {
  return value === 'setting' || value === 'scheme' ? value : 'none';
}

interface TunnelStatus {
  tunnelEnabled: boolean;
  tunnelUrl: string | null;
  tunnelLoading: boolean;
  /**
   * The QR pairing URL for the running tunnel, or null until issued. Built as
   * `<tunnel>/<current session path>?...&pair=<code>` so the scanning device opens
   * the same session the user is viewing. Carries a short-lived single-use pairing
   * code — NEVER the auth token. Rotated by issuePairing().
   */
  pairUrl: string | null;
  /** True while a fresh pairing code is being issued. */
  pairLoading: boolean;
  /** Issue (or rotate) a fresh single-use pairing code and refresh pairUrl. */
  issuePairing: () => Promise<void>;
  /** null until the prerequisite probe returns; false means cloudflared is missing. */
  cloudflaredAvailable: boolean | null;
  /** true when the user toggled on but cloudflared must be installed first. */
  awaitingInstallConsent: boolean;
  /** true while cloudflared is being installed after the user consented. */
  installing: boolean;
  preventSleep: boolean;
  sleepLoading: boolean;
  /** Someone else changed the lid setting the sleep guard holds; only the user's click may move the switch. */
  sleepExternalChange: SleepExternalChange;
  error: string | null;
  errorCode: TunnelErrorCode | null;
  handleTunnelToggle: (checked: boolean) => Promise<void>;
  handleSleepToggle: (checked: boolean) => Promise<void>;
  confirmInstallAndStart: () => Promise<void>;
  cancelInstall: () => void;
  retryTunnel: () => Promise<void>;
}

export function useTunnelStatus(): TunnelStatus {
  const { send, subscribe } = useBridge();

  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [cloudflaredAvailable, setCloudflaredAvailable] = useState<boolean | null>(null);
  const [awaitingInstallConsent, setAwaitingInstallConsent] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [preventSleep, setPreventSleep] = useState(false);
  const [sleepLoading, setSleepLoading] = useState(false);
  const [sleepExternalChange, setSleepExternalChange] = useState<SleepExternalChange>('none');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<TunnelErrorCode | null>(null);
  const [pairUrl, setPairUrl] = useState<string | null>(null);
  const [pairLoading, setPairLoading] = useState(false);

  // Issue (or rotate) a single-use pairing code and refresh the QR pairing URL.
  // Only valid while the tunnel is running; errors are swallowed (the QR simply
  // stays absent) so a transient failure never breaks the modal.
  const issuePairing = useCallback(async () => {
    setPairLoading(true);
    try {
      const res = await send(MessageType.ISSUE_TUNNEL_PAIRING, {});
      const p = res.payload ?? res;
      if (p.status === 'ok' && typeof p.pairUrl === 'string') {
        // The backend returns `<tunnelOrigin>/?pair=<code>` (root path). Rebuild it
        // onto the desktop's current session location so the scanning device opens
        // the SAME session, not the project list. Token is never carried.
        setPairUrl(buildRemotePairUrl(p.pairUrl, window.location.href));
      }
    } catch {
      // leave pairUrl as-is; the modal shows a regenerate affordance
    } finally {
      setPairLoading(false);
    }
  }, [send]);

  // Start the tunnel unconditionally (caller has ensured cloudflared exists).
  const startTunnelNow = useCallback(async () => {
    setTunnelLoading(true);
    try {
      const res = await send(MessageType.TUNNEL_START, { port: Number(window.location.port) || 80 });
      if (res.status === 'error') {
        setError(res.error as string);
        setErrorCode('unknown');
        setTunnelLoading(false);
      }
    } catch {
      setTunnelLoading(false);
    }
  }, [send]);

  // Fetch initial status
  useEffect(() => {
    send(MessageType.GET_TUNNEL_STATUS, {}).then((res) => {
      const p = res.payload ?? res;
      if (p.status === 'ok') {
        setTunnelEnabled(p.tunnel.enabled);
        setTunnelUrl(p.tunnel.url ?? null);
        setPreventSleep(p.sleepGuard.enabled);
        setSleepExternalChange(asExternalChange(p.sleepGuard.externalChange));
      }
    }).catch(() => {});
  }, [send]);

  // Probe prerequisites (cloudflared availability) so the UI can warn/ask upfront
  useEffect(() => {
    send(MessageType.GET_TUNNEL_PREREQS, {}).then((res) => {
      const p = res.payload ?? res;
      if (p.status === 'ok') setCloudflaredAvailable(Boolean(p.cloudflaredAvailable));
    }).catch(() => {});
  }, [send]);

  // Subscribe to broadcast updates
  useEffect(() => {
    const unsubTunnel = subscribe(MessageType.TUNNEL_STATUS, (msg) => {
      const p = msg.payload as Record<string, unknown>;
      const enabled = p.enabled as boolean;
      setTunnelEnabled(enabled);
      setTunnelUrl(p.url as string | null);
      setTunnelLoading(false);
      // A stopped tunnel invalidates any pairing URL (the code is dead anyway).
      if (!enabled) setPairUrl(null);
      if (p.error) {
        setError(p.error as string);
        setErrorCode((p.errorCode as TunnelErrorCode) ?? 'unknown');
      }
    });
    const unsubInstall = subscribe(MessageType.CLOUDFLARED_INSTALL_STATUS, (msg) => {
      const p = msg.payload as Record<string, unknown>;
      setInstalling(false);
      if (p.status === 'installed') {
        setCloudflaredAvailable(true);
        startTunnelNow();
      } else {
        setError((p.error as string) ?? 'Installation failed');
        setErrorCode('cloudflared-missing');
      }
    });
    const unsubSleep = subscribe(MessageType.SLEEP_GUARD_STATUS, (msg) => {
      const p = msg.payload as Record<string, unknown>;
      setPreventSleep(p.enabled as boolean);
      setSleepExternalChange(asExternalChange(p.externalChange));
      setSleepLoading(false);
    });
    return () => { unsubTunnel(); unsubInstall(); unsubSleep(); };
  }, [subscribe, startTunnelNow]);

  const handleTunnelToggle = useCallback(async (checked: boolean) => {
    setError(null);
    setErrorCode(null);
    if (checked) {
      // Missing cloudflared → ask for install consent instead of starting.
      if (cloudflaredAvailable === false) {
        setAwaitingInstallConsent(true);
        return;
      }
      await startTunnelNow();
    } else {
      setAwaitingInstallConsent(false);
      // Sleep prevention is NOT touched here. The two toggles are independent
      // features, and only the user's own click may move the sleep one. Stopping
      // the tunnel used to turn sleep prevention off silently, which is a decision
      // that was never the tunnel's to make.
      await send(MessageType.TUNNEL_STOP, {}).catch(() => {});
    }
  }, [cloudflaredAvailable, startTunnelNow, send]);

  const confirmInstallAndStart = useCallback(async () => {
    setAwaitingInstallConsent(false);
    setError(null);
    setErrorCode(null);
    setInstalling(true);
    // Outcome arrives via the CLOUDFLARED_INSTALL_STATUS broadcast, which then
    // starts the tunnel on success.
    await send(MessageType.INSTALL_CLOUDFLARED, {}).catch(() => {
      setInstalling(false);
      setError('Installation failed');
      setErrorCode('cloudflared-missing');
    });
  }, [send]);

  const cancelInstall = useCallback(() => {
    setAwaitingInstallConsent(false);
  }, []);

  const handleSleepToggle = useCallback(async (checked: boolean) => {
    setError(null);
    if (checked) {
      setSleepLoading(true);
      try {
        const res = await send(MessageType.SLEEP_GUARD_ENABLE, {});
        if (res.status === 'error') {
          setError(res.error as string);
          setSleepLoading(false);
        }
      } catch {
        setSleepLoading(false);
      }
    } else {
      await send(MessageType.SLEEP_GUARD_DISABLE, {}).catch(() => {});
    }
  }, [send]);

  const retryTunnel = useCallback(() => handleTunnelToggle(true), [handleTunnelToggle]);

  return {
    tunnelEnabled,
    tunnelUrl,
    tunnelLoading,
    pairUrl,
    pairLoading,
    issuePairing,
    cloudflaredAvailable,
    awaitingInstallConsent,
    installing,
    preventSleep,
    sleepLoading,
    sleepExternalChange,
    error,
    errorCode,
    handleTunnelToggle,
    handleSleepToggle,
    confirmInstallAndStart,
    cancelInstall,
    retryTunnel,
  };
}
