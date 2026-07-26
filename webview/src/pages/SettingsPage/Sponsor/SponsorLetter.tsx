import { useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

/**
 * Break a paragraph after every comma and sentence end, so the letter reads one
 * clause per line.
 *
 * Done at render time rather than in the catalogs: a translator writes normal
 * prose, and the line breaks are presentation. The punctuation stays attached to
 * the clause it belongs to, and the CJK forms (，、。) are handled alongside the
 * Latin ones because the same letter ships in twelve languages.
 */
function toLines(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[,.!?，、。！？])\s*/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * The maintainer's note on why sponsorship is being asked for — the same answer
 * the pricing page's FAQ gives, shown here as a short letter.
 *
 * Collapsed by default, and on purpose. Opening the screen straight into a
 * personal appeal reads as pleading; behind a quiet question, it is there for
 * whoever wants to know. Expanded, it is centred and italic so it reads as a
 * note from a person rather than more product copy.
 */
export function SponsorLetter() {
  const { t } = useTranslation('settings');
  const [open, setOpen] = useState(false);
  const paragraphs = t('sponsor.letter', { returnObjects: true }) as string[];

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
        <div className="mt-4 space-y-4 px-2 text-center">
          {paragraphs.map((paragraph) => (
            <p
              key={paragraph}
              className="text-[0.95rem] italic leading-relaxed text-text-tertiary break-keep"
            >
              {toLines(paragraph).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
