import { useEffect, useState } from 'react';
import { XMarkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Portal } from '@/components/Portal';
import { useTranslation } from '@/i18n';
import { LoginCodeInput } from '../LoginCodeInput';

interface Props {
  onOpenUrl: () => void;
  onSubmitCode: (code: string) => void;
  onClose: () => void;
}

/**
 * Shown once `claude auth login` prints its OAuth URL (the backend forwards it
 * instead of opening it, which would double-open — see login.ts). The user opens
 * the sign-in page with the button when the CLI's own auto-open didn't fire (e.g.
 * WSL, where claude can't reach a Windows browser).
 *
 * The code entry is collapsed by default. Whether a pasted code is actually needed
 * depends on whether the browser's callback page can reach claude's local loopback
 * server — which succeeds (auto-completes, no code) or fails (shows a code to
 * paste) entirely on the browser side. The CLI's output and the OAuth URL are
 * identical in both cases, so we can't detect it; instead the user reveals the
 * field only when their browser actually handed them a code. Issue #57.
 */
export function LoginUrlModal(props: Props) {
  const { onOpenUrl, onSubmitCode, onClose } = props;
  const { t } = useTranslation('switchAccount');
  const [showCodeInput, setShowCodeInput] = useState(false);

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

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-sm bg-surface-raised border border-border-default rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-md font-semibold text-text-primary">{t('urlModal.title')}</h2>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-3">
            <p className="text-sm text-text-secondary leading-relaxed">
              {t('urlModal.description')}
            </p>

            <button
              onClick={onOpenUrl}
              className="w-full py-2.5 rounded-lg bg-accent-claude hover:bg-accent-claude-hover text-white font-semibold text-sm transition-colors flex items-center justify-center gap-1.5"
            >
              {t('urlModal.openButton')}
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </button>

            {showCodeInput ? (
              <LoginCodeInput onSubmit={onSubmitCode} />
            ) : (
              <button
                onClick={() => setShowCodeInput(true)}
                className="w-full text-xs text-text-link hover:underline text-center py-1 bg-transparent border-none cursor-pointer"
              >
                {t('urlModal.revealCode')}
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
