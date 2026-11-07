# lib/version.ps1 - installed ccg version.

# The installed cli version, or "dev" when not stamped (install.ps1 writes .ccg-version).
function Get-CcgSelfVersion {
    $file = Join-Path $script:CcgRoot '.ccg-version'
    if (Test-Path $file) { return (Get-Content $file -Raw).Trim() }
    return 'dev'
}

# Compare two semver strings (a leading 'v' is ignored; missing parts count as 0).
# Returns -1, 0 or 1 for a < b, a == b, a > b.
function Compare-Semver {
    param([string]$A, [string]$B)
    $pa = $A.TrimStart('v').Split('.')
    $pb = $B.TrimStart('v').Split('.')
    $max = [Math]::Max($pa.Count, $pb.Count)
    for ($i = 0; $i -lt $max; $i++) {
        $x = 0; $y = 0
        if ($i -lt $pa.Count) { [void][int]::TryParse($pa[$i], [ref]$x) }
        if ($i -lt $pb.Count) { [void][int]::TryParse($pb[$i], [ref]$y) }
        if ($x -lt $y) { return -1 }
        if ($x -gt $y) { return 1 }
    }
    return 0
}

# GitHub repo releases come from. Override with CCG_RELEASE_REPO (forks).
function Get-ReleaseRepo {
    if ($env:CCG_RELEASE_REPO) { return $env:CCG_RELEASE_REPO }
    return 'Swttch/swttch'
}

# Latest release tag (e.g. "v0.35.3"), or $null when GitHub cannot be reached.
function Get-LatestReleaseTag {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$(Get-ReleaseRepo)/releases/latest" -TimeoutSec 10
        if ($r.tag_name) { return [string]$r.tag_name }
    } catch { }
    return $null
}
