import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { ClientEnv, MessageType } from '../../shared';
import { Claude } from '../claude';
import { sendMessageHandler } from './sendMessage';
import { stopGenerationHandler } from './stopGeneration';
import { stopSessionHandler } from './stopSession';
import { startSessionHandler } from './startSession';
import { sessionChangeHandler } from './sessionChange';
import { toolResponseHandler } from './toolResponse';
import { getSessionsHandler } from './getSessions';
import { loadSessionHandler } from './loadSession';
import { deleteSessionHandler } from './deleteSession';
import { renameSessionHandler } from './renameSession';
import { getSettingsHandler } from './getSettings';
import { saveSettingsHandler } from './saveSettings';
import { getClaudeConfigDirHandler } from './getClaudeConfigDir';
import { saveClaudeConfigDirHandler } from './saveClaudeConfigDir';
import { getTelemetryConsentHandler } from './getTelemetryConsent';
import { setTelemetryConsentHandler } from './setTelemetryConsent';
import { getAnnouncementsHandler } from './getAnnouncements';
import { dismissAnnouncementHandler } from './dismissAnnouncement';
import { getAnnouncementsEnabledHandler } from './getAnnouncementsEnabled';
import { setAnnouncementsEnabledHandler } from './setAnnouncementsEnabled';
import { getSponsorUrlHandler } from './getSponsorUrl';
import { verifyLicenseHandler } from './verifyLicense';
import { getSponsorStatusHandler } from './getSponsorStatus';
import { deactivateLicenseHandler } from './deactivateLicense';
import { checkSponsorHandler } from './checkSponsor';
import { getProjectsHandler } from './getProjects';
import { getUsageHandler } from './getUsage';
import { getUsageReportHandler } from './getUsageReport';
import { getAllUsageHandler } from './getAllUsage';
import { openFileHandler } from './openFile';
import { openDiffHandler } from './openDiff';
import { applyDiffHandler } from './applyDiff';
import { rejectDiffHandler } from './rejectDiff';
import { createSessionHandler } from './createSession';
import { openNewTabHandler } from './openNewTab';
import { openSessionHandler } from './openSession';
import { openSettingsHandler } from './openSettings';
import { restartBackendHandler } from './restartBackend';
import { openTerminalHandler } from './openTerminal';
import { getVersionHandler } from './getVersion';
import { getCliUpdateInfoHandler } from './getCliUpdateInfo';
import { updateCliHandler } from './updateCli';
import { installCcbHandler } from './installCcb';
import { getCcbInstallHintHandler } from './getCcbInstallHint';
import { getAccountHandler } from './getAccount';
import { getAccountsHandler } from './getAccounts';
import { saveAccountHandler } from './saveAccount';
import { switchAccountHandler } from './switchAccount';
import { deleteAccountHandler } from './deleteAccount';
import { reclaimSessionHandler } from './reclaimSession';
import { loginHandler } from './login';
import { submitLoginCodeHandler } from './submitLoginCode';
import { openUrlHandler } from './openUrl';
import { getAvailableTerminalsHandler } from './getAvailableTerminals';
import { getAvailableEditorsHandler } from './getAvailableEditors';
import { getDetectedCliPathHandler } from './getDetectedCliPath';
import { getDetectedNodePathHandler } from './getDetectedNodePath';
import { pickFilesHandler } from './pickFiles';
import { nativeDropFlushHandler } from './nativeDropFlush';
import { getPluginUpdatesHandler } from './getPluginUpdates';
import { updatePluginHandler } from './updatePlugin';
import { getClaudeSettingsHandler } from './getClaudeSettings';
import { saveClaudeSettingsHandler } from './saveClaudeSettings';
import { setModelHandler } from './setModel';
import { getWorkingDirHandler } from './getWorkingDir';
import { getIdeRootHandler } from './getIdeRoot';
import { tunnelStartHandler } from './tunnelStart';
import { tunnelStopHandler } from './tunnelStop';
import { getTunnelStatusHandler } from './getTunnelStatus';
import { getTunnelPrereqsHandler } from './getTunnelPrereqs';
import { issueTunnelPairingHandler } from './issueTunnelPairing';
import { issueLocalPairingHandler } from './issueLocalPairing';
import { installCloudflaredHandler } from './installCloudflared';
import { sleepGuardEnableHandler } from './sleepGuardEnable';
import { sleepGuardDisableHandler } from './sleepGuardDisable';
import { listProjectFilesHandler } from './listProjectFiles';
import { getCliConfigHandler } from './getCliConfig';
import { openFolderDialogHandler } from './openFolderDialog';
import { findBackgroundTaskOutputPathHandler } from './findBackgroundTaskOutputPathHandler';
import { listSystemSoundsHandler } from './listSystemSounds';
import { playSystemSoundHandler } from './playSystemSound';
import { clientInfoHandler } from './clientInfo';
import { clientErrorHandler } from './clientError';
import { panelFocusedHandler } from './panelFocused';
import { getMcpServersHandler } from './getMcpServersHandler';
import { getMcpServerToolsHandler } from './getMcpServerToolsHandler';
import {
  reconnectMcpServerHandler,
  authenticateMcpServerHandler,
  clearMcpServerAuthHandler,
  setMcpServerEnabledHandler,
  submitMcpOauthCallbackUrlHandler,
  addMcpServerHandler,
  removeMcpServerHandler,
  searchMcpRegistryHandler,
} from './mcpActionsHandler';

