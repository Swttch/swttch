// webview/src/api/bridge/Bridge.ts

import type { Connector, ConnectionChangeHandler } from './Connector';
import { WebSocketConnector } from './WebSocketConnector';
import { MessageType, ErrorCode } from '@/shared';
import { showSponsorGatedToast } from '@/utils/showSponsorGatedToast';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const LOGIN_REQUEST_TIMEOUT_MS = 300_000;

type MessageHandler = (message: IPCMessage) => void;

interface PendingRequest {
  resolve: (payload?: any) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class Bridge {
  private pending = new Map<string, PendingRequest>();
  private handlers = new Map<string, Set<MessageHandler>>();
  private connectionChangeHandlers = new Set<ConnectionChangeHandler>();
  private lastErrorValue: Error | null = null;

  constructor(private connector: Connector) {
    // Connector의 수신 메시지를 프로토콜 레이어에서 처리
    this.connector.onMessage((message) => this.handleMessage(message));

    // Connector의 연결 상태 변경을 Bridge 레벨에서도 전파
    this.connector.onConnectionChange((connected) => {
      this.connectionChangeHandlers.forEach(handler => {
        try {
          handler(connected);
        } catch (error) {
          console.error('[Bridge] Error in connection change handler:', error);
        }
      });
    });
  }

  /**
   * 연결 시작. Connector.connect() 위임.
   * KotlinConnector: kotlinBridge ready 확인
   * WebSocketConnector: WS open 대기
   */
  async connect(): Promise<void> {
    await this.connector.connect();
  }

  /**
   * 연결 해제.
   */
  disconnect(): void {
    // pending 요청 전부 reject
    this.pending.forEach((pending, _requestId) => {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Bridge disconnected'));
    });
    this.pending.clear();

    this.connector.disconnect();
  }

  get isConnected(): boolean {
    return this.connector.isConnected;
  }

  /**
   * BridgeClient 호환 alias. ClaudeCodeApi에서 this.bridge.connected 사용.
   */
  get connected(): boolean {
    return this.isConnected;
  }

  get lastError(): Error | null {
    return this.lastErrorValue;
  }

  /**
   * 요청-응답 패턴. requestId 생성 + ACK/ERROR 매칭 + 30초 타임아웃.
   *
   * 기존 useBridge.send()와 동일한 동작:
   * - requestId 생성 후 pending Map에 등록
   * - connector.send()로 메시지 전송
   * - ACK 수신 시 resolve(payload), ERROR 수신 시 reject
   * - 30초 타임아웃 시 reject
   *
   * 연결 미완료 시 connector.ensureReady()로 대기.
   */
  async request<T = any>(type: string, payload: Record<string, unknown> = {}, options?: { timeout?: number }): Promise<T> {
    const requestId = this.generateRequestId();
    const message: IPCMessage = {
      type,
      requestId,
      payload,
      timestamp: Date.now(),
    };

    console.log('[Bridge] Sending request:', type, payload);

    // 연결 미완료 시 대기 (instanceof 체크 없이 인터페이스 메서드 사용)
    if (!this.connector.isConnected) {
      console.log('[Bridge] Waiting for connection...');
      try {
        await this.connector.ensureReady();
      } catch (error) {
        console.error('[Bridge] Connection wait failed:', error);
        throw new Error('No bridge available');
      }
    }

    const timeoutMs = options?.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS;

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          const error = new Error(`Request ${requestId} (${type}) timed out`);
          console.error('[Bridge] Request timeout:', requestId, type);
          reject(error);
        }
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timeoutId });

      try {
        this.connector.send(message);
      } catch (error) {
        this.pending.delete(requestId);
        clearTimeout(timeoutId);
        const err = error instanceof Error ? error : new Error(String(error));
        this.lastErrorValue = err;
        console.error('[Bridge] Error sending message:', error);
        reject(error);
      }
    });
  }

  /**
   * 타입별 메시지 구독. ACK/ERROR는 내부 처리되므로 이 메서드로 수신되지 않음.
   * 반환값: unsubscribe 함수.
   */
  subscribe(type: string, handler: MessageHandler): () => void {
    console.debug('[Bridge] subscribe:', type);
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /**
   * Fire-and-forget 전송. requestId 없이 메시지 전송.
   * JetBrainsAdapter에서 CREATE_SESSION, OPEN_SETTINGS 등에 사용.
   */
  sendRaw(message: IPCMessage): void {
    this.connector.send(message);
  }

  /**
   * 특정 타입의 메시지를 1회 대기.
   * subscribe + 타임아웃으로 구현.
   */
  waitFor<T = unknown>(type: string, timeout = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeout);

      const unsubscribe = this.subscribe(type, (message) => {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(message.payload as T);
      });
    });
  }

  /**
   * 연결 상태 변경 콜백 등록. useBridge() 훅이 React state 동기화에 사용.
   * 반환값: unsubscribe 함수.
   */
  onConnectionChange(handler: ConnectionChangeHandler): () => void {
    this.connectionChangeHandlers.add(handler);
    return () => {
      this.connectionChangeHandlers.delete(handler);
    };
  }

  // --- Private ---

  /**
   * 수신 메시지 처리.
   *
   * ACK/ERROR 매칭 로직 (기존 useBridge.ts 28-66행 그대로):
   * - ACK: requestId를 message.requestId || message.payload.requestId 에서 찾음 (Kotlin/legacy 호환)
   * - ERROR: message.requestId로 매칭
   * - 그 외: 타입별 구독 핸들러에 dispatch
   */
  private handleMessage(message: IPCMessage): void {
    console.log('[Bridge] Received message:', message.type, message);

    // ACK 처리 (기존 useBridge.ts 33-43행)
    if (message.type === MessageType.ACK) {
      const requestId = (message.requestId || message.payload?.requestId) as string;
      if (requestId) {
        const pending = this.pending.get(requestId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pending.delete(requestId);
          pending.resolve(message.payload);
        }
      }
      return;
    }

    // ERROR 처리 (기존 useBridge.ts 46-53행)
    if (message.type === MessageType.ERROR && message.requestId) {
      // Global sponsor gate: any request the backend rejects because the user
      // isn't a sponsor shows the invite toast here, so individual callers never
      // have to check sponsorship before sending.
      if ((message.payload as { errorCode?: string } | undefined)?.errorCode === ErrorCode.SPONSOR_REQUIRED) {
        showSponsorGatedToast();
      }
      const pending = this.pending.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pending.delete(message.requestId);
        pending.reject(new Error(String(message.payload?.error || 'Unknown error')));
      }
      return;
    }

    // 타입별 핸들러 dispatch (기존 useBridge.ts 56-66행)
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      console.debug('[Bridge] dispatch:', message.type, '->', handlers.size, 'handlers');
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('[Bridge] Error in message handler:', error);
        }
      });
    }
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// --- Singleton ---

