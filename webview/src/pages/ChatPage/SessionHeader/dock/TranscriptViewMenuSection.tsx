import Tippy from '@tippyjs/react/headless';
import toast from 'react-hot-toast';
import { CheckIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useSettings } from '@/contexts/SettingsContext';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { SettingKey, TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '@/types/settings';
import { useTranscriptViewMode } from '../../message-renderers/transcriptViewMode';

const CLASSIC = 'classic';
type Choice = TranscriptViewMode | typeof CLASSIC;

/**
 * Marks the second menu so the ⋮ menu's own outside-click check can tell a press
 * inside it from a press outside. The second menu is drawn into `<body>`, so it
 * is not inside the ⋮ menu's DOM, and without this the press that picks a view
 * would close the ⋮ menu first and the pick would never land.
 */
export const TRANSCRIPT_VIEW_SUBMENU_ATTRIBUTE = 'data-transcript-view-submenu';

/**
 * "Transcript view" in the header menu: a row that opens a second menu beside
 * it when the pointer rests on it, the way the desktop app's menu does. The
 * second menu picks how THIS session's chat is drawn, and the check marks the
 * view in use, which for a session that has not been picked is the default from
 * the settings screen. A pick is kept by session id in `transcriptViewModeBySession`.
 *
 * The second menu is Tippy's, like the other menus in this UI, for what a hand
 * drawn box cannot do: it opens toward the start side of the row, and Popper
 * flips it to the other side when there is no room, and it is drawn into
 * `<body>` so the ⋮ menu cannot clip it. It is `interactive`, so the pointer can
 * travel from the row onto the menu without closing it.
 *
 * Hidden when there is no session to attach the pick to (the empty chat that
 * has not sent anything yet).
 */
export function TranscriptViewMenuSection({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation('chat');
  const { settings, updateSetting } = useSettings();
  const sessionId = useSessionContextOrNull()?.currentSessionId ?? null;
  const current = useTranscriptViewMode() ?? CLASSIC;

  if (!sessionId) return null;

  const choices: Choice[] = [...TRANSCRIPT_VIEW_MODES, CLASSIC];
  const pick = (choice: Choice) => {
    const bySession = settings[SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION] ?? {};
    void updateSetting(SettingKey.TRANSCRIPT_VIEW_MODE_BY_SESSION, { ...bySession, [sessionId]: choice });
    onPick();
  };

  const defaultChoice: Choice = settings[SettingKey.TRANSCRIPT_VIEW_MODE] ?? CLASSIC;
  const makeDefault = () => {
    void updateSetting(SettingKey.TRANSCRIPT_VIEW_MODE, current === CLASSIC ? null : current);
    toast.success(t('sessionHeader.transcriptView.defaultOffer.saved', { mode: t(`sessionHeader.transcriptView.${current}`) }));
    onPick();
  };

  return (
    <div className="border-t border-border-default py-1">
      <Tippy
        interactive
        // Opens on the pointer resting on the row. A click on it does nothing: the second menu is
        // already open by then, and a toggle would close it under the pointer.
        trigger="mouseenter focus"
        hideOnClick={false}
        placement="left-start"
        offset={[-4, 0]}
        delay={[80, 120]}
        appendTo={() => document.body}
        render={(attrs) => (
          <div
            role="menu"
            aria-label={t('sessionHeader.transcriptView.title')}
            {...{ [TRANSCRIPT_VIEW_SUBMENU_ATTRIBUTE]: '' }}
            className="min-w-[10rem] max-w-[16rem] bg-surface-raised border border-border-default rounded-md shadow-xl py-1 z-50"
            {...attrs}
          >
            {choices.map((choice) => (
              // Classic says what it is: it is not a view of the desktop app's, so its name alone does not.
              <Tooltip key={choice} content={choice === CLASSIC ? t('sessionHeader.transcriptView.classicHint') : undefined} placement="left">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice === current}
                  onClick={() => pick(choice)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
                >
                  <span>{t(`sessionHeader.transcriptView.${choice}`)}</span>
                  {choice === current && <CheckIcon className="w-4 h-4 text-text-secondary" />}
                </button>
              </Tooltip>
            ))}
            {current !== defaultChoice && (
              // Only for a view that is not the default yet, as in the desktop app: the way to keep it for every session.
              <>
                <div className="my-1 border-t border-border-default" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={makeDefault}
                  className="flex w-full items-center px-3 py-1.5 text-start text-sm text-text-primary hover:bg-surface-hover"
                >
                  {t('sessionHeader.transcriptView.setDefault', { mode: t(`sessionHeader.transcriptView.${current}`) })}
                </button>
              </>
            )}
          </div>
        )}
      >
        <div
          role="menuitem"
          aria-haspopup="menu"
          tabIndex={0}
          className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover cursor-default"
        >
          <span>{t('sessionHeader.transcriptView.title')}</span>
          <ChevronRightIcon className="w-4 h-4 text-text-secondary rtl:rotate-180" />
        </div>
      </Tippy>
    </div>
  );
}
