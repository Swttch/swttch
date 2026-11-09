# commands/self-update.ps1 - `ccg self-update`: re-run the install script to update ccg itself.
# Run `ccg stop` first: a running backend is not touched, but its files are not replaced either.

function Invoke-CcgSelfUpdate {
    param([string[]]$CcgArgs)
    if ($CcgArgs -contains '-h' -or $CcgArgs -contains '--help') {
        Write-Host (T 'help_self_update_header'); Write-Host ''; Write-Host (T 'help_self_update_body')
        return 0
    }
    # -y / --yes: install.ps1 runs through iex and cannot take arguments, so it reads CCG_YES.
    if ($CcgArgs -contains '-y' -or $CcgArgs -contains '--yes') { $env:CCG_YES = '1' }
    $url = "https://raw.githubusercontent.com/$(Get-ReleaseRepo)/main/cli/install.ps1"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $script = Invoke-RestMethod -Uri $url -TimeoutSec 30
    } catch {
        [Console]::Error.WriteLine((T 'err_self_update_fetch' $url))
        return 1
    }
    Invoke-Expression $script
    return 0
}
