# lib/runtime.ps1 - cached runtimes (backend.mjs + webview), one folder per version.

function Get-CachedRuntimes {
    $dir = Join-Path $script:CcgRoot 'runtimes'
    if (-not (Test-Path $dir)) { return @() }
    return @(Get-ChildItem $dir -Directory | ForEach-Object { $_.Name })
}
