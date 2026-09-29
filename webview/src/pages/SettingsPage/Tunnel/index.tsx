import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { TunnelStatusNotice } from '@/components/TunnelStatusNotice';
import { SettingSection, SettingRow } from '../common';
import { useTunnelStatus } from '@/hooks';
import { useTranslation } from '@/i18n';
import { SleepPreventionSwitch, SleepPreventionHint, useSleepPreventionCopy } from '@/components/SleepPrevention';

export function TunnelSettings() {
  const { t } = useTranslation('settings');
  const sleepCopy = useSleepPreventionCopy();
  const {
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
  } = useTunnelStatus();

  const [copied, setCopied] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request a fresh single-use pairing code once the tunnel is up so the QR
  // encodes `<tunnel>/?pair=<code>` (never the auth token).
  useEffect(() => {
    if (tunnelEnabled && tunnelUrl && !pairUrl && !pairLoading) {
      issuePairing();
    }
  }, [tunnelEnabled, tunnelUrl, pairUrl, pairLoading, issuePairing]);

  useEffect(() => {
    if (tunnelLoading || installing) {
      setElapsedSec(0);
      elapsedRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } else {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [tunnelLoading, installing]);

  const handleCopy = () => {
    if (!pairUrl) return;
    navigator.clipboard.writeText(pairUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-6">{t('nav.tunnel')}</h2>

      <SettingSection title={t('tunnel.connection.title')}>
        <TunnelStatusNotice
          cloudflaredAvailable={cloudflaredAvailable}
          tunnelEnabled={tunnelEnabled}
          tunnelLoading={tunnelLoading}
          installing={installing}
          awaitingInstallConsent={awaitingInstallConsent}
          error={error}
          errorCode={errorCode}
          onRetry={retryTunnel}
          onConfirmInstall={confirmInstallAndStart}
          onCancelInstall={cancelInstall}
        />
        <SettingRow
          label={t('tunnel.connection.enable.label')}
          description={t('tunnel.connection.enable.description')}
        >
          <ToggleSwitch
            checked={tunnelEnabled}
            onChange={handleTunnelToggle}
            disabled={tunnelLoading || installing}
          />
        </SettingRow>

        {(tunnelLoading || installing) && (
          <div className="py-4 border-b border-border-default flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>
                {installing
                  ? t('tunnel.connection.installingProgress', { seconds: elapsedSec })
                  : t('tunnel.connection.establishingProgress', { seconds: elapsedSec })}
              </span>
            </div>
            <p className="text-xs text-text-disabled">{t('tunnel.connection.estimatedTime')}</p>
          </div>
        )}

        {tunnelEnabled && pairUrl && (
          <div className="py-4 border-b border-border-default">
            <p className="text-xs text-text-tertiary mb-3">{t('tunnel.connection.pairingHint')}</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="font-mono text-[0.8461rem] text-text-secondary flex-1 truncate">{pairUrl}</span>
              <button onClick={handleCopy} className="flex-shrink-0">
                {copied
                  ? <ClipboardDocumentCheckIcon className="w-3 h-3 text-state-success-fg" />
                  : <ClipboardDocumentIcon className="w-3 h-3 text-text-secondary hover:text-text-primary cursor-pointer" />
                }
              </button>
            </div>
            <div className="flex justify-start">
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG value={pairUrl} size={100} bgColor="#ffffff" fgColor="#000000" />
              </div>
            </div>
            <button
              onClick={() => issuePairing()}
              disabled={pairLoading}
              className="mt-3 flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-3 h-3 ${pairLoading ? 'animate-spin' : ''}`} />
              <span>{t('tunnel.connection.regeneratePairing')}</span>
            </button>
          </div>
        )}
      </SettingSection>

      <SettingSection title={sleepCopy.label}>
        <SettingRow
          label={sleepCopy.label}
          description={sleepCopy.description}
          below={preventSleep ? <SleepPreventionHint externalChange={sleepExternalChange} /> : undefined}
        >
          <SleepPreventionSwitch
            checked={preventSleep}
            loading={sleepLoading}
            onChange={handleSleepToggle}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}
