# lib/runtime.ps1 - cached runtimes (backend.mjs + webview), one folder per version
# under <CcgRoot>\runtimes\<version>.

function Get-RuntimeCacheDir {
    param([string]$Version)
    return Join-Path $script:CcgRoot ('runtimes\' + $Version.TrimStart('v'))
}

# A runtime is usable when backend.mjs, account-cli.mjs and webview\ are all there.
function Test-RuntimeDir {
    param([string]$Dir)
    return (Test-Path (Join-Path $Dir 'backend.mjs')) -and (Test-Path (Join-Path $Dir 'account-cli.mjs')) -and (Test-Path (Join-Path $Dir 'webview') -PathType Container)
}

function Test-RuntimeCached {
    param([string]$Version)
    return Test-RuntimeDir (Get-RuntimeCacheDir $Version)
}

# Cached versions, oldest first.
function Get-CachedRuntimes {
    $dir = Join-Path $script:CcgRoot 'runtimes'
    if (-not (Test-Path $dir)) { return @() }
    $names = @(Get-ChildItem $dir -Directory | Where-Object { Test-RuntimeDir $_.FullName } | ForEach-Object { $_.Name })
    return @($names | Sort-Object { try { [version]$_ } catch { [version]'0.0' } })
}

function Get-RuntimeAssetUrl {
    param([string]$Version)
    $v = $Version.TrimStart('v')
    return "https://github.com/$(Get-ReleaseRepo)/releases/download/v$v/claude-code-gui-standalone-v$v.tgz"
}

# Download and extract a runtime. Removes the cache folder on failure so a retry starts clean.
function Install-Runtime {
    param([string]$Version)
    $dir = Get-RuntimeCacheDir $Version
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("ccg-runtime-{0}.tgz" -f $Version.TrimStart('v'))
    $ok = $false
    try {
        $ProgressPreference = 'SilentlyContinue'
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri (Get-RuntimeAssetUrl $Version) -OutFile $tmp -UseBasicParsing
        $prev = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'   # tar prints harmless header warnings to stderr
        & tar.exe -xzf $tmp -C $dir 2>$null
        $exit = $LASTEXITCODE
        $ErrorActionPreference = $prev
        $ok = ($exit -eq 0) -and (Test-RuntimeDir $dir)
    } catch { $ok = $false }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if (-not $ok) { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
    return $ok
}
