import { useState } from 'react';
import { useTranslation } from '@/i18n';

interface Props {
  onSubmit: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Optional OAuth code-entry field. Some login flows (notably WSL projects, where
 * the CLI can't auto-complete via a local callback) print a code after browser
 * sign-in and wait for it to be pasted back. The backend signals LOGIN_CODE_REQUIRED
 * only when that prompt actually appears, so this is shown conditionally. Issue #57.
 */
export function LoginCodeInput(props: Props) {
  const { onSubmit, disabled = false, className = '' } = props;
  const { t } = useTranslation('switchAccount');
  const [code, setCode] = useState('');

  const submit = (): void => {
    const trimmed = code.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className={`p-4 rounded-lg bg-surface-overlay border border-border-default ${className}`}>
      <p className="text-sm text-text-primary font-semibold">{t('codeInput.title')}</p>
      <p className="text-xs text-text-tertiary mt-1">
        {t('codeInput.description')}
      </p>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder={t('codeInput.placeholder')}
        autoFocus
        className="w-full mt-3 px-3 py-2 rounded-md bg-surface-base border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-claude"
      />
      <button
        onClick={submit}
        disabled={disabled || code.trim() === ''}
        className="w-full mt-3 py-2.5 rounded-lg bg-accent-claude hover:bg-accent-claude-hover disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
      >
        {t('codeInput.submit')}
      </button>
    </div>
  );
}
