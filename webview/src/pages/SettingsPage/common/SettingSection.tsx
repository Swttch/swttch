import {ReactNode} from "react";

interface SettingSectionProps {
  /**
   * Omit for a section that opens a screen and so has nothing to distinguish
   * itself from: the screen's own heading already says what it is, and a
   * subtitle repeating it adds a line without adding a distinction.
   */
  title?: ReactNode;
  description?: ReactNode;
  /**
   * Rendered at the far right of the title row. For status that belongs to the
   * section as a whole rather than to any one row — an installed version, an
   * update button — which would otherwise need a row of its own and read as
   * another setting.
   */
  titleAction?: ReactNode;
  /**
   * Dim the rows and stop them taking input, for a section whose settings
   * cannot take effect yet (a missing dependency, say). The title row stays
   * live so whatever `titleAction` offers — usually the way to fix it — is
   * still reachable.
   */
  disabled?: boolean;
  children: ReactNode;
}

export function SettingSection({
  title,
  description,
  titleAction,
  disabled = false,
  children,
}: SettingSectionProps) {
  return (
    <section className="mb-10">
      {(title || titleAction) && (
        <div className={`flex items-center gap-4 mb-4 ${title ? 'justify-between' : 'justify-end'}`}>
          {title && (
            // Set in the ordinary case, not in small caps. A section heading is
            // a quiet label above its card rather than a shout, and uppercase
            // only ever applied to half our users anyway: it does nothing to
            // Korean, Japanese or Chinese, so the same heading read as two
            // different designs depending on the interface language.
            <h2 className="text-[0.9230rem] font-medium text-text-primary">
              {title}
            </h2>
          )}
          {titleAction}
        </div>
      )}
      {description && (typeof description === 'string' ? (
        <p className="text-[0.8461rem] font-normal text-text-secondary -mt-2 mb-3">{description}</p>
      ) : description)}
      <div
        className={
          // The outline is the same colour as the dividers inside it, so the
          // card reads as one quiet enclosure rather than as a box with a
          // stronger frame than its own contents.
          'bg-surface-raised rounded-2xl border border-border-subtle px-5 ' +
          // aria-disabled rather than a fieldset: the rows are a mix of custom
          // controls and native inputs, and `inert` is not available in every
          // WebView we run in, so pointer-events carries the interaction block
          // while aria-disabled carries the meaning.
          (disabled ? 'opacity-50 pointer-events-none select-none' : '')
        }
        aria-disabled={disabled || undefined}
      >
        {children}
      </div>
    </section>
  );
}
