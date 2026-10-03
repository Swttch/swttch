import { Fragment } from 'react';

/** The chip the empty-chat hint draws around "Shift" and "Tab". */
const KEY_CAP_CLASS =
  'inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 bg-surface-tooltip rounded text-text-secondary text-xs font-mono';

interface KeyCapsProps {
  /** One entry per alternative; each alternative is the chips of one combination. */
  combos: readonly (readonly string[])[];
}

/**
 * One chip per key, with a slash between alternatives that do the same job in
 * a pair (the start and the end of a line, say).
 */
export function KeyCaps(props: KeyCapsProps) {
  const { combos } = props;

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
      {combos.map((caps, comboIndex) => (
        <Fragment key={comboIndex}>
          {comboIndex > 0 && (
            <span aria-hidden="true" className="text-text-tertiary text-xs">
              /
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            {caps.map((cap, capIndex) => (
              <kbd key={capIndex} className={KEY_CAP_CLASS}>
                {cap}
              </kbd>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
