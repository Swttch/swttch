# lib/browser.ps1 - WebView URL, opening the browser, and control-channel auth.
#
# Auth mirrors the bash ccg exactly: a random SECRET is persisted once and the token
# is derived as HMAC-SHA256(secret, "ccg-auth") (hex), so a token stays the same across
# runs and matches the one the JetBrains plugin derives from the same secret file.
# The token is never placed in a URL; a fresh single-use PAIRING CODE is.

# Percent-encode for a URL query value; unreserved characters and '/' stay as they are.
function ConvertTo-UrlEncoded {
    param([string]$Text)
    $sb = New-Object System.Text.StringBuilder
    foreach ($b in [Text.Encoding]::UTF8.GetBytes($Text)) {
        $c = [char]$b
        if ($c -match '[a-zA-Z0-9._~/-]') { [void]$sb.Append($c) } else { [void]$sb.AppendFormat('%{0:X2}', $b) }
    }
    return $sb.ToString()
}

function Get-WebviewUrl {
    param([string]$Cwd, [string]$Pair = '')
    $url = 'http://localhost:{0}/?workingDir={1}' -f $script:CcgPort, (ConvertTo-UrlEncoded $Cwd)
    if ($Pair) { $url += '&pair=' + (ConvertTo-UrlEncoded $Pair) }
    return $url
}

function Open-Browser {
    param([string]$Url)
    try { Start-Process $Url } catch { }
}

# XDG-aware, defaulting to %USERPROFILE%\.claude-code-gui like the JetBrains plugin.
function Get-AuthConfigDir {
    if ($env:XDG_CONFIG_HOME) { return $env:XDG_CONFIG_HOME }
    return Join-Path $env:USERPROFILE '.claude-code-gui'
}

function Get-AuthSecret {
    $dir = Get-AuthConfigDir
    $file = Join-Path $dir 'auth-secret'
    if (Test-Path $file) {
        $s = ((Get-Content $file -Raw) -replace '\s', '')
        if ($s) { return $s }
    }
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    [IO.File]::WriteAllText($file, $secret, (New-Object Text.UTF8Encoding($false)))
    # Owner-only, the Windows counterpart of chmod 600 (best effort).
    & icacls.exe $file /inheritance:r /grant:r "$($env:USERNAME):(F)" 2>&1 | Out-Null
    return $secret
}

function Get-AuthToken {
    $hmac = New-Object Security.Cryptography.HMACSHA256 (, [Text.Encoding]::UTF8.GetBytes((Get-AuthSecret)))
    $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes('ccg-auth'))
    return ($hash | ForEach-Object { $_.ToString('x2') }) -join ''
}

# Fresh single-use pairing code, URL-safe base64 without padding.
function New-PairCode {
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([Convert]::ToBase64String($bytes)).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}
