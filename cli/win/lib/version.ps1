# lib/version.ps1 - installed ccg version.

# The installed cli version, or "dev" when not stamped (install.ps1 writes .ccg-version).
function Get-CcgSelfVersion {
    $file = Join-Path $script:CcgRoot '.ccg-version'
    if (Test-Path $file) { return (Get-Content $file -Raw).Trim() }
    return 'dev'
}
