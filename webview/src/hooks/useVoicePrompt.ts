import { useCallback, useEffect, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

/**
 * 음성 입력을 쓸지 한 번 묻는 질문의 응답 상태.
 * 백엔드 `profile.ts`의 VoicePromptStatus와 값이 일치해야 한다.
 */
export enum VoicePromptStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

export interface VoicePrompt {
  status: VoicePromptStatus;
  askedAt: string | null;
  decidedAt: string | null;
}

interface VoicePromptResponse {
  voicePrompt: VoicePrompt;
}

/**
 * profile.json의 음성 입력 질문 응답을 읽고, 질문 노출과 응답을 영속화하는 훅.
 *
 * 응답을 받는 것과 그 응답에 따라 행동하는 것(설치·설정 끄기)은 호출부의 몫이다.
 * 여기서는 기록만 한다.
 */
export function useVoicePrompt() {
  const { send } = useBridgeContext();
  const [prompt, setPrompt] = useState<VoicePrompt | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = (await send(MessageType.GET_VOICE_PROMPT, {})) as VoicePromptResponse | null;
      setPrompt(res?.voicePrompt ?? null);
    } catch {
      setPrompt(null);
    }
  }, [send]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 질문을 화면에 띄운 시각을 남긴다. 응답이 아니므로 status는 그대로 pending이다. */
  const markAsked = useCallback(async () => {
    const res = (await send(MessageType.SET_VOICE_PROMPT, {
      asked: true,
    })) as VoicePromptResponse | null;
    if (res?.voicePrompt) setPrompt(res.voicePrompt);
  }, [send]);

  const decide = useCallback(
    async (accepted: boolean) => {
      const res = (await send(MessageType.SET_VOICE_PROMPT, {
        accepted,
      })) as VoicePromptResponse | null;
      if (res?.voicePrompt) setPrompt(res.voicePrompt);
    },
    [send],
  );

  return {
    prompt,
    /** 아직 응답하지 않았다 = 다음 마이크 클릭에서 물어야 한다. */
    shouldAsk: prompt?.status === VoicePromptStatus.PENDING,
    markAsked,
    decide,
    refresh,
  };
}
