# commands/stop.ps1 - `ccg stop`: end the backend process tree.
#
# Windows has no graceful signal for a console-less node, so every stop ends the processes
# right away, leaves first and the root last. -f/--force is accepted for the bash ccg's sake.

function Stop-ProcessTree {
    param($Snap, [int]$RootId, [bool]$Tree)
    Write-Host (T 'stop_target' $RootId)
    $ids = @()
    if ($Tree) { $ids = @(Get-Descendants $Snap $RootId); [array]::Reverse($ids) }
    foreach ($id in ($ids + @($RootId))) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
}

function Read-Confirm {
    param([string]$Prompt)
    return (Read-Host $Prompt) -match '^(y|yes)$'
}

function Invoke-CcgStop {
    param([string[]]$CcgArgs)
    $mode = 'port'; $target = $script:CcgPort; $tree = $true
    for ($i = 0; $i -lt $CcgArgs.Count; $i++) {
        $a = $CcgArgs[$i]
        switch -Regex ($a) {
            '^(-h|--help)$' {
                Write-Host (T 'help_stop_header'); Write-Host ''; Write-Host (T 'help_stop_body')
                return 0
            }
            '^(-f|--force)$' { }
            '^--no-tree$' { $tree = $false }
            '^(-a|--all)$' { $mode = 'all' }
            '^(-p|--port)$' {
                $n = 0
                if ($i + 1 -ge $CcgArgs.Count -or -not [int]::TryParse($CcgArgs[$i + 1], [ref]$n)) {
                    [Console]::Error.WriteLine('--port requires a numeric value'); return 1
                }
                $mode = 'port'; $target = $n; $i++
            }
            '^\d+$' { $mode = 'pid'; $target = [int]$a }
            default { [Console]::Error.WriteLine("unknown flag: $a"); return 1 }
        }
    }

    $snap = Get-ProcessSnapshot
    $roots = @(Get-BackendRoots $snap)
    switch ($mode) {
        'all' {
            if ($roots.Count -eq 0) { Write-Host (T 'stop_all_none'); return 0 }
            if (-not (Read-Confirm (T 'stop_all_prompt' $roots.Count))) { Write-Host (T 'stop_aborted'); return 0 }
            foreach ($r in $roots) { Stop-ProcessTree $snap $r $tree }
            Write-Host (T 'stop_done'); return 0
        }
        'port' {
            foreach ($r in $roots) {
                if ((Get-TreePorts $snap $r) -contains $target) {
                    Stop-ProcessTree $snap $r $tree; Write-Host (T 'stop_done'); return 0
                }
            }
            $script:CcgPort = $target
            if (Get-NetTCPConnection -State Listen -LocalPort $target -ErrorAction SilentlyContinue) {
                Stop-BackendOnPort; Write-Host (T 'stop_done'); return 0
            }
            Write-Host (T 'stop_none' $target); return 0
        }
        'pid' {
            if (-not $snap.ContainsKey($target)) { Write-Host (T 'stop_none' $target); return 0 }
            $ours = $false
            foreach ($r in $roots) { if ($r -eq $target -or (Get-Descendants $snap $r) -contains $target) { $ours = $true; if ($tree) { $target = $r }; break } }
            if (-not $ours) {
                [Console]::Error.WriteLine((T 'stop_not_ours' $target))
                if (-not (Read-Confirm (T 'stop_not_ours_prompt'))) { Write-Host (T 'stop_aborted'); return 0 }
            }
            Stop-ProcessTree $snap $target $tree; Write-Host (T 'stop_done'); return 0
        }
    }
    return 0
}
