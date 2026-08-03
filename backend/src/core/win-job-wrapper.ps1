# CCG win32 chat-CLI job wrapper.
#
# Why this exists: win32 has no process groups. `taskkill /F /T` walks the LIVE
# parent-child tree, but git-bash (MSYS) spawns its worker processes under a
# short-lived fork helper that exits immediately, detaching the worker from the
# cmd->claude->bash tree (children even reparent to ppid 1). Windows never
# reparents to a reaper, so those workers become invisible orphans that keep
# running (and billing). POSIX avoids this by launching the CLI detached as a
# process-group leader and signalling the whole group (see claude.ts killTree).
#
# A Windows Job Object is the kernel equivalent of a process group: every
# descendant of a job member stays in the job regardless of PPID reparenting.
# This wrapper creates a job with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, launches the
# real chat CLI inside it, then holds the job handle for the CLI's lifetime. When
# the backend kills THIS process (or the backend itself dies), the last job handle
# closes and the kernel tears down the ENTIRE tree — the MSYS orphans included.
#
# Contract with the backend (claude.ts / win-job.ts):
#   - $env:CCG_JOB_CMDLINE holds the exact `cmd /d /s /c` command line to run.
#   - argv[0] (if present) is the sessionId, carried ONLY so the on-disk registry's
#     sessionId-keyed orphan sweep can find and kill THIS wrapper. The wrapper
#     itself ignores it.
#   - MUST be silent on stdout: the backend reads the child's stdout as the chat
#     stream-json protocol. Only genuine errors go to stderr.
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CcgJobNative {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr a, string name);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint len);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
}
"@

$cmdline = $env:CCG_JOB_CMDLINE
if ([string]::IsNullOrEmpty($cmdline)) {
  [Console]::Error.WriteLine('[ccg-job] CCG_JOB_CMDLINE not set')
  exit 210
}

# Create the job + set KILL_ON_JOB_CLOSE. If any of this fails we still launch the
# CLI (degrading to the pre-job behavior) rather than break chat — a missing job
# only reopens the orphan gap, it never blocks the user.
$job = [CcgJobNative]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -ne [IntPtr]::Zero) {
  # JOBOBJECT_EXTENDED_LIMIT_INFORMATION is 144 bytes on x64: BASIC_LIMIT(64) +
  # IO_COUNTERS(48) + 4x SIZE_T memory fields(32). LimitFlags sits at offset 16.
  $size = 144
  $buf = [Runtime.InteropServices.Marshal]::AllocHGlobal($size)
  try {
    for ($i = 0; $i -lt $size; $i++) { [Runtime.InteropServices.Marshal]::WriteByte($buf, $i, 0) }
    [Runtime.InteropServices.Marshal]::WriteInt32($buf, 16, 0x2000)  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    # JobObjectExtendedLimitInformation = 9
    [void][CcgJobNative]::SetInformationJobObject($job, 9, $buf, $size)
  } finally {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($buf)
  }
}

$psi = New-Object Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
# cmd resolves the claude launcher via PATHEXT exactly as the pre-job spawn did.
$psi.Arguments = '/d /s /c "' + $cmdline + '"'
# Inherit our std handles so the child's stdio is the backend's pipes, byte-for-byte.
$psi.UseShellExecute = $false
$proc = [Diagnostics.Process]::Start($psi)

# Put the CLI (and thus every descendant) in the job. Non-fatal on failure.
if ($job -ne [IntPtr]::Zero) {
  [void][CcgJobNative]::AssignProcessToJobObject($job, $proc.Handle)
}

$proc.WaitForExit()
exit $proc.ExitCode
