import { useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

/**
 * The maintainer's note on why sponsorship is being asked for — the same answer
 * the pricing page's FAQ gives, shown here as a short letter.
 *
 * Collapsed by default, and on purpose. Opening the screen straight into a
 * personal appeal reads as pleading; behind a quiet question, it is there for
 * whoever wants to know. Expanded, it is centred and italic so it reads as a
 * note from a person rather than more product copy.
 *
 * Each paragraph arrives as an array of LINES. The breaks are authored — they
 * carry the cadence of the letter, and where a clause should end differs per
 * language — so they live in the catalogs rather than being re-derived here by
 * splitting on punctuation.
 */
export function SponsorLetter() {
  const { t } = useTranslation('settings');
  const [open, setOpen] = useState(false);
  const paragraphs = t('sponsor.letter', { returnObjects: true }) as string[][];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <ChevronRightIcon
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        {t('sponsor.letterToggle')}
      </button>

      {open && (
        <div className="mt-4 px-2 text-center">
          <div className="space-y-4">
            {paragraphs.map((lines) => (
              <p
                key={lines[0]}
                className="text-[0.95rem] italic leading-relaxed text-text-tertiary break-keep"
              >
                {lines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
            ))}
          </div>
          <p className="mt-5 text-[0.95rem] italic text-text-tertiary">
            {t('sponsor.letterSignature')}
          </p>
        </div>
      )}
    </div>
  );
}