export async function handleMessage(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  bridge: Bridge,
  bridges: Record<ClientEnv, Bridge>,
): Promise<void> {
  console.error('[node-backend]', `Received: ${message.type}`);

  // Project the active context's CLAUDE_CONFIG_DIR onto process.env up front, so every
  // handler that reads Claude data (sessions, projects) or spawns a child (claude/ccb)
  // resolves the right profile for this workingDir. Messages without a workingDir leave
  // the current context untouched — the project picker (getProjects) sets global itself,
  // and usage/account intentionally keep whatever context is already active. (#123)
  const ctxWorkingDir = (message.payload as { workingDir?: string } | undefined)?.workingDir;
  if (ctxWorkingDir) await Claude.applyConfigDir(ctxWorkingDir);

  switch (message.type) {
    case MessageType.SEND_MESSAGE:
      await sendMessageHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.STOP_GENERATION:
      stopGenerationHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.STOP_SESSION:
      stopSessionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.START_SESSION:
      await startSessionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SESSION_CHANGE:
      sessionChangeHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.TOOL_RESPONSE:
      toolResponseHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_SESSIONS:
      await getSessionsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.LOAD_SESSION:
    case MessageType.LOAD_OLDER_MESSAGES:
      await loadSessionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.DELETE_SESSION:
      await deleteSessionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.RENAME_SESSION:
      await renameSessionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_SETTINGS:
      await getSettingsHandler(connectionId, message, connections, bridge, bridges);
      break;
    case MessageType.SAVE_SETTINGS:
      await saveSettingsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_CLAUDE_CONFIG_DIR:
      await getClaudeConfigDirHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SAVE_CLAUDE_CONFIG_DIR:
      await saveClaudeConfigDirHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_TELEMETRY_CONSENT:
      await getTelemetryConsentHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SET_TELEMETRY_CONSENT:
      await setTelemetryConsentHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_ANNOUNCEMENTS:
      await getAnnouncementsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.DISMISS_ANNOUNCEMENT:
      await dismissAnnouncementHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_ANNOUNCEMENTS_ENABLED:
      await getAnnouncementsEnabledHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SET_ANNOUNCEMENTS_ENABLED:
      await setAnnouncementsEnabledHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_SPONSOR_URL:
      await getSponsorUrlHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_SPONSOR_STATUS:
      await getSponsorStatusHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.VERIFY_LICENSE:
      await verifyLicenseHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.DEACTIVATE_LICENSE:
      await deactivateLicenseHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.CHECK_SPONSOR:
      await checkSponsorHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_PROJECTS:
      await getProjectsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_USAGE:
      await getUsageHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_USAGE_REPORT:
      await getUsageReportHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_ALL_USAGE:
      await getAllUsageHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.OPEN_FILE:
      await openFileHandler(connectionId, message, connections, bridge, bridges);
      break;
    case MessageType.OPEN_DIFF:
      await openDiffHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.APPLY_DIFF:
      await applyDiffHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.REJECT_DIFF:
      await rejectDiffHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.CREATE_SESSION:
      await createSessionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.OPEN_NEW_TAB:
      await openNewTabHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.OPEN_SESSION:
      await openSessionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.OPEN_SETTINGS:
      await openSettingsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.RESTART_BACKEND:
      restartBackendHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.OPEN_TERMINAL:
      await openTerminalHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_VERSION:
      await getVersionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_CLI_UPDATE_INFO:
      await getCliUpdateInfoHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.UPDATE_CLI:
      await updateCliHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.INSTALL_CCB:
      await installCcbHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_CCB_INSTALL_HINT:
      await getCcbInstallHintHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_ACCOUNT:
      await getAccountHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_ACCOUNTS:
      await getAccountsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SAVE_ACCOUNT:
      await saveAccountHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SWITCH_ACCOUNT:
      await switchAccountHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.DELETE_ACCOUNT:
      await deleteAccountHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.RECLAIM_SESSION:
      await reclaimSessionHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.LOGIN:
      await loginHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SUBMIT_LOGIN_CODE:
      submitLoginCodeHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.OPEN_URL:
      await openUrlHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_AVAILABLE_TERMINALS:
      await getAvailableTerminalsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_AVAILABLE_EDITORS:
      await getAvailableEditorsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_DETECTED_CLI_PATH:
      await getDetectedCliPathHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_DETECTED_NODE_PATH:
      await getDetectedNodePathHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.PICK_FILES:
      await pickFilesHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.NATIVE_DROP_FLUSH:
      await nativeDropFlushHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_PLUGIN_UPDATES:
      await getPluginUpdatesHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.UPDATE_PLUGIN:
      await updatePluginHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_CLAUDE_SETTINGS:
      await getClaudeSettingsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SAVE_CLAUDE_SETTINGS:
      await saveClaudeSettingsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SET_MODEL:
      setModelHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_WORKING_DIR:
      getWorkingDirHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_IDE_ROOT:
      await getIdeRootHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.TUNNEL_START:
      await tunnelStartHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.TUNNEL_STOP:
      await tunnelStopHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_TUNNEL_STATUS:
      await getTunnelStatusHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_TUNNEL_PREREQS:
      await getTunnelPrereqsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.ISSUE_TUNNEL_PAIRING:
      await issueTunnelPairingHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.ISSUE_LOCAL_PAIRING:
      await issueLocalPairingHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.INSTALL_CLOUDFLARED:
      await installCloudflaredHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SLEEP_GUARD_ENABLE:
      await sleepGuardEnableHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SLEEP_GUARD_DISABLE:
      await sleepGuardDisableHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.LIST_PROJECT_FILES:
      await listProjectFilesHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_CLI_CONFIG:
      await getCliConfigHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.OPEN_FOLDER_DIALOG:
      await openFolderDialogHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.FIND_BG_TASK_OUTPUT_PATH:
      await findBackgroundTaskOutputPathHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.LIST_SYSTEM_SOUNDS:
      await listSystemSoundsHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.PLAY_SYSTEM_SOUND:
      await playSystemSoundHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.CLIENT_INFO:
      clientInfoHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.CLIENT_ERROR:
      clientErrorHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.PANEL_FOCUSED:
      panelFocusedHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_MCP_SERVERS:
      await getMcpServersHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.RECONNECT_MCP_SERVER:
      await reconnectMcpServerHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.AUTHENTICATE_MCP_SERVER:
      await authenticateMcpServerHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.CLEAR_MCP_SERVER_AUTH:
      await clearMcpServerAuthHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SET_MCP_SERVER_ENABLED:
      await setMcpServerEnabledHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SUBMIT_MCP_OAUTH_CALLBACK_URL:
      await submitMcpOauthCallbackUrlHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.ADD_MCP_SERVER:
      await addMcpServerHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.REMOVE_MCP_SERVER:
      await removeMcpServerHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.SEARCH_MCP_REGISTRY:
      await searchMcpRegistryHandler(connectionId, message, connections, bridge);
      break;
    case MessageType.GET_MCP_SERVER_TOOLS:
      await getMcpServerToolsHandler(connectionId, message, connections, bridge);
      break;
    default:
      console.error('[node-backend]', `Unknown message type: ${message.type}`);
  }
}
