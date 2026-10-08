import { execFile } from 'child_process';
import type { FileIcon } from './fileIcon';

const ICON_TIMEOUT_MS = 15_000;

/**
 * Windows hands out a type's icon through `SHGetFileInfo`. The USEFILEATTRIBUTES
 * flag makes it answer for the extension alone, so no file has to exist, and the
 * large icon (32 pixels) is what Explorer shows in its medium views.
 *
 * `$EXTENSION$` is replaced by an extension that has already passed the strict
 * pattern, so nothing but letters, digits, `_`, `+` and `-` reaches the script.
 */
const SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CcgFileIcon {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SHFILEINFO {
    public IntPtr hIcon;
    public int iIcon;
    public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SHGetFileInfo(string path, uint attributes, ref SHFILEINFO info, uint size, uint flags);
  [DllImport("user32.dll")]
  public static extern bool DestroyIcon(IntPtr handle);
}
"@
$info = New-Object CcgFileIcon+SHFILEINFO
# SHGFI_ICON (0x100) | SHGFI_USEFILEATTRIBUTES (0x10), asking about a normal file (0x80)
[void][CcgFileIcon]::SHGetFileInfo('.$EXTENSION$', 0x80, [ref]$info, [uint32][System.Runtime.InteropServices.Marshal]::SizeOf($info), 0x110)
if ($info.hIcon -eq [IntPtr]::Zero) { exit 3 }
try {
  $icon = [System.Drawing.Icon]::FromHandle($info.hIcon)
  $bitmap = $icon.ToBitmap()
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  [Convert]::ToBase64String($stream.ToArray())
} finally {
  [void][CcgFileIcon]::DestroyIcon($info.hIcon)
}
`;

/** The script for one extension, ready to hand to PowerShell. */
export function windowsIconScript(extension: string): string {
  return SCRIPT.replace('$EXTENSION$', extension);
}

/** Runs the script and gives back the base64 png it printed, or throws. */
export type WindowsRunner = (script: string) => Promise<string>;

const runWithPowerShell: WindowsRunner = (script) =>
  new Promise((resolve, reject) => {
    // -EncodedCommand takes the script as UTF-16 base64, which spares it every layer
    // of quoting. powershell.exe is started directly, never through cmd.exe, whose
    // rules for quotes would otherwise get a say.
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: ICON_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    );
  });

export async function readWindowsIcon(extension: string, run: WindowsRunner = runWithPowerShell): Promise<FileIcon | null> {
  const base64 = await run(windowsIconScript(extension));
  return base64 ? { mimeType: 'image/png', base64 } : null;
}
