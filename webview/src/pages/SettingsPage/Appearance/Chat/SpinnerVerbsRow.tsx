import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { SettingRow } from '../../common';
import { SettingBadge, SettingBadgeVariant } from '@/components';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useTranslation } from '@/i18n';
import { SpinnerVerbsMode } from '@/types/claude-settings';
import { useClaudeDisplaySettings, useIsOverriddenByProject } from '@/utils/settingsScope';

const SPINNER_VERBS_DOC_HREF = 'https://code.claude.com/docs/en/settings-reference#spinnerverbs';

const VERB_BOX_CLASS =
  'w-full rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-border-focus focus:outline-none';

/**
 * Whether this Enter confirms what was typed.
 *
 * The first Enter after typing Hangul only commits the syllable still being composed
 * (keyCode 229 in Safari). Taking it as "confirm" saved the verb, then the browser typed
 * the leftover syllable into the box that had just been emptied.
 */
function isConfirmingEnter(e: React.KeyboardEvent<HTMLInputElement>): boolean {
  return e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229;
}

interface VerbItemProps {
  verb: string;
  editLabel: string;
  removeLabel: string;
  /** The verb after editing; never empty, because emptying a verb removes it instead. */
  onChange: (verb: string) => void;
  onRemove: () => void;
}

/**
 * One verb on its own line: a box to edit it in place and a button to remove it.
 * Leaving the box (or pressing Enter) saves; leaving it empty removes the verb.
 */
function VerbItem({ verb, editLabel, removeLabel, onChange, onRemove }: VerbItemProps) {
  const [draft, setDraft] = useState(verb);

  // Follow the list when it changes underneath this line (a verb above was removed).
  useEffect(() => setDraft(verb), [verb]);

  const commit = () => {
    const next = draft.trim();
    if (next === verb) {
      setDraft(verb);
      return;
    }
    if (next === '') onRemove();
    else onChange(next);
  };

  return (
    // The × sits inside the box, at its end, rather than in a column beside it: a column
    // left free for it pushed every box short of the mode control above.
    <li className="relative">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (isConfirmingEnter(e)) commit();
        }}
        aria-label={editLabel}
        className={`${VERB_BOX_CLASS} pe-9`}
      />
      <button
        type="button"
        onClick={onRemove}
        title={removeLabel}
        aria-label={removeLabel}
        className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-text-tertiary transition-colors hover:text-text-primary"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

/**
 * Edits the Claude `spinnerVerbs` setting — the verbs the spinner shows while a turn
 * runs (#548). `Append` adds them to the built-in set, `Replace` shows only them.
 *
 * The verbs are a list, one line each: edit a line in place, remove it with ×, and add
 * the next in the empty box at the bottom. Every change saves at once, per
 * SettingsPage/CLAUDE.md. An empty list clears the key: Claude keeps its built-in
 * verbs for an empty `replace` anyway, so a hollow object in the file would be noise.
 * Reads/writes the active scope tab.
 */
