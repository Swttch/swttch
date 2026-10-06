import { InputMode, INPUT_MODES } from '../../../types/chatInput';
import { ModeIcon } from './ModeIcon';
import { CheckIcon } from '@heroicons/react/16/solid';
import { isMobile } from '@/config/environment';
import { useTranslation } from '@/i18n';

interface Props {
  modes: InputMode[];
  currentMode: InputMode;
  onSelect: (mode: InputMode) => void;
}

/**
 * 모드 선택 패널. 입력창 모드 태그 클릭 시 위로 떠서, 가용한 권한 모드를
 * 아이콘+라벨+설명과 함께 보여준다(커서 확장 레이아웃 기준).
 * 현재 모드는 하이라이트 + 체크로 표시한다.
 *
 * The effort slider now lives in the model panel (ModelSwitchOverlay): effort is a property of the model.
 */
export function ModeSelectPanel(props: Props) {
  const { modes, currentMode, onSelect } = props;
  const { t } = useTranslation('chat');

  return (
    <div className={`flex flex-col gap-0.5 rounded-lg border border-border-subtle bg-surface-raised py-1.5 shadow-lg ${isMobile() ? 'w-full min-w-0' : 'min-w-[320px]'}`}>
      <div className="flex items-center justify-between px-3 py-1.5 text-[0.8461rem] text-text-tertiary">
        <span>{t('chatInput.modeSelectPanel.modes')}</span>
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-surface-hover px-1.5 py-0.5 text-[0.7rem]">⇧</kbd>
          <span>+</span>
          <kbd className="rounded bg-surface-hover px-1.5 py-0.5 text-[0.7rem]">tab</kbd>
          <span>{t('chatInput.modeSelectPanel.toSwitch')}</span>
        </span>
      </div>

      {modes.map((m) => {
        const config = INPUT_MODES[m];
        const selected = m === currentMode;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onSelect(m)}
            className={`mx-1 flex items-start gap-2.5 rounded-md px-2.5 py-2 text-start transition-colors ${
              selected ? 'bg-surface-hover' : 'hover:bg-surface-hover'
            }`}
          >
            <span className="mt-0.5 flex-shrink-0 text-text-secondary">
              <ModeIcon mode={m} className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[0.9rem] font-medium text-text-primary">{config.label}</div>
              <div className="text-[0.8rem] text-text-tertiary">{config.description}</div>
            </div>
            {selected && <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-secondary" />}
          </button>
        );
      })}
    </div>
  );
}
