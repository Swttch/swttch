# lib/node.ps1 - Node.js discovery. The backend needs Node.js >= 18.

# Returns @{ Path; Version; Ok } ; Path is $null when node is not on PATH.
function Get-CcgNode {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { return @{ Path = $null; Version = $null; Ok = $false } }
    $raw = (& $cmd.Source --version 2>$null)
    $major = 0
    if ($raw -match '^v?(\d+)\.') { $major = [int]$Matches[1] }
    return @{ Path = $cmd.Source; Version = $raw; Ok = ($major -ge 18) }
}
