import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBridge } from '../api/bridge/Bridge';

type MessageHandler = (message: IPCMessage) => void;

interface UseBridgeReturn {
  isConnected: boolean;
  send: <T = any>(type: string, payload?: Record<string, unknown>, options?: { timeout?: number }) => Promise<T>;
  /** Fire-and-forget. For streams the backend does not ack — see the impl note. */
  sendRaw: (type: string, payload?: Record<string, unknown>) => void;
  subscribe: (type: string, handler: MessageHandler) => () => void;
  lastError: Error | null;
}

/**
 * Bridge 싱글턴의 React 래퍼 훅.
 *
 * 역할:
 * 1. Bridge.isConnected를 React state로 동기화
 * 2. Bridge.lastError를 React state로 동기화
 * 3. Bridge.request()를 send로, Bridge.subscribe()를 subscribe로 위임
 *
 * 기존 useBridge()와 반환 타입 100% 동일 -> 소비자 변경 불필요.
 */
export function useBridge(): UseBridgeReturn {
  const bridge = getBridge();

  const [isConnected, setIsConnected] = useState(bridge.isConnected);
  const [lastError, setLastError] = useState<Error | null>(bridge.lastError);

  // Bridge 연결 상태 변경 -> React state 동기화
  useEffect(() => {
    const unsubscribe = bridge.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (connected) {
        setLastError(null);
      }
    });

    // 초기값 동기화 (Bridge가 이미 연결된 경우)
    setIsConnected(bridge.isConnected);

    return unsubscribe;
  }, [bridge]);

  // send: Bridge.request() 위임 + 에러 시 lastError 업데이트
  const send = useCallback(
    async <T = any>(type: string, payload: Record<string, unknown> = {}, options?: { timeout?: number }): Promise<T> => {
      try {
        return await bridge.request<T>(type, payload, options);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setLastError(err);
        throw error;
      }
    },
    [bridge]
  );

  // sendRaw: 응답을 기다리지 않는 단방향 전송.
  //
  // send()는 requestId를 붙이고 ACK를 30초까지 기다리므로, 받아쓰기 오디오처럼
  // 초당 여러 번 보내고 답을 받을 필요가 없는 스트림에 쓰면 응답 없는 요청이
  // 계속 쌓여 브릿지가 막힌다. 그런 흐름은 이쪽을 쓴다.
  const sendRaw = useCallback(
    (type: string, payload?: Record<string, unknown>): void => {
      bridge.sendRaw({ type, payload: payload ?? {}, timestamp: Date.now() });
    },
    [bridge]
  );

  // subscribe: Bridge.subscribe() 직접 위임
  const subscribe = useCallback(
    (type: string, handler: MessageHandler): (() => void) => {
      return bridge.subscribe(type, handler);
    },
    [bridge]
  );

  // Stabilize the returned object so consumers using `bridge` as a useEffect
  // dependency (e.g. ChatInput's native-drop subscription) don't re-attach
  // listeners every render. send/subscribe are already useCallback-stable.
  return useMemo(
    () => ({ isConnected, send, sendRaw, subscribe, lastError }),
    [isConnected, send, sendRaw, subscribe, lastError],
  );
}
