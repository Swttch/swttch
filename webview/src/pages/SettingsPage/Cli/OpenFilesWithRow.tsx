import { useState, useEffect } from 'react';
import { SettingRow } from '../common';
import { Select, type SelectOption } from '@/components/Select';
import { useSettings } from '@/contexts/SettingsContext';
import { useBridge } from '@/hooks/useBridge';
import { SettingKey, OPEN_FILES_WITH_CUSTOM_VALUE } from '@/types/settings';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

/** A detected editor as returned by GET_AVAILABLE_EDITORS. */
interface EditorInfo {
  id: string;
  name: string;
  path: string;
}

const CUSTOM_MARKER = OPEN_FILES_WITH_CUSTOM_VALUE;
const TARGET_PATH = '%TARGET_PATH%';

/**
 * "Open files with" — which program opens a file reference clicked in chat.
 *
 * When an IDE (Kotlin RPC) host is attached — a JCEF webview OR a browser tab
 * opened from an IDE session — the file always opens in that IDE, so the value is
 * fixed and shown as the product name (not editable). With no IDE attached
 * (standalone / dev browser) the user picks a detected editor, a custom program
 * (executable path + argument template), or the OS default (empty).
 */
export function OpenFilesWithRow() {
  const { t } = useTranslation('settings');
  const { settings, updateSetting, ideAttached, ideProduct } = useSettings();
  const { send } = useBridge();

  const [editors, setEditors] = useState<EditorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No picker when the IDE owns file opening — skip the detection round-trip.
    if (ideAttached) {
      setLoading(false);
      return;
    }
    send(MessageType.GET_AVAILABLE_EDITORS, {})
      .then((res) => {
        setEditors((res?.editors as EditorInfo[]) ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [send, ideAttached]);

  if (ideAttached) {
    return (
      <SettingRow
        label={t('cli.openFilesWith.label')}
        description={t('cli.openFilesWith.jetbrainsDescription')}
      >
        <span className="text-sm text-text-tertiary">
          {ideProduct || t('cli.openFilesWith.jetbrainsFallback')}
        </span>
      </SettingRow>
    );
  }

  const openFilesWith = settings[SettingKey.OPEN_FILES_WITH];
  const custom = settings[SettingKey.OPEN_FILES_WITH_CUSTOM];
  const isCustom = openFilesWith === CUSTOM_MARKER;
  const selectValue = isCustom ? CUSTOM_MARKER : openFilesWith ?? '';

  const options: SelectOption[] = [
    { value: '', label: t('cli.openFilesWith.systemDefault') },
    ...editors.map((e) => ({ value: e.name, label: e.name })),
    { value: CUSTOM_MARKER, label: t('cli.openFilesWith.configureCustom') },
  ];

  const handleSelectChange = (value: string) => {
    // A single write per change: the custom details (path/arguments) are saved
    // separately when the user edits them below. Writing OPEN_FILES_WITH and
    // OPEN_FILES_WITH_CUSTOM back-to-back here raced the settings-file write.
    if (value === CUSTOM_MARKER) {
      void updateSetting(SettingKey.OPEN_FILES_WITH, CUSTOM_MARKER);
    } else {
      void updateSetting(SettingKey.OPEN_FILES_WITH, value || null);
    }
  };

  const updateCustom = (patch: Partial<{ path: string; arguments: string }>) => {
    void updateSetting(SettingKey.OPEN_FILES_WITH_CUSTOM, {
      path: patch.path ?? custom?.path ?? '',
      arguments: patch.arguments ?? custom?.arguments ?? TARGET_PATH,
    });
  };

  const handleChoose = async () => {
    const res = await send(MessageType.PICK_FILES, { mode: 'files', multiple: false });
    const picked = (res?.paths as string[] | undefined)?.[0];
    if (picked) {
      updateCustom({ path: picked });
    }
  };

  const inputClass =
    'bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary';

  return (
    <SettingRow
      label={t('cli.openFilesWith.label')}
      description={t('cli.openFilesWith.description')}
    >
      {loading ? (
        <span className="text-sm text-text-tertiary">{t('cli.openFilesWith.detecting')}</span>
      ) : (
        <div className="flex flex-col items-end gap-2">
          <Select
            value={selectValue}
            options={options}
            ariaLabel={t('cli.openFilesWith.label')}
            onChange={handleSelectChange}
            className="bg-surface-overlay border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
          {isCustom && (
            <div className="flex w-72 flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={custom?.path ?? ''}
                  onChange={(e) => updateCustom({ path: e.target.value })}
                  placeholder={t('cli.openFilesWith.pathPlaceholder')}
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={handleChoose}
                  className="shrink-0 rounded-lg border border-border-default bg-surface-overlay px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
                >
                  {t('cli.openFilesWith.choose')}
                </button>
              </div>
              <input
                type="text"
                value={custom?.arguments ?? TARGET_PATH}
                onChange={(e) => updateCustom({ arguments: e.target.value })}
                placeholder={TARGET_PATH}
                className={inputClass}
              />
            </div>
          )}
        </div>
      )}
    </SettingRow>
  );
}
