# commands/run.ps1 - `ccg run` (default): port check -> version compare -> spawn backend
# -> open browser. Mirrors cli/commands/run (bash).

# What to do given the port state: install_fresh | no_release | foreign_error |
# already_latest | update_prompt | use_existing.
function Get-RunAction {
    param([string]$Status, [string]$Current, [string]$Latest)
    switch ($Status) {
        'foreign' { return 'foreign_error' }
        'free' { if ($Latest) { return 'install_fresh' } else { return 'no_release' } }
        'ours' {
            if (-not $Latest) { return 'use_existing' }
            if ((Compare-Semver $Current $Latest) -lt 0) { return 'update_prompt' }
            return 'already_latest'
        }
    }
    return 'unknown'
}

# Value of -b/--bind or -p/--port ($Names) in $CcgArgs: @{ Found; Value } (Value is $null
# when the flag is given without a value).
function Get-RunOption {
    param([string[]]$CcgArgs, [string[]]$Names)
    $result = @{ Found = $false; Value = $null }
    for ($i = 0; $i -lt $CcgArgs.Count; $i++) {
        $a = $CcgArgs[$i]
        if ($Names -contains $a) {
            $result.Found = $true
            if ($i + 1 -lt $CcgArgs.Count) { $result.Value = $CcgArgs[$i + 1]; $i++ } else { $result.Value = $null }
        } elseif ($a -match '^(-[a-z]|--[a-z]+)=(.*)$' -and ($Names -contains $Matches[1])) {
            $result.Found = $true
            $result.Value = if ($Matches[2]) { $Matches[2] } else { $null }
        }
    }
    return $result
}

function Test-LoopbackBind {
    param([string]$Addr)
    return $Addr -in @('127.0.0.1', 'localhost', '::1', '')
}

function Invoke-CcgRun {
    param([string[]]$CcgArgs)
    if ($CcgArgs -contains '-h' -or $CcgArgs -contains '--help') {
        $kind = if ($script:Program -eq 'swttch') { 'browser' } else { 'run' }
        Write-Host (T "help_${kind}_header")
        Write-Host ''
        Write-Host (T "help_${kind}_body")
        return 0
    }

    $port = Get-RunOption $CcgArgs @('-p', '--port')
    if ($port.Found) {
        if (-not $port.Value) { [Console]::Error.WriteLine((T 'err_port_missing_value')); return 1 }
        $n = 0
        if (-not ([int]::TryParse($port.Value, [ref]$n)) -or $n -lt 1 -or $n -gt 65535) {
            [Console]::Error.WriteLine((T 'err_port_invalid')); return 1
        }
        $script:CcgPort = $n
    }
    $bindOpt = Get-RunOption $CcgArgs @('-b', '--bind')
    $bind = '127.0.0.1'
    if ($bindOpt.Found) {
        if (-not $bindOpt.Value) { [Console]::Error.WriteLine((T 'err_bind_missing_value')); return 1 }
        $bind = $bindOpt.Value
    }
    if (-not (Test-LoopbackBind $bind)) { [Console]::Error.WriteLine((T 'warn_bind_exposed' $bind)) }

    $status = Get-PortStatus
    $current = Get-BackendVersion
    $latestTag = Get-LatestReleaseTag
    $latest = if ($latestTag) { $latestTag.TrimStart('v') } else { '' }
    $action = Get-RunAction $status ([string]$current) $latest

    switch ($action) {
        'foreign_error' {
            [Console]::Error.WriteLine((T 'err_port_foreign' $script:CcgPort))
            [Console]::Error.WriteLine((T 'err_port_foreign_hint' $script:CcgPort))
            return 1
        }
        { $_ -in 'already_latest', 'use_existing' } {
            Write-Host (T 'running_already' $current $script:CcgPort)
            Open-Browser (Get-WebviewUrl (Get-Location).Path)
            return 0
        }
        'update_prompt' {
            Write-Host (T 'update_prompt' $latest $current)
            Write-Host (T 'caution_marketplace')
            $answer = Read-Host (T 'update_prompt_question')
            if ($answer -match '^(y|yes)$') {
                Stop-BackendOnPort
                Write-Host (T 'update_killed_old' $latest)
                return (Start-RuntimeAndSpawn $latest $bind)
            }
            Write-Host (T 'update_declined' $current)
            Open-Browser (Get-WebviewUrl (Get-Location).Path)
            return 0
        }
        'install_fresh' { return (Start-RuntimeAndSpawn $latest $bind) }
        'no_release' { [Console]::Error.WriteLine((T 'err_no_release')); return 1 }
    }
    return 1
}
