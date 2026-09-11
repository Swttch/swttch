import { UserIcon } from '@heroicons/react/24/outline';

interface Props {
  /** Who the message is going to, in the words the CLI used for them. */
  name: string;
  /** The model that agent runs on, when the CLI said. */
  model?: string;
}

/**
 * Who this input is pointed at.
 *
 * The session input's bottom bar opens with the permission mode — under what
 * terms this message goes out. An agent input's equivalent question is who it
 * goes to, and it is not a rhetorical one: a workflow's agents are picked from
 * tabs, so the recipient changes under you as you click around.
 *
 * Styled after the session input's own tags rather than freshly: same height,
 * same muted treatment, so the two bars read as one family.
 */
export function AgentRecipientTag(props: Props) {
  const { name, model } = props;

  return (
    <span
      className="flex items-center gap-1 px-1.5 h-[22px] rounded text-[0.7692rem] text-text-tertiary min-w-0"
      title={model ? `${name} · ${model}` : name}
    >
      <UserIcon className="w-3 h-3 shrink-0" />
      <span className="truncate">{name}</span>
      {model && (
        <>
          <span className="text-text-tertiary/50">·</span>
          <span className="truncate">{model}</span>
        </>
      )}
    </span>
  );
}
