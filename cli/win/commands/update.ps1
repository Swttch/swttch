# commands/update.ps1 - `ccg update`: refresh the runtime to the latest release (stops our
# running backend, wipes this version's cache, downloads it again, starts it).

function Invoke-CcgUpdate {
    param([string[]]$CcgArgs)
    if ($CcgArgs -contains '-h' -or $CcgArgs -contains '--help') {
        Write-Host (T 'help_update_header'); Write-Host ''; Write-Host (T 'help_update_body')
        return 0
    }
    $tag = Get-LatestReleaseTag
    if (-not $tag) { [Console]::Error.WriteLine((T 'err_no_release')); return 1 }
    $version = $tag.TrimStart('v')
    $status = Get-PortStatus
    if ($status -eq 'foreign') {
        [Console]::Error.WriteLine((T 'err_port_foreign' $script:CcgPort))
        [Console]::Error.WriteLine((T 'err_port_foreign_hint' $script:CcgPort))
        return 1
    }
    if ($status -eq 'ours') { Stop-BackendOnPort }
    # An explicit update wipes the cache even when this version is cached: a release patched in
    # place (same tag, new asset) would otherwise never be picked up.
    Remove-Item (Get-RuntimeCacheDir $version) -Recurse -Force -ErrorAction SilentlyContinue
    return (Start-RuntimeAndSpawn $version)
}
