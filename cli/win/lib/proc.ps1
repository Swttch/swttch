# lib/proc.ps1 - process table and backend-tree discovery (the Windows counterpart of
# lib/proc, lib/backend-detect and lib/port/tree in the bash ccg).
#
# A backend root is a node.exe running backend.mjs (production) or server.ts (dev). Its
# descendants carry no marker, so they are found by walking the parent-PID graph. A
# snapshot is a hashtable: ProcessId -> Win32_Process.

function Get-ProcessSnapshot {
    $snap = @{}
    foreach ($p in Get-CimInstance Win32_Process) { $snap[[int]$p.ProcessId] = $p }
    return $snap
}

function Get-ChildPids {
    param($Snap, [int]$ParentId)
    return @($Snap.Values | Where-Object { $_.ParentProcessId -eq $ParentId -and $_.ProcessId -ne $ParentId } | ForEach-Object { [int]$_.ProcessId } | Sort-Object)
}

# Descendants of $RootId, parents before children (breadth first).
function Get-Descendants {
    param($Snap, [int]$RootId)
    $result = New-Object System.Collections.ArrayList
    $queue = New-Object System.Collections.Queue
    $queue.Enqueue($RootId)
    while ($queue.Count -gt 0) {
        foreach ($c in (Get-ChildPids $Snap $queue.Dequeue())) {
            if ($result -notcontains $c) { [void]$result.Add($c); $queue.Enqueue($c) }
        }
    }
    return @($result)
}

# True when the command line is node running an entry named $Marker.
function Test-EntryCommand {
    param($Proc, [string]$Marker)
    if ($Proc.Name -ne 'node.exe' -or -not $Proc.CommandLine) { return $false }
    return ($Proc.CommandLine.Replace('\', '/') -split '\s+' | Where-Object { ($_.Trim('"') -split '/')[-1] -eq $Marker }).Count -gt 0
}

function Test-BackendEntry {
    param($Proc)
    return (Test-EntryCommand $Proc 'backend.mjs') -or (Test-EntryCommand $Proc 'server.ts')
}

# A dev watcher/runner would respawn a killed backend, so a dev root is promoted past it.
function Test-DevRunner {
    param($Proc)
    $c = [string]$Proc.CommandLine
    return ($c -match '(^|\s)--watch(=|\s|$)') -or ($c -match 'nodemon') -or ($c -match '(pnpm|npm|yarn)\S*\s+(run\s+)?dev(\s|$)')
}

function Get-RootPromotion {
    param($Snap, [int]$ProcId)
    $cur = $ProcId
    for ($i = 0; $i -lt 100; $i++) {
        $parent = $Snap[[int]$Snap[$cur].ParentProcessId]
        if ($parent -and (Test-DevRunner $parent)) { $cur = [int]$parent.ProcessId } else { break }
    }
    return $cur
}

# Topmost backend entries, promoted past dev runners, one PID each.
function Get-BackendRoots {
    param($Snap)
    $cands = @($Snap.Values | Where-Object { Test-BackendEntry $_ } | ForEach-Object { [int]$_.ProcessId })
    $roots = New-Object System.Collections.ArrayList
    foreach ($c in $cands) {
        $hasAncestor = $false
        $cur = $c
        for ($i = 0; $i -lt 100; $i++) {
            $pp = [int]$Snap[$cur].ParentProcessId
            if (-not $Snap.ContainsKey($pp) -or $pp -eq 0) { break }
            if ($cands -contains $pp) { $hasAncestor = $true; break }
            $cur = $pp
        }
        if ($hasAncestor) { continue }
        $r = Get-RootPromotion $Snap $c
        if ($roots -notcontains $r) { [void]$roots.Add($r) }
    }
    return @($roots)
}
