# commands/version.ps1 - `ccg version`: installed ccg, cached runtimes, running backend.

function Invoke-CcgVersion {
    param([string[]]$CcgArgs)
    if ($CcgArgs -contains '-h' -or $CcgArgs -contains '--help') {
        Write-Output (T 'help_version_header')
        Write-Output ''
        Write-Output (T 'help_version_body')
        return
    }
    Write-Output (T 'version_ccg' (Get-CcgSelfVersion))
    $cached = Get-CachedRuntimes
    if ($cached.Count -gt 0) { Write-Output (T 'version_runtime_cached' ($cached -join ', ')) }
    else { Write-Output (T 'version_runtime_none') }
    $v = Get-BackendVersion
    if ($v) { Write-Output (T 'version_backend_running' $v $script:CcgPort) }
    else { Write-Output (T 'version_backend_none') }
}
