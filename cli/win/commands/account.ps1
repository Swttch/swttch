# commands/account.ps1 - `ccg account`: manage saved Claude accounts from the terminal
# (list / use / current / save / rm). Mirrors cli/commands/account/*.sh: ALL credential
# logic lives in the Node helper account-cli.mjs of the newest cached runtime; this file
# only runs it and renders its TAB-separated output through i18n.
# The helper's exit code is the contract (see backend/src/cli/account.ts):
#   0 ok - 2 no saved accounts - 3 not found - 4 ambiguous - 5 no live login.

$script:AccountOut = ''
$script:AccountErr = ''

# Path to account-cli.mjs in the newest cached runtime; $null when none is cached.
function Get-AccountHelperPath {
    $versions = @(Get-CachedRuntimes)
    if ($versions.Count -eq 0) { return $null }
    return Join-Path (Get-RuntimeCacheDir $versions[-1]) 'account-cli.mjs'
}

# Run the node helper with the given args. Sets $script:AccountOut / AccountErr and returns
# the helper's exit code (1 when node or the helper bundle is missing).
function Invoke-AccountHelper {
    param([string[]]$HelperArgs)
    $script:AccountOut = ''; $script:AccountErr = ''
    $node = Get-CcgNode
    if (-not $node.Path) { [Console]::Error.WriteLine((T 'err_node_missing')); return 1 }
    $helper = Get-AccountHelperPath
    if ((-not $helper) -or (-not (Test-Path $helper))) {
        [Console]::Error.WriteLine((T 'err_account_helper_missing')); return 1
    }
    # The command line is built by hand: PowerShell would re-quote an argument that has quotes.
    $quoted = @('"' + $helper + '"') + @($HelperArgs | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' })
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $node.Path
    $psi.Arguments = $quoted -join ' '
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $proc = [System.Diagnostics.Process]::Start($psi)
    $errTask = $proc.StandardError.ReadToEndAsync()
    $script:AccountOut = $proc.StandardOutput.ReadToEnd().TrimEnd("`r", "`n")
    $proc.WaitForExit()
    $script:AccountErr = $errTask.Result.TrimEnd("`r", "`n")
    return $proc.ExitCode
}

# Map a helper exit code to a localized error on stderr.
function Write-AccountError {
    param([int]$Code, [string]$Token = '')
    switch ($Code) {
        2 { [Console]::Error.WriteLine((T 'account_none')) }
        3 { [Console]::Error.WriteLine((T 'err_account_not_found' $Token)) }
        4 {
            [Console]::Error.WriteLine((T 'err_account_ambiguous' $Token))
            if ($script:AccountErr) { [Console]::Error.WriteLine('  ' + $script:AccountErr) }
        }
        5 { [Console]::Error.WriteLine((T 'err_account_no_login')) }
        default {
            if ($script:AccountErr) { [Console]::Error.WriteLine($script:AccountErr) }
            [Console]::Error.WriteLine((T 'err_account_generic'))
        }
    }
}

function Write-AccountHelp {
    Write-Host (T 'help_account_header'); Write-Host ''; Write-Host (T 'help_account_body')
}

function Invoke-AccountList {
    $rc = [int](Invoke-AccountHelper @('list') | Select-Object -Last 1)
    if ($rc -eq 2) { Write-Host (T 'account_none'); return 0 }
    if ($rc -ne 0) { Write-AccountError $rc; return $rc }
    Write-Host (T 'account_list_header')
    foreach ($line in ($script:AccountOut -split "`n")) {
        $f = $line.TrimEnd("`r") -split "`t"
        if ($f.Count -lt 2 -or -not $f[1]) { continue }
        $marker = if ($f[0] -eq '1') { T 'account_active_marker' } else { ' ' }
        $meta = if ($f.Count -gt 2 -and $f[2]) { ' [' + $f[2] + ']' } else { '' }
        Write-Host ('  ' + $marker + ' ' + $f[1] + $meta)
    }
    return 0
}

function Invoke-AccountCurrent {
    $rc = [int](Invoke-AccountHelper @('current') | Select-Object -Last 1)
    if ($rc -eq 2) { Write-Host (T 'account_none'); return 0 }
    if ($rc -ne 0) { Write-AccountError $rc; return $rc }
    Write-Host (T 'account_current' (($script:AccountOut -split "`t")[0]))
    return 0
}

function Invoke-AccountUse {
    param([string]$Token)
    if (-not $Token) { [Console]::Error.WriteLine((T 'err_account_need_token')); return 1 }
    $rc = [int](Invoke-AccountHelper @('use', $Token) | Select-Object -Last 1)
    if ($rc -ne 0) { Write-AccountError $rc $Token; return $rc }
    Write-Host (T 'account_switched' $script:AccountOut)
    return 0
}

function Invoke-AccountSave {
    $rc = [int](Invoke-AccountHelper @('save') | Select-Object -Last 1)
    if ($rc -ne 0) { Write-AccountError $rc; return $rc }
    Write-Host (T 'account_saved' $script:AccountOut)
    return 0
}

function Invoke-AccountRemove {
    param([string]$Token)
    if (-not $Token) { [Console]::Error.WriteLine((T 'err_account_need_token')); return 1 }
    if ((Read-Host (T 'account_rm_prompt' $Token)) -notmatch '^(y|yes)$') {
        Write-Host (T 'account_aborted'); return 0
    }
    $rc = [int](Invoke-AccountHelper @('rm', $Token) | Select-Object -Last 1)
    if ($rc -ne 0) { Write-AccountError $rc $Token; return $rc }
    Write-Host (T 'account_removed' $script:AccountOut)
    return 0
}

function Invoke-CcgAccount {
    param([string[]]$CcgArgs)
    $sub = if ($CcgArgs.Count -gt 0) { $CcgArgs[0] } else { 'list' }
    $tok = if ($CcgArgs.Count -gt 1) { $CcgArgs[1] } else { '' }
    switch ($sub) {
        { $_ -in 'list', 'ls' }              { return (Invoke-AccountList) }
        'current'                            { return (Invoke-AccountCurrent) }
        { $_ -in 'use', 'switch' }           { return (Invoke-AccountUse $tok) }
        'save'                               { return (Invoke-AccountSave) }
        { $_ -in 'rm', 'remove', 'delete' }  { return (Invoke-AccountRemove $tok) }
        { $_ -in '-h', '--help' }            { Write-AccountHelp; return 0 }
        default {
            [Console]::Error.WriteLine((T 'err_account_unknown_sub' $sub))
            Write-AccountHelp
            return 1
        }
    }
}
