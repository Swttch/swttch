import { useState } from 'react';
import { SettingRow } from '../../common';
import type { PermissionSpec } from '@/permissions';
import { useTranslation } from '@/i18n';

interface Props {
  spec: PermissionSpec;
}

/**
 * One browser permission, and the only thing we can do about it.
 *
 * Takes a spec as a prop where other settings rows take none, because there is
 * no fixed list of them: which permissions exist is decided at runtime by what
 * the browser supports, so the section renders one row per available spec.
 *
 * Granted and denied are both read-only. A page cannot take a permission back,
 * and it cannot ask again once refused — the browser owns that decision, so the
 * row says where things stand and points at the browser's own controls rather
 * than offering a button that would do nothing.
 */
export function PermissionRow({ spec }: Props) {
  const { t } = useTranslation('settings');
  const [state, setState] = useState<NotificationPermission>(spec.getState());

  const handleRequest = () => {
    spec
      .request()
      .then((next) => setState(next))
      .catch(() => setState(spec.getState()));
  };

  return (
    <SettingRow
      label={spec.label}
      description={
        state === 'granted'
          ? t('browser.permissions.revokeHint')
          : state === 'denied'
            ? t('browser.permissions.deniedHint')
            : spec.description
      }
    >
      {state === 'granted' && (
        <span className="text-sm text-state-success-fg font-medium">
          {t('browser.permissions.granted')}
        </span>
      )}
      {state === 'denied' && (
        <span className="text-sm text-text-tertiary font-medium">
          {t('browser.permissions.denied')}
        </span>
      )}
      {state === 'default' && (
        <button
          type="button"
          onClick={handleRequest}
          className="px-3 py-1 rounded text-sm font-medium bg-accent-primary text-text-inverse hover:opacity-90 transition-opacity"
        >
          {t('browser.permissions.request')}
        </button>
      )}
    </SettingRow>
  );
}
