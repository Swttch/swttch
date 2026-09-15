import { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Portal } from '@/components/Portal';
import { useAccountData } from './useAccountData';
import { SectionLabel } from './SectionLabel';
import { InfoRow, InfoRowSkeleton } from './InfoRow';
import { UsageSection } from "./UsageSection";
import { UsageReportSection } from "./UsageReportSection";

interface AccountUsageModalProps {
  onClose: () => void;
}

export function AccountUsageModal({ onClose }: AccountUsageModalProps) {
  const { t } = useTranslation('common');
  const { data: accountData, isLoading: accountLoading } = useAccountData();

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
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-md font-semibold text-text-primary">{t('accountUsage.title')}</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* ACCOUNT section */}
          <div>
            <SectionLabel>{t('accountUsage.accountSection')}</SectionLabel>
            {accountLoading && !accountData ? (
              <>
                <InfoRowSkeleton />
                <InfoRowSkeleton />
                <InfoRowSkeleton />
              </>
            ) : (
              <>
                <InfoRow label={t('accountUsage.authMethod')} value={accountData?.authMethod ?? null} />
                {/*
                  An API key has no email to show, and the CLI nulls the field rather
                  than omitting it. Naming the variable the credential came from turns a
                  blank row into an answer: the panel is not broken, the account simply
                  is not a subscription login.
                */}
                {accountData?.apiKeySource ? (
                  <InfoRow label={t('accountUsage.credentialSource')} value={accountData.apiKeySource} />
                ) : (
                  <InfoRow label={t('accountUsage.email')} value={accountData?.email ?? null} />
                )}
                <InfoRow label={t('accountUsage.plan')} value={accountData?.plan ?? null} />
              </>
            )}
          </div>

          {/* USAGE section */}
          <UsageSection />

          {/* Detailed /usage breakdown (claude -p "/usage") */}
          <UsageReportSection />
        </div>
      </div>
    </div>
    </Portal>
  );
}
