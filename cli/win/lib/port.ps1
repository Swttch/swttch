# lib/port.ps1 - probe the backend port.

# The version the backend on $CcgPort reports at /version, or $null.
function Get-BackendVersion {
    param([int]$Port = $script:CcgPort)
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/version" -TimeoutSec 2
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

# Number of node processes running a backend.mjs (the cmd.exe wrapper that launches it also
# has backend.mjs in its command line, so only node.exe counts).
function Get-BackendProcessCount {
    return @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'backend\.mjs' }).Count
}

# Stop whatever listens on $CcgPort and wait up to $TimeoutSec for the port to free.
# Windows has no graceful signal for a console-less node, so this ends the process.
function Stop-BackendOnPort {
    param([int]$TimeoutSec = 3)
    $pids = @(Get-NetTCPConnection -State Listen -LocalPort $script:CcgPort -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)
    foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
    for ($i = 0; $i -lt ($TimeoutSec * 2); $i++) {
        if (-not (Get-NetTCPConnection -State Listen -LocalPort $script:CcgPort -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 500
    }
}
