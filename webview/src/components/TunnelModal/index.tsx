import { useEffect, useState, useRef } from 'react';
import { XMarkIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { QRCodeSVG } from 'qrcode.react';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { SleepPreventionSwitch, SleepPreventionHint, useSleepPreventionCopy } from '@/components/SleepPrevention';
import { Portal } from '@/components/Portal';
import { TunnelStatusNotice } from '@/components/TunnelStatusNotice';
import { useTunnelStatus } from '@/hooks';
import { useTranslation } from '@/i18n';

interface Props {
  onClose: () => void;
}

export function TunnelModal(props: Props) {
  const { onClose } = props;
  const { t } = useTranslation('common');
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

  // Once the tunnel is up, request a fresh single-use pairing code so the QR
  // encodes `<tunnel>/?pair=<code>` (never the auth token). Re-issue happens via
  // the regenerate button when the short-lived code expires.
  useEffect(() => {
    if (tunnelEnabled && tunnelUrl && !pairUrl && !pairLoading) {
      issuePairing();
    }
  }, [tunnelEnabled, tunnelUrl, pairUrl, pairLoading, issuePairing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-md font-semibold text-text-primary">{t('tunnelModal.title')}</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
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

          {/* Tunnel toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">{t('tunnelModal.remoteTunnelUnofficial')}</div>
              <div className="text-xs text-text-tertiary">{t('tunnelModal.exposeVia')}</div>
            </div>
            <ToggleSwitch
              checked={tunnelEnabled}
              onChange={handleTunnelToggle}
              disabled={tunnelLoading || installing}
            />
          </div>

          {/* Loading indicator */}
          {(tunnelLoading || installing) && (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>{installing ? t('tunnelModal.installingCloudflared') : t('tunnelModal.connecting')} ({elapsedSec}s)</span>
              </div>
              <p className="text-xs text-text-disabled">{t('tunnelModal.typicalTime')}</p>
            </div>
          )}

          {/* Pairing URL + QR — encodes a short-lived single-use pairing code
              (?pair=), never the auth token. */}
          {tunnelEnabled && pairUrl && (
            <div className="space-y-3">
              <p className="text-xs text-text-tertiary">{t('tunnelModal.pairingHint')}</p>
              <div className="flex items-center gap-2">
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
                className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-3 h-3 ${pairLoading ? 'animate-spin' : ''}`} />
                <span>{t('tunnelModal.regeneratePairing')}</span>
              </button>
            </div>
          )}

          {/* Sleep prevention, shared with the Settings page. Independent of the
              tunnel: only its own switch moves it. */}
          <div className="border-t border-border-default pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-primary">{sleepCopy.label}</div>
                <div className="text-xs text-text-tertiary">{sleepCopy.description}</div>
              </div>
              <SleepPreventionSwitch
                checked={preventSleep}
                loading={sleepLoading}
                onChange={handleSleepToggle}
              />
            </div>
            {preventSleep && <SleepPreventionHint externalChange={sleepExternalChange} />}
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
