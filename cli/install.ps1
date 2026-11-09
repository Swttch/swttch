# install.ps1 - bootstrap installer for the ccg CLI on native Windows (PowerShell).
#
# Usage:
#   irm https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.ps1 | iex
#
# What it does:
#   1. Resolves the latest release tag from GitHub.
#   2. Downloads ccg-cli-v<ver>.tar.gz and extracts it to ~\.claude-code-gui.
#   3. Adds ~\.claude-code-gui\win\bin to your user PATH.
#   4. Writes the .ccg-version stamp and warns if Node.js 18+ is not found.
#
# Env overrides:
#   CCG_HOME          - installation root (default: %USERPROFILE%\.claude-code-gui)
#   CCG_RELEASE_REPO  - GitHub owner/repo (default: Swttch/swttch)
#   CCG_VERSION       - pin to a specific version (default: latest)
#   CCG_YES           - set to 1 to skip the overwrite question (ccg self-update -y sets it)
#
# Intentionally English-only and ASCII-only: it runs through `iex`, before ccg exists.
# Everything lives in one function so a failure uses `return`, never `exit`
# (`exit` would close the user's PowerShell window when run through `iex`).

function Install-Ccg {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    # Windows PowerShell 5.1 does not negotiate TLS 1.2 by default.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $ccgHome = if ($env:CCG_HOME) { $env:CCG_HOME } else { Join-Path $env:USERPROFILE '.claude-code-gui' }
    $repo = if ($env:CCG_RELEASE_REPO) { $env:CCG_RELEASE_REPO } else { 'Swttch/swttch' }

    # 1. pre-checks
    if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
        Write-Host 'Error: tar.exe is required but not found (it ships with Windows 10 version 1803 and later).' -ForegroundColor Red
        return
    }

    # 2. resolve version
    if ($env:CCG_VERSION) {
        $version = $env:CCG_VERSION.TrimStart('v')
    } else {
        Write-Host "Looking up latest release from $repo..."
        try {
            $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -TimeoutSec 10
        } catch {
            Write-Host 'Error: Could not fetch latest release. Network problem?' -ForegroundColor Red
            return
        }
        $version = ([string]$release.tag_name).TrimStart('v')
    }
    Write-Host "Installing Swttch v$version..."

    # 3. confirm overwrite
    $stamp = Join-Path $ccgHome '.ccg-version'
    if (Test-Path $stamp) {
        $existing = (Get-Content $stamp -Raw).Trim()
        $answer = 'Y'
        if ($env:CCG_YES -eq '1') { Write-Host "Existing installation v$existing detected. Overwriting (-y)." }
        else { try { $answer = Read-Host "Existing installation v$existing detected. Overwrite? (Y/n)" } catch { Write-Host '(no console available; proceeding with Y)' } }
        if ($answer -match '^(n|no)$') { Write-Host 'Aborted.'; return }
    }

    # 4. download and extract
    New-Item -ItemType Directory -Force -Path $ccgHome | Out-Null
    $assetUrl = "https://github.com/$repo/releases/download/v$version/ccg-cli-v$version.tar.gz"
    $tmp = Join-Path ([IO.Path]::GetTempPath()) "ccg-cli-v$version.tar.gz"
    Write-Host "Downloading $assetUrl..."
    try {
        Invoke-WebRequest -Uri $assetUrl -OutFile $tmp -UseBasicParsing
    } catch {
        Write-Host "Error: Download failed. Check that release v$version has the asset 'ccg-cli-v$version.tar.gz' attached." -ForegroundColor Red
        return
    }
    $ErrorActionPreference = 'Continue'   # tar prints harmless header warnings to stderr
    & tar.exe -xzf $tmp -C $ccgHome 2>$null
    $tarExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if ($tarExit -ne 0) {
        Write-Host 'Error: Extraction failed.' -ForegroundColor Red
        return
    }
    $winBin = Join-Path $ccgHome 'win\bin'
    if (-not (Test-Path (Join-Path $winBin 'ccg.cmd'))) {
        Write-Host "Error: release v$version has no Windows build (win\bin\ccg.cmd is missing). Try a newer release." -ForegroundColor Red
        return
    }
    Set-Content -Path $stamp -Value $version -Encoding ASCII

    # 5. PATH integration (user scope, idempotent)
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($userPath -split ';' | Where-Object { $_ })
    if (@($entries | Where-Object { $_.TrimEnd('\') -ieq $winBin.TrimEnd('\') }).Count -eq 0) {
        [Environment]::SetEnvironmentVariable('Path', (($entries + $winBin) -join ';'), 'User')
        Write-Host "Added $winBin to your user PATH."
    } else {
        Write-Host "PATH entry already present: $winBin"
    }
    if (@($env:Path -split ';' | Where-Object { $_.TrimEnd('\') -ieq $winBin.TrimEnd('\') }).Count -eq 0) {
        $env:Path = "$env:Path;$winBin"
    }

    # 6. Node.js check (the backend needs Node.js 18+). Advice only; never installs anything.
    $nodeOk = $false
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $raw = (& $node.Source --version 2>$null)
        if ($raw -match '^v?(\d+)\.' -and [int]$Matches[1] -ge 18) { $nodeOk = $true }
    }
    Write-Host ''
    Write-Host 'Installation complete. Open a new terminal, then run: ccg'
    if (-not $nodeOk) {
        Write-Host ''
        Write-Host 'WARNING: Node.js 18 or newer was not found on PATH (ccg needs it to run the backend).' -ForegroundColor Yellow
        Write-Host '  If you already installed it, open a new terminal so PATH is refreshed.'
        Write-Host '  Otherwise install it from https://nodejs.org/ or run: winget install OpenJS.NodeJS.LTS'
    }
}

Install-Ccg