export function SpinnerVerbsRow() {
  const isOverridden = useIsOverriddenByProject();
  const { t } = useTranslation('settings');
  const { updateSetting } = useClaudeSettings();
  // What the tab shows: its own value, or on the project tab the global one it inherits.
  const { displaySettings, isInherited, resetFor } = useClaudeDisplaySettings();

  const stored = displaySettings.spinnerVerbs;
  const storedMode = stored?.mode === SpinnerVerbsMode.Replace ? SpinnerVerbsMode.Replace : SpinnerVerbsMode.Append;
  const storedVerbs = (Array.isArray(stored?.verbs) ? stored.verbs : []).filter(
    (verb): verb is string => typeof verb === 'string',
  );
  // A key for the effect below: the array is rebuilt on every render, its content is what matters.
  const storedKey = JSON.stringify(storedVerbs);

  // Append is the default: a user who only types a verb does not lose the rest. The
  // verbs are kept here rather than read straight from the settings, because the
  // settings come back a round trip after the save and the list would lag behind the key press.
  const [draftMode, setDraftMode] = useState(storedMode);
  const [draftVerbs, setDraftVerbs] = useState(storedVerbs);
  const [newVerb, setNewVerb] = useState('');

  // Re-sync with the stored value when the scope tab (and thus what it displays)
  // changes underneath us.
  useEffect(() => setDraftMode(storedMode), [storedMode]);
  useEffect(() => setDraftVerbs(JSON.parse(storedKey) as string[]), [storedKey]);

  const save = (mode: SpinnerVerbsMode, verbs: string[]) => {
    // The mode means nothing without verbs, so changing only it writes nothing.
    const unchanged = JSON.stringify(verbs) === storedKey && (verbs.length === 0 || mode === storedMode);
    if (unchanged) return;
    void updateSetting('spinnerVerbs', verbs.length === 0 ? null : { mode, verbs });
  };

  const changeMode = (mode: SpinnerVerbsMode) => {
    setDraftMode(mode);
    save(mode, draftVerbs);
  };

  const changeVerbs = (verbs: string[]) => {
    setDraftVerbs(verbs);
    save(draftMode, verbs);
  };

  // In front, so the verb just typed sits directly under the box it was typed in.
  const addVerb = () => {
    const verb = newVerb.trim();
    setNewVerb('');
    if (verb === '') return;
    changeVerbs([verb, ...draftVerbs]);
  };

  // The controls sit under the description rather than beside it: a list of verbs needs
  // the width, and beside the text it wrapped the description into a narrow column.
  // SettingRow dims only what it holds beside the text, so the dimming a project
  // override calls for (#344) is done here for the controls placed below it.
  const controls = (
    <div className={isOverridden('spinnerVerbs') ? 'cursor-not-allowed' : undefined}>
      <div
        className={`mt-3 flex flex-col gap-3 ${isOverridden('spinnerVerbs') ? 'opacity-40 pointer-events-none select-none' : ''}`}
        aria-disabled={isOverridden('spinnerVerbs') || undefined}
      >
        <div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-secondary">{t('appearance.chat.spinnerVerbs.modeLabel')}</span>
            <SegmentedControl<SpinnerVerbsMode>
              label={t('appearance.chat.spinnerVerbs.modeLabel')}
              value={draftMode}
              onChange={changeMode}
              options={[
                { value: SpinnerVerbsMode.Append, label: t('appearance.chat.spinnerVerbs.append') },
                { value: SpinnerVerbsMode.Replace, label: t('appearance.chat.spinnerVerbs.replace') },
              ]}
            />
          </div>
          {/* Append and Replace do not explain themselves, so the chosen one carries
              the sentence Claude's docs give for that value. */}
          <p className="mt-1 text-end text-xs text-text-tertiary">
            {draftMode === SpinnerVerbsMode.Replace
              ? t('appearance.chat.spinnerVerbs.replaceHint')
              : t('appearance.chat.spinnerVerbs.appendHint')}
          </p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <span className="mt-1.5 flex-shrink-0 text-sm text-text-secondary">
            {t('appearance.chat.spinnerVerbs.verbsLabel')}
          </span>
          <div role="group" aria-label={t('appearance.chat.spinnerVerbs.verbsLabel')} className="w-full max-w-sm">
            <ul className="flex flex-col gap-2">
              {/* The add box stays on top and keeps focus after Enter, so verbs can be typed
                  one after another; each lands under it. */}
              <li>
                <input
                  type="text"
                  value={newVerb}
                  onChange={(e) => setNewVerb(e.target.value)}
                  onBlur={addVerb}
                  onKeyDown={(e) => {
                    if (isConfirmingEnter(e)) addVerb();
                  }}
                  placeholder={t('appearance.chat.spinnerVerbs.placeholder')}
                  aria-label={t('appearance.chat.spinnerVerbs.placeholder')}
                  className={VERB_BOX_CLASS}
                />
              </li>
              {draftVerbs.map((verb, index) => (
                <VerbItem
                  key={index}
                  verb={verb}
                  editLabel={t('appearance.chat.spinnerVerbs.edit', { name: verb })}
                  removeLabel={t('appearance.chat.spinnerVerbs.remove', { name: verb })}
                  onChange={(next) => changeVerbs(draftVerbs.map((current, i) => (i === index ? next : current)))}
                  onRemove={() => changeVerbs(draftVerbs.filter((_, i) => i !== index))}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <SettingRow
      label="spinnerVerbs"
      description={t('appearance.chat.spinnerVerbs.description')}
      isOverridden={isOverridden('spinnerVerbs')}
      isInherited={isInherited('spinnerVerbs')}
      onResetToGlobal={resetFor('spinnerVerbs')}
      badge={<SettingBadge variant={SettingBadgeVariant.ClaudeNative} docHref={SPINNER_VERBS_DOC_HREF} />}
      below={controls}
    >
      {null}
    </SettingRow>
  );
}
