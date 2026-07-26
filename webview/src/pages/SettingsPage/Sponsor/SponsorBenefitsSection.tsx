import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { featureDocUrl } from '@/config/app';
import { useTranslation } from '@/i18n';

/**
 * The features a sponsorship carries.
 *
 * Deliberately just links: the names alone already need translating in every
 * locale, and duplicating each feature's explanation here would mean maintaining
 * a second copy of docs that already exist. Each entry opens its feature doc in
 * the browser, where the reader can pick their language.
 *
 * Labels come from the feature docs' own titles rather than the i18n bundle —
 * they name a document, and the document is what the link opens.
 */
const BENEFITS: Array<{ folder: string; label: string }> = [
  { folder: '018-scheduled_messages', label: 'Scheduled messages' },
  { folder: '019-auto_resume_on_limit', label: 'Auto-resume on usage limit' },
];

export function SponsorBenefitsSection() {
  const { t } = useTranslation('settings');

  return (
    <div className="pt-5">
      <h3 className="text-sm font-semibold text-text-primary">{t('sponsor.benefits.title')}</h3>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed break-keep">
        {t('sponsor.benefits.description')}
      </p>

      <ul className="mt-4 space-y-2">
        {BENEFITS.map((benefit) => (
          <li key={benefit.folder}>
            <a
              href={featureDocUrl(benefit.folder)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-text-link transition-opacity hover:opacity-80"
            >
              {benefit.label}
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
