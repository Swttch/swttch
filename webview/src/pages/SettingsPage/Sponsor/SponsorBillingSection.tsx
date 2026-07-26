import { ArrowTopRightOnSquareIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import { useSponsorInvoices, type SponsorInvoice } from '@/hooks/queries/useSponsorAccount';
import { useTranslation } from '@/i18n';

/**
 * Render an amount the way the payment provider recorded it.
 *
 * `total` arrives in the smallest currency unit (cents for USD), so it is scaled
 * before formatting. Intl handles the per-currency decimals, which is why the
 * currency code is passed through rather than assumed.
 */
function formatAmount(invoice: SponsorInvoice): string {
  if (invoice.total === null) return '';
  const currency = invoice.currency ?? 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      invoice.total / 100,
    );
  } catch {
    // Unknown currency code — show the bare number rather than nothing.
    return String(invoice.total / 100);
  }
}

function formatDate(iso: string | null): string {
  if (iso === null) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString();
}

/**
 * Payment history, newest first, each row linking to its receipt.
 *
 * Receipts are hosted and signed by the payment provider, so the link opens
 * there rather than rendering a document we would have to keep in sync.
 */
export function SponsorBillingSection() {
  const { t } = useTranslation('settings');
  const { data: invoices = [], isLoading } = useSponsorInvoices(true);

  return (
    <div className="pt-5">
      <div className="flex items-center gap-2">
        <ReceiptPercentIcon className="w-5 h-5 text-text-secondary" />
        <h3 className="text-sm font-semibold text-text-primary">{t('sponsor.billing.title')}</h3>
      </div>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed break-keep">
        {t('sponsor.billing.description')}
      </p>

      {isLoading ? (
        <p className="mt-4 text-xs text-text-tertiary">{t('sponsor.billing.loading')}</p>
      ) : invoices.length === 0 ? (
        <p className="mt-4 text-xs text-text-tertiary">{t('sponsor.billing.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-default border-t border-border-default">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="text-sm text-text-primary">{formatAmount(invoice)}</div>
                <div className="mt-0.5 truncate text-xs text-text-tertiary">
                  {[formatDate(invoice.paidAt), invoice.status].filter(Boolean).join(' · ')}
                </div>
              </div>
              {invoice.receiptUrl !== null && (
                <a
                  href={invoice.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary hover:bg-surface-hover"
                >
                  {t('sponsor.billing.receipt')}
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
