import { useEffect, useMemo } from 'react';
import { Tag } from '@/pages/ChatPage/ChatInput/Tag';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { useFableProbe } from '@/contexts/FableProbeContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useBridge } from '@/hooks/useBridge';
import { SWITCH_MODEL_EVENT } from '@/pages/ChatPage/ModelSwitchOverlay';
import { DEFAULT_MODEL_ALIAS, resolveModelInfo, resolveModelLabel, toModelAlias, withFableFallback } from '@/types/models';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useVersionInfo } from '@/hooks/useVersionInfo';
import { LoadedMessageType } from '@/types';
import type { ModelInfo } from '@/types/slashCommand';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

/** Fired by the ⌘/Ctrl+Shift+. shortcut to rotate to the next model. */
export const ROTATE_MODEL_EVENT = 'rotate-model';

/**
 * Last-resort label when `current` can't be matched to any list item — e.g.
 * the CLI reported a model family the selectable list doesn't carry. Humanize
 * the coarse alias ("opus" → "Opus") so the indicator stays meaningful instead
 * of vanishing; fall back to the raw value if even the family is unknown.
 */
function fallbackModelLabel(current: string): string {
  const alias = toModelAlias(current);
  if (alias === DEFAULT_MODEL_ALIAS) return current;
  return alias.charAt(0).toUpperCase() + alias.slice(1);
}

/**
 * Always-on indicator of the current session model in the composer's
 * bottom bar. Clicking (or ⌘/Ctrl+Shift+M) opens the existing
 * `ModelSwitchOverlay`; ⌘/Ctrl+Shift+. rotates to the next model.
 *
 * The label is the real model name resolved from the CLI model info
 * (see `resolveModelLabel`). If the current model can't be resolved
 * (models not loaded yet), the tag renders nothing.
 */
export function ModelTag() {
  const { t } = useTranslation('chat');
  const { setSessionModel, appendMessage } = useChatStreamContext();
  const { controlResponse } = useCliConfig();
  const { currentSessionId } = useSessionContext();
  const { send } = useBridge();
  const currentModel = useCurrentModel();
  const { cliVersion } = useVersionInfo();
  const { probedAvailable } = useFableProbe();

  // Memoized on the CLI response so the fallback-augmented array keeps a stable
  // reference across renders (the rotate effect below depends on `models`).
  const models: ModelInfo[] = useMemo(
    () => withFableFallback(controlResponse?.response?.response?.models ?? [], new Date(), cliVersion, probedAvailable),
    [controlResponse, cliVersion, probedAvailable],
  );

  useEffect(() => {
    const handleRotate = () => {
      if (models.length === 0) return;
      const info = resolveModelInfo(models, currentModel);
      const idx = info ? models.indexOf(info) : -1;
      const next = models[(idx + 1) % models.length];

      setSessionModel(next.value);
      // Instant local feedback. The CLI's `/model` echo only appears once a
      // message is sent (and not at all if the process has exited), so this is
      // what makes the change visible immediately. The echo is deduped against
      // this notification in UserMessageRenderer, so they never double up; on
      // reload this (ephemeral) notification is gone and the echo takes over.
      appendMessage({
        type: LoadedMessageType.Notification,
        uuid: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        summary: t('chatInput.modelTag.setModelNotification', { model: resolveModelLabel(next) }),
        modelChangeValue: next.value,
      });
      if (currentSessionId) void send(MessageType.SET_MODEL, { model: next.value });
    };

    window.addEventListener(ROTATE_MODEL_EVENT, handleRotate);
    return () => window.removeEventListener(ROTATE_MODEL_EVENT, handleRotate);
  }, [models, currentModel, setSessionModel, appendMessage, currentSessionId, send]);

  // Models not loaded yet — nothing meaningful to show. The CLI config arrives
  // shortly and fills this in; this is the ONLY case where the tag is hidden.
  if (models.length === 0) return null;

  const info = resolveModelInfo(models, currentModel);
  // Once models are loaded the tag always renders: a matched label when we can
  // resolve the model, otherwise a humanized fallback so it never disappears.
  const label = info ? resolveModelLabel(info) : fallbackModelLabel(currentModel);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent(SWITCH_MODEL_EVENT));
  };

  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const rotateHint = isMac ? '⌘⇧.' : 'Ctrl+Shift+.';

  return (
    <Tag title={t('chatInput.modelTag.switchModel', { hint: rotateHint })} onClick={handleClick}>
      <span className="hidden xs:inline">{label}</span>
      <span className="inline xs:hidden">{label.split(' ')[0]}</span>
    </Tag>
  );
}
