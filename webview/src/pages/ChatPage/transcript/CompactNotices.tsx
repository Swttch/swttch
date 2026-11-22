import { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import type { LoadedMessageDto } from '../../../types';
import { formatTokenCount } from './compact';

/** The quiet grey of a summary line, as in the tool runs. */
const QUIET_TEXT = 'text-[var(--tr-muted)]';

/**
 * Where the conversation was compacted: one quiet line saying how many tokens that saved. The desktop app draws it
 * between the replies it kept and the ones that follow, in place of the summary the model was handed.
 */
export function CompactDivider({ message }: { message: LoadedMessageDto }) {
  const { t } = useTranslation('chat');
  const dropped = message.compactMetadata?.cumulativeDroppedTokens;
  return (
    <div className={`px-[0.9rem] py-[1.4062rem] text-[0.8438rem] ${QUIET_TEXT}`} data-transcript-compact-divider>
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
    <div className="px-[0.9rem] py-[0.9563rem]" data-transcript-notice>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-[0.225rem] py-[0.45rem] text-start text-[0.8438rem] transition-colors hover:text-[var(--tr-hover)] ${QUIET_TEXT}`}
      >
        <span>{t('transcript.compact.notices', { count: 1 })}</span>
        <ChevronDownIcon className={`h-[0.9rem] w-[0.9rem] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className={`px-[0.225rem] pt-[0.225rem] text-[0.7616rem] leading-[var(--chat-line-height,1.6)] ${QUIET_TEXT}`}>{message.content}</div>}
    </div>
  );
}
