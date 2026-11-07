# lib/port.ps1 - probe the backend port.

# The version the backend on $CcgPort reports at /version, or $null.
function Get-BackendVersion {
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$($script:CcgPort)/version" -TimeoutSec 2
        if ($r.version) { return [string]$r.version }
    } catch { }
    return $null
}

# "ours" (answers /version), "foreign" (something else listens), or "free".
function Get-PortStatus {
    if (Get-BackendVersion) { return 'ours' }
    $listening = Get-NetTCPConnection -State Listen -LocalPort $script:CcgPort -ErrorAction SilentlyContinue
    if ($listening) { return 'foreign' }
    return 'free'
}

# Number of node processes running a backend.mjs.
function Get-BackendProcessCount {
    return @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'backend\.mjs' }).Count
}
