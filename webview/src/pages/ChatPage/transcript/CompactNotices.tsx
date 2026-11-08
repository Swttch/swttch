import { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import type { LoadedMessageDto } from '../../../types';
import { formatTokenCount } from './compact';

/** The quiet grey of a summary line, as in the tool runs. */
const QUIET_TEXT = 'text-[#9c9c9c]';

/**
 * Where the conversation was compacted: one quiet line saying how many tokens that saved. The desktop app draws it
 * between the replies it kept and the ones that follow, in place of the summary the model was handed.
 */
export function CompactDivider({ message }: { message: LoadedMessageDto }) {
  const { t } = useTranslation('chat');
  const dropped = message.compactMetadata?.cumulativeDroppedTokens;
  return (
    <div className={`px-4 py-[25px] text-[0.9375rem] ${QUIET_TEXT}`} data-transcript-compact-divider>
      {typeof dropped === 'number' && dropped > 0
        ? t('transcript.compact.saved', { tokens: formatTokenCount(dropped) })
        : t('transcript.compact.title')}
    </div>
  );
}

/** A notice the CLI raised about the session: a line that opens to what it said. */
export function CliNotice({ message }: { message: LoadedMessageDto }) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-[17px]" data-transcript-notice>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 py-2 text-start text-[0.9375rem] transition-colors hover:text-[#d4d4d4] ${QUIET_TEXT}`}
      >
        <span>{t('transcript.compact.notices', { count: 1 })}</span>
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className={`px-1 pt-1 text-[0.8461rem] leading-[1.5] ${QUIET_TEXT}`}>{message.content}</div>}
    </div>
  );
}
