import { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import type { LoadedMessageDto } from '../../../types';
import { formatTokensFor } from '@/utils/workflowFormat';
import { compactSavedTokens } from './compact';

/** The quiet grey of a summary line, as in the tool runs. */
const QUIET_TEXT = 'text-[var(--tr-muted)]';

/**
 * Where the conversation was compacted: one quiet line saying how many tokens that saved. The desktop app draws it
 * between the replies it kept and the ones that follow, in place of the summary the model was handed.
 */
export function CompactDivider({ message }: { message: LoadedMessageDto }) {
  const { t, i18n } = useTranslation('chat');
  const saved = compactSavedTokens(message);
  const tokens = saved === undefined ? undefined : formatTokensFor(i18n.language, saved);
  return (
    <div className={`-mt-2 px-4 py-[0.625rem] text-[0.8438rem] leading-[1rem] ${QUIET_TEXT}`} data-transcript-compact-divider>
      {tokens ? t('transcript.compact.saved', { tokens }) : t('transcript.compact.title')}
    </div>
  );
}

/** A notice the CLI raised about the session: a line that opens to what it said. */
export function CliNotice({ message }: { message: LoadedMessageDto }) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 pb-[0.8rem] pt-[0.175rem]" data-transcript-notice>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-[0.225rem] py-[0.45rem] text-start text-[0.8438rem] leading-[1rem] transition-colors hover:text-[var(--tr-hover)] ${QUIET_TEXT}`}
      >
        <span>{t('transcript.compact.notices', { count: 1 })}</span>
        <ChevronDownIcon className={`h-[0.9rem] w-[0.9rem] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className={`ps-3 text-sm leading-[var(--chat-line-height,1.6)] ${QUIET_TEXT}`}>{message.content}</div>}
    </div>
  );
}
