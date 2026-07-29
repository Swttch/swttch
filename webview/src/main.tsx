import 'reflect-metadata';
import './i18n/config'; // initialize i18next before the first render
import { initAuthToken } from './api/bridge/authToken';
import { initLogForwarder } from './api/logging';
import { installGlobalErrorHooks } from './api/errorReporting';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import {isMobile} from "@/config/environment.ts";
import { MOBILE_BASE_ZOOM } from "@/utils/zoom";

// Capture the per-launch pairing code from `?pair=` BEFORE anything opens a
// backend WebSocket or React Router mutates the URL. Resolves any already-known
// token and strips the pairing param from the address bar; the actual /pair
// exchange happens lazily when the first WebSocket connects.
initAuthToken();

// 가능한 한 빨리 초기화하여 초기 로그도 캡처
initLogForwarder();

// 런타임 에러 / 미처리 promise 거부를 단일 보고 경로로 수렴시키는 전역 훅을 1회 등록한다
// (프론트 error boundary 모델의 전역 절반). React 렌더 에러는 ErrorBoundary가 담당.
installGlobalErrorHooks();

// Detect mobile devices and scale up the zoom level for better readability.
// SettingsContext later re-applies this as the BASE that the user's own zoom
// (CmdOrCtrl +/-) multiplies into, so the two never overwrite each other.
if (isMobile()) {
  document.documentElement.style.zoom = String(MOBILE_BASE_ZOOM);

  // CSS zoom makes content larger than viewport, causing the browser to
  // force-scroll the html element when the virtual keyboard opens.
  // This keeps fixed-positioned elements (header, input) in place.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    window.visualViewport.addEventListener('scroll', () => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
