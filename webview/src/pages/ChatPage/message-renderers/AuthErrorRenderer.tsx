import { useAuthContext } from '@/contexts';
import { LoadedMessageDto, getTextContent } from '../../../types';
import { LoginCta } from '../LoginCta';

interface Props {
  message: LoadedMessageDto;
}

/**
 * Renders the CLI's authentication-failure entry (401 / authentication_failed)
 * as a single line — a red status dot, the dimmed error text, and an inline
 * login CTA pushed to the right edge.
 *
 * Both the dot and the CTA read the state THIS entry describes, not the ambient
 * `loggedIn` alone: an auth check that predates the failure is stale, since
 * `claude auth status` keeps reporting a revoked token as logged in. Only a
 * check made after the failure can turn the line green.
 */
export function AuthErrorRenderer(props: Props) {
  const { message } = props;
  const { loggedIn, checkedAt } = useAuthContext();

  const failedAt = message.timestamp ? Date.parse(message.timestamp) : NaN;
  // An unparseable/absent timestamp cannot date the failure, so no auth check can
  // be shown to postdate it — fall back to the failure standing (dot stays red).
  const authFailedAt = Number.isNaN(failedAt) ? Infinity : failedAt;
  const resolved = loggedIn === true && checkedAt > authFailedAt;

  return (
    <div className="group pt-2 pb-4 px-6">
      <div className="flex items-center gap-3 flex-wrap text-text-primary text-[1rem] leading-relaxed">
        {/* Counted as a message like any other bullet — see `ToolWrapper`. */}
        <span data-message-bullet className={`${resolved ? 'text-green-500' : 'text-red-500 animate animate-pulse'} mt-[1px] text-[0.6923rem]`}>●</span>
        <span className="opacity-75 mr-auto">{getTextContent(message)}</span>
        <LoginCta authFailedAt={authFailedAt} />
      </div>
    </div>
  );
}
