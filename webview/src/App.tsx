import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppProviders } from './contexts';
import { I18nLocaleSync } from './i18n/I18nLocaleSync';
import { ChatPage, SettingsPage, SettingsOverlay, SwitchAccountPage, ProjectSelectorPage, SessionPanelPage } from './pages';
import { AccountUsageModal } from './components/AccountUsageModal';
import { TunnelModal } from './components/TunnelModal';
import { ForbiddenNotice } from './components/ForbiddenNotice';
import { isRemoteBlocked } from './api/bridge/authToken';
import { usePairingStatus } from './hooks/usePairingStatus';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useZoomControls } from './hooks/useZoomControls';
import { ZoomIndicator } from './components/ZoomIndicator';
import { usePanelFocusReporter } from './hooks/usePanelFocusReporter';
import { useSettingsOverlayNavigation } from './hooks/useSettingsOverlayNavigation';
import { OPEN_ACCOUNT_USAGE_EVENT } from './commandPalette/sections/model/AccountUsageItem';
import { OPEN_TUNNEL_EVENT } from './pages/ChatPage/SessionHeader/dock/actions';
import { isDev } from './config/environment';
import 'katex/dist/katex.min.css';

function AppContent() {
  useKeyboardShortcuts();
  // CmdOrCtrl +/-/0 and CmdOrCtrl + wheel scale the whole UI (issue #169).
  useZoomControls();
  // Tell the backend which panel is active so panel-scoped pushes route here.
  usePanelFocusReporter();
  // Lets non-React callers (toasts, palette items) open settings as an overlay.
  useSettingsOverlayNavigation();
  const [isAccountUsageOpen, setIsAccountUsageOpen] = useState(false);
  // Owned here rather than by the dock icon: the same item can be triggered from
  // the ⋮ overflow menu, and that row unmounts the moment the menu closes.
  const [isTunnelOpen, setIsTunnelOpen] = useState(false);
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  useEffect(() => {
    const handler = () => setIsAccountUsageOpen(true);
    window.addEventListener(OPEN_ACCOUNT_USAGE_EVENT, handler);
    return () => window.removeEventListener(OPEN_ACCOUNT_USAGE_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = () => setIsTunnelOpen(true);
    window.addEventListener(OPEN_TUNNEL_EVENT, handler);
    return () => window.removeEventListener(OPEN_TUNNEL_EVENT, handler);
  }, []);

  return (
    <>
      <I18nLocaleSync />
      <ZoomIndicator />
      {isDev() && <div className="fixed w-full top-0 border-t-2 border-t-fuchsia-500 z-50" />}
      <Routes location={backgroundLocation ?? location}>
        <Route path="/" element={<ProjectSelectorPage />} />
        <Route path="/sessions/new" element={<ChatPage />} />
        <Route path="/sessions/:current_session_id" element={<ChatPage />} />
        <Route path="/session-panel" element={<SessionPanelPage />} />
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="/switch-account" element={<SwitchAccountPage />} />
        <Route path="*" element={<Navigate to="/sessions/new" replace />} />
      </Routes>

      {backgroundLocation && (
        <SettingsOverlay>
          <Routes>
            <Route path="/settings/*" element={<SettingsPage asOverlay />} />
          </Routes>
        </SettingsOverlay>
      )}

      {isAccountUsageOpen && (
        <AccountUsageModal onClose={() => setIsAccountUsageOpen(false)} />
      )}

      {isTunnelOpen && <TunnelModal onClose={() => setIsTunnelOpen(false)} />}

      {/* Remote-device pairing failure (expired/locked/unreachable ?pair= code):
          shows "rescan the QR" instead of a silent 401 reconnect loop. Renders
          nothing in normal local use. */}
      <Toaster
        position="top-center"
        containerStyle={{ top: 40 }}
        toastOptions={{
          style: {
            background: 'var(--surface-raised)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            fontSize: '0.8461rem',
            padding: '8px 12px',
          },
          success: {
            iconTheme: {
              primary: 'var(--state-success-fg)',
              secondary: 'var(--surface-raised)',
            },
          },
        }}
      />
    </>
  );
}

function App() {
  // Access is blocked when EITHER the device is an unpaired remote (a tunnel URL
  // with no `?pair=` code) OR a pairing attempt did not succeed for any reason
  // (expired / wrong / rate-limited / unreachable). usePairingStatus makes this
  // reactive so a pairing that fails after mount flips us to the block. A LOCAL
  // transient disconnect is NEVER blocked (isRemoteBlocked stays false).
  const { state: pairingState } = usePairingStatus();
  const blocked = isRemoteBlocked() || pairingState === 'failed';

  // Render ONLY the hard "403" block on an EMPTY template — do NOT mount the app
  // providers, router, or chat UI (nothing to connect, nothing leaking behind).
  if (blocked) {
    return <ForbiddenNotice />;
  }

  return (
    <ErrorBoundary>
      <AppProviders>
        <AppContent />
      </AppProviders>
    </ErrorBoundary>
  );
}

export default App;
