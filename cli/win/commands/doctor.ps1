# commands/doctor.ps1 - `ccg doctor`: node, PATH, cache, port, stray backends.

function Invoke-CcgDoctor {
    param([string[]]$CcgArgs)
    if ($CcgArgs -contains '-h' -or $CcgArgs -contains '--help') {
        Write-Output (T 'help_doctor_header')
        Write-Output ''
        Write-Output (T 'help_doctor_body')
        return
    }
    Write-Output (T 'doctor_header')

    $node = Get-CcgNode
    if (-not $node.Path) { Write-Output (T 'doctor_node_missing') }
    elseif (-not $node.Ok) { Write-Output (T 'doctor_node_old' $node.Path $node.Version) }
    else { Write-Output (T 'doctor_node_ok' $node.Path $node.Version) }

    $bin = Join-Path $script:WinRoot 'bin'
    $onPath = @($env:Path -split ';' | Where-Object { $_.TrimEnd('\') -ieq $bin.TrimEnd('\') }).Count -gt 0
    if ($onPath) { Write-Output (T 'doctor_path_ok' $bin) } else { Write-Output (T 'doctor_path_missing' $bin) }

    Write-Output (T 'doctor_cache_count' (Get-CachedRuntimes).Count)

    switch (Get-PortStatus) {
        'free'    { Write-Output (T 'doctor_port_free' $script:CcgPort) }
        'ours'    { Write-Output (T 'doctor_port_us' $script:CcgPort (Get-BackendVersion)) }
        'foreign' { Write-Output (T 'doctor_port_foreign' $script:CcgPort) }
    }

    $n = Get-BackendProcessCount
    if ($n -ge 2) { Write-Output (T 'doctor_backend_warn' $n) }
    elseif ($n -eq 1) { Write-Output (T 'doctor_backend_count' $n) }
}