let bridgeInstance: Bridge | null = null;

/**
 * Bridge 싱글턴 생성/접근.
 *
 * 단일 백엔드 아키텍처: 항상 WebSocketConnector 사용.
 * - 개발 환경: ws://localhost:3001/ws (Node.js standalone, Vite dev server와 별도)
 * - JetBrains 환경: ws://{window.location.host}/ws (Node.js가 정적 파일과 같은 포트로 서빙)
 *
 * 이 함수는 module-level에서 호출 가능 (React 외부).
 * WebSocketConnector는 연결 실패 시 자동 재연결을 시도하므로 안전.
 */
export function getBridge(): Bridge {
  if (!bridgeInstance) {
    const connector = new WebSocketConnector();

    bridgeInstance = new Bridge(connector);

    // 연결 시작 (비동기, fire-and-forget)
    // WebSocketConnector: WS 연결 시도 (실패 시 2초마다 자동 재연결)
    bridgeInstance.connect().catch((error) => {
      console.error('[Bridge] Initial connection failed:', error);
    });
  }
  return bridgeInstance;
}

/**
 * 테스트용: 싱글턴 리셋.
 */
export function resetBridge(): void {
  if (bridgeInstance) {
    bridgeInstance.disconnect();
    bridgeInstance = null;
  }
}
