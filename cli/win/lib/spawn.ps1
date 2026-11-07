# lib/spawn.ps1 - run the backend in the foreground, watch for the PORT:n handshake,
# open the browser, and pass the logs through until node exits.

# Exit code the backend uses to request a respawn (RESTART_EXIT_CODE in backend).
$script:RestartExitCode = 75
# Minimum seconds between restarts (crash-loop guard).
$script:RestartMinInterval = 2

# Runs node backend.mjs once and blocks until it exits. Returns node's exit code.
# stdin is NUL so the backend cannot swallow Ctrl+C; stderr is merged into stdout.
function Invoke-BackendOnce {
    param([string]$CacheDir, [bool]$First, [string]$Bind, [string]$AuthToken, [string]$PairCode)
    $node = (Get-CcgNode).Path
    $backend = Join-Path $CacheDir 'backend.mjs'
    $url = Get-WebviewUrl (Get-Location).Path $PairCode
    $env:PORT = [string]$script:CcgPort
    $env:CCG_BIND = $Bind
    $env:CCG_AUTH_TOKEN = $AuthToken
    $env:CCG_INITIAL_PAIR_CODE = $PairCode
    $env:WEBVIEW_DIR = Join-Path $CacheDir 'webview'
    $portSeen = $false
    # cmd.exe gives the backend a NUL stdin and merges stderr into stdout. The command line is
    # built by hand: PowerShell would re-quote an argument that contains quotes and spaces.
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $env:ComSpec
    $psi.Arguments = '/d /s /c ""' + $node + '" "' + $backend + '" <nul 2>&1"'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    try {
        while ($null -ne ($line = $proc.StandardOutput.ReadLine())) {
            if ((-not $portSeen) -and $line.StartsWith('PORT:')) {
                $portSeen = $true
                $port = ($line.Substring(5) -replace '[^0-9].*$', '')
                Write-Host (T 'backend_started' $port)
                if ($First) {
                    $u = $url.Replace("localhost:$($script:CcgPort)", "localhost:$port")
                    Write-Host (T 'opening_browser' $u)
                    Open-Browser $u
                }
            }
            Write-Host $line
        }
        $proc.WaitForExit()
        $code = $proc.ExitCode
    } finally {
        # Ctrl+C or an error: never leave the backend running behind us.
        if (-not $proc.HasExited) { & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null }
    }
    return $code
}

# Spawn the backend; on exit code 75 respawn without reopening the browser.
function Start-BackendForeground {
    param([string]$CacheDir, [string]$Bind = '127.0.0.1')
    $auth = Get-AuthToken
    $pair = New-PairCode
    $first = $true
    while ($true) {
        $started = Get-Date
        $rc = Invoke-BackendOnce $CacheDir $first $Bind $auth $pair
        if ($rc -ne $script:RestartExitCode) { return $rc }
        if (((Get-Date) - $started).TotalSeconds -lt $script:RestartMinInterval) {
            [Console]::Error.WriteLine((T 'err_restart_loop'))
            return 1
        }
        Write-Host (T 'backend_restarting')
        $first = $false
    }
}

# Make sure the runtime is on disk (download if needed), then spawn it.
function Start-RuntimeAndSpawn {
    param([string]$Version, [string]$Bind = '127.0.0.1')
    if (-not (Get-CcgNode).Path) {
        [Console]::Error.WriteLine((T 'err_node_missing'))
        [Console]::Error.WriteLine((T 'err_node_missing_hint'))
        return 1
    }
    if (-not (Test-RuntimeCached $Version)) {
        Write-Host (T 'backend_starting' $Version)
        if (-not (Install-Runtime $Version)) {
            [Console]::Error.WriteLine((T 'err_runtime_missing' $Version))
            return 1
        }
    }
    Write-Host (T 'backend_starting' $Version)
    return (Start-BackendForeground (Get-RuntimeCacheDir $Version) $Bind)
}
