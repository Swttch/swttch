import type {
  MacDetection,
  LinuxDetection,
  WindowsPathDetection,
} from './resolveApp';

/**
 * Single source of truth for the terminals we detect, mirroring the editor
 * catalog (and GitHub Desktop's `shells/*`). macOS uses bundle ids, Windows
 * uses known exe paths + `where`, Linux probes PATH. `name` is the user-facing
 * label and the value persisted in `terminalApp`.
 */
export interface TerminalCatalogEntry {
  id: string;
  name: string;
  /** Preferred default (shown first, selected when nothing is saved). */
  isDefault?: boolean;
  mac?: MacDetection;
  win?: WindowsPathDetection;
  linux?: LinuxDetection;
}

const LOCALAPPDATA = process.env['LOCALAPPDATA'] ?? '';
const PROGRAMFILES = process.env['PROGRAMFILES'] ?? '';
const SYSTEMROOT = process.env['SYSTEMROOT'] ?? 'C:\\Windows';

export const TERMINAL_CATALOG: TerminalCatalogEntry[] = [
  // --- macOS ----------------------------------------------------------------
  {
    id: 'terminal',
    name: 'Terminal',
    isDefault: true,
    mac: { bundleIds: ['com.apple.Terminal'], appNames: ['Terminal'] },
  },
  {
    id: 'iterm2',
    name: 'iTerm2',
    mac: { bundleIds: ['com.googlecode.iterm2'], appNames: ['iTerm'] },
  },
  {
    id: 'warp',
    name: 'Warp',
    mac: { bundleIds: ['dev.warp.Warp-Stable'], appNames: ['Warp'] },
  },
  {
    id: 'ghostty',
    name: 'Ghostty',
    mac: { bundleIds: ['com.mitchellh.ghostty'], appNames: ['Ghostty'] },
    linux: { binaries: ['ghostty'] },
  },
  {
    id: 'kitty',
    name: 'Kitty',
    mac: { bundleIds: ['net.kovidgoyal.kitty'], appNames: ['kitty'] },
    linux: { binaries: ['kitty'] },
  },
  {
    id: 'tabby',
    name: 'Tabby',
    mac: { bundleIds: ['org.tabby'], appNames: ['Tabby'] },
  },

  // --- cross-platform -------------------------------------------------------
  {
    id: 'alacritty',
    name: 'Alacritty',
    mac: { bundleIds: ['org.alacritty', 'io.alacritty'], appNames: ['Alacritty'] },
    win: {
      paths: [
        `${LOCALAPPDATA}\\Programs\\Alacritty\\alacritty.exe`,
        `${PROGRAMFILES}\\Alacritty\\alacritty.exe`,
      ],
      whereCmd: 'alacritty',
    },
    linux: { binaries: ['alacritty'] },
  },
  {
    id: 'wezterm',
    name: 'WezTerm',
    mac: { bundleIds: ['com.github.wez.wezterm'], appNames: ['WezTerm'] },
    win: {
      paths: [
        `${LOCALAPPDATA}\\Programs\\WezTerm\\wezterm.exe`,
        `${PROGRAMFILES}\\WezTerm\\wezterm.exe`,
      ],
      whereCmd: 'wezterm',
    },
    linux: { binaries: ['wezterm'] },
  },
  {
    id: 'hyper',
    name: 'Hyper',
    mac: { bundleIds: ['co.zeit.hyper'], appNames: ['Hyper'] },
    win: {
      paths: [`${LOCALAPPDATA}\\hyper\\Hyper.exe`, `${PROGRAMFILES}\\Hyper\\Hyper.exe`],
      whereCmd: 'hyper',
    },
    linux: { binaries: ['hyper'] },
  },

  // --- Windows --------------------------------------------------------------
  {
    id: 'windows-terminal',
    name: 'Windows Terminal',
    win: {
      paths: [`${LOCALAPPDATA}\\Microsoft\\WindowsApps\\wt.exe`],
      whereCmd: 'wt',
    },
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    win: {
      paths: [
        `${SYSTEMROOT}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
        `${PROGRAMFILES}\\PowerShell\\7\\pwsh.exe`,
      ],
      whereCmd: 'powershell',
    },
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    win: { paths: [`${SYSTEMROOT}\\System32\\cmd.exe`], whereCmd: 'cmd' },
  },
  {
    id: 'git-bash',
    name: 'Git Bash',
    win: { paths: [`${PROGRAMFILES}\\Git\\bin\\bash.exe`], whereCmd: 'bash' },
  },

  // --- Linux ----------------------------------------------------------------
  { id: 'gnome-terminal', name: 'GNOME Terminal', linux: { binaries: ['gnome-terminal'] } },
  { id: 'konsole', name: 'Konsole', linux: { binaries: ['konsole'] } },
  { id: 'xfce4-terminal', name: 'XFCE Terminal', linux: { binaries: ['xfce4-terminal'] } },
  { id: 'tilix', name: 'Tilix', linux: { binaries: ['tilix'] } },
  { id: 'xterm', name: 'XTerm', linux: { binaries: ['xterm'] } },
];
