# commands/uninstall.ps1 - `ccg uninstall`: remove what the installer put on this machine.
#
# Only the launcher's own files and the downloaded runtimes are removed. The same folder also
# holds the user's data (accounts, settings, licence) shared with the JetBrains plugin; that
# is never deleted here.

function Invoke-CcgUninstall {
    param([string[]]$CcgArgs)
    if ($CcgArgs -contains '-h' -or $CcgArgs -contains '--help') {
        Write-Host (T 'help_uninstall_header'); Write-Host ''; Write-Host (T 'help_uninstall_body')
        return 0
    }
    $home1 = $script:CcgRoot
    Write-Host (T 'uninstall_start' $home1)

    # PATH: drop our entry from the user PATH.
    $winBin = Join-Path $script:WinRoot 'bin'
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($userPath -split ';' | Where-Object { $_ })
    $kept = @($entries | Where-Object { $_.TrimEnd('\') -ine $winBin.TrimEnd('\') })
    if ($kept.Count -ne $entries.Count) {
        [Environment]::SetEnvironmentVariable('Path', ($kept -join ';'), 'User')
        Write-Host (T 'uninstall_path_removed' $winBin)
    }

    $failed = @()
    # win\ holds the launcher that is running right now: a detached cmd removes it a moment after
    # this process exits (deleting ccg.cmd under a running batch makes cmd print path errors).
    # The paths travel in environment variables so non-ASCII or spaced user names stay intact.
    $winDir = Join-Path $home1 'win'
    if (Test-Path $winDir) {
        $env:CCG_RM_WIN = $winDir
        $env:CCG_RM_BIN = Join-Path $home1 'bin'
        $env:CCG_RM_HOME = $home1
        $cleanup = Join-Path ([IO.Path]::GetTempPath()) 'ccg-uninstall-cleanup.cmd'
        Set-Content -Path $cleanup -Encoding ASCII -Value @(
            '@echo off',
            'ping -n 3 127.0.0.1 > nul',
            'rd /s /q "%CCG_RM_WIN%"',
            'rd "%CCG_RM_BIN%" 2> nul',
            'rd "%CCG_RM_HOME%" 2> nul',
            '(goto) 2>nul & del "%~f0"'
        )
        Start-Process cmd.exe -ArgumentList '/d', '/c', ('"' + $cleanup + '"') -WindowStyle Hidden
    }
    foreach ($name in 'commands', 'lib', 'locales', 'runtimes', 'uninstall.sh', '.ccg-version', 'bin\ccg') {
        $path = Join-Path $home1 $name
        if (-not (Test-Path $path)) { continue }
        Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $path) { $failed += $name }
    }
    $bin = Join-Path $home1 'bin'
    if ((Test-Path $bin) -and -not (Get-ChildItem $bin -Force)) { Remove-Item $bin -Force -ErrorAction SilentlyContinue }

    if ($failed.Count -gt 0) {
        [Console]::Error.WriteLine((T 'uninstall_failed' ($failed -join ', ')))
        return 1
    }
    Write-Host (T 'uninstall_done' $home1)
    return 0
}
